import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { storage } from "../storage.js";
import { DownloaderManager } from "../downloaders.js";

const router = Router();
router.use(authenticateToken);

// GET /api/download-clients — list all download clients
router.get("/", async (_req, res) => {
  try {
    const clients = await storage.getDownloadClients();
    // Mask passwords in response
    const masked = clients.map((c) => ({ ...c, password: c.password ? "••••••••" : null }));
    res.json(masked);
  } catch {
    res.status(500).json({ error: "Failed to fetch download clients" });
  }
});

// GET /api/download-clients/:id — get single client
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const client = await storage.getDownloadClient(id);
    if (!client) return res.status(404).json({ error: "Download client not found" });
    res.json({ ...client, password: client.password ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "Failed to fetch download client" });
  }
});

// POST /api/download-clients — add a new download client
router.post("/", async (req, res) => {
  try {
    const { name, type, url, username, password, downloadPath, platformPaths, enabled } =
      req.body;

    if (!name || !type || !url) {
      return res.status(400).json({ error: "name, type, and url are required" });
    }

    const validTypes = ["qbittorrent", "transmission", "rtorrent", "nzbget", "sabnzbd"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    }

    const client = await storage.createDownloadClient({
      name,
      type,
      url,
      username: username ?? null,
      password: password ?? null,
      downloadPath: downloadPath ?? null,
      platformPaths: platformPaths ?? null,
      enabled: enabled ?? true,
    });

    res.status(201).json({ ...client, password: client.password ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "Failed to create download client" });
  }
});

// PATCH /api/download-clients/:id — update a download client
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await storage.getDownloadClient(id);
    if (!existing) return res.status(404).json({ error: "Download client not found" });

    const { name, type, url, username, password, downloadPath, platformPaths, enabled } =
      req.body;

    // Don't overwrite the stored password if the masked placeholder is sent back
    const resolvedPassword =
      password === "••••••••" ? existing.password : (password ?? existing.password);

    const updated = await storage.updateDownloadClient(id, {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(url !== undefined && { url }),
      ...(username !== undefined && { username }),
      ...(resolvedPassword !== undefined && { password: resolvedPassword }),
      ...(downloadPath !== undefined && { downloadPath }),
      ...(platformPaths !== undefined && { platformPaths }),
      ...(enabled !== undefined && { enabled }),
    });

    res.json({ ...updated, password: updated?.password ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "Failed to update download client" });
  }
});

// DELETE /api/download-clients/:id — delete a download client
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await storage.getDownloadClient(id);
    if (!existing) return res.status(404).json({ error: "Download client not found" });
    await storage.deleteDownloadClient(id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete download client" });
  }
});

// POST /api/download-clients/:id/test — test connection
router.post("/:id/test", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const client = await storage.getDownloadClient(id);
    if (!client) return res.status(404).json({ error: "Download client not found" });

    const result = await DownloaderManager.testDownloader(client);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ success: false, message });
  }
});

// GET /api/download-clients/:id/queue — get active downloads from a client
router.get("/:id/queue", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const client = await storage.getDownloadClient(id);
    if (!client) return res.status(404).json({ error: "Download client not found" });

    const queue = await DownloaderManager.getAllDownloads(client);
    res.json(queue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

// POST /api/download-clients/:id/add — send a torrent/NZB to a specific client
router.post("/:id/add", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const client = await storage.getDownloadClient(id);
    if (!client) return res.status(404).json({ error: "Download client not found" });
    if (!client.enabled) return res.status(400).json({ error: "Download client is disabled" });

    const { url, title, gameId, indexerId, sizeBytes, seeders, score } = req.body;
    if (!url || !title || !gameId) {
      return res.status(400).json({ error: "url, title, and gameId are required" });
    }

    const result = await DownloaderManager.addDownload(client, {
      url,
      title,
      downloadType: url.startsWith("magnet:") || url.endsWith(".torrent") ? "torrent" : "usenet",
      downloadPath: client.downloadPath ?? undefined,
    });

    if (!result.success) {
      return res.status(502).json({ error: result.message });
    }

    // Record in download history
    await storage.createDownloadHistoryEntry({
      gameId: parseInt(gameId),
      indexerId: indexerId ? parseInt(indexerId) : null,
      releaseTitle: title,
      sizeBytes: sizeBytes ?? null,
      seeders: seeders ?? null,
      score: score ?? null,
      downloadClientId: id,
      externalId: result.id ?? null,
      status: "downloading",
    });

    // Mark wanted game as downloading
    await storage.updateWantedGameStatus(parseInt(gameId), "downloading");

    res.json({ success: true, externalId: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/download-clients/queue/all — aggregate queue across all enabled clients
router.get("/queue/all", async (_req, res) => {
  try {
    const clients = await storage.getEnabledDownloadClients();
    const allDownloads: Array<{ clientId: number; clientName: string; downloads: unknown[] }> = [];

    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          const downloads = await DownloaderManager.getAllDownloads(client);
          allDownloads.push({ clientId: client.id, clientName: client.name, downloads });
        } catch {
          allDownloads.push({ clientId: client.id, clientName: client.name, downloads: [] });
        }
      }),
    );

    res.json(allDownloads);
  } catch {
    res.status(500).json({ error: "Failed to fetch download queue" });
  }
});

export default router;
