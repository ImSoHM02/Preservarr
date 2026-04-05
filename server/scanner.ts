import fs from "fs";
import path from "path";
import crypto from "crypto";
import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import PQueue from "p-queue";
import CRC32 from "crc-32";
import { storage } from "./storage.js";
import { notifyUser } from "./socket.js";
import { expressLogger } from "./logger.js";
import { normalizeTitle } from "../shared/title-utils.js";

const scannerLog = expressLogger.child({ module: "scanner" });

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ScanProgress {
  running: boolean;
  total: number;
  processed: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  currentFile: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export type LibraryPaths = Record<string, string>; // slug → absolute path

// ─────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────

let watcher: FSWatcher | null = null;

const progress: ScanProgress = {
  running: false,
  total: 0,
  processed: 0,
  added: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  currentFile: null,
  startedAt: null,
  finishedAt: null,
};

// Low-concurrency queue for background MD5/SHA1 computation
const hashQueue = new PQueue({ concurrency: 2 });

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Parse a ROM filename into a clean title, region, and revision.
 * Handles No-Intro style: "Game Title (USA) (Rev 1).ext"
 * and Redump style:       "Game Title (USA, Europe).ext"
 */
function parseRomFilename(filename: string): {
  title: string;
  region: string | null;
  revision: string | null;
} {
  const stem = path.parse(filename).name;

  const regionMatch = stem.match(
    /\((USA|Europe|Japan|World|Korea|Germany|France|Spain|Italy|Australia|Brazil|China|En|Ja|De|Fr|Es|It|Pt)[^)]*\)/i,
  );
  const region = regionMatch
    ? regionMatch[0].replace(/[()]/g, "").split(",")[0].trim()
    : null;

  const revMatch = stem.match(/\(Rev ([^)]+)\)/i);
  const revision = revMatch ? revMatch[1].trim() : null;

  // Remove all parenthesized/bracketed groups to get the clean title
  const title = stem.replace(/\s*[\[(][^\])]* [\])]?/g, "").trim() ||
    stem.replace(/\s*\([^)]*\)/g, "").trim();

  return { title: title || stem, region, revision };
}

/** Compute CRC32 of a file, returned as 8-char uppercase hex (unsigned). */
async function computeCRC32(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, {
      highWaterMark: 256 * 1024,
    });
    let crc = 0;
    stream.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      crc = CRC32.buf(buf, crc);
    });
    stream.on("end", () => {
      const unsigned = (crc >>> 0).toString(16).padStart(8, "0").toUpperCase();
      resolve(unsigned);
    });
    stream.on("error", reject);
  });
}

/** Compute MD5 or SHA1 of a file via streaming. */
async function computeHash(
  filePath: string,
  algorithm: "md5" | "sha1",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
    stream.on("error", reject);
  });
}

/** Read library paths from settings. Returns {} if not set. */
async function getLibraryPaths(): Promise<LibraryPaths> {
  const raw = await storage.getSetting("library_paths");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LibraryPaths;
  } catch {
    return {};
  }
}

/**
 * Build an extension → platform map from the DB.
 * Keys are lowercase extensions (without the dot).
 */
async function buildExtensionMap(): Promise<
  Map<string, { id: number; slug: string; namingStandard: string }>
