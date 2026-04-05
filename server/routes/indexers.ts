import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { storage } from "../storage.js";
import { prowlarrClient } from "../prowlarr.js";
import { torznabClient } from "../torznab.js";

const router = Router();
router.use(authenticateToken);

// GET /api/indexers — list all indexers
router.get("/", async (_req, res) => {
  try {
    const indexers = await storage.getIndexers();
    res.json(indexers);
  } catch {
    res.status(500).json({ error: "Failed to fetch indexers" });
  }
});

// GET /api/indexers/:id — get single indexer
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid indexer ID" });
    const indexer = await storage.getIndexer(id);
    if (!indexer) return res.status(404).json({ error: "Indexer not found" });
    res.json(indexer);
  } catch {
    res.status(500).json({ error: "Failed to fetch indexer" });
  }
});

// POST /api/indexers — create a manual Torznab indexer
router.post("/", async (req, res) => {
  try {
    const { name, url, apiKey, priority, enabled, categories } = req.body;
    if (!name || !url || !apiKey) {
      return res.status(400).json({ error: "name, url, and apiKey are required" });
    }
    const indexer = await storage.createIndexer({
      name,
      type: "torznab",
      url,
      apiKey,
      priority: priority ?? 50,
      enabled: enabled ?? true,
      categories: categories ?? [],
    });
    res.status(201).json(indexer);
  } catch {
    res.status(500).json({ error: "Failed to create indexer" });
  }
});

// PATCH /api/indexers/:id — update indexer
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid indexer ID" });
    const indexer = await storage.getIndexer(id);
    if (!indexer) return res.status(404).json({ error: "Indexer not found" });

    const { name, url, apiKey, priority, enabled, categories } = req.body;
    const updated = await storage.updateIndexer(id, {
      ...(name !== undefined && { name }),
      ...(url !== undefined && { url }),
      ...(apiKey !== undefined && { apiKey }),
      ...(priority !== undefined && { priority }),
      ...(enabled !== undefined && { enabled }),
      ...(categories !== undefined && { categories }),
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update indexer" });
  }
});

// DELETE /api/indexers/:id — delete indexer
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid indexer ID" });
    const indexer = await storage.getIndexer(id);
    if (!indexer) return res.status(404).json({ error: "Indexer not found" });
    await storage.deleteIndexer(id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete indexer" });
  }
});

// POST /api/indexers/:id/test — test connection to an indexer
router.post("/:id/test", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid indexer ID" });
    const indexer = await storage.getIndexer(id);
    if (!indexer) return res.status(404).json({ error: "Indexer not found" });
    const result = await torznabClient.testConnection(indexer);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ success: false, message });
  }
});

// POST /api/indexers/prowlarr/sync — sync indexers from Prowlarr
router.post("/prowlarr/sync", async (_req, res) => {
  try {
    const prowlarrUrl = await storage.getSetting("prowlarr_url");
    const prowlarrApiKey = await storage.getSetting("prowlarr_api_key");

    if (!prowlarrUrl || !prowlarrApiKey) {
      return res.status(400).json({
        error: "Prowlarr URL and API key must be configured in Settings before syncing",
      });
    }

    const remoteIndexers = await prowlarrClient.getIndexers(prowlarrUrl, prowlarrApiKey);

    let added = 0;
    let updated = 0;

    for (const remote of remoteIndexers) {
      if (!remote.name || !remote.url || !remote.apiKey) continue;

      // Check if an indexer with the same URL already exists
      const existing = (await storage.getIndexers()).find((i) => i.url === remote.url);

      if (existing) {
        await storage.updateIndexer(existing.id, {
          name: remote.name,
          enabled: remote.enabled ?? true,
          priority: remote.priority ?? 50,
        });
        updated++;
      } else {
        await storage.createIndexer({
          name: remote.name,
          type: "torznab", // Prowlarr proxies everything as Torznab/Newznab
          url: remote.url,
          apiKey: remote.apiKey,
          priority: remote.priority ?? 50,
          enabled: remote.enabled ?? true,
          categories: [],
        });
        added++;
      }
    }

    res.json({
      message: `Sync complete: ${added} added, ${updated} updated`,
      added,
      updated,
      total: remoteIndexers.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Prowlarr sync failed: ${message}` });
  }
});

// POST /api/games/:gameId/search — search for a game across all enabled indexers
// (Registered here to group with indexer logic; also accessible via game routes)
router.post("/search/:gameId", async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId);
    if (isNaN(gameId)) return res.status(400).json({ error: "Invalid game ID" });

    const { qualityProfileId, query } = req.body;
    const { searchForGame } = await import("../search.js");

    const result = await searchForGame({
      gameId,
      qualityProfileId: qualityProfileId ? parseInt(qualityProfileId) : undefined,
      manualQuery: query,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
