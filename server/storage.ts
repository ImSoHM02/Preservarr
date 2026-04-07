import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import {
  users,
  settings,
  platforms,
  games,
  gameFiles,
  wantedGames,
  indexers,
  qualityProfiles,
  downloadClients,
  downloadHistory,
  searchHistory,
  versionSources,
  datEntries,
  titledbEntries,
  notificationTargets,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, like, or, sql, desc, and, asc } from "drizzle-orm";

// ──────────────────────────────────────────────
// Type aliases
// ──────────────────────────────────────────────

export type User = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;

export type Platform = InferSelectModel<typeof platforms>;
export type Game = InferSelectModel<typeof games>;
export type GameFile = InferSelectModel<typeof gameFiles>;
export type WantedGame = InferSelectModel<typeof wantedGames>;
export type Indexer = InferSelectModel<typeof indexers>;
export type QualityProfile = InferSelectModel<typeof qualityProfiles>;
export type DownloadClient = InferSelectModel<typeof downloadClients>;
export type DownloadHistoryEntry = InferSelectModel<typeof downloadHistory>;
export type SearchHistoryEntry = InferSelectModel<typeof searchHistory>;
export type VersionSource = InferSelectModel<typeof versionSources>;
export type DatEntry = InferSelectModel<typeof datEntries>;
export type TitledbEntry = InferSelectModel<typeof titledbEntries>;
export type NotificationTarget = InferSelectModel<typeof notificationTargets>;

function normalizeSwitchTitleId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(normalized)) return null;
  return normalized;
}

function getAlternateSwitchTitleId(titleId: string): string | null {
  if (titleId.length !== 16) return null;
  if (titleId.endsWith("000")) return `${titleId.slice(0, 13)}800`;
  if (titleId.endsWith("800")) return `${titleId.slice(0, 13)}000`;
  return null;
}

// ──────────────────────────────────────────────
// Storage class
// ──────────────────────────────────────────────

class Storage {
  // ── Settings (key-value) ──────────────────

