import { Router } from "express";
import { storage } from "../storage.js";
import {
  hashPassword,
  comparePassword,
  generateToken,
  authenticateToken,
} from "../auth.js";
import { sendRouteError } from "../errors.js";

const router = Router();

// GET /api/auth/status — check if any users exist (for first-run setup)
router.get("/status", async (_req, res) => {
  try {
    const count = await storage.countUsers();
    res.json({ hasUsers: count > 0 });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to check auth status",
      route: "GET /api/auth/status",
    });
  }
});

// POST /api/auth/setup — create the first admin user
router.post("/setup", async (req, res) => {
  try {
    const count = await storage.countUsers();
    if (count > 0) {
      return res.status(400).json({ error: "Setup already completed" });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({
      username,
      password: passwordHash,
    });

    const token = await generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to create user",
      route: "POST /api/auth/setup",
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = await generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    sendRouteError(res, error, {
      fallbackMessage: "Failed to login",
      route: "POST /api/auth/login",
    });
  }
});

// GET /api/auth/me — get current user from token
router.get("/me", authenticateToken, async (req, res) => {
  const user = req.user!;
  res.json({ id: user.id, username: user.username });
});

export default router;