> {
  const map = new Map<
    string,
    { id: number; slug: string; namingStandard: string }
  >();
  const platforms = await storage.getEnabledPlatforms();
  for (const platform of platforms) {
    const exts = (platform.fileExtensions as string[]) ?? [];
    for (const ext of exts) {
      map.set(ext.toLowerCase().replace(/^\./, ""), {
        id: platform.id,
        slug: platform.slug,
        namingStandard: platform.namingStandard,
      });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Core: process a single file
// ─────────────────────────────────────────────────────────────

async function processFile(
  filePath: string,
  platformId: number,
  namingStandard: string,
): Promise<"added" | "updated" | "skipped" | "error"> {
  try {
    const stat = await fs.promises.stat(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const sizeBytes = stat.size;

    // Check if we already have this file
    const existing = await storage.getGameFileByPath(filePath);

    if (existing) {
      // File already tracked; skip unless size changed (re-import)
      if (existing.sizeBytes === sizeBytes) {
        return "skipped";
      }
      // Size changed → recompute hashes
      const crc32 = await computeCRC32(filePath);
      await storage.updateGameFile(existing.id, {
        sizeBytes,
        crc32,
        md5: null,
        sha1: null,
        versionStatus: "unknown",
      });
      // Queue full hash re-computation
      hashQueue.add(() => computeFullHashes(existing.id, filePath));
      return "updated";
    }

    // New file: parse filename and find/create game record
    const { title, region, revision } = parseRomFilename(filename);
    const normalizedTitle = normalizeTitle(title);

    // Try to find an existing game with a matching normalized title on this platform
    const platformGames = await storage.getGamesByPlatform(platformId);
    const matchedGame = platformGames.find(
      (g) => normalizeTitle(g.title) === normalizedTitle,
    );

    let gameId: number;

    if (matchedGame) {
      gameId = matchedGame.id;
    } else {
      // Create a stub game from the filename
      const newGame = await storage.createGame({
        title,
        platformId,
        region: region ?? undefined,
      });
      gameId = newGame.id;
      scannerLog.info({ gameId, title, platformId }, "Created stub game from scan");
    }

    // Compute CRC32 (fast — blocks briefly for large files but acceptable)
    const crc32 = await computeCRC32(filePath);

    // Look up dat_entries for this hash to get version info
    const datMatches = await storage.getDatEntriesByHash(crc32);
    const knownVersion = datMatches[0]?.revision ?? revision ?? null;

    // Create game_file record
    const gameFile = await storage.createGameFile({
      gameId,
      path: filePath,
      filename,
      sizeBytes,
      fileFormat: ext.toUpperCase(),
      crc32,
      knownVersion,
      versionStatus: "unknown",
      importedAt: new Date().toISOString(),
    });

    // Queue slow hashes in background
    hashQueue.add(() => computeFullHashes(gameFile.id, filePath));

    notifyUser("scanner:file-added", {
      gameId,
      gameFileId: gameFile.id,
      filename,
      platformId,
    });

    return "added";
  } catch (err) {
    scannerLog.error({ filePath, err }, "Error processing file");
    return "error";
  }
}

/** Background job: compute MD5 + SHA1 and write back to DB. */
async function computeFullHashes(fileId: number, filePath: string): Promise<void> {
  try {
    const [md5, sha1] = await Promise.all([
      computeHash(filePath, "md5"),
      computeHash(filePath, "sha1"),
    ]);

    // Re-check dat entries with sha1 for more accurate match
    const datMatches = await storage.getDatEntriesByHash(sha1);
    const updates: Parameters<typeof storage.updateGameFile>[1] = { md5, sha1 };

    if (datMatches.length > 0) {
      updates.knownVersion = datMatches[0].revision ?? undefined;
      updates.versionStatus = "current"; // Assume current until version check runs
    }

    await storage.updateGameFile(fileId, updates);
    scannerLog.debug({ fileId }, "Full hashes computed");
  } catch (err) {
    scannerLog.warn({ fileId, filePath, err }, "Failed to compute full hashes");
  }
}

// ─────────────────────────────────────────────────────────────
// Full scan
// ─────────────────────────────────────────────────────────────

export async function runFullScan(): Promise<ScanProgress> {
  if (progress.running) {
    return { ...progress };
  }

  const libraryPaths = await getLibraryPaths();
  const slugPathEntries = Object.entries(libraryPaths);

  if (slugPathEntries.length === 0) {
    scannerLog.info("No library paths configured; skipping scan");
    return { ...progress };
  }

  const extMap = await buildExtensionMap();

  // Reset progress
  Object.assign(progress, {
    running: true,
    total: 0,
    processed: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    currentFile: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  notifyUser("scanner:started", { startedAt: progress.startedAt });

  // Collect all files first so we can set progress.total
  const filesToProcess: Array<{
    filePath: string;
    platformId: number;
    namingStandard: string;
  }> = [];

  for (const [slug, dirPath] of slugPathEntries) {
    if (!fs.existsSync(dirPath)) {
      scannerLog.warn({ slug, dirPath }, "Library path does not exist; skipping");
      continue;
    }

    const platform = await storage.getPlatformBySlug(slug);
    if (!platform) {
      scannerLog.warn({ slug }, "No platform found for slug; skipping");
      continue;
    }

    // Walk directory (non-recursive for now to keep it simple)
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      scannerLog.warn({ dirPath }, "Cannot read directory");
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      const platformInfo = extMap.get(ext);
      if (!platformInfo || platformInfo.id !== platform.id) continue;
      filesToProcess.push({
        filePath: path.join(dirPath, entry.name),
        platformId: platform.id,
        namingStandard: platform.namingStandard,
      });
    }
  }

  progress.total = filesToProcess.length;
  notifyUser("scanner:progress", { ...progress });

  // Process files sequentially to avoid overwhelming SQLite
  for (const { filePath, platformId, namingStandard } of filesToProcess) {
    progress.currentFile = path.basename(filePath);
    const result = await processFile(filePath, platformId, namingStandard);
    progress[result === "added" ? "added" :
              result === "updated" ? "updated" :
              result === "skipped" ? "skipped" : "errors"]++;
    progress.processed++;

    // Emit progress every 10 files or on last file
    if (progress.processed % 10 === 0 || progress.processed === progress.total) {
      notifyUser("scanner:progress", { ...progress });
    }
  }

  progress.running = false;
  progress.currentFile = null;
  progress.finishedAt = new Date().toISOString();

  notifyUser("scanner:complete", { ...progress });
  scannerLog.info(
    {
      added: progress.added,
      updated: progress.updated,
      skipped: progress.skipped,
      errors: progress.errors,
    },
    "Library scan complete",
  );

  return { ...progress };
}

export function getScanProgress(): ScanProgress {
  return { ...progress };
}

// ─────────────────────────────────────────────────────────────
// Filesystem watcher
// ─────────────────────────────────────────────────────────────

export async function startWatcher(): Promise<void> {
  if (watcher) await stopWatcher();

  const libraryPaths = await getLibraryPaths();
  const dirs = Object.values(libraryPaths).filter((p) => fs.existsSync(p));

  if (dirs.length === 0) return;

  const extMap = await buildExtensionMap();

  watcher = chokidarWatch(dirs, {
    ignoreInitial: true,
    depth: 1,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  watcher.on("add", async (filePath: string) => {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const platformInfo = extMap.get(ext);
    if (!platformInfo) return;
    scannerLog.info({ filePath }, "Watcher: new file detected");
    await processFile(filePath, platformInfo.id, platformInfo.namingStandard);
  });

  watcher.on("unlink", async (filePath: string) => {
    const existing = await storage.getGameFileByPath(filePath);
    if (existing) {
      // Mark as removed (we don't delete the record, just log it)
      scannerLog.info({ filePath }, "Watcher: file removed");
      notifyUser("scanner:file-removed", { gameFileId: existing.id, filePath });
    }
  });

  scannerLog.info({ dirs }, "Filesystem watcher started");
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
    scannerLog.info("Filesystem watcher stopped");
  }
}
