import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateToken } from "../auth.js";
import { db } from "../db.js";
import { games, gameFiles, wantedGames } from "../../shared/schema.js";
import { eq, sql, count } from "drizzle-orm";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

// GET /api/platforms — list all platforms with game counts
router.get("/", async (_req, res) => {
  try {
    const allPlatforms = await storage.getPlatforms();

    // Get game counts per platform in one query
    const gameCounts = db
      .select({
        platformId: games.platformId,
        count: count().as("count"),
      })
      .from(games)
      .groupBy(games.platformId)
      .all();

    const countMap = new Map(gameCounts.map((r) => [r.platformId, r.count]));

    const result = allPlatforms.map((p) => ({
      ...p,
      gameCount: countMap.get(p.id) ?? 0,
    }));

    res.json(result);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch platforms",
      route: "GET /api/platforms",
    });
  }
});

// GET /api/platforms/:slug — get a single platform by slug
router.get("/:slug", async (req, res) => {
  try {
    const platform = await storage.getPlatformBySlug(req.params.slug);
    if (!platform) {
      return res.status(404).json({ error: "Platform not found" });
    }

    // Get game count
    const result = db
      .select({ count: count() })
      .from(games)
      .where(eq(games.platformId, platform.id))
      .get();

    res.json({ ...platform, gameCount: result?.count ?? 0 });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch platform",
      route: "GET /api/platforms/:slug",
      context: { slug: req.params.slug },
    });
  }
});

// PATCH /api/platforms/:id — update a platform (enable/disable, edit categories, etc.)
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const platform = await storage.getPlatform(id);
    if (!platform) {
      return res.status(404).json({ error: "Platform not found" });
    }

    const { enabled, torznabCategories, igdbPlatformId } = req.body;
    const updated = await storage.upsertPlatform({
      ...platform,
      enabled: enabled !== undefined ? enabled : platform.enabled,
      torznabCategories:
        torznabCategories !== undefined
          ? torznabCategories
          : platform.torznabCategories,
      igdbPlatformId:
        igdbPlatformId !== undefined
          ? igdbPlatformId
          : platform.igdbPlatformId,
    });

    res.json(updated);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update platform",
      route: "PATCH /api/platforms/:id",
      context: { platformId: req.params.id },
    });
  }
});

// GET /api/platforms/:slug/stats — get detailed stats for a platform
router.get("/:slug/stats", async (req, res) => {
  try {
    const platform = await storage.getPlatformBySlug(req.params.slug);
    if (!platform) {
      return res.status(404).json({ error: "Platform not found" });
    }

    const totalGames = db
      .select({ count: count() })
      .from(games)
      .where(eq(games.platformId, platform.id))
      .get();

    const totalFiles = db
      .select({ count: count() })
      .from(gameFiles)
      .innerJoin(games, eq(gameFiles.gameId, games.id))
      .where(eq(games.platformId, platform.id))
      .get();

    const wantedCount = db
      .select({ count: count() })
      .from(wantedGames)
      .innerJoin(games, eq(wantedGames.gameId, games.id))
      .where(eq(games.platformId, platform.id))
      .get();

    res.json({
      totalGames: totalGames?.count ?? 0,
      totalFiles: totalFiles?.count ?? 0,
      wantedGames: wantedCount?.count ?? 0,
    });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch platform stats",
      route: "GET /api/platforms/:slug/stats",
      context: { slug: req.params.slug },
    });
  }
});

export default router;
