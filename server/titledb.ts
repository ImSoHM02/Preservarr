import { storage } from "./storage.js";
import { logger } from "./logger.js";
import type { InferInsertModel } from "drizzle-orm";
import type { titledbEntries } from "../shared/schema.js";

const titledbLogger = logger.child({ module: "titledb" });

// titledb JSON format: keyed by Title ID
// Each entry has: id, name, version, publisher, iconUrl, etc.
interface TitledbJsonEntry {
  id: string;
  name?: string;
  version?: number;
  publisher?: string;
  iconUrl?: string;
  region?: string;
}

// titledb GitHub raw URLs per region
const TITLEDB_URLS: Record<string, string> = {
  US: "https://raw.githubusercontent.com/nicoboss/titledb/master/US.en.json",
  EU: "https://raw.githubusercontent.com/nicoboss/titledb/master/EU.en.json",
  JP: "https://raw.githubusercontent.com/nicoboss/titledb/master/JP.ja.json",
};

const DEFAULT_REGION = "US";

/**
 * Fetch the titledb JSON for a given region and store entries in the database.
 * Creates or updates the version_source record for the Switch platform.
 */
export async function syncTitledb(region: string = DEFAULT_REGION): Promise<{
  entryCount: number;
  updated: number;
  outdated: number;
}> {
  const url = TITLEDB_URLS[region];
  if (!url) {
    throw new Error(`Unknown titledb region: ${region}. Valid: ${Object.keys(TITLEDB_URLS).join(", ")}`);
  }

  titledbLogger.info({ region, url }, "starting titledb sync");

  // Find the Switch platform
  const platforms = await storage.getPlatforms();
  const switchPlatform = platforms.find((p) => p.slug === "switch");
  if (!switchPlatform) {
    throw new Error("Nintendo Switch platform not found in database");
  }

  // Fetch the JSON
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch titledb: ${response.status} ${response.statusText}`);
  }

  const rawData: Record<string, TitledbJsonEntry> = await response.json();
  titledbLogger.info({ region, rawCount: Object.keys(rawData).length }, "fetched titledb JSON");

  // Parse entries — only keep base application titles (Title ID ends in 000)
  const entries: InferInsertModel<typeof titledbEntries>[] = [];

  // Get or create version source
  const existingSources = await storage.getVersionSources(switchPlatform.id);
  let versionSource = existingSources.find((s) => s.sourceType === "titledb");

  if (!versionSource) {
    versionSource = await storage.createVersionSource({
      platformId: switchPlatform.id,
      sourceType: "titledb",
      url,
      lastSyncedAt: new Date().toISOString(),
      entryCount: 0,
    });
  }

  // Clear old entries before re-importing
  await storage.clearTitledbEntries(versionSource.id);

  for (const [titleId, entry] of Object.entries(rawData)) {
    if (!titleId || !entry) continue;

    // titledb uses numeric IDs as keys but the actual Title ID is in the entry
    // The version field is a number (e.g., 0, 65536, 131072 — multiples of 65536)
    const version = entry.version != null ? String(entry.version) : null;

    // Compute the update Title ID: base app ID with 800 replacing the last 3 chars
    // e.g., 01007EF00011E000 → 01007EF00011E800
    const baseTitleId = entry.id || titleId;
    const updateTitleId = baseTitleId.length === 16
      ? baseTitleId.slice(0, 13) + "800"
      : null;

    entries.push({
      versionSourceId: versionSource.id,
      titleId: baseTitleId,
      name: entry.name || null,
      version,
      updateTitleId,
      iconUrl: entry.iconUrl || null,
      publisher: entry.publisher || null,
      region,
    });
  }

  titledbLogger.info({ region, parsedCount: entries.length }, "parsed titledb entries");

  // Bulk insert
  await storage.bulkInsertTitledbEntries(entries);

  // Update version source metadata
  await storage.updateVersionSource(versionSource.id, {
    lastSyncedAt: new Date().toISOString(),
    entryCount: entries.length,
    url,
  });

  // Now run version checks against owned Switch games
  const result = await checkSwitchVersions(switchPlatform.id);

  titledbLogger.info(
    { region, entryCount: entries.length, ...result },
    "titledb sync complete",
  );

  return { entryCount: entries.length, ...result };
}

/**
 * Check all Switch game files against titledb entries.
 * Updates version status on game_files and optionally adds outdated titles to wanted.
 */
export async function checkSwitchVersions(platformId: number): Promise<{
  updated: number;
  outdated: number;
}> {
  let updated = 0;
  let outdated = 0;

  // Get all Switch games that have a titleId set
  const gamesWithTitleId = await storage.getGamesForPlatformWithTitleId(platformId);

  if (gamesWithTitleId.length === 0) {
    titledbLogger.info("no Switch games with Title IDs found, skipping version check");
    return { updated, outdated };
  }

  titledbLogger.info({ gameCount: gamesWithTitleId.length }, "checking Switch game versions");

  const now = new Date().toISOString();

  for (const game of gamesWithTitleId) {
    if (!game.titleId) continue;

    // Look up the titledb entry
    const titledbEntry = await storage.getTitledbEntryByTitleId(game.titleId);
    if (!titledbEntry || !titledbEntry.version) {
      continue;
    }

    const latestVersion = titledbEntry.version;

    // Get all files for this game
    const files = await storage.getGameFilesByGameId(game.id);
    if (files.length === 0) continue;

    for (const file of files) {
      const knownVersion = file.knownVersion || "0";
      const isOutdated = parseInt(latestVersion, 10) > parseInt(knownVersion, 10);

      const versionStatus = isOutdated ? "outdated" : "current";

      await storage.updateGameFile(file.id, {
        latestVersion,
        versionStatus,
        versionCheckedAt: now,
      });

      updated++;
      if (isOutdated) {
        outdated++;
        titledbLogger.debug(
          { game: game.title, titleId: game.titleId, knownVersion, latestVersion },
          "game has update available",
        );
      }
    }
  }

  return { updated, outdated };
}

/**
 * Get available titledb regions.
 */
export function getTitledbRegions(): string[] {
  return Object.keys(TITLEDB_URLS);
}
