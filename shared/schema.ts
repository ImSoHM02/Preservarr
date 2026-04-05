import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// ──────────────────────────────────────────────
// Platforms
// ──────────────────────────────────────────────

export const platforms = sqliteTable("platforms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  fileExtensions: text("file_extensions", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  namingStandard: text("naming_standard", {
    enum: ["no-intro", "redump", "none"],
  })
    .notNull()
    .default("none"),
  versionSource: text("version_source", {
    enum: ["titledb", "no-intro", "redump", "none"],
  })
    .notNull()
    .default("none"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  torznabCategories: text("torznab_categories").notNull().default("6000"),
  igdbPlatformId: integer("igdb_platform_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const platformsRelations = relations(platforms, ({ many }) => ({
  games: many(games),
  qualityProfiles: many(qualityProfiles),
  versionSources: many(versionSources),
}));

// ──────────────────────────────────────────────
// Games
// ──────────────────────────────────────────────

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    igdbId: integer("igdb_id"),
    screenscraperId: integer("screenscraper_id"),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
    coverUrl: text("cover_url"),
    description: text("description"),
    region: text("region"),
    releaseDate: text("release_date"),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    alternateNames: text("alternate_names", { mode: "json" }).$type<string[]>(),
    titleId: text("title_id"), // Nintendo Switch App ID
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    igdbIdx: index("games_igdb_id_idx").on(table.igdbId),
    platformIdx: index("games_platform_id_idx").on(table.platformId),
    titleIdIdx: index("games_title_id_idx").on(table.titleId),
  }),
);

export const gamesRelations = relations(games, ({ one, many }) => ({
  platform: one(platforms, {
    fields: [games.platformId],
    references: [platforms.id],
  }),
  gameFiles: many(gameFiles),
  wantedGame: one(wantedGames),
  downloadHistory: many(downloadHistory),
  searchHistory: many(searchHistory),
}));

// ──────────────────────────────────────────────
// Game Files
// ──────────────────────────────────────────────

export const gameFiles = sqliteTable(
  "game_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes"),
    fileFormat: text("file_format"),
    crc32: text("crc32"),
    md5: text("md5"),
    sha1: text("sha1"),
    knownVersion: text("known_version"),
    latestVersion: text("latest_version"),
    versionStatus: text("version_status", {
      enum: ["current", "outdated", "unknown"],
    })
      .notNull()
      .default("unknown"),
    versionCheckedAt: text("version_checked_at"),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    gameIdx: index("game_files_game_id_idx").on(table.gameId),
    pathIdx: uniqueIndex("game_files_path_idx").on(table.path),
    crc32Idx: index("game_files_crc32_idx").on(table.crc32),
    sha1Idx: index("game_files_sha1_idx").on(table.sha1),
  }),
);

export const gameFilesRelations = relations(gameFiles, ({ one }) => ({
  game: one(games, {
    fields: [gameFiles.gameId],
    references: [games.id],
  }),
}));

// ──────────────────────────────────────────────
// Wanted Games
// ──────────────────────────────────────────────

export const wantedGames = sqliteTable(
  "wanted_games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" })
      .unique(),
    status: text("status", {
      enum: ["wanted", "searching", "downloading", "owned", "ignored"],
    })
      .notNull()
      .default("wanted"),
    monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
    qualityProfileId: integer("quality_profile_id").references(
      () => qualityProfiles.id,
    ),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("wanted_games_status_idx").on(table.status),
    gameIdx: index("wanted_games_game_id_idx").on(table.gameId),
  }),
);

export const wantedGamesRelations = relations(wantedGames, ({ one }) => ({
  game: one(games, {
    fields: [wantedGames.gameId],
    references: [games.id],
  }),
  qualityProfile: one(qualityProfiles, {
    fields: [wantedGames.qualityProfileId],
    references: [qualityProfiles.id],
  }),
}));

// ──────────────────────────────────────────────
// Version Sources
// ──────────────────────────────────────────────

export const versionSources = sqliteTable(
  "version_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
    sourceType: text("source_type", {
      enum: ["titledb", "no-intro", "redump"],
    }).notNull(),
    filePath: text("file_path"),
    url: text("url"),
    lastSyncedAt: text("last_synced_at"),
    entryCount: integer("entry_count").default(0),
  },
  (table) => ({
    platformIdx: index("version_sources_platform_id_idx").on(table.platformId),
  }),
);

export const versionSourcesRelations = relations(
  versionSources,
  ({ one, many }) => ({
    platform: one(platforms, {
      fields: [versionSources.platformId],
      references: [platforms.id],
    }),
    datEntries: many(datEntries),
  }),
);

// ──────────────────────────────────────────────
// DAT Entries (parsed No-Intro / Redump)
// ──────────────────────────────────────────────

export const datEntries = sqliteTable(
  "dat_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    versionSourceId: integer("version_source_id")
      .notNull()
      .references(() => versionSources.id, { onDelete: "cascade" }),
    gameTitle: text("game_title").notNull(),
    region: text("region"),
    revision: text("revision"),
    crc32: text("crc32"),
    md5: text("md5"),
    sha1: text("sha1"),
  },
  (table) => ({
    versionSourceIdx: index("dat_entries_version_source_id_idx").on(
      table.versionSourceId,
    ),
    crc32Idx: index("dat_entries_crc32_idx").on(table.crc32),
    sha1Idx: index("dat_entries_sha1_idx").on(table.sha1),
  }),
);

