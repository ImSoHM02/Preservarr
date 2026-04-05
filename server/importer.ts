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
    const entries = await fs.readdir(subDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (exts.has(path.extname(entry.name).slice(1).toLowerCase())) {
        return path.join(subDir, entry.name);
      }
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
      const downloadDir =
        (status as Record<string, unknown>).downloadDir as string | undefined ??
        client.downloadPath;

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

      const srcPath = await findRomFile(downloadDir, status.name, extensions);
      if (!srcPath) {
        importLog.warn(
          { historyId: entry.id, downloadDir, name: status.name },
          "ROM file not found after download — skipping import",
        );
        continue;
      }

      // Get the configured library path for this platform
      const rawPaths = await storage.getSetting("library_paths");
      const libraryPaths: Record<string, string> = rawPaths
        ? (JSON.parse(rawPaths) as Record<string, string>)
        : {};
      const destDir = libraryPaths[platform.slug];

      let finalPath = srcPath;

      if (destDir && path.normalize(path.dirname(srcPath)) !== path.normalize(destDir)) {
        // Move to the library directory
        try {
          await fs.mkdir(destDir, { recursive: true });
          const destPath = path.join(destDir, path.basename(srcPath));
          await fs.rename(srcPath, destPath);
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
