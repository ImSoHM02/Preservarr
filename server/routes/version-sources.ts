import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { storage } from "../storage.js";
import { parseDatFile } from "../dat-parser.js";
import { sendRouteError } from "../errors.js";
import { routesLogger } from "../logger.js";

const router = Router();
router.use(authenticateToken);

// GET /api/version-sources — list all version sources, enriched with platform info
router.get("/", async (_req, res) => {
  try {
    const sources = await storage.getVersionSources();
    const platforms = await storage.getPlatforms();
    const platformMap = new Map(platforms.map((p) => [p.id, p]));

    const enriched = sources.map((s) => ({
      ...s,
      platform: platformMap.get(s.platformId) ?? null,
    }));

    res.json(enriched);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch version sources",
      route: "GET /api/version-sources",
    });
  }
});

// GET /api/version-sources/platforms — list platforms eligible for DAT import (no-intro or redump)
router.get("/platforms", async (_req, res) => {
  try {
    const platforms = await storage.getPlatforms();
    const sources = await storage.getVersionSources();

    // Build a map of platformId → existing version source
    const sourceMap = new Map(sources.map((s) => [s.platformId, s]));

    const eligible = platforms
      .filter((p) => p.versionSource === "no-intro" || p.versionSource === "redump")
      .map((p) => ({
        ...p,
        existingSource: sourceMap.get(p.id) ?? null,
      }));

    res.json(eligible);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch eligible platforms",
      route: "GET /api/version-sources/platforms",
    });
  }
});

// POST /api/version-sources/upload — upload and parse a DAT file for a platform
router.post("/upload", async (req, res) => {
  try {
    const { platformId, content, filename } = req.body as {
      platformId: number;
      content: string;
      filename?: string;
    };

    if (!platformId || !content) {
      return res.status(400).json({ error: "platformId and content are required" });
    }

    const platform = await storage.getPlatform(platformId);
    if (!platform) {
      return res.status(404).json({ error: "Platform not found" });
    }

    if (platform.versionSource !== "no-intro" && platform.versionSource !== "redump") {
      return res.status(400).json({
        error: `Platform "${platform.name}" uses version source "${platform.versionSource}", not no-intro or redump`,
      });
    }

    // Parse the DAT XML
    const parsed = parseDatFile(content);

    routesLogger.info(
      {
        platformId,
        platformName: platform.name,
        datName: parsed.name,
        entryCount: parsed.entries.length,
        filename,
      },
      "Parsed DAT file"
    );

    if (parsed.entries.length === 0) {
      return res.status(400).json({ error: "DAT file contains no valid entries with hashes" });
    }

    // Check for existing version source for this platform
    const existingSources = await storage.getVersionSources(platformId);
    const existingDat = existingSources.find(
      (s) => s.sourceType === platform.versionSource
    );

    let versionSourceId: number;

    if (existingDat) {
      // Clear old entries and update the source
      await storage.clearDatEntries(existingDat.id);
      await storage.updateVersionSource(existingDat.id, {
        filePath: filename ?? parsed.name,
        lastSyncedAt: new Date().toISOString(),
        entryCount: parsed.entries.length,
      });
      versionSourceId = existingDat.id;
    } else {
      // Create new version source
      const source = await storage.createVersionSource({
        platformId,
        sourceType: platform.versionSource as "no-intro" | "redump",
        filePath: filename ?? parsed.name,
        lastSyncedAt: new Date().toISOString(),
        entryCount: parsed.entries.length,
      });
      versionSourceId = source.id;
    }

    // Bulk insert all entries
    await storage.bulkInsertDatEntries(
      parsed.entries.map((e) => ({
        versionSourceId,
        gameTitle: e.gameTitle,
        region: e.region,
        revision: e.revision,
        crc32: e.crc32,
        md5: e.md5,
        sha1: e.sha1,
      }))
    );

    // Re-match existing game files for this platform against new DAT entries
    const matchResult = await rematchGameFiles(platformId);

    const source = await storage.getVersionSource(versionSourceId);

    res.json({
      source,
      parsed: {
        name: parsed.name,
        description: parsed.description,
        entryCount: parsed.entries.length,
      },
      matched: matchResult,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid DAT file")) {
      return res.status(400).json({ error: error.message });
    }
    sendRouteError(res, error, {
      fallbackMessage: "Failed to import DAT file",
      route: "POST /api/version-sources/upload",
    });
  }
});

// POST /api/version-sources/:id/rematch — re-check game files against this DAT
router.post("/:id/rematch", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const source = await storage.getVersionSource(id);
    if (!source) return res.status(404).json({ error: "Version source not found" });

    const result = await rematchGameFiles(source.platformId);
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to re-match game files",
      route: "POST /api/version-sources/:id/rematch",
    });
  }
});

// DELETE /api/version-sources/:id — remove a version source and its entries
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const source = await storage.getVersionSource(id);
    if (!source) return res.status(404).json({ error: "Version source not found" });

    await storage.deleteVersionSource(id);

    // Reset version status for game files on this platform
    const gameFilesForPlatform = await storage.getGameFilesForPlatform(source.platformId);
    for (const gf of gameFilesForPlatform) {
      await storage.updateGameFile(gf.id, {
        knownVersion: null,
        versionStatus: "unknown",
        versionCheckedAt: null,
      });
    }

    res.status(204).send();
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to delete version source",
      route: "DELETE /api/version-sources/:id",
    });
  }
});

/**
 * Re-match all game files for a platform against DAT entries.
 * Uses CRC32 first (fast), then SHA1 if available.
 */
async function rematchGameFiles(platformId: number): Promise<{
  total: number;
  matched: number;
  unmatched: number;
}> {
  const gameFilesForPlatform = await storage.getGameFilesForPlatform(platformId);
  let matched = 0;

  for (const gf of gameFilesForPlatform) {
    // Try SHA1 first (most accurate), then CRC32
    const hash = gf.sha1 ?? gf.crc32;
    if (!hash) continue;

    const datMatches = await storage.getDatEntriesByHash(hash);
    if (datMatches.length > 0) {
      await storage.updateGameFile(gf.id, {
        knownVersion: datMatches[0].revision ?? undefined,
        versionStatus: "current",
        versionCheckedAt: new Date().toISOString(),
      });
      matched++;
    } else {
      await storage.updateGameFile(gf.id, {
        versionStatus: "unknown",
        versionCheckedAt: new Date().toISOString(),
      });
    }
  }

  return {
    total: gameFilesForPlatform.length,
    matched,
    unmatched: gameFilesForPlatform.length - matched,
  };
}

export default router;
