import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { igdbClient, type IGDBGame } from "../igdb.js";
import { storage } from "../storage.js";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

// GET /api/igdb/search?q=zelda&platformId=4 — search IGDB for games
router.get("/search", async (req, res) => {
  try {
    const { q, platformId } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "q parameter is required" });
    }

    // If platformId is specified, filter IGDB results to that platform
    let igdbPlatformId: number | undefined;
    if (platformId) {
      const platform = await storage.getPlatform(parseInt(platformId as string, 10));
      if (platform?.igdbPlatformId) {
        igdbPlatformId = platform.igdbPlatformId;
      }
    }

    const results = await igdbClient.searchGames(q.trim(), 30, igdbPlatformId);
    res.json(formatResults(results));
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to search IGDB",
      route: "GET /api/igdb/search",
    });
  }
});

// POST /api/igdb/import — import an IGDB game into the local database
router.post("/import", async (req, res) => {
  try {
    const { igdbId, platformId } = req.body;

    if (!igdbId || !platformId) {
      return res.status(400).json({ error: "igdbId and platformId are required" });
    }

    const platform = await storage.getPlatform(platformId);
    if (!platform) {
      return res.status(400).json({ error: "Invalid platformId" });
    }

    // Check if already imported
    const existing = await storage.getGameByIgdbId(igdbId);
    if (existing && existing.platformId === platformId) {
      return res.status(409).json({ error: "Game already exists for this platform", game: existing });
    }

    // Fetch full game data from IGDB
    const igdbGame = await igdbClient.getGameById(igdbId);
    if (!igdbGame) {
      return res.status(404).json({ error: "Game not found on IGDB" });
    }

    const coverUrl = igdbGame.cover?.url
      ? `https:${igdbGame.cover.url.replace("t_thumb", "t_cover_big")}`
      : null;

    const releaseDate = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000).toISOString().split("T")[0]
      : null;

    const game = await storage.createGame({
      title: igdbGame.name,
      igdbId: igdbGame.id,
      platformId,
      coverUrl,
      description: igdbGame.summary ?? null,
      releaseDate,
      genres: igdbGame.genres?.map((g) => g.name) ?? null,
      alternateNames: null,
      region: null,
      titleId: null,
    });

    res.status(201).json(game);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to import game from IGDB",
      route: "POST /api/igdb/import",
    });
  }
});

// POST /api/igdb/import/batch — import multiple IGDB games at once
router.post("/import/batch", async (req, res) => {
  try {
    const { games: gameList, platformId } = req.body;

    if (!Array.isArray(gameList) || !platformId) {
      return res.status(400).json({ error: "games (array of igdbIds) and platformId are required" });
    }

    const platform = await storage.getPlatform(platformId);
    if (!platform) {
      return res.status(400).json({ error: "Invalid platformId" });
    }

    const results: { imported: number; skipped: number; failed: number; games: unknown[] } = {
      imported: 0,
      skipped: 0,
      failed: 0,
      games: [],
    };

    // Fetch all games from IGDB in batch
    const igdbGames = await igdbClient.getGamesByIds(gameList);
    const igdbMap = new Map(igdbGames.map((g) => [g.id, g]));

    for (const igdbId of gameList) {
      try {
        const existing = await storage.getGameByIgdbId(igdbId);
        if (existing && existing.platformId === platformId) {
          results.skipped++;
          continue;
        }

        const igdbGame = igdbMap.get(igdbId);
        if (!igdbGame) {
          results.failed++;
          continue;
        }

        const coverUrl = igdbGame.cover?.url
          ? `https:${igdbGame.cover.url.replace("t_thumb", "t_cover_big")}`
          : null;

        const releaseDate = igdbGame.first_release_date
          ? new Date(igdbGame.first_release_date * 1000).toISOString().split("T")[0]
          : null;

        const game = await storage.createGame({
          title: igdbGame.name,
          igdbId: igdbGame.id,
          platformId,
          coverUrl,
          description: igdbGame.summary ?? null,
          releaseDate,
          genres: igdbGame.genres?.map((g) => g.name) ?? null,
          alternateNames: null,
          region: null,
          titleId: null,
        });

        results.imported++;
        results.games.push(game);
      } catch {
        results.failed++;
      }
    }

    res.status(201).json(results);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to batch import games",
      route: "POST /api/igdb/import/batch",
    });
  }
});

// GET /api/igdb/status — check if IGDB credentials are configured
router.get("/status", async (_req, res) => {
  try {
    // Try a minimal search to verify credentials work
    const results = await igdbClient.searchGames("test", 1);
    res.json({ configured: true, working: true });
  } catch {
    res.json({ configured: false, working: false });
  }
});

function formatResults(games: IGDBGame[]) {
  return games.map((game) => ({
    igdbId: game.id,
    name: game.name,
    summary: game.summary ?? null,
    coverUrl: game.cover?.url
      ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
      : null,
    releaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().split("T")[0]
      : null,
    rating: game.rating ? Math.round(game.rating) : null,
    platforms: game.platforms?.map((p) => ({ id: p.id, name: p.name })) ?? [],
    genres: game.genres?.map((g) => g.name) ?? [],
  }));
}

export default router;
