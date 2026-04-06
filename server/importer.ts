import fs from "fs/promises";
import path from "path";
import { storage } from "./storage.js";
import { DownloaderManager } from "./downloaders.js";
import { expressLogger } from "./logger.js";

const importLog = expressLogger.child({ module: "importer" });

let pollerInterval: ReturnType<typeof setInterval> | null = null;

// Statuses that indicate a download client considers a torrent done
const COMPLETE_STATUSES = new Set([
  "seeding",
  "completed",
  "pausedUP",   // qBittorrent: paused after upload
  "stalledUP",  // qBittorrent: stalled after upload
  "uploading",  // qBittorrent: actively uploading (download done)
  "Seeding",    // Transmission
  "Stopped",    // Transmission when finished
]);

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseLibraryPaths(raw: unknown): Record<string, string> {
  if (!raw) return {};

  const asRecord = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        out[key] = entry.trim();
      }
    }
    return out;
  };

  // Historically this setting has been stored both as JSON string and object.
  if (typeof raw === "string") {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  return asRecord(raw);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function hasSupportedExtension(filePath: string, extensions: string[]): boolean {
  const exts = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, "")));
  return exts.has(path.extname(filePath).slice(1).toLowerCase());
}

async function findFirstByExtensionRecursive(
  rootDir: string,
  extensions: string[],
  maxDepth: number,
): Promise<string | null> {
  const exts = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, "")));
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;

    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(next.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (exts.has(ext)) {
          return path.join(next.dir, entry.name);
        }
      }
    }

    if (next.depth >= maxDepth) continue;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dir: path.join(next.dir, entry.name), depth: next.depth + 1 });
      }
    }
  }

  return null;
}

function isPathInside(parentDir: string, candidatePath: string): boolean {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  const rel = path.relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function ensureUniqueDestinationPath(destPath: string): Promise<string> {
  if (!(await pathExists(destPath))) {
    return destPath;
  }

  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);

  for (let i = 1; i <= 999; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

async function moveFileWithCrossDeviceFallback(srcPath: string, destPath: string): Promise<void> {
  try {
    await fs.rename(srcPath, destPath);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") throw err;
  }

  await fs.copyFile(srcPath, destPath);
  await fs.unlink(srcPath);
}

/**
 * Find the first ROM file matching the given extensions inside a directory.
 * Checks: dir/name (direct file), dir/name/ (sub-folder), then dir/ directly.
 */
async function findRomFile(
  dir: string,
  name: string,
  extensions: string[],
): Promise<string | null> {
  const exts = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, "")));

  // 1. Maybe the torrent name IS the file
  const nameExt = path.extname(name).slice(1).toLowerCase();
  if (exts.has(nameExt)) {
    const p = path.join(dir, name);
    try {
      await fs.access(p);
      return p;
    } catch {
      // fall through
    }
  }

  // 2. Torrent saves into a sub-folder named after the release
  const subDir = path.join(dir, name);
  try {
    const recursiveMatch = await findFirstByExtensionRecursive(subDir, extensions, 4);
    if (recursiveMatch) {
      return recursiveMatch;
    }
  } catch {
    // sub-folder doesn't exist or can't be read
  }

  // 3. Scan the top-level download dir for any matching extension
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (exts.has(path.extname(entry.name).slice(1).toLowerCase())) {
        return path.join(dir, entry.name);
      }
    }
  } catch {
    // can't read dir
  }

  return null;
}