export const datEntriesRelations = relations(datEntries, ({ one }) => ({
  versionSource: one(versionSources, {
    fields: [datEntries.versionSourceId],
    references: [versionSources.id],
  }),
}));

// ──────────────────────────────────────────────
// Download History
// ──────────────────────────────────────────────

export const downloadHistory = sqliteTable(
  "download_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    indexerId: integer("indexer_id").references(() => indexers.id),
    releaseTitle: text("release_title"),
    sizeBytes: integer("size_bytes"),
    seeders: integer("seeders"),
    score: integer("score"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    completedAt: text("completed_at"),
    status: text("status", {
      enum: ["downloading", "completed", "failed", "imported"],
    })
      .notNull()
      .default("downloading"),
  },
  (table) => ({
    gameIdx: index("download_history_game_id_idx").on(table.gameId),
  }),
);

export const downloadHistoryRelations = relations(
  downloadHistory,
  ({ one }) => ({
    game: one(games, {
      fields: [downloadHistory.gameId],
      references: [games.id],
    }),
    indexer: one(indexers, {
      fields: [downloadHistory.indexerId],
      references: [indexers.id],
    }),
  }),
);

// ──────────────────────────────────────────────
// Search History
// ──────────────────────────────────────────────

export const searchHistory = sqliteTable(
  "search_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    queryUsed: text("query_used").notNull(),
    indexerId: integer("indexer_id").references(() => indexers.id),
    resultsCount: integer("results_count").notNull().default(0),
    bestScore: integer("best_score"),
    searchedAt: text("searched_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    gameIdx: index("search_history_game_id_idx").on(table.gameId),
  }),
);

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  game: one(games, {
    fields: [searchHistory.gameId],
    references: [games.id],
  }),
  indexer: one(indexers, {
    fields: [searchHistory.indexerId],
    references: [indexers.id],
  }),
}));

// ──────────────────────────────────────────────
// Indexers
// ──────────────────────────────────────────────

export const indexers = sqliteTable("indexers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["prowlarr", "torznab"] }).notNull(),
  url: text("url").notNull(),
  apiKey: text("api_key").notNull(),
  priority: integer("priority").notNull().default(50),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  categories: text("categories", { mode: "json" }).$type<string[]>(),
});

export const indexersRelations = relations(indexers, ({ many }) => ({
  downloadHistory: many(downloadHistory),
  searchHistory: many(searchHistory),
}));

// ──────────────────────────────────────────────
// Quality Profiles
// ──────────────────────────────────────────────

export const qualityProfiles = sqliteTable("quality_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  platformId: integer("platform_id")
    .notNull()
    .references(() => platforms.id),
  preferredFormats: text("preferred_formats", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  preferredRegions: text("preferred_regions", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  minSeeders: integer("min_seeders").notNull().default(1),
  upgradeExisting: integer("upgrade_existing", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const qualityProfilesRelations = relations(
  qualityProfiles,
  ({ one, many }) => ({
    platform: one(platforms, {
      fields: [qualityProfiles.platformId],
      references: [platforms.id],
    }),
    wantedGames: many(wantedGames),
  }),
);

// ──────────────────────────────────────────────
// Download Clients
// ──────────────────────────────────────────────

export const downloadClients = sqliteTable("download_clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["qbittorrent", "transmission", "rtorrent", "nzbget", "sabnzbd"],
  }).notNull(),
  url: text("url").notNull(),
  username: text("username"),
  password: text("password"),
  downloadPath: text("download_path"),
  platformPaths: text("platform_paths", { mode: "json" }).$type<
    Record<string, string>
  >(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

// ──────────────────────────────────────────────
// Notification Targets
// ──────────────────────────────────────────────

export const notificationTargets = sqliteTable("notification_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["discord", "telegram", "apprise", "webhook"],
  }).notNull(),
  url: text("url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  notifyOn: text("notify_on", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default(sql`'["update_available","import","fail"]'`),
});

// ──────────────────────────────────────────────
// Settings (key-value store)
// ──────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ──────────────────────────────────────────────
// Users (single admin account)
// ──────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ──────────────────────────────────────────────
// Zod Schemas (for validation)
// ──────────────────────────────────────────────

export const insertPlatformSchema = createInsertSchema(platforms);
export const selectPlatformSchema = createSelectSchema(platforms);

export const insertGameSchema = createInsertSchema(games);
export const selectGameSchema = createSelectSchema(games);

export const insertGameFileSchema = createInsertSchema(gameFiles);
export const selectGameFileSchema = createSelectSchema(gameFiles);

export const insertWantedGameSchema = createInsertSchema(wantedGames);
export const selectWantedGameSchema = createSelectSchema(wantedGames);

export const insertIndexerSchema = createInsertSchema(indexers);
export const selectIndexerSchema = createSelectSchema(indexers);

export const insertQualityProfileSchema = createInsertSchema(qualityProfiles);
export const selectQualityProfileSchema = createSelectSchema(qualityProfiles);

export const insertDownloadClientSchema = createInsertSchema(downloadClients);
export const selectDownloadClientSchema = createSelectSchema(downloadClients);

export const insertNotificationTargetSchema =
  createInsertSchema(notificationTargets);
export const selectNotificationTargetSchema =
  createSelectSchema(notificationTargets);

export const insertSettingsSchema = createInsertSchema(settings);
export const selectSettingsSchema = createSelectSchema(settings);

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
