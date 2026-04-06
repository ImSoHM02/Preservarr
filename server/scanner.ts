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

type PlatformScanContext = {
  slug: string;
  dirPath: string;
  platformId: number;
  supportedExtensions: Set<string>;
  managedFolderMap: Map<string, number>;
};

type FileScanTarget = {
  filePath: string;
  platformId: number;
  matchedGameId?: number;
  shouldComputeHashes: boolean;
};

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

  // Remove common parenthesized/bracketed tags to get the clean title.
  const title = stem
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .trim();

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

  const asLibraryPaths = (value: unknown): LibraryPaths => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: LibraryPaths = {};
    for (const [slug, dirPath] of Object.entries(value)) {
      if (typeof dirPath === "string" && dirPath.trim().length > 0) {
        out[slug] = dirPath.trim();
      }
    }
    return out;
  };

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "string") {
        try {
          return asLibraryPaths(JSON.parse(parsed) as unknown);
        } catch {
          return {};
        }
      }
      return asLibraryPaths(parsed);
    } catch {
      return {};
    }
  }

  return asLibraryPaths(raw);
}

function normalizeExtension(value: string): string {
  return value.toLowerCase().replace(/^\./, "");
}

function isPathInside(parentDir: string, candidatePath: string): boolean {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  const rel = path.relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function sanitizePathSegment(name: string): string {
  const withoutReservedChars = name.replace(/[<>:"/\\|?*]/g, " ");
  const withoutControlChars = Array.from(withoutReservedChars, (char) =>
    char.charCodeAt(0) < 32 ? " " : char,
  ).join("");
  const sanitized = withoutControlChars
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .]+$/g, "");
  return sanitized.length > 0 ? sanitized : "Unknown Game";
}

function toManagedFolderKey(name: string): string {
  return sanitizePathSegment(name).toLowerCase();
}

function getTopLevelManagedFolder(rootDir: string, filePath: string): string | null {
  const rel = path.relative(rootDir, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep).filter((part) => part.length > 0);
  // Only treat files in subfolders as managed game folder files.
  if (parts.length < 2) return null;
  return parts[0];
}

async function buildManagedFolderMap(platformId: number): Promise<Map<string, number>> {
  const games = await storage.getGamesByPlatform(platformId);
  const map = new Map<string, number>();
  for (const game of games) {
    const key = toManagedFolderKey(game.title);
    // Keep first winner for duplicate sanitized folder names.
    if (!map.has(key)) {
      map.set(key, game.id);
    }
  }
  return map;
}

async function buildPlatformScanContexts(libraryPaths: LibraryPaths): Promise<PlatformScanContext[]> {
  const contexts: PlatformScanContext[] = [];

  for (const [slug, dirPath] of Object.entries(libraryPaths)) {
    if (!fs.existsSync(dirPath)) {
      scannerLog.warn({ slug, dirPath }, "Library path does not exist; skipping");
      continue;
    }

    const platform = await storage.getPlatformBySlug(slug);
    if (!platform) {
      scannerLog.warn({ slug }, "No platform found for slug; skipping");
      continue;
    }

    const supportedExtensions = new Set(
      ((platform.fileExtensions as string[] | null) ?? []).map(normalizeExtension),
    );

    contexts.push({
      slug,
      dirPath,
      platformId: platform.id,
      supportedExtensions,
      managedFolderMap: await buildManagedFolderMap(platform.id),
    });
  }

  return contexts;
}

function buildFileScanTarget(
  context: PlatformScanContext,
  filePath: string,
): FileScanTarget | null {
  const ext = normalizeExtension(path.extname(filePath).slice(1));
  const shouldComputeHashes = context.supportedExtensions.has(ext);

  const folderName = getTopLevelManagedFolder(context.dirPath, filePath);
  const matchedGameId = folderName
    ? context.managedFolderMap.get(toManagedFolderKey(folderName))
    : undefined;

  if (!matchedGameId && !shouldComputeHashes) {
    return null;
  }

  return {
    filePath,
    platformId: context.platformId,
    matchedGameId,
    shouldComputeHashes,
  };
}

function resolveTargetAcrossContexts(
  filePath: string,
  contexts: PlatformScanContext[],
): FileScanTarget | null {
  const matchedTarget = contexts
    .map((context) => buildFileScanTarget(context, filePath))
    .find((target) => target?.matchedGameId);
  if (matchedTarget) return matchedTarget;

  return contexts
    .map((context) => buildFileScanTarget(context, filePath))
    .find((target): target is FileScanTarget => target !== null) ?? null;
}

async function resolveWatcherTarget(
  filePath: string,
  contexts: PlatformScanContext[],
): Promise<FileScanTarget | null> {
  const matchingContexts = contexts.filter((context) =>
    isPathInside(context.dirPath, filePath),
  );

  if (matchingContexts.length === 0) return null;

  const folderCandidates = matchingContexts
    .map((context) => ({
      context,
      folderName: getTopLevelManagedFolder(context.dirPath, filePath),
    }))
    .filter(
      (entry): entry is { context: PlatformScanContext; folderName: string } =>
        typeof entry.folderName === "string",
    );

  for (const { context, folderName } of folderCandidates) {
    const key = toManagedFolderKey(folderName);
    let matchedGameId = context.managedFolderMap.get(key);
    if (!matchedGameId) {
      // Refresh map once for dynamic game additions while watcher is running.
      context.managedFolderMap = await buildManagedFolderMap(context.platformId);
      matchedGameId = context.managedFolderMap.get(key);
    }
    if (!matchedGameId) continue;

    const ext = normalizeExtension(path.extname(filePath).slice(1));
    return {
      filePath,
      platformId: context.platformId,
      matchedGameId,
      shouldComputeHashes: context.supportedExtensions.has(ext),
    };
  }

  const ext = normalizeExtension(path.extname(filePath).slice(1));
  const extContexts = matchingContexts.filter((context) =>
    context.supportedExtensions.has(ext),
  );
  if (extContexts.length === 0) return null;

  const selectedContext = extContexts[0];
  return {
    filePath,
    platformId: selectedContext.platformId,
    shouldComputeHashes: true,
  };
}

async function collectFilesRecursive(rootDir: string, maxDepth: number): Promise<string[]> {
  const files: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(next.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(next.dir, entry.name);
      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory() && next.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: next.depth + 1 });
      }
    }
  }

  return files;
}

