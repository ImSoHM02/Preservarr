import { PLATFORM_CATALOG } from "../shared/platform-catalog.js";
import { getPlatformSourceMapping } from "../shared/platform-source-mapping.js";
import { logger } from "./logger.js";
import { storage } from "./storage.js";

export async function syncPlatformCatalog(): Promise<void> {
  let inserted = 0;
  let updated = 0;
  let removed = 0;
  let archived = 0;
  const allowedSlugs = new Set(PLATFORM_CATALOG.map((entry) => entry.slug));

  for (const entry of PLATFORM_CATALOG) {
    const mappedSource = getPlatformSourceMapping(entry.slug);
    const namingStandard = mappedSource?.namingStandard ?? entry.namingStandard;
    const versionSource = mappedSource?.versionSource ?? entry.versionSource;
    const existing = await storage.getPlatformBySlug(entry.slug);
    if (existing) {
      const shouldUpdateNamingStandard =
        existing.namingStandard === "none" && namingStandard !== "none";
      const shouldUpdateVersionSource =
        existing.versionSource === "none" && versionSource !== "none";
      const shouldUpdateIgdbId =
        (existing.igdbPlatformId === null || existing.igdbPlatformId === undefined) &&
        entry.igdbPlatformId !== null &&
        entry.igdbPlatformId !== undefined;

      if (shouldUpdateNamingStandard || shouldUpdateVersionSource || shouldUpdateIgdbId) {
        await storage.upsertPlatform({
          ...existing,
          namingStandard: shouldUpdateNamingStandard ? namingStandard : existing.namingStandard,
          versionSource: shouldUpdateVersionSource ? versionSource : existing.versionSource,
          igdbPlatformId: shouldUpdateIgdbId ? entry.igdbPlatformId : existing.igdbPlatformId,
        });
        updated += 1;
      }
      continue;
    }

    await storage.upsertPlatform({
      name: entry.name,
      slug: entry.slug,
      fileExtensions: entry.fileExtensions,
      namingStandard,
      versionSource,
      enabled: true,
      hidden: false,
      torznabCategories: entry.torznabCategories,
      igdbPlatformId: entry.igdbPlatformId,
    });
    inserted += 1;
  }

  const existingPlatforms = await storage.getPlatforms();
  for (const platform of existingPlatforms) {
    if (allowedSlugs.has(platform.slug)) {
      continue;
    }

    const gameCount = await storage.getPlatformGameCount(platform.id);
    if (gameCount === 0) {
      await storage.deletePlatform(platform.id);
      removed += 1;
      continue;
    }

    if (!platform.hidden || platform.enabled) {
      await storage.upsertPlatform({
        ...platform,
        hidden: true,
        enabled: false,
      });
      archived += 1;
    }
  }

  logger.info(
    {
      inserted,
      updated,
      removed,
      archived,
      total: PLATFORM_CATALOG.length,
    },
    "Platform catalog sync complete"
  );
}
