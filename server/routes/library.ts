import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { storage } from "../storage.js";
import { runFullScan, getScanProgress, startWatcher, stopWatcher } from "../scanner.js";
import { type LibraryPaths } from "../scanner.js";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

// GET /api/library/paths — get configured library paths
router.get("/paths", async (_req, res) => {
  try {
    const raw = await storage.getSetting("library_paths");
    const paths: LibraryPaths = raw ? JSON.parse(raw) : {};
    res.json(paths);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch library paths",
      route: "GET /api/library/paths",
    });
  }
});

// PUT /api/library/paths — update library paths
// Body: { [platformSlug]: "/absolute/path" }
router.put("/paths", async (req, res) => {
  try {
    const paths = req.body as LibraryPaths;
    if (typeof paths !== "object" || Array.isArray(paths)) {
      return res.status(400).json({ error: "Body must be a slug→path object" });
    }
    // Validate values are strings
    for (const [slug, p] of Object.entries(paths)) {
      if (typeof p !== "string") {
        return res.status(400).json({ error: `Path for '${slug}' must be a string` });
      }
    }
    await storage.setSetting("library_paths", JSON.stringify(paths));
    // Restart watcher with new paths
    await stopWatcher();
    await startWatcher();
    res.json(paths);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update library paths",
      route: "PUT /api/library/paths",
    });
  }
});

// GET /api/library/scan — get current scan status
router.get("/scan", (_req, res) => {
  res.json(getScanProgress());
});

// POST /api/library/scan — trigger a full library scan
router.post("/scan", async (_req, res) => {
  const current = getScanProgress();
  if (current.running) {
    return res.status(409).json({ error: "Scan already running", progress: current });
  }
  // Kick off scan asynchronously — don't await
  runFullScan().catch((err) => {
    console.error("Scan error:", err);
  });
  res.status(202).json({ message: "Scan started", progress: getScanProgress() });
});

// DELETE /api/library/paths/:slug — remove a specific platform path
router.delete("/paths/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const raw = await storage.getSetting("library_paths");
    const paths: LibraryPaths = raw ? JSON.parse(raw) : {};
    if (!(slug in paths)) {
      return res.status(404).json({ error: "No path configured for that platform" });
    }
    delete paths[slug];
    await storage.setSetting("library_paths", JSON.stringify(paths));
    await stopWatcher();
    await startWatcher();
    res.json(paths);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to remove path",
      route: "DELETE /api/library/paths/:slug",
      context: { slug: req.params.slug },
    });
  }
});

export default router;
