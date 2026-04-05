import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateToken } from "../auth.js";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

// GET /api/settings — get all settings (returns object of key-value pairs)
router.get("/", async (_req, res) => {
  try {
    // Retrieve common settings
    const keys = [
      "igdb_client_id",
      "igdb_client_secret",
      "prowlarr_url",
      "prowlarr_api_key",
      "library_paths",
      "ownfoil_enabled",
      "ownfoil_base_url",
      "ownfoil_games_path",
    ];

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = await storage.getSetting(key);
    }

    res.json(result);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch settings",
      route: "GET /api/settings",
    });
  }
});

// GET /api/settings/:key
router.get("/:key", async (req, res) => {
  try {
    const value = await storage.getSetting(req.params.key);
    res.json({ key: req.params.key, value: value ?? null });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch setting",
      route: "GET /api/settings/:key",
      context: { key: req.params.key },
    });
  }
});

// PUT /api/settings/:key
router.put("/:key", async (req, res) => {
  try {
    const { value } = req.body;
    await storage.setSetting(req.params.key, value);
    res.json({ key: req.params.key, value });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update setting",
      route: "PUT /api/settings/:key",
      context: { key: req.params.key },
    });
  }
});

// PUT /api/settings — bulk update settings
router.put("/", async (req, res) => {
  try {
    const entries = req.body;
    if (!entries || typeof entries !== "object") {
      return res.status(400).json({ error: "Request body must be an object of key-value pairs" });
    }

    for (const [key, value] of Object.entries(entries)) {
      await storage.setSetting(key, value);
    }

    res.json({ success: true });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update settings",
      route: "PUT /api/settings",
    });
  }
});

export default router;
