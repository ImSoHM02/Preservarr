import { Router } from "express";
import { authenticateToken } from "../auth.js";
import { queryLogs } from "../logs.js";
import { sendRouteError } from "../errors.js";

const router = Router();
router.use(authenticateToken);

const ALLOWED_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);

router.get("/", async (req, res) => {
  try {
    const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const limit = Number.isNaN(rawLimit) ? 200 : Math.max(1, Math.min(rawLimit, 1000));

    const rawLevels = typeof req.query.levels === "string" ? req.query.levels : "";
    const levels = rawLevels
      .split(",")
      .map((level) => level.trim().toLowerCase())
      .filter((level) => ALLOWED_LEVELS.has(level));

    const module =
      typeof req.query.module === "string" && req.query.module.trim().length > 0
        ? req.query.module.trim()
        : undefined;

    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : undefined;

    const result = await queryLogs({
      limit,
      levels: levels.length > 0 ? new Set(levels) : undefined,
      module,
      search,
    });

    res.json(result);
  } catch (error) {
    sendRouteError(res, error, {
      status: 500,
      fallbackMessage: "Failed to fetch logs",
      route: "GET /api/logs",
    });
  }
});

export default router;

