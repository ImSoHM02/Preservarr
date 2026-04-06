import fs from "fs/promises";
import type { Dirent } from "fs";
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

async function ensureUniqueDestinationDirectory(destDir: string): Promise<string> {
  if (!(await pathExists(destDir))) {
    return destDir;
  }

  for (let i = 1; i <= 999; i++) {
    const candidate = `${destDir} (${i})`;
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  return `${destDir}-${Date.now()}`;
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

async function resolvePayloadPath(
  downloadDir: string,
  statusName: string,
  contentPath: string | null,
): Promise<string | null> {
  if (contentPath && (await pathExists(contentPath))) {
    return contentPath;
  }

  const byName = path.join(downloadDir, statusName);
  if (await pathExists(byName)) {
    return byName;
  }

  return null;
}

async function removeDirectoryIfEmpty(dirPath: string): Promise<void> {
  try {
    const remaining = await fs.readdir(dirPath);
    if (remaining.length === 0) {
      await fs.rmdir(dirPath);
    }
  } catch {
    // Best effort cleanup only.
  }
}

async function moveEntryToDirectory(srcPath: string, destDir: string): Promise<string> {
  const stat = await fs.stat(srcPath);
  const baseName = path.basename(srcPath);

  if (stat.isFile()) {
    const desiredDestPath = path.join(destDir, baseName);
    const destPath = await ensureUniqueDestinationPath(desiredDestPath);
    await moveFileWithCrossDeviceFallback(srcPath, destPath);
    return destPath;
  }

  let desiredDirPath = path.join(destDir, baseName);
  const existing = await fs.stat(desiredDirPath).catch(() => null);
  if (existing && !existing.isDirectory()) {
    desiredDirPath = await ensureUniqueDestinationDirectory(desiredDirPath);
  }

  try {
    await fs.rename(srcPath, desiredDirPath);
    return desiredDirPath;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!["EXDEV", "EEXIST", "ENOTEMPTY"].includes(code ?? "")) throw err;
  }

  await fs.mkdir(desiredDirPath, { recursive: true });
  const entries = await fs.readdir(srcPath, { withFileTypes: true });

  for (const entry of entries) {
    const nextSrc = path.join(srcPath, entry.name);
    await moveEntryToDirectory(nextSrc, desiredDirPath);
  }

  await removeDirectoryIfEmpty(srcPath);

  return desiredDirPath;
}

async function moveDirectoryContents(srcDir: string, destDir: string): Promise<string[]> {
  const entries: Dirent[] = await fs.readdir(srcDir, { withFileTypes: true });
  const movedPaths: string[] = [];

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    movedPaths.push(await moveEntryToDirectory(srcPath, destDir));
  }

  await removeDirectoryIfEmpty(srcDir);
  return movedPaths;
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

      // Resolve the game and platform so we can determine destination directory
      const game = await storage.getGame(entry.gameId);
      if (!game) continue;

      const platform = await storage.getPlatform(game.platformId);
      if (!platform) continue;

      const contentPath = getNonEmptyString(statusObj.contentPath);
      const payloadPath = await resolvePayloadPath(downloadDir, status.name, contentPath);

      if (!payloadPath) {
        importLog.warn(
          {
            historyId: entry.id,
            downloadDir,
            contentPath: contentPath ?? undefined,
            name: status.name,
          },
          "Download payload path not found — skipping import",
        );
        continue;
      }

      // Get the configured library path for this platform
      const rawPaths = await storage.getSetting("library_paths");
      const libraryPaths = parseLibraryPaths(rawPaths as unknown);
      const libraryRoot = libraryPaths[platform.slug];
      const gameFolderName = sanitizePathSegment(game.title);
      const gameDestDir = libraryRoot ? path.join(libraryRoot, gameFolderName) : null;

      let finalPath = payloadPath;

      if (gameDestDir && !isPathInside(gameDestDir, payloadPath)) {
        // Move full payload into /<library>/<game title>/
        try {
          await fs.mkdir(gameDestDir, { recursive: true });
          const payloadStat = await fs.stat(payloadPath);

          if (payloadStat.isDirectory()) {
            const movedPaths = await moveDirectoryContents(payloadPath, gameDestDir);
            finalPath = gameDestDir;
            importLog.info(
              { srcPath: payloadPath, destDir: gameDestDir, movedCount: movedPaths.length },
              "Release directory moved to game library folder",
            );
          } else {
            const desiredDestPath = path.join(gameDestDir, path.basename(payloadPath));
            const destPath = await ensureUniqueDestinationPath(desiredDestPath);
            await moveFileWithCrossDeviceFallback(payloadPath, destPath);
            finalPath = destPath;
            importLog.info({ srcPath: payloadPath, destPath }, "File moved to game library folder");
          }
        } catch (err) {
          importLog.error(
            { err, srcPath: payloadPath, destDir: gameDestDir },
            "Failed to move payload to library folder — leaving in place",
          );
          // Still continue with payloadPath so we complete import state.
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
