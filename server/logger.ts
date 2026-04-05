import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
export const LOG_FILE_PATH = process.env.LOG_FILE_PATH || "./server.log";

// Configure pino with multiple targets
const transport = pino.transport({
  targets: [
    {
      target: "pino/file",
      options: { destination: LOG_FILE_PATH, mkdir: true },
    },
    isProduction
      ? {
          target: "pino/file",
          options: { destination: 1 }, // stdout
        }
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            destination: 1, // stdout
          },
        },
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "debug",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    redact: {
      paths: [
        "password",
        "*.password",
        "apiKey",
        "*.apiKey",
        "token",
        "*.token",
        "authorization",
        "*.authorization",
        "headers.authorization",
        "headers.x-api-key",
      ],
      censor: "[REDACTED]",
    },
  },
  transport
);

// Create child loggers for different modules
export const igdbLogger = logger.child({ module: "igdb" });
export const routesLogger = logger.child({ module: "routes" });
export const expressLogger = logger.child({ module: "express" });
export const downloadersLogger = logger.child({ module: "downloaders" });
export const torznabLogger = logger.child({ module: "torznab" });
export const searchLogger = logger.child({ module: "search" });