export async function pollImports(): Promise<void> {
  const active = await storage.getActiveDownloadHistory();
  if (active.length === 0) return;

  for (const entry of active) {
    // Only process entries that have both client and external ID (added via Preservarr)
    if (!entry.downloadClientId || !entry.externalId) continue;

    const client = await storage.getDownloadClient(entry.downloadClientId);
    if (!client) continue;

    try {
      const status = await DownloaderManager.getDownloadStatus(client, entry.externalId);
      if (!status) continue;

      const isComplete =
        status.progress >= 100 || COMPLETE_STATUSES.has(status.status);

      if (!isComplete) continue;

      importLog.info(
        { historyId: entry.id, externalId: entry.externalId, progress: status.progress },
        "Download complete — importing",
      );

      // Determine save directory: prefer downloadDir from client status, fall back to client.downloadPath
      const statusObj = status as Record<string, unknown>;
      const downloadDir =
        getNonEmptyString(statusObj.downloadDir) ??
        getNonEmptyString(client.downloadPath);

      if (!downloadDir) {
        importLog.warn({ historyId: entry.id }, "No downloadDir available — skipping import");
        await storage.updateDownloadHistoryEntry(entry.id, {
          status: "failed",
          completedAt: new Date().toISOString(),
        });
        continue;
      }

      // Resolve the game and platform so we know which extensions to look for
      const game = await storage.getGame(entry.gameId);
      if (!game) continue;

      const platform = await storage.getPlatform(game.platformId);
      if (!platform) continue;

      const extensions = (platform.fileExtensions as string[] | null) ?? [];

      let srcPath: string | null = null;

      const contentPath = getNonEmptyString(statusObj.contentPath);
      if (contentPath) {
        try {
          const contentStat = await fs.stat(contentPath);
          if (contentStat.isFile() && hasSupportedExtension(contentPath, extensions)) {
            srcPath = contentPath;
          } else if (contentStat.isDirectory()) {
            srcPath = await findFirstByExtensionRecursive(contentPath, extensions, 4);
          }
        } catch {
          // fall back to downloadDir/name lookup below
        }
      }

      if (!srcPath) {
        srcPath = await findRomFile(downloadDir, status.name, extensions);
      }

      if (!srcPath) {
        importLog.warn(
          {
            historyId: entry.id,
            downloadDir,
            contentPath: contentPath ?? undefined,
            name: status.name,
          },
          "ROM file not found after download — skipping import",
        );
        continue;
      }

      // Get the configured library path for this platform
      const rawPaths = await storage.getSetting("library_paths");
      const libraryPaths = parseLibraryPaths(rawPaths as unknown);
      const destDir = libraryPaths[platform.slug];

      let finalPath = srcPath;

      if (destDir && !isPathInside(destDir, srcPath)) {
        // Move to the library directory
        try {
          await fs.mkdir(destDir, { recursive: true });
          const desiredDestPath = path.join(destDir, path.basename(srcPath));
          const destPath = await ensureUniqueDestinationPath(desiredDestPath);
          await moveFileWithCrossDeviceFallback(srcPath, destPath);
          finalPath = destPath;
          importLog.info({ srcPath, destPath }, "File moved to library");
        } catch (err) {
          importLog.error({ err, srcPath, destDir }, "Failed to move file — leaving in place");
          // Still continue with srcPath so the file gets registered
        }
      }

      // Mark download history as imported
      await storage.updateDownloadHistoryEntry(entry.id, {
        status: "imported",
        completedAt: new Date().toISOString(),
      });

      // Mark wanted game as owned
      await storage.updateWantedGameStatus(entry.gameId, "owned");

      importLog.info(
        { gameId: entry.gameId, finalPath, platform: platform.slug },
        "Import complete",
      );

      // The chokidar watcher will auto-pick up the file if it landed in a watched directory.
      // If not (e.g. destDir wasn't watched yet), the user can trigger a manual scan.
    } catch (err) {
      importLog.error({ historyId: entry.id, err }, "Import poll error for entry");
    }
  }
}

export function startImportPoller(): void {
  if (pollerInterval) return;
  // Poll every 30 seconds — lightweight, just queries the DB and active download clients
  pollerInterval = setInterval(() => {
    pollImports().catch((err) =>
      importLog.error({ err }, "Unhandled error in import poller"),
    );
  }, 30_000);
  importLog.info("Import poller started (30 s interval)");
}

export function stopImportPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    importLog.info("Import poller stopped");
  }
}
