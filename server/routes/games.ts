import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateToken } from "../auth.js";
import { db } from "../db.js";
import { games, gameFiles, wantedGames } from "../../shared/schema.js";
import { eq, count, and } from "drizzle-orm";
import { sendRouteError } from "../errors.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../logger.js";

const router = Router();
router.use(authenticateToken);

// GET /api/games?platformId=X&search=Y — list games, optionally filtered
router.get("/", async (req, res) => {
  try {
    const { platformId, search } = req.query;

    let result;
    if (search && typeof search === "string") {
      result = await storage.searchGames(search);
      if (platformId) {
        const pid = parseInt(platformId as string, 10);
        result = result.filter((g) => g.platformId === pid);
      }
    } else if (platformId) {
      result = await storage.getGamesByPlatform(
        parseInt(platformId as string, 10),
      );
    } else {
      // Return empty array rather than all games — require a filter
      return res
        .status(400)
        .json({ error: "platformId or search parameter required" });
    }

    // Attach wanted status to each game
    const gameIds = result.map((g) => g.id);
    const wantedStatuses = gameIds.length
      ? db
          .select({
            gameId: wantedGames.gameId,
            status: wantedGames.status,
            monitored: wantedGames.monitored,
          })
          .from(wantedGames)
          .all()
          .filter((w) => gameIds.includes(w.gameId))
      : [];
    const wantedMap = new Map(wantedStatuses.map((w) => [w.gameId, w]));

    // Attach file counts
    const fileCounts = gameIds.length
      ? db
          .select({
            gameId: gameFiles.gameId,
            count: count().as("count"),
          })
          .from(gameFiles)
          .groupBy(gameFiles.gameId)
          .all()
          .filter((f) => gameIds.includes(f.gameId))
      : [];
    const fileMap = new Map(fileCounts.map((f) => [f.gameId, f.count]));

    const enriched = result.map((g) => ({
      ...g,
      wanted: wantedMap.get(g.id) ?? null,
      fileCount: fileMap.get(g.id) ?? 0,
    }));

    res.json(enriched);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch games",
      route: "GET /api/games",
    });
  }
});

// GET /api/games/:id — get a single game with files and wanted status
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const game = await storage.getGame(id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const files = await storage.getGameFiles(id);
    const wanted = await storage.getWantedGameByGameId(id);
    const platform = await storage.getPlatform(game.platformId);

    res.json({ ...game, files, wanted, platform });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch game",
      route: "GET /api/games/:id",
      context: { gameId: req.params.id },
    });
  }
});

// POST /api/games — add a game manually
router.post("/", async (req, res) => {
  try {
    const { title, platformId, igdbId, coverUrl, description, region, releaseDate, genres, alternateNames, titleId } = req.body;

    if (!title || !platformId) {
      return res.status(400).json({ error: "title and platformId are required" });
    }

    const platform = await storage.getPlatform(platformId);
    if (!platform) {
      return res.status(400).json({ error: "Invalid platformId" });
    }

    // Check for duplicate IGDB ID
    if (igdbId) {
      const existing = await storage.getGameByIgdbId(igdbId);
      if (existing) {
        return res.status(409).json({ error: "Game with this IGDB ID already exists", game: existing });
      }
    }

    const game = await storage.createGame({
      title,
      platformId,
      igdbId,
      coverUrl,
      description,
      region,
      releaseDate,
      genres,
      alternateNames,
      titleId,
    });

    res.status(201).json(game);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to create game",
      route: "POST /api/games",
    });
  }
});

// PATCH /api/games/:id — update a game
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getGame(id);
    if (!existing) {
      return res.status(404).json({ error: "Game not found" });
    }

    const game = await storage.updateGame(id, req.body);
    res.json(game);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update game",
      route: "PATCH /api/games/:id",
      context: { gameId: req.params.id },
    });
  }
});

// POST /api/games/:id/wanted — mark a game as wanted
router.post("/:id/wanted", async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const game = await storage.getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const existing = await storage.getWantedGameByGameId(gameId);
    if (existing) {
      return res.status(409).json({ error: "Game already in wanted list", wanted: existing });
    }

    const { status, monitored, qualityProfileId } = req.body;
    const wanted = await storage.createWantedGame({
      gameId,
      status: status || "wanted",
      monitored: monitored !== undefined ? monitored : true,
      qualityProfileId,
    });

    res.status(201).json(wanted);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to add game to wanted list",
      route: "POST /api/games/:id/wanted",
      context: { gameId: req.params.id },
    });
  }
});

// POST /api/games/:id/search — search indexers for a game
router.post("/:id/search", async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const game = await storage.getGame(gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const { qualityProfileId, query } = req.body;
    const { searchForGame } = await import("../search.js");

    const result = await searchForGame({
      gameId,
      qualityProfileId: qualityProfileId ? parseInt(qualityProfileId) : undefined,
      manualQuery: query,
    });

    res.json(result);
  } catch (err) {
    sendRouteError(res, err, {
      fallbackMessage: "Failed to search game",
      route: "POST /api/games/:id/search",
      context: { gameId: req.params.id },
    });
  }
});

// PATCH /api/games/:id/wanted — update wanted status
router.patch("/:id/wanted", async (req, res) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    const updated = await storage.updateWantedGameStatus(gameId, status);
    if (!updated) {
      return res.status(404).json({ error: "Game not in wanted list" });
    }

    res.json(updated);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update wanted status",
      route: "PATCH /api/games/:id/wanted",
      context: { gameId: req.params.id },
    });
  }
});

// DELETE /api/games/:id — remove a game, optionally deleting files from disk
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const game = await storage.getGame(id);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const deleteFiles = req.body?.deleteFiles === true;

    if (deleteFiles) {
      const files = await storage.getGameFiles(id);
      const deletedPaths = new Set<string>();

      for (const file of files) {
        try {
          // Delete the file itself
          await fs.unlink(file.path);
          deletedPaths.add(path.dirname(file.path));
        } catch (err: any) {
          if (err.code !== "ENOENT") {
            logger.warn({ path: file.path, error: err.message }, "Failed to delete game file");
          }
        }
      }

      // Clean up now-empty parent directories
      for (const dir of Array.from(deletedPaths)) {
        try {
          const remaining = await fs.readdir(dir);
          if (remaining.length === 0) {
            await fs.rmdir(dir);
          }
        } catch {
          // Directory may already be gone or not empty — ignore
        }
      }
    }

    await storage.deleteGame(id);
    res.json({ success: true, filesDeleted: deleteFiles });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to delete game",
      route: "DELETE /api/games/:id",
      context: { gameId: req.params.id },
    });
  }
});

export default router;
