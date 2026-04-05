import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import https from "https";
import fs from "fs";
import http from "http";

import { setupVite, serveStatic, log } from "./vite.js";
import { generalApiLimiter } from "./middleware.js";
import { config } from "./config.js";
import { expressLogger } from "./logger.js";
import { setupSocketIO } from "./socket.js";
import { ensureDatabase } from "./migrate.js";
import authRoutes from "./routes/auth.js";
import platformRoutes from "./routes/platforms.js";
import gameRoutes from "./routes/games.js";
import settingsRoutes from "./routes/settings.js";
import igdbRoutes from "./routes/igdb.js";
import qualityProfileRoutes from "./routes/quality-profiles.js";
import libraryRoutes from "./routes/library.js";
import indexerRoutes from "./routes/indexers.js";
import downloadClientRoutes from "./routes/download-clients.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Apply general rate limiting to all API routes
app.use("/api", generalApiLimiter);

// Set Origin-Agent-Cluster header
app.use((_req, res, next) => {
  res.setHeader("Origin-Agent-Cluster", "?1");
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      expressLogger.info(
        {
          method: req.method,
          path,
          statusCode: res.statusCode,
          duration,
        },
        `${req.method} ${path} ${res.statusCode} in ${duration}ms`,
      );
    }
  });

  next();
});

(async () => {
  try {
    // Ensure database is ready before starting server
    await ensureDatabase();

    const server = http.createServer(app);
    setupSocketIO(server);

    // Health check
    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // API routes
    app.use("/api/auth", authRoutes);
    app.use("/api/platforms", platformRoutes);
    app.use("/api/games", gameRoutes);
    app.use("/api/settings", settingsRoutes);
    app.use("/api/igdb", igdbRoutes);
    app.use("/api/quality-profiles", qualityProfileRoutes);
    app.use("/api/library", libraryRoutes);
    app.use("/api/indexers", indexerRoutes);
    app.use("/api/download-clients", downloadClientRoutes);

    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const error = err.message || "Internal Server Error";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: { error: string; details?: any } = { error };
      if (err.details) {
        response.details = err.details;
      }

      res.status(status).json(response);
      throw err;
    });

    // Setup Vite in dev, static serving in prod
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const { port, host } = config.server;
    const { ssl } = config;

    server.listen(port, host, () => {
      log(`HTTP server serving on ${host}:${port}`);
    });

    // Start HTTPS server if enabled
    if (ssl.enabled && ssl.certPath && ssl.keyPath) {
      try {
        const { validateCertFiles } = await import("./ssl.js");
        const { valid, error } = await validateCertFiles(
          ssl.certPath,
          ssl.keyPath,
        );

        if (!valid) {
          log(
            `SSL Configuration Invalid: ${error}. Starting in HTTP-only mode.`,
          );
        } else {
          const httpsOptions = {
            key: await fs.promises.readFile(ssl.keyPath),
            cert: await fs.promises.readFile(ssl.certPath),
          };

          const httpsServer = https.createServer(httpsOptions, app);
          setupSocketIO(httpsServer);

          httpsServer.listen(ssl.port, host, () => {
            log(`HTTPS server serving on ${host}:${ssl.port}`);
          });

          if (ssl.redirectHttp) {
            app.use((req, res, next) => {
              if (req.path === "/api/health") {
                return next();
              }
              if (!req.secure) {
                const host = req.hostname || "localhost";
                return res.redirect(`https://${host}:${ssl.port}${req.url}`);
              }
              next();
            });
          }
        }
      } catch (error) {
        log("Failed to start HTTPS server: " + String(error));
      }
    }

    // Start filesystem watcher for configured library paths
    const { startWatcher } = await import("./scanner.js");
    await startWatcher().catch((err) => log("Watcher start failed: " + String(err)));

    log("Preservarr server initialized");
  } catch (error) {
    log("Fatal error during startup:");
    console.error(error);
    process.exit(1);
  }
})();
