import { storage } from "./storage.js";
import { logger } from "./logger.js";
import type { InferInsertModel } from "drizzle-orm";
import type { titledbEntries } from "../shared/schema.js";

const titledbLogger = logger.child({ module: "titledb" });

interface TitledbRegionMetadataEntry {
  nsuId?: number | string;
  id: string;
  name?: string;
  version?: number | string | null;
  publisher?: string;
  iconUrl?: string;
}

type TitledbRegionMetadataJson = Record<string, TitledbRegionMetadataEntry>;
type TitledbVersionHistory = Record<string, string>;
type TitledbVersionsJson = Record<string, TitledbVersionHistory>;

const TITLEDB_REPO_BASE_URL = "https://raw.githubusercontent.com/blawar/titledb/master";
const TITLEDB_VERSIONS_URL = `${TITLEDB_REPO_BASE_URL}/versions.json`;

const TITLEDB_LOCALES = {
  US: { country: "US", language: "en" },
  GB: { country: "GB", language: "en" },
  JP: { country: "JP", language: "ja" },
} as const;

// Backward compatibility for previously-saved settings.
const LEGACY_REGION_ALIASES: Record<string, keyof typeof TITLEDB_LOCALES> = {
  EU: "GB",
};

type TitledbLocale = keyof typeof TITLEDB_LOCALES;
const DEFAULT_REGION = "US";

function normalizeTitleId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(normalized)) return null;
  return normalized;
}

function getUpdateTitleId(titleId: string): string | null {
  return titleId.length === 16 ? `${titleId.slice(0, 13)}800` : null;
}

function getBaseTitleId(titleId: string): string {
  if (titleId.length === 16 && titleId.endsWith("800")) {
    return `${titleId.slice(0, 13)}000`;
  }
  return titleId;
}

function parseVersionNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatestVersion(history: TitledbVersionHistory | undefined): number | null {
  if (!history) return null;
  let latest: number | null = null;
  for (const rawVersion of Object.keys(history)) {
    const parsed = parseVersionNumber(rawVersion);
    if (parsed === null) continue;
    if (latest === null || parsed > latest) {
      latest = parsed;
    }
  }
  return latest;
}

function resolveLocale(region: string): TitledbLocale {
  const normalized = region.trim().toUpperCase();
  if (normalized in TITLEDB_LOCALES) {
    return normalized as TitledbLocale;
  }

  const alias = LEGACY_REGION_ALIASES[normalized];
  if (alias) {
    return alias;
  }

  const valid = Object.keys(TITLEDB_LOCALES).join(", ");
  const aliases = Object.keys(LEGACY_REGION_ALIASES).join(", ");
  throw new Error(`Unknown titledb region: ${region}. Valid: ${valid}. Aliases: ${aliases}`);
}

function getMetadataUrl(locale: TitledbLocale): string {
  const { country, language } = TITLEDB_LOCALES[locale];
  return `${TITLEDB_REPO_BASE_URL}/${country}.${language}.json`;
}

/**
 * Fetch the titledb JSON for a given region and store entries in the database.
 * Creates or updates the version_source record for the Switch platform.
 */
