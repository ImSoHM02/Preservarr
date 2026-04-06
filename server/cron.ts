import cron from "node-cron";
import { syncTitledb } from "./titledb.js";
import { logger } from "./logger.js";
import { storage } from "./storage.js";

const cronLogger = logger.child({ module: "cron" });

/**
 * Start all scheduled jobs.
 *
 * - titledb sync: daily at 02:00 (configurable via `titledb_sync_cron` setting)
 */
export async function startScheduledJobs(): Promise<void> {
  // Default: daily at 02:00
  const cronExpression = (await storage.getSetting("titledb_sync_cron")) || "0 2 * * *";
  const region = (await storage.getSetting("titledb_region")) || "US";

  if (!cron.validate(cronExpression)) {
    cronLogger.error({ cronExpression }, "invalid cron expression for titledb sync, using default");
  }

  const expression = cron.validate(cronExpression) ? cronExpression : "0 2 * * *";

  cron.schedule(expression, async () => {
    cronLogger.info({ region }, "starting scheduled titledb sync");
    try {
      const result = await syncTitledb(region);
      cronLogger.info(result, "scheduled titledb sync complete");
    } catch (error) {
      cronLogger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "scheduled titledb sync failed",
      );
    }
  });

  cronLogger.info({ cron: expression, region }, "titledb sync job scheduled");
}