// ─────────────────────────────────────────────────────────────
// Core: process a single file
// ─────────────────────────────────────────────────────────────

async function processFile(
  filePath: string,
  platformId: number,
  options: { matchedGameId?: number; shouldComputeHashes: boolean },
): Promise<"added" | "updated" | "skipped" | "error"> {
  try {
    const stat = await fs.promises.stat(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const sizeBytes = stat.size;

    // Check if we already have this file
    const existing = await storage.getGameFileByPath(filePath);

    if (existing) {
      const gameChanged = options.matchedGameId && existing.gameId !== options.matchedGameId;
      if (!gameChanged && existing.sizeBytes === sizeBytes) {
        return "skipped";
      }

      const updates: Parameters<typeof storage.updateGameFile>[1] = {
        sizeBytes,
        versionStatus: "unknown",
      };

      if (gameChanged) {
        updates.gameId = options.matchedGameId;
      }

      if (options.shouldComputeHashes) {
        updates.crc32 = await computeCRC32(filePath);
        updates.md5 = null;
        updates.sha1 = null;
        hashQueue.add(() => computeFullHashes(existing.id, filePath));
      } else {
        updates.crc32 = null;
        updates.md5 = null;
        updates.sha1 = null;
      }

      await storage.updateGameFile(existing.id, updates);
      return "updated";
    }

    // New file: parse filename and find/create game record
    let gameId: number;
    let revision: string | null = null;

    if (options.matchedGameId) {
      gameId = options.matchedGameId;
    } else {
      const { title, region, revision: parsedRevision } = parseRomFilename(filename);
      revision = parsedRevision;
      const normalizedTitle = normalizeTitle(title);

      // Try to find an existing game with a matching normalized title on this platform
      const platformGames = await storage.getGamesByPlatform(platformId);
      const matchedGame = platformGames.find(
        (g) => normalizeTitle(g.title) === normalizedTitle,
      );

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
    }

    let crc32: string | null = null;
    let knownVersion: string | null = revision ?? null;

    if (options.shouldComputeHashes) {
      crc32 = await computeCRC32(filePath);
      const datMatches = await storage.getDatEntriesByHash(crc32);
      knownVersion = datMatches[0]?.revision ?? revision ?? null;
    }

    // Create game_file record
    const gameFile = await storage.createGameFile({
      gameId,
      path: filePath,
      filename,
      sizeBytes,
      fileFormat: ext.length > 0 ? ext.toUpperCase() : null,
      crc32,
      knownVersion,
      versionStatus: "unknown",
      importedAt: new Date().toISOString(),
    });

    if (options.shouldComputeHashes) {
      // Queue slow hashes in background
      hashQueue.add(() => computeFullHashes(gameFile.id, filePath));
    }

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
  const contexts = await buildPlatformScanContexts(libraryPaths);

  if (contexts.length === 0) {
    scannerLog.info("No library paths configured; skipping scan");
    return { ...progress };
  }

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
  const filesToProcess: FileScanTarget[] = [];
  const contextsByDir = new Map<string, PlatformScanContext[]>();
  for (const context of contexts) {
    const group = contextsByDir.get(context.dirPath);
    if (group) {
      group.push(context);
    } else {
      contextsByDir.set(context.dirPath, [context]);
    }
  }

  for (const [dirPath, dirContexts] of Array.from(contextsByDir.entries())) {
    const files = await collectFilesRecursive(dirPath, 6);
    for (const filePath of files) {
      const target = resolveTargetAcrossContexts(filePath, dirContexts);
      if (!target) continue;
      filesToProcess.push(target);
    }
  }

  progress.total = filesToProcess.length;
  notifyUser("scanner:progress", { ...progress });

  // Process files sequentially to avoid overwhelming SQLite
  for (const target of filesToProcess) {
    const { filePath } = target;
    progress.currentFile = path.basename(filePath);
    const result = await processFile(filePath, target.platformId, {
      matchedGameId: target.matchedGameId,
      shouldComputeHashes: target.shouldComputeHashes,
    });
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
  const contexts = await buildPlatformScanContexts(libraryPaths);
  const dirs = Array.from(
    new Set(
      contexts
        .map((context) => context.dirPath)
        .filter((p) => fs.existsSync(p)),
    ),
  );

  if (dirs.length === 0) return;

  watcher = chokidarWatch(dirs, {
    ignoreInitial: true,
    depth: 6,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  watcher.on("add", async (filePath: string) => {
    const target = await resolveWatcherTarget(filePath, contexts);
    if (!target) return;
    scannerLog.info(
      {
        filePath,
        platformId: target.platformId,
        matchedGameId: target.matchedGameId ?? undefined,
      },
      "Watcher: new file detected",
    );
    await processFile(filePath, target.platformId, {
      matchedGameId: target.matchedGameId,
      shouldComputeHashes: target.shouldComputeHashes,
    });
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