export async function syncTitledb(region: string = DEFAULT_REGION): Promise<{
  entryCount: number;
  updated: number;
  outdated: number;
}> {
  const locale = resolveLocale(region);
  const metadataUrl = getMetadataUrl(locale);

  titledbLogger.info({ region, locale, metadataUrl }, "starting titledb sync");

  // Find the Switch platform
  const platforms = await storage.getPlatforms();
  const switchPlatform = platforms.find((p) => p.slug === "switch");
  if (!switchPlatform) {
    throw new Error("Nintendo Switch platform not found in database");
  }

  // Fetch region metadata and version history.
  const [metadataResponse, versionsResponse] = await Promise.all([
    fetch(metadataUrl),
    fetch(TITLEDB_VERSIONS_URL),
  ]);

  if (!metadataResponse.ok) {
    throw new Error(
      `Failed to fetch titledb metadata (${metadataUrl}): ${metadataResponse.status} ${metadataResponse.statusText}`,
    );
  }
  if (!versionsResponse.ok) {
    throw new Error(
      `Failed to fetch titledb versions (${TITLEDB_VERSIONS_URL}): ${versionsResponse.status} ${versionsResponse.statusText}`,
    );
  }

  const metadataByNsuId = (await metadataResponse.json()) as TitledbRegionMetadataJson;
  const versionsByTitleId = (await versionsResponse.json()) as TitledbVersionsJson;

  titledbLogger.info(
    {
      locale,
      metadataCount: Object.keys(metadataByNsuId).length,
      versionTitleCount: Object.keys(versionsByTitleId).length,
    },
    "fetched titledb JSON",
  );

  const latestVersionByBaseTitleId = new Map<string, number>();
  for (const [rawTitleId, history] of Object.entries(versionsByTitleId)) {
    const normalizedTitleId = normalizeTitleId(rawTitleId);
    if (!normalizedTitleId) continue;

    const latestVersion = getLatestVersion(history);
    if (latestVersion === null) continue;

    const baseTitleId = getBaseTitleId(normalizedTitleId);
    const existing = latestVersionByBaseTitleId.get(baseTitleId);
    if (existing === undefined || latestVersion > existing) {
      latestVersionByBaseTitleId.set(baseTitleId, latestVersion);
    }
  }

  // Get or create version source
  const existingSources = await storage.getVersionSources(switchPlatform.id);
  let versionSource = existingSources.find((s) => s.sourceType === "titledb");

  if (!versionSource) {
    versionSource = await storage.createVersionSource({
      platformId: switchPlatform.id,
      sourceType: "titledb",
      url: metadataUrl,
      lastSyncedAt: new Date().toISOString(),
      entryCount: 0,
    });
  }

  // Clear old entries before re-importing
  await storage.clearTitledbEntries(versionSource.id);

  const entriesByTitleId = new Map<string, InferInsertModel<typeof titledbEntries>>();

  // Region files are mapped by NSU ID; each entry contains a Switch Title ID in `id`.
  for (const entry of Object.values(metadataByNsuId)) {
    const baseTitleId = normalizeTitleId(entry.id);
    if (!baseTitleId) continue;

    const latestVersion = latestVersionByBaseTitleId.get(baseTitleId);
    const fallbackVersion = parseVersionNumber(entry.version);

    entriesByTitleId.set(baseTitleId, {
      versionSourceId: versionSource.id,
      titleId: baseTitleId,
      name: entry.name || null,
      version: latestVersion !== undefined
        ? String(latestVersion)
        : (fallbackVersion !== null ? String(fallbackVersion) : null),
      updateTitleId: getUpdateTitleId(baseTitleId),
      dlcTitleIds: null,
      iconUrl: entry.iconUrl || null,
      publisher: entry.publisher || null,
      region: locale,
    });
  }

  // Keep version-only titles too, in case a title is not present in the selected locale file.
  for (const [baseTitleId, latestVersion] of Array.from(latestVersionByBaseTitleId.entries())) {
    if (entriesByTitleId.has(baseTitleId)) continue;

    entriesByTitleId.set(baseTitleId, {
      versionSourceId: versionSource.id,
      titleId: baseTitleId,
      name: null,
      version: String(latestVersion),
      updateTitleId: getUpdateTitleId(baseTitleId),
      dlcTitleIds: null,
      iconUrl: null,
      publisher: null,
      region: locale,
    });
  }

  const entries = Array.from(entriesByTitleId.values());
  titledbLogger.info({ locale, parsedCount: entries.length }, "parsed titledb entries");

  // Bulk insert
  await storage.bulkInsertTitledbEntries(entries);

  // Update version source metadata
  await storage.updateVersionSource(versionSource.id, {
    lastSyncedAt: new Date().toISOString(),
    entryCount: entries.length,
    url: metadataUrl,
  });

  // Now run version checks against owned Switch games
  const result = await checkSwitchVersions(switchPlatform.id);

  titledbLogger.info(
    { region, locale, entryCount: entries.length, ...result },
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
    const latestVersionNumber = parseVersionNumber(latestVersion);
    if (latestVersionNumber === null) {
      continue;
    }

    // Get all files for this game
    const files = await storage.getGameFilesByGameId(game.id);
    if (files.length === 0) continue;

    for (const file of files) {
      const knownVersion = file.knownVersion || "0";
      const knownVersionNumber = parseVersionNumber(knownVersion) ?? 0;
      const isOutdated = latestVersionNumber > knownVersionNumber;

      const versionStatus = isOutdated ? "outdated" : "current";

      await storage.updateGameFile(file.id, {
        latestVersion: String(latestVersionNumber),
        versionStatus,
        versionCheckedAt: now,
      });

      updated++;
      if (isOutdated) {
        outdated++;
        titledbLogger.debug(
          {
            game: game.title,
            titleId: game.titleId,
            knownVersion,
            latestVersion: String(latestVersionNumber),
          },
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
  return Object.keys(TITLEDB_LOCALES).sort();
}