  async getSetting(key: string): Promise<string | undefined> {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value as string | undefined;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    db.insert(settings)
      .values({ key, value: value as any, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: value as any, updatedAt: new Date().toISOString() },
      })
      .run();
  }

  // Alias for auth.ts compatibility
  async getSystemConfig(key: string): Promise<string | undefined> {
    return this.getSetting(key);
  }

  async setSystemConfig(key: string, value: string): Promise<void> {
    return this.setSetting(key, value);
  }

  // ── Users ─────────────────────────────────

  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(data: InsertUser): Promise<User> {
    return db.insert(users).values(data).returning().get();
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<User | undefined> {
    return db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.id, userId))
      .returning()
      .get();
  }

  async countUsers(): Promise<number> {
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .get();
    return result?.count ?? 0;
  }

  // ── Platforms ──────────────────────────────

  async getPlatforms(): Promise<Platform[]> {
    return db.select().from(platforms).orderBy(asc(platforms.name)).all();
  }

  async getEnabledPlatforms(): Promise<Platform[]> {
    return db
      .select()
      .from(platforms)
      .where(eq(platforms.enabled, true))
      .orderBy(asc(platforms.name))
      .all();
  }

  async getPlatform(id: number): Promise<Platform | undefined> {
    return db.select().from(platforms).where(eq(platforms.id, id)).get();
  }

  async getPlatformBySlug(slug: string): Promise<Platform | undefined> {
    return db.select().from(platforms).where(eq(platforms.slug, slug)).get();
  }

  async getPlatformGameCount(platformId: number): Promise<number> {
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.platformId, platformId))
      .get();
    return result?.count ?? 0;
  }

  async upsertPlatform(data: InferInsertModel<typeof platforms>): Promise<Platform> {
    return db
      .insert(platforms)
      .values(data)
      .onConflictDoUpdate({
        target: platforms.slug,
        set: {
          name: data.name,
          fileExtensions: data.fileExtensions,
          namingStandard: data.namingStandard,
          versionSource: data.versionSource,
          torznabCategories: data.torznabCategories,
          igdbPlatformId: data.igdbPlatformId,
          enabled: data.enabled,
          hidden: data.hidden,
        },
      })
      .returning()
      .get();
  }

  async deletePlatform(platformId: number): Promise<void> {
    db.delete(qualityProfiles).where(eq(qualityProfiles.platformId, platformId)).run();
    db.delete(versionSources).where(eq(versionSources.platformId, platformId)).run();
    db.delete(platforms).where(eq(platforms.id, platformId)).run();
  }

  // ── Games ─────────────────────────────────

  async getGame(id: number): Promise<Game | undefined> {
    return db.select().from(games).where(eq(games.id, id)).get();
  }

  async getGamesByPlatform(platformId: number): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(eq(games.platformId, platformId))
      .orderBy(asc(games.title))
      .all();
  }

  async getGameByIgdbId(igdbId: number): Promise<Game | undefined> {
    return db.select().from(games).where(eq(games.igdbId, igdbId)).get();
  }

  async getGameByTitleId(titleId: string): Promise<Game | undefined> {
    const normalized = normalizeSwitchTitleId(titleId);
    if (!normalized) {
      return db.select().from(games).where(eq(games.titleId, titleId)).get();
    }

    return db
      .select()
      .from(games)
      .where(sql`lower(${games.titleId}) = ${normalized}`)
      .get();
  }

  async createGame(data: InferInsertModel<typeof games>): Promise<Game> {
    return db.insert(games).values(data).returning().get();
  }

  async updateGame(
    id: number,
    data: Partial<InferInsertModel<typeof games>>
  ): Promise<Game | undefined> {
    return db
      .update(games)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(games.id, id))
      .returning()
      .get();
  }

  async deleteGame(id: number): Promise<void> {
    // Clean up non-cascading references first
    db.delete(downloadHistory).where(eq(downloadHistory.gameId, id)).run();
    db.delete(searchHistory).where(eq(searchHistory.gameId, id)).run();
    // game_files and wanted_games cascade automatically
    db.delete(games).where(eq(games.id, id)).run();
  }

  async searchGames(query: string): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(like(games.title, `%${query}%`))
      .orderBy(asc(games.title))
      .all();
  }

  // ── Game Files ────────────────────────────

  async getGameFiles(gameId: number): Promise<GameFile[]> {
    return db.select().from(gameFiles).where(eq(gameFiles.gameId, gameId)).all();
  }

  async getGameFileByPath(path: string): Promise<GameFile | undefined> {
    return db.select().from(gameFiles).where(eq(gameFiles.path, path)).get();
  }

  async createGameFile(data: InferInsertModel<typeof gameFiles>): Promise<GameFile> {
    return db.insert(gameFiles).values(data).returning().get();
  }

  async updateGameFile(
    id: number,
    data: Partial<InferInsertModel<typeof gameFiles>>
  ): Promise<GameFile | undefined> {
    return db.update(gameFiles).set(data).where(eq(gameFiles.id, id)).returning().get();
  }

  async getOutdatedFiles(): Promise<GameFile[]> {
    return db.select().from(gameFiles).where(eq(gameFiles.versionStatus, "outdated")).all();
  }

  // ── Wanted Games ──────────────────────────

  async getWantedGames(status?: string): Promise<WantedGame[]> {
    if (status) {
      return db
        .select()
        .from(wantedGames)
        .where(eq(wantedGames.status, status as any))
        .all();
    }
    return db.select().from(wantedGames).all();
  }

  async getWantedGameByGameId(gameId: number): Promise<WantedGame | undefined> {
    return db.select().from(wantedGames).where(eq(wantedGames.gameId, gameId)).get();
  }

  async createWantedGame(data: InferInsertModel<typeof wantedGames>): Promise<WantedGame> {
    return db.insert(wantedGames).values(data).returning().get();
  }

  async updateWantedGameStatus(gameId: number, status: string): Promise<WantedGame | undefined> {
    return db
      .update(wantedGames)
      .set({ status: status as any })
      .where(eq(wantedGames.gameId, gameId))
      .returning()
      .get();
  }

  // ── Indexers ──────────────────────────────

  async getIndexers(): Promise<Indexer[]> {
    return db.select().from(indexers).all();
  }

  async getEnabledIndexers(): Promise<Indexer[]> {
    return db
      .select()
      .from(indexers)
      .where(eq(indexers.enabled, true))
      .orderBy(asc(indexers.priority))
      .all();
  }

  async getIndexer(id: number): Promise<Indexer | undefined> {
    return db.select().from(indexers).where(eq(indexers.id, id)).get();
  }

  async createIndexer(data: InferInsertModel<typeof indexers>): Promise<Indexer> {
    return db.insert(indexers).values(data).returning().get();
  }

  async updateIndexer(
    id: number,
    data: Partial<InferInsertModel<typeof indexers>>
  ): Promise<Indexer | undefined> {
    return db.update(indexers).set(data).where(eq(indexers.id, id)).returning().get();
  }

  async deleteIndexer(id: number): Promise<void> {
    db.delete(indexers).where(eq(indexers.id, id)).run();
  }

  // ── Quality Profiles ──────────────────────

  async getQualityProfiles(): Promise<QualityProfile[]> {
    return db.select().from(qualityProfiles).all();
  }

  async getQualityProfile(id: number): Promise<QualityProfile | undefined> {
    return db.select().from(qualityProfiles).where(eq(qualityProfiles.id, id)).get();
  }

  async createQualityProfile(
    data: InferInsertModel<typeof qualityProfiles>
  ): Promise<QualityProfile> {
    return db.insert(qualityProfiles).values(data).returning().get();
  }

  async updateQualityProfile(
    id: number,
    data: Partial<InferInsertModel<typeof qualityProfiles>>
  ): Promise<QualityProfile | undefined> {
    return db.update(qualityProfiles).set(data).where(eq(qualityProfiles.id, id)).returning().get();
  }

  async deleteQualityProfile(id: number): Promise<void> {
    db.delete(qualityProfiles).where(eq(qualityProfiles.id, id)).run();
  }

  // ── Download Clients ──────────────────────

  async getDownloadClients(): Promise<DownloadClient[]> {
    return db.select().from(downloadClients).all();
  }

  async getEnabledDownloadClients(): Promise<DownloadClient[]> {
    return db.select().from(downloadClients).where(eq(downloadClients.enabled, true)).all();
  }

  async getDownloadClient(id: number): Promise<DownloadClient | undefined> {
    return db.select().from(downloadClients).where(eq(downloadClients.id, id)).get();
  }

  async createDownloadClient(
    data: InferInsertModel<typeof downloadClients>
  ): Promise<DownloadClient> {
    return db.insert(downloadClients).values(data).returning().get();
  }

  async updateDownloadClient(
    id: number,
    data: Partial<InferInsertModel<typeof downloadClients>>
  ): Promise<DownloadClient | undefined> {
    return db.update(downloadClients).set(data).where(eq(downloadClients.id, id)).returning().get();
  }

  async deleteDownloadClient(id: number): Promise<void> {
    db.delete(downloadClients).where(eq(downloadClients.id, id)).run();
  }

  // ── Download History ──────────────────────

  async getDownloadHistory(gameId?: number): Promise<DownloadHistoryEntry[]> {
    if (gameId) {
      return db
        .select()
        .from(downloadHistory)
        .where(eq(downloadHistory.gameId, gameId))
        .orderBy(desc(downloadHistory.startedAt))
        .all();
    }
    return db.select().from(downloadHistory).orderBy(desc(downloadHistory.startedAt)).all();
  }

  async createDownloadHistoryEntry(
    data: InferInsertModel<typeof downloadHistory>
  ): Promise<DownloadHistoryEntry> {
    return db.insert(downloadHistory).values(data).returning().get();
  }

  async updateDownloadHistoryEntry(
    id: number,
    data: Partial<InferInsertModel<typeof downloadHistory>>
  ): Promise<DownloadHistoryEntry | undefined> {
    return db.update(downloadHistory).set(data).where(eq(downloadHistory.id, id)).returning().get();
  }

  async getActiveDownloadHistory(): Promise<DownloadHistoryEntry[]> {
    return db
      .select()
      .from(downloadHistory)
      .where(and(eq(downloadHistory.status, "downloading")))
      .all();
  }

  // ── Search History ────────────────────────

  async createSearchHistoryEntry(
    data: InferInsertModel<typeof searchHistory>
  ): Promise<SearchHistoryEntry> {
    return db.insert(searchHistory).values(data).returning().get();
  }

  async getSearchHistory(gameId?: number): Promise<SearchHistoryEntry[]> {
    if (gameId) {
      return db
        .select()
        .from(searchHistory)
        .where(eq(searchHistory.gameId, gameId))
        .orderBy(desc(searchHistory.searchedAt))
        .all();
    }
    return db.select().from(searchHistory).orderBy(desc(searchHistory.searchedAt)).all();
  }

  // ── Version Sources ───────────────────────

  async getVersionSources(platformId?: number): Promise<VersionSource[]> {
    if (platformId) {
      return db
        .select()
        .from(versionSources)
        .where(eq(versionSources.platformId, platformId))
        .all();
    }
    return db.select().from(versionSources).all();
  }

  async createVersionSource(data: InferInsertModel<typeof versionSources>): Promise<VersionSource> {
    return db.insert(versionSources).values(data).returning().get();
  }

  async updateVersionSource(
    id: number,
    data: Partial<InferInsertModel<typeof versionSources>>
  ): Promise<VersionSource | undefined> {
    return db.update(versionSources).set(data).where(eq(versionSources.id, id)).returning().get();
  }

  // ── DAT Entries ───────────────────────────

  async getDatEntriesByHash(hash: string): Promise<DatEntry[]> {
    return db
      .select()
      .from(datEntries)
      .where(or(eq(datEntries.crc32, hash), eq(datEntries.md5, hash), eq(datEntries.sha1, hash)))
      .all();
  }

  async bulkInsertDatEntries(entries: InferInsertModel<typeof datEntries>[]): Promise<void> {
    if (entries.length === 0) return;
    // Insert in chunks of 500 to avoid SQLite variable limits
    const chunkSize = 500;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      db.insert(datEntries).values(chunk).run();
    }
  }

  async getVersionSource(id: number): Promise<VersionSource | undefined> {
    return db.select().from(versionSources).where(eq(versionSources.id, id)).get();
  }

  async deleteVersionSource(id: number): Promise<void> {
    // dat_entries cascade-delete via FK
    db.delete(versionSources).where(eq(versionSources.id, id)).run();
  }

  async clearDatEntries(versionSourceId: number): Promise<void> {
    db.delete(datEntries).where(eq(datEntries.versionSourceId, versionSourceId)).run();
  }

  async getDatEntryCount(versionSourceId: number): Promise<number> {
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(datEntries)
      .where(eq(datEntries.versionSourceId, versionSourceId))
      .get();
    return result?.count ?? 0;
  }

  async getGameFilesForPlatform(platformId: number): Promise<GameFile[]> {
    return db
      .select({ gameFiles: gameFiles })
      .from(gameFiles)
      .innerJoin(games, eq(gameFiles.gameId, games.id))
      .where(eq(games.platformId, platformId))
      .then((rows) => rows.map((r) => r.gameFiles));
  }

  // ── titledb Entries ───────────────────────

  async getTitledbEntryByTitleId(titleId: string): Promise<TitledbEntry | undefined> {
    const normalized = normalizeSwitchTitleId(titleId);
    if (!normalized) return undefined;

    const direct = db
      .select()
      .from(titledbEntries)
      .where(sql`lower(${titledbEntries.titleId}) = ${normalized}`)
      .get();

    const alternateTitleId = getAlternateSwitchTitleId(normalized);
    if (!alternateTitleId) return direct;

    const alternate = db
      .select()
      .from(titledbEntries)
      .where(sql`lower(${titledbEntries.titleId}) = ${alternateTitleId}`)
      .get();

    if (!direct) return alternate;
    if (!alternate) return direct;

    const directVersion = Number.parseInt(direct.version ?? "", 10);
    const alternateVersion = Number.parseInt(alternate.version ?? "", 10);
    if (Number.isFinite(alternateVersion) && !Number.isFinite(directVersion)) {
      return alternate;
    }
    if (
      Number.isFinite(alternateVersion) &&
      Number.isFinite(directVersion) &&
      alternateVersion > directVersion
    ) {
      return alternate;
    }

    return direct;
  }

  async getTitledbEntries(versionSourceId: number): Promise<TitledbEntry[]> {
    return db
      .select()
      .from(titledbEntries)
      .where(eq(titledbEntries.versionSourceId, versionSourceId))
      .all();
  }

  async bulkInsertTitledbEntries(
    entries: InferInsertModel<typeof titledbEntries>[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const chunkSize = 500;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      db.insert(titledbEntries).values(chunk).run();
    }
  }

  async clearTitledbEntries(versionSourceId: number): Promise<void> {
    db.delete(titledbEntries).where(eq(titledbEntries.versionSourceId, versionSourceId)).run();
  }

  async getTitledbEntryCount(versionSourceId: number): Promise<number> {
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(titledbEntries)
      .where(eq(titledbEntries.versionSourceId, versionSourceId))
      .get();
    return result?.count ?? 0;
  }

  async getGamesForPlatformWithTitleId(platformId: number): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(
        and(
          eq(games.platformId, platformId),
          sql`${games.titleId} IS NOT NULL AND ${games.titleId} != ''`
        )
      )
      .all();
  }

  async getGameFilesByGameId(gameId: number): Promise<GameFile[]> {
    return db.select().from(gameFiles).where(eq(gameFiles.gameId, gameId)).all();
  }

  // ── Notification Targets ──────────────────

  async getNotificationTargets(): Promise<NotificationTarget[]> {
    return db.select().from(notificationTargets).all();
  }

  async getEnabledNotificationTargets(): Promise<NotificationTarget[]> {
    return db.select().from(notificationTargets).where(eq(notificationTargets.enabled, true)).all();
  }

  async createNotificationTarget(
    data: InferInsertModel<typeof notificationTargets>
  ): Promise<NotificationTarget> {
    return db.insert(notificationTargets).values(data).returning().get();
  }

  async updateNotificationTarget(
    id: number,
    data: Partial<InferInsertModel<typeof notificationTargets>>
  ): Promise<NotificationTarget | undefined> {
    return db
      .update(notificationTargets)
      .set(data)
      .where(eq(notificationTargets.id, id))
      .returning()
      .get();
  }

  async deleteNotificationTarget(id: number): Promise<void> {
    db.delete(notificationTargets).where(eq(notificationTargets.id, id)).run();
  }
}

export const storage = new Storage();
