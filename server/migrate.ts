import { logger } from "./logger.js";
import { db } from "./db.js";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Run database migrations from the migrations folder
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info("Running database migrations...");

    // Create migrations table if it doesn't exist
    // SQLite syntax for table creation
    db.run(sql`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL UNIQUE,
        created_at integer
      );
    `);

    const migrationsFolder = path.resolve(process.cwd(), "migrations");
    const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

    if (!fs.existsSync(journalPath)) {
      throw new Error(`Migrations journal not found at: ${journalPath}`);
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ tag: string }>;
    };
    const appliedRows = db.all<{ hash: string }>(sql`SELECT hash FROM "__drizzle_migrations"`);
    const appliedHashes = new Set(appliedRows.map((r) => r.hash));

    const applyMigration = (tag: string) => {
      if (appliedHashes.has(tag)) {
        return;
      }

      logger.info(`Applying migration ${tag}...`);

      const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        throw new Error(`Migration SQL not found for tag ${tag} at ${sqlPath}`);
      }
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");

      // SQLite doesn't strictly need statement splitting like pg if using exec() on the driver directly,
      // but drizzle's .run() might be single-statement.
      // Better-sqlite3's exec() handles multiple statements.
      // However, we want transaction safety.

      // We will assume the file content is a valid SQL script.
      // Drizzle-kit generated files often use `--> statement-breakpoint` separator.
      const statements = sqlContent.split("--> statement-breakpoint");

      db.transaction((tx) => {
        for (const statement of statements) {
          if (!statement.trim()) continue;
          try {
            tx.run(sql.raw(statement));
          } catch (e) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = ((e as any).message || "").toLowerCase();
            // Keep migrations idempotent across partially-migrated or manually-fixed databases.
            if (msg.includes("already exists") || msg.includes("duplicate column name")) {
              logger.warn(`Skipping statement in ${tag}: ${(e as Error).message}`);
            } else {
              throw e;
            }
          }
        }
      });

      db.run(sql`
        INSERT INTO "__drizzle_migrations" (hash, created_at)
        VALUES (${tag}, ${Date.now()})
      `);
      appliedHashes.add(tag);

      logger.info(`Migration ${tag} applied successfully`);
    };

    for (const entry of journal.entries) {
      const tag = entry.tag;
      logger.debug(`Checking migration status: ${tag}`);
      applyMigration(tag);
    }

    // Safety net: apply any SQL migration files that exist but are missing from _journal.json.
    // This prevents schema drift if a migration file was added without updating the journal.
    const journalTags = new Set(journal.entries.map((entry) => entry.tag));
    const fileTags = fs
      .readdirSync(migrationsFolder)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();

    for (const tag of fileTags) {
      if (journalTags.has(tag)) continue;
      logger.warn(`Migration ${tag} is not listed in _journal.json. Applying via fallback scan.`);
      applyMigration(tag);
    }

    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.error({ err: error }, "Database migration failed");
    throw error;
  }
}

/**
 * Verify database connection and tables exist
 */
export async function ensureDatabase(): Promise<void> {
  try {
    logger.info(`Checking database connection...`);

    // Test connection
    const result = db.get(sql`SELECT 1`);
    if (!result) {
      throw new Error("Database connection test failed");
    }
    logger.info("Database connection successful");

    // Run migrations to ensure schema is up-to-date
    await runMigrations();
  } catch (error) {
    logger.error({ err: error }, "Database check failed");
    throw error;
  }
}

/**
 * Gracefully close database connection
 */
export async function closeDatabase(): Promise<void> {
  logger.info("Database connection closed (noop for sqlite)");
}
