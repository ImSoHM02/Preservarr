import { Router } from "express";
import { storage } from "../storage.js";
import { authenticateToken } from "../auth.js";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

// GET /api/quality-profiles — list all quality profiles
router.get("/", async (_req, res) => {
  try {
    const profiles = await storage.getQualityProfiles();

    // Attach platform name to each profile
    const platforms = await storage.getPlatforms();
    const platformMap = new Map(platforms.map((p) => [p.id, p]));

    const enriched = profiles.map((p) => ({
      ...p,
      platform: platformMap.get(p.platformId) ?? null,
    }));

    res.json(enriched);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch quality profiles",
      route: "GET /api/quality-profiles",
    });
  }
});

// GET /api/quality-profiles/:id — get a single quality profile
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const profile = await storage.getQualityProfile(id);
    if (!profile) {
      return res.status(404).json({ error: "Quality profile not found" });
    }

    const platform = await storage.getPlatform(profile.platformId);
    res.json({ ...profile, platform: platform ?? null });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to fetch quality profile",
      route: "GET /api/quality-profiles/:id",
      context: { profileId: req.params.id },
    });
  }
});

// POST /api/quality-profiles — create a quality profile
router.post("/", async (req, res) => {
  try {
    const { name, platformId, preferredFormats, preferredRegions, minSeeders, upgradeExisting } =
      req.body;

    if (!name || !platformId || !preferredFormats || !preferredRegions) {
      return res.status(400).json({
        error: "name, platformId, preferredFormats, and preferredRegions are required",
      });
    }

    const platform = await storage.getPlatform(platformId);
    if (!platform) {
      return res.status(400).json({ error: "Invalid platformId" });
    }

    if (!Array.isArray(preferredFormats) || !Array.isArray(preferredRegions)) {
      return res
        .status(400)
        .json({ error: "preferredFormats and preferredRegions must be arrays" });
    }

    const profile = await storage.createQualityProfile({
      name,
      platformId,
      preferredFormats,
      preferredRegions,
      minSeeders: minSeeders ?? 1,
      upgradeExisting: upgradeExisting ?? false,
    });

    res.status(201).json(profile);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to create quality profile",
      route: "POST /api/quality-profiles",
    });
  }
});

// PATCH /api/quality-profiles/:id — update a quality profile
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getQualityProfile(id);
    if (!existing) {
      return res.status(404).json({ error: "Quality profile not found" });
    }

    const { name, platformId, preferredFormats, preferredRegions, minSeeders, upgradeExisting } =
      req.body;

    if (platformId) {
      const platform = await storage.getPlatform(platformId);
      if (!platform) {
        return res.status(400).json({ error: "Invalid platformId" });
      }
    }

    const updated = await storage.updateQualityProfile(id, {
      ...(name !== undefined && { name }),
      ...(platformId !== undefined && { platformId }),
      ...(preferredFormats !== undefined && { preferredFormats }),
      ...(preferredRegions !== undefined && { preferredRegions }),
      ...(minSeeders !== undefined && { minSeeders }),
      ...(upgradeExisting !== undefined && { upgradeExisting }),
    });

    res.json(updated);
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to update quality profile",
      route: "PATCH /api/quality-profiles/:id",
      context: { profileId: req.params.id },
    });
  }
});

// DELETE /api/quality-profiles/:id — delete a quality profile
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await storage.getQualityProfile(id);
    if (!existing) {
      return res.status(404).json({ error: "Quality profile not found" });
    }

    await storage.deleteQualityProfile(id);
    res.status(204).send();
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to delete quality profile",
      route: "DELETE /api/quality-profiles/:id",
      context: { profileId: req.params.id },
    });
  }
});

export default router;
