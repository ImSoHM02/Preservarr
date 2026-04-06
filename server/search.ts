/**
 * Search Service
 *
 * Implements the multi-stage search query builder (Section 8 of the plan)
 * and result scoring against quality profiles.
 */

import { storage, type Indexer, type QualityProfile } from "./storage.js";
import { torznabClient } from "./torznab.js";
import { normalizeTitle } from "../shared/title-utils.js";
import { expressLogger } from "./logger.js";

const searchLog = expressLogger.child({ module: "search" });

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  link: string;
  size: number;
  seeders: number;
  leechers: number;
  category: string;
  indexerId: number;
  indexerName: string;
  score: number;
  pubDate: string;
  // raw attributes from Torznab
  attributes?: Record<string, string>;
}

export interface SearchOptions {
  gameId: number;
  qualityProfileId?: number;
  manualQuery?: string; // Override — skips multi-stage builder
}

// ─────────────────────────────────────────────────────────────
// Multi-stage query builder (Section 8 of the plan)
// ─────────────────────────────────────────────────────────────

/**
 * Build an ordered list of search queries from a game title.
 * Queries are tried in sequence; first stage that returns results wins.
 */
export function buildSearchStages(
  title: string,
  platformName: string,
  alternateNames?: string[],
): string[] {
  const stages: string[] = [];

  // Normalise: strip leading article ("The ", "A ", "An "), collapse whitespace
  const stripArticle = (t: string) =>
    t.replace(/^(the|a|an)\s+/i, "").trim();

  const base = stripArticle(title);

  // Stage 1: Exact normalised title (articles stripped)
  stages.push(base);

  // Stage 2: Strip subtitle (after ": " or " – " / " - ")
  const subtitleStripped = base.replace(/\s*[:–\-]\s+.*$/, "").trim();
  if (subtitleStripped && subtitleStripped !== base) {
    stages.push(subtitleStripped);
  }

  // Stage 3: Add platform hint variants
  const platformHints = buildPlatformHints(platformName);
  for (const hint of platformHints) {
    const withHint = `${subtitleStripped || base} ${hint}`;
    if (!stages.includes(withHint)) {
      stages.push(withHint);
    }
  }

  // Stage 4: Alternate regional titles from IGDB
  if (alternateNames) {
    for (const alt of alternateNames.slice(0, 3)) {
      const cleanAlt = stripArticle(alt);
      if (!stages.includes(cleanAlt)) {
        stages.push(cleanAlt);
      }
    }
  }

  // Stage 5: Broad keyword fallback (first significant word of subtitle)
  const words = base.split(/\s+/);
  if (words.length > 2) {
    const keyword = words.slice(words.length - 2).join(" ");
    if (!stages.includes(keyword)) {
      stages.push(keyword);
    }
  }

  return stages.filter(Boolean);
}

/** Map a platform name to short search hint keywords */
function buildPlatformHints(platformName: string): string[] {
  const lower = platformName.toLowerCase();
  if (lower.includes("switch")) return ["Switch", "NSP", "NSW"];
  if (lower.includes("nintendo 64") || lower === "n64") return ["N64", "Nintendo 64"];
  if (lower.includes("snes") || lower.includes("super famicom")) return ["SNES", "SFC"];
  if (lower.includes("game boy advance") || lower === "gba") return ["GBA"];
  if (lower.includes("game boy color") || lower === "gbc") return ["GBC"];
  if (lower.includes("game boy") || lower === "gb") return ["GB", "Gameboy"];
  if (lower.includes("nintendo ds") || lower === "nds") return ["NDS", "DS"];
  if (lower.includes("3ds")) return ["3DS"];
  if (lower.includes("playstation 2") || lower === "ps2") return ["PS2", "PlayStation 2"];
  if (lower.includes("playstation portable") || lower === "psp") return ["PSP"];
  if (lower.includes("playstation") || lower === "ps1" || lower === "psx") return ["PS1", "PSX", "PlayStation"];
  if (lower.includes("genesis") || lower.includes("mega drive")) return ["Genesis", "Mega Drive", "MD"];
  if (lower.includes("dreamcast")) return ["Dreamcast", "DC"];
  return [platformName];
}

// ─────────────────────────────────────────────────────────────
// Result scoring (Section 8 of the plan)
// ─────────────────────────────────────────────────────────────

const GOOD_SCENE_GROUPS = new Set([
  "trsi", "venom", "suxxors", "project", "capital", "mode7", "legacy",
  "tsunami", "paradox", "abstrakt", "psyclone", "rindvieh",
]);

const BAD_FLAGS = /\[(bios|bads|overdump|unlicensed|pirates|hack|fixed|modified)\]/i;

