import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { storage } from "../storage.js";
import { DownloaderManager } from "../downloaders.js";
import { sendRouteError } from "../errors.js";
import { routesLogger } from "../logger.js";

const router = Router();
router.use(authenticateToken);

// GET /api/download-clients — list all download clients
router.get("/", async (_req, res) => {
  try {
    const clients = await storage.getDownloadClients();
    // Mask passwords in response
    const masked = clients.map((c) => ({ ...c, password: c.password ? "••••••••" : null }));
    res.json(masked);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch download clients",
      route: "GET /api/download-clients",
    });
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
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch download client",
      route: "GET /api/download-clients/:id",
      context: { clientId: req.params.id },
    });
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
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to create download client",
      route: "POST /api/download-clients",
    });
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

    // Don't overwrite the stored password if the masked placeholder or empty string is sent back
    const resolvedPassword =
      !password || password === "••••••••" ? existing.password : password;

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
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update download client",
      route: "PATCH /api/download-clients/:id",
      context: { clientId: req.params.id },
    });
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
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to delete download client",
      route: "DELETE /api/download-clients/:id",
      context: { clientId: req.params.id },
    });
  }
});

// POST /api/download-clients/:id/test — test connection
router.post("/:id/test", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const client = await storage.getDownloadClient(id);
    if (!client) return res.status(404).json({ error: "Download client not found" });

    routesLogger.info(
      {
        requestId: res.locals.requestId,
        clientId: client.id,
        clientType: client.type,
        clientName: client.name,
        clientUrl: client.url,
      },
      "Testing download client connection"
    );

    const result = await DownloaderManager.testDownloader(client);
    if (!result.success) {
      const lowerUrl = client.url.toLowerCase();
      const hint =
        lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")
          ? "Client URL points to localhost. In Docker, localhost is the Preservarr container. Use the downloader container name or host.docker.internal."
          : "Check URL/port/credentials. If Preservarr runs in Docker, use container DNS name instead of localhost.";
      return res.status(502).json({
        success: false,
        message: result.message,
        hint,
        requestId: res.locals.requestId,
      });
    }

    res.json(result);
  } catch (err) {
    sendRouteError(res, err, {
      status: 502,
      fallbackMessage: "Download client connection test failed",
      route: "POST /api/download-clients/:id/test",
      context: { clientId: req.params.id },
    });
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
    sendRouteError(res, err, {
      status: 502,
      fallbackMessage: "Failed to fetch client queue",
      route: "GET /api/download-clients/:id/queue",
      context: { clientId: req.params.id },
    });
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
    sendRouteError(res, err, {
      fallbackMessage: "Failed to add download to client",
      route: "POST /api/download-clients/:id/add",
      context: { clientId: req.params.id },
    });
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
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch download queue",
      route: "GET /api/download-clients/queue/all",
    });
  }
});

export default router;