export function scoreResult(
  result: { title: string; seeders?: number; size?: number; category?: string },
  platform: { name: string; torznabCategories: string },
  profile: Pick<QualityProfile, "preferredFormats" | "preferredRegions" | "minSeeders">,
): number {
  let score = 0;
  const t = result.title.toLowerCase();

  // −50: Known-bad flags
  if (BAD_FLAGS.test(result.title)) return -50;

  // +30: Platform keyword in release title
  const platformKeywords = buildPlatformHints(platform.name).map((k) => k.toLowerCase());
  if (platformKeywords.some((kw) => t.includes(kw))) score += 30;

  // +20: Preferred region match
  const preferredRegions = (profile.preferredRegions as string[]) ?? [];
  const matchedRegion = preferredRegions.findIndex((r) =>
    t.includes(`(${r.toLowerCase()})`) || t.includes(r.toLowerCase()),
  );
  if (matchedRegion === 0) score += 20; // Top preference
  else if (matchedRegion > 0) score += Math.max(0, 20 - matchedRegion * 5);
  else score -= 10; // Region mismatch (deprioritise, not discard)

  // +20: Preferred format match
  const preferredFormats = (profile.preferredFormats as string[]) ?? [];
  const matchedFormat = preferredFormats.findIndex((f) =>
    t.includes(f.toLowerCase()) ||
    result.title.toLowerCase().endsWith(`.${f.toLowerCase()}`),
  );
  if (matchedFormat === 0) score += 20;
  else if (matchedFormat > 0) score += Math.max(0, 20 - matchedFormat * 5);

  // +10: No-Intro verified tag [!]
  if (result.title.includes("[!]")) score += 10;

  // +10: Seeder count ≥ minimum
  const seeders = result.seeders ?? 0;
  if (seeders >= (profile.minSeeders ?? 1)) score += 10;

  // +5: Known-good scene group
  const groupMatch = result.title.match(/-(\w+)$/);
  if (groupMatch && GOOD_SCENE_GROUPS.has(groupMatch[1].toLowerCase())) score += 5;

  // +10: File size within expected range (rough check)
  if (result.size && result.size > 0) score += 10;

  return Math.max(score, -50);
}

// ─────────────────────────────────────────────────────────────
// Main search function
// ─────────────────────────────────────────────────────────────

export async function searchForGame(options: SearchOptions): Promise<{
  results: SearchResult[];
  stageUsed: string | null;
  errors: string[];
}> {
  const { gameId, qualityProfileId, manualQuery } = options;

  const game = await storage.getGame(gameId);
  if (!game) throw new Error(`Game ${gameId} not found`);

  const platform = await storage.getPlatform(game.platformId);
  if (!platform) throw new Error(`Platform ${game.platformId} not found`);

  const indexers = await storage.getEnabledIndexers();
  if (indexers.length === 0) {
    return { results: [], stageUsed: null, errors: ["No enabled indexers"] };
  }

  // Build quality profile for scoring
  let profile: Pick<QualityProfile, "preferredFormats" | "preferredRegions" | "minSeeders"> = {
    preferredFormats: [],
    preferredRegions: ["USA", "World", "Europe", "Japan"],
    minSeeders: 1,
  };

  if (qualityProfileId) {
    const qp = await storage.getQualityProfile(qualityProfileId);
    if (qp) profile = qp;
  }

  // Categories from platform (comma-separated string in DB)
  const categories = platform.torznabCategories
    ? platform.torznabCategories.split(",").map((c) => c.trim()).filter(Boolean)
    : ["6000"];

  const errors: string[] = [];
  let stageUsed: string | null = null;

  // Determine query stages
  const stages = manualQuery
    ? [manualQuery]
    : buildSearchStages(
        game.title,
        platform.name,
        (game.alternateNames as string[] | null) ?? [],
      );

  // Try each stage until we get results
  for (const query of stages) {
    const allItems: SearchResult[] = [];

    await Promise.allSettled(
      indexers.map(async (indexer: Indexer) => {
        try {
          let response = await torznabClient.searchGames(indexer, {
            query,
            category: categories,
            limit: 100,
          });

          // Some indexers use category maps that don't line up with global platform defaults.
          // If the category-constrained search returns nothing, retry without category constraints.
          if (response.items.length === 0 && categories.length > 0) {
            const broadResponse = await torznabClient.searchGames(indexer, {
              query,
              limit: 100,
              skipCategory: true,
            });
            if (broadResponse.items.length > 0) {
              searchLog.debug(
                {
                  gameId,
                  query,
                  indexer: indexer.name,
                  constrainedCategories: categories,
                  broadResults: broadResponse.items.length,
                },
                "Category-constrained search returned no items; broad search fallback found results",
              );
            }
            response = broadResponse;
          }

          for (const item of response.items) {
            const score = scoreResult(
              {
                title: item.title,
                seeders: item.seeders,
                size: item.size,
                category: item.category,
              },
              platform,
              profile,
            );

            allItems.push({
              title: item.title,
              link: item.link,
              size: item.size ?? 0,
              seeders: item.seeders ?? 0,
              leechers: item.leechers ?? 0,
              category: item.category ?? "",
              indexerId: indexer.id,
              indexerName: indexer.name,
              score,
              pubDate: item.pubDate,
              attributes: item.attributes,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${indexer.name}: ${msg}`);
        }
      }),
    );

    if (allItems.length > 0) {
      stageUsed = query;

      // Log to search_history
      const bestScore = Math.max(...allItems.map((r) => r.score));
      await storage.createSearchHistoryEntry({
        gameId,
        queryUsed: query,
        resultsCount: allItems.length,
        bestScore,
        searchedAt: new Date().toISOString(),
      }).catch(() => {}); // Non-fatal

      searchLog.info(
        { gameId, query, results: allItems.length, bestScore },
        "Search returned results",
      );

      // Sort by score desc, then seeders desc
      allItems.sort((a, b) => b.score - a.score || b.seeders - a.seeders);
      return { results: allItems, stageUsed, errors };
    }

    searchLog.debug({ gameId, query }, "No results for stage; trying next");
  }

  // Log zero-result attempt
  await storage.createSearchHistoryEntry({
    gameId,
    queryUsed: stages[stages.length - 1] ?? "",
    resultsCount: 0,
    bestScore: 0,
    searchedAt: new Date().toISOString(),
  }).catch(() => {});

  return { results: [], stageUsed: null, errors };
}
