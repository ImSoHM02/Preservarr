# Preservarr — Project Plan
### A console ROM/emulation manager for the -arr ecosystem

---

## 1. Vision & Scope

Preservarr is a self-hosted, web-based media manager for console game ROMs, designed to fit naturally alongside Sonarr, Radarr, Prowlarr, and similar tools. It automates the discovery, download, organisation, and metadata enrichment of ROM files for use with emulators, and optionally integrates with Ownfoil to serve Nintendo Switch titles directly to Tinfoil.

The key distinction from Questarr (which targets general PC/console gaming as a want-list manager) is that Preservarr is ROM-first: it is specifically built around emulator file formats, platform-specific naming standards, and the emulator ecosystem.

---

## 2. Core Feature Set

### 2.1 Library Management
- Scan one or more directories for ROM files across all supported platforms
- Identify files using filename conventions (No-Intro, Redump, GoodTools) and hash-based identification (CRC32, MD5, SHA1) matched against imported DAT files
- Track status per title: **Wanted → Searching → Downloading → Owned → Ignored**
- Support multi-file ROM formats (BIN+CUE, multi-disc ISOs, etc.)
- Detect and track version/revision info per platform (ROM revisions for retro, update version numbers for Switch)
- Version badge on every game card: green (current), amber (update available), grey (unknown)
- Display collection statistics and completion percentages per platform

### 2.2 Platform Support (Initial)
Platforms should be treated as configurable modules. Initial targets:

| Platform | File Formats | Notes |
|---|---|---|
| Nintendo Switch | NSP, NSZ, XCI, XCZ | Ownfoil integration |
| Nintendo 64 | N64, Z64, V64 | No-Intro naming |
| SNES / Super Famicom | SFC, SMC | No-Intro naming |
| Game Boy / GBC / GBA | GB, GBC, GBA | No-Intro naming |
| Nintendo DS / 3DS | NDS, CIA, 3DS | |
| PlayStation 1 | BIN+CUE, ISO, CHD | Redump naming |
| PlayStation 2 | ISO, CHD | Redump naming |
| PlayStation Portable | ISO, CSO, CHD | |
| Sega Genesis / Mega Drive | MD, BIN, SMD | |
| Dreamcast | GDI, CHD | Redump naming |

Additional platforms can be added via community contributions.

### 2.3 Metadata
- Primary source: **IGDB API** (same as Questarr) — covers, descriptions, ratings, release dates, genres, franchises
- Secondary source: **ScreenScraper** — emulation-specific metadata, regional box art, wheel art, snap videos, strong ROM identification via hash
- Fallback: **TheGamesDB**
- Metadata stored locally in database; configurable refresh intervals
- Platform-aware art (console-specific box art aspect ratios and styles)

### 2.4 Indexer Integration (via Prowlarr / Torznab)
- Connect to Prowlarr as the central indexer hub (same model as Sonarr/Radarr) — the user's existing Prowlarr instance gives access to every ROM-focused tracker they've already configured, for free
- Direct Torznab endpoint support as a fallback for users who don't run Prowlarr
- Platform-aware Torznab category mapping — configurable per platform with sensible defaults (e.g. Switch → `6000,6070`, PS1 → `6000,6050`), since ROM indexers often use non-standard category codes
- Smart, multi-stage search query construction (see Section 8 for full detail)
- Result scoring and ranking by relevance: platform match, region preference, format preference, seeder count
- Quality profiles per platform: prefer CHD over ISO, NSZ over NSP, No-Intro dumps over uncategorised releases
- Configurable region preference order (e.g. USA > World > Europe > Japan) applied at result filtering time
- Configurable search delay and automatic retry intervals for newly-wanted titles
- Search history table to track which indexers returned results for which queries, enabling tuning over time
- Manual search UI: user can trigger a search for any title and pick from a ranked result list (same UX as Radarr's manual search)
- Auto-grab: optionally pick the highest-scored result automatically when a match is found

### 2.5 Download Client Integration
- **qBittorrent** (primary)
- **Transmission**
- **rTorrent / ruTorrent**
- **NZBGet** / **SABnzbd** (Usenet)
- Per-platform download paths configurable per client
- Post-download import: move/copy + rename to target library folder
- Handle multi-disc/archive extraction automatically

### 2.6 Naming & Organisation
- Configurable naming templates per platform
- Support No-Intro standard: `Game Title (Region) (Rev X) (Disc Y)`
- Support Redump standard for disc-based systems
- Region tagging: `(USA)`, `(Europe)`, `(Japan)`, `(World)`
- CHD conversion integration (optional post-processing step using `chdman`)
- Automatic NSZ compression for Switch titles (optional, requires `nsz` tool)

### 2.7 Ownfoil Integration (Optional Module)
Since Ownfoil manages a Nintendo Switch library as a Tinfoil-compatible self-hosted shop, Preservarr can act as the acquisition layer that feeds into Ownfoil:

- **File routing**: Downloaded Switch ROMs (NSP/XCI/NSZ) are placed into Ownfoil's watched `/games` directory automatically
- **Rescan trigger**: After a successful import, call Ownfoil's library scan endpoint (if/when Ownfoil exposes one, or via filesystem watchdog)
- **Completion awareness**: Query Ownfoil's library to determine which titles, updates, and DLCs are already present — Preservarr uses this to avoid re-downloading content already in Ownfoil
- **Missing content detection**: Cross-reference your wanted list against Ownfoil's existing library, and mark titles accordingly
- **DLC & update tracking**: Ownfoil tracks App IDs and version numbers; Preservarr can use this data to want specific update versions
- Configuration: Ownfoil base URL + optional credentials (if shop is set to private)

### 2.8 Emulator Profiles (Nice-to-Have, Phase 2)
- Define which emulator handles each platform
- Generate emulator-specific playlists (RetroArch `.lpl`, LaunchBox XML, ES-DE gamelist.xml)
- Optionally trigger library refreshes in EmulationStation-DE or Pegasus Frontend via their APIs

---

## 3. Tech Stack

Preservarr should align closely with the Questarr/Sonarr ecosystem to lower the barrier for contributors already familiar with those projects.

### 3.1 Backend
**Runtime**: Node.js 20+ with TypeScript

**Framework**: Express.js

**Database**: SQLite via **Drizzle ORM** — consistent with the broader -arr ecosystem (Sonarr, Radarr, Prowlarr all use SQLite) and simpler to self-host with no external database service required. WAL mode handles concurrent reads from background jobs without issue.

**Job Scheduler**: `node-cron` + `setInterval` for periodic jobs (library scans, version checks, download monitoring) — same approach as Questarr, sufficient for single-instance use

**Key Libraries**:
- `axios` — HTTP client for API calls
- `p-queue` — controlled concurrency for indexer searches
- `chokidar` — filesystem watching for library directories
- `archiver` / `extract-zip` — archive handling
- `xml2js` — Torznab/RSS feed parsing

### 3.2 Frontend
**Framework**: React 18 + TypeScript

**Build tool**: Vite

**Styling**: Tailwind CSS + **shadcn/ui** (same as Questarr — consistent look across the -arr ecosystem)

**State management**: React Query (TanStack Query) for server state

**Key UI patterns**:
- Platform selector sidebar (similar to Radarr's quality profile selector)
- ROM grid view with box art (similar to Radarr's movie poster grid)
- Activity feed for downloads (similar to Sonarr's queue)
- Per-platform completion dashboard

### 3.3 External Services & APIs

| Service | Purpose | Auth |
|---|---|---|
| IGDB (via Twitch) | Game metadata, cover art | OAuth2 Client Credentials |
| ScreenScraper | Emulation-specific art & metadata | Username + password |
| Prowlarr | Indexer aggregation | API key |
| titledb (GitHub) | Switch version data (cached JSON) | None (public) |
| No-Intro DAT files | Retro ROM revision database | User-supplied files |
| Redump DAT files | Disc-based system revision database | User-supplied files |
| Ownfoil | Switch library state + version data | URL + optional credentials |
| Download clients | Torrent/Usenet | URL + credentials |

### 3.4 Deployment
- **Docker + Docker Compose** as the primary deployment method (single Dockerfile, single service — no external database container required)
- SQLite database stored in a persistent volume (e.g. `/app/data/sqlite.db`)
- Environment-variable based configuration with a `.env.example`
- Volumes for: library paths, config/database persistence
- Health check endpoint at `/api/health`
- Entrypoint script runs Drizzle migrations automatically on container start

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│   (Platform browser, ROM library, Queue, Settings)       │
└────────────────────────┬────────────────────────────────┘
                         │ REST API / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                   Express.js Backend                     │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Library    │  │   Metadata   │  │   Indexer      │  │
│  │  Scanner    │  │   Service    │  │   Service      │  │
│  │ (chokidar)  │  │(IGDB/ScrnSc) │  │(Prowlarr/Tznb) │  │
│  └─────────────┘  └──────────────┘  └───────┬────────┘  │
│                                             │            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────▼────────┐  │
│  │  Version    │  │   Import     │  │  Search Score  │  │
│  │  Check Svc  │  │   Pipeline   │  │  + Quality     │  │
│  │(DAT/titledb)│  │(rename/move) │  │  Profiles      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Download   │  │   Notif.     │  │   Ownfoil      │  │
│  │  Manager    │  │   Service    │  │   Integration  │  │
│  │(qBit/etc.)  │  │(Discord/TG)  │  │   (optional)   │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              PostgreSQL (Drizzle ORM)             │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema (Core Tables)

```
platforms          — id, name, slug, file_extensions[], naming_standard, version_source
                     (version_source: 'titledb' | 'no-intro' | 'redump' | 'none')

games              — id, title, igdb_id, screenscraper_id, platform_id, cover_url,
                     description, region, release_date, genres[]

game_files         — id, game_id, path, filename, size_bytes, file_format,
                     crc32, md5, sha1,                    -- hash fields for DAT matching
                     known_version, latest_version,        -- version tracking
                     version_status,                       -- 'current' | 'outdated' | 'unknown'
                     version_checked_at, imported_at

wanted_games       — id, game_id, status, monitored, quality_profile_id, added_at
                     (status: wanted | searching | downloading | owned | ignored)

version_sources    — id, platform_id, source_type, file_path, last_synced_at,
                     entry_count                          -- for DAT files; URL for titledb

dat_entries        — id, version_source_id, game_title, region, revision,
                     crc32, md5, sha1                     -- parsed No-Intro / Redump entries

download_history   — id, game_id, indexer_id, release_title, size_bytes,
                     seeders, score, started_at, completed_at, status

search_history     — id, game_id, query_used, indexer_id, results_count,
                     best_score, searched_at              -- for tuning search logic

indexers           — id, name, type (prowlarr | torznab), url, api_key,
                     priority, enabled, categories[]      -- per-indexer category codes

quality_profiles   — id, name, platform_id,
                     preferred_formats[],                 -- e.g. ['NSZ','NSP','XCI']
                     preferred_regions[],                 -- e.g. ['USA','World','Europe']
                     min_seeders

download_clients   — id, name, type, url, username, password,
                     download_path, platform_paths        -- JSON: {switch: '/games/switch', ...}

notification_targets — id, name, type (discord | telegram | apprise | webhook),
                       url, enabled, notify_on[]          -- ['update_available','import','fail']

settings           — key, value (JSON), updated_at
```

---

## 6. Development Phases

### Phase 1 — Core (MVP)
- Project scaffolding (monorepo: `client/`, `server/`, `shared/`)
- Docker + Docker Compose setup
- PostgreSQL schema + Drizzle migrations
- IGDB metadata integration
- Library scanner (directory watching, file identification, hash computation, basic status tracking)
- Basic React UI: platform list, game grid, game detail page
- Prowlarr integration: connection settings, indexer listing, Torznab search, result display
- Quality profiles: format preference, region preference, min seeders
- Search query builder (multi-stage normalisation — see Section 8)
- qBittorrent download client integration
- Import pipeline (post-download move + rename)
- User authentication (single admin account, bcrypt)
- Light/dark mode

### Phase 2 — Version Checking & Enrichment
- No-Intro DAT file import + hash-based ROM identification
- Redump DAT file import for disc-based systems
- titledb sync for Switch version tracking
- Version check service (scheduled daily, badge on game cards)
- "Update available" → auto-add to Wanted + notification trigger
- ScreenScraper integration (richer emulation-specific art)
- Usenet support (NZBGet, SABnzbd)
- Additional download clients (Transmission, rTorrent)
- CHD conversion post-processing
- NSZ compression for Switch titles
- Platform completion dashboard
- Notification support (Discord webhook, Telegram, Apprise)
- Search history tracking + basic search analytics page

### Phase 3 — Integrations & Export
- **Ownfoil integration** (full — file routing, rescan trigger, library sync, DLC/update awareness, version data pull)
- EmulationStation-DE gamelist.xml export
- RetroArch playlist generation
- LaunchBox XML export
- Public REST API with API key auth (for third-party integrations)
- Webhook support (on import, on download failure, on update available, etc.)

---

## 7. Ownfoil Integration — Detail

Ownfoil exposes its library via the filesystem and (currently) doesn't have a formal REST API beyond Tinfoil shop endpoints. The integration should be designed to be resilient to Ownfoil's evolving feature set:

**Short-term approach (filesystem-based)**:
1. User configures Ownfoil's `/games` directory path in Preservarr settings
2. Preservarr's Switch import pipeline targets this directory directly
3. On import completion, Preservarr optionally calls Ownfoil's Tinfoil shop endpoint to trigger a re-index (Ownfoil uses a filesystem watchdog that should pick up new files automatically)

**Long-term approach (if Ownfoil adds an API)**:
1. Query Ownfoil's library to get a list of all owned App IDs + versions
2. Mark those titles as Owned in Preservarr automatically
3. Identify missing DLCs or updates and add them to the Wanted list

**Configuration keys**:
```
ownfoil.enabled        = true/false
ownfoil.baseUrl        = http://192.168.1.x:8465
ownfoil.username       = (optional)
ownfoil.password       = (optional)
ownfoil.gamesPath      = /path/to/ownfoil/games
ownfoil.syncOnImport   = true/false
```

---

## 8. Prowlarr Integration — Detail

### Connection & Configuration
The user provides their Prowlarr base URL and API key in Settings. On test, Preservarr calls `/api/v1/indexer` to list all configured indexers and display them in the UI (name, type, enabled state), confirming the connection is healthy. Searches go to the Torznab unified endpoint:

```
GET {prowlarr_url}/torznab/all/api
  ?t=search
  &q={encoded_query}
  &cat={category_codes}
  &apikey={api_key}
```

Each platform has a configurable comma-separated list of Torznab category codes stored in the `indexers` table, with community-sourced defaults:

| Platform | Default categories |
|---|---|
| Nintendo Switch | `6000,6070` |
| PlayStation 1/2 | `6000,6050` |
| Game Boy / GBA | `6000,6080` |
| SNES / N64 | `6000,6080` |
| PSP | `6000,6060` |
| Sega Genesis | `6000,6080` |

### Multi-Stage Search Query Builder
Straightforward title lookups often fail on ROM indexers because release names include platform tags, region codes, revision markers, and scene group names. The search service builds queries in stages and tries each in sequence until results are found:

```
Stage 1: Exact normalised title
  "The Legend of Zelda: Ocarina of Time"
  → strip leading article → "Legend of Zelda Ocarina of Time"

Stage 2: Strip subtitle (after : or —)
  → "Legend of Zelda"

Stage 3: Add platform hint
  → "Legend of Zelda N64"
  → "Legend of Zelda Nintendo 64"

Stage 4: Try alternate regional title
  → "Zelda no Densetsu Toki no Ocarina"  (from IGDB alternate_names field)

Stage 5: Broad keyword fallback
  → "Ocarina of Time"
```

Each stage waits for results before proceeding. If any stage returns results, scoring begins immediately — no need to try subsequent stages.

### Result Scoring
Each result from Prowlarr is scored out of 100 before being presented to the user or auto-grabbed. Higher score = better match.

| Signal | Points |
|---|---|
| Platform keyword in release title | +30 |
| Preferred region match (e.g. USA) | +20 |
| Preferred format match (e.g. NSZ, CHD) | +20 |
| No-Intro / Redump tag in title `[!]` | +10 |
| Seeder count ≥ min_seeders threshold | +10 |
| File size within expected range for format | +10 |
| Scene group known-good list | +5 |
| Release title contains `[BIOS]` or `[BADS]` flags | −50 |
| Region mismatch (deprioritise, not discard) | −10 |

Results below a configurable minimum score (default: 30) are hidden by default in the UI but accessible via "Show all results." Auto-grab only fires for results scoring ≥ 70.

### Quality Profiles
Quality profiles work per platform, similar to Sonarr's quality profiles. Each profile specifies:
- Preferred file formats in priority order (e.g. `NSZ > NSP > XCI > XCZ`)
- Preferred region order (e.g. `USA > World > Europe > Japan`)
- Minimum seeders for auto-grab
- Whether to upgrade an existing file if a better-quality release is found

A game can be assigned a quality profile at the wanted-game level, overriding the platform default.

### Search History
Every search attempt is logged to the `search_history` table with the query used, which indexer responded, how many results were returned, and the best score achieved. A Search History page in Settings lets you see which games are failing to find results, which queries are working, and which indexers are most productive for ROMs — useful for tuning category codes and quality thresholds.

---

## 9. Version Checking — Detail

### Strategy by Platform

Version checking is not one-size-fits-all. The implementation is split into three strategies, selected automatically based on `platforms.version_source`:

**Nintendo Switch (`version_source: 'titledb'`)**

The community-maintained [titledb](https://github.com/nicoboss/titledb) project publishes a JSON file per region (e.g. `US.en.json`) listing every known Switch Title ID, its name, latest version number, update Title ID, and DLC Title IDs. Preservarr caches this file locally (refreshed daily via a scheduled job) and uses it to:

1. Look up each owned Switch game by its Title ID
2. Compare `game_files.known_version` against `titledb.version` for that Title ID
3. Flag as `version_status = 'outdated'` if a newer version exists
4. Store the update's Title ID in the `wanted_games` record so the search service knows exactly what to look for

If Ownfoil is connected, Ownfoil's own library data (which includes App IDs and version numbers per file) can be used as a supplementary version source, cross-referencing titledb to catch anything Preservarr hasn't scanned directly.

**Retro cartridge systems (`version_source: 'no-intro'`)**

No-Intro publishes DAT files (XML) through their Dat-o-Matic service. Each DAT covers one platform and lists every verified-good ROM dump with its CRC32, MD5, SHA1, filename, region, and revision number. Preservarr imports these DAT files (user-supplied, guided by a first-run setup wizard) and parses them into the `dat_entries` table.

On library scan, each ROM file is hashed (CRC32 is fast enough for real-time scanning; MD5/SHA1 are computed in a background job). The hash is looked up in `dat_entries`. This gives you:
- Confirmation the dump is a known-good file
- The official revision number for that dump
- Whether a higher revision exists for the same game in the same region

If a `Rev 1` exists in the DAT for a game you own as `Rev 0`, it's flagged as outdated.

**Disc-based systems (`version_source: 'redump'`)**

Redump DATs work identically to No-Intro DATs but cover disc-based systems (PS1, PS2, Dreamcast, etc.). The same import → hash → match → compare flow applies. Redump uses disc sector hashes (typically the full disc SHA1) rather than file hashes, so CHD files need to be queried via `chdman verify` to extract the underlying hash before matching.

**Systems with no revision tracking (`version_source: 'none'`)**

Some platforms (e.g. Sega Game Gear, Atari 2600) have no actively maintained DAT with revision data. For these, version status always shows as `'unknown'` with a grey badge — no false positives.

### Scheduled Jobs

```
Daily (02:00 local time, configurable):
  1. Fetch + cache titledb JSON for all enabled Switch regions
  2. Re-check all Switch game_files where version_checked_at < 24h ago
  3. Re-check all retro game_files against DAT entries (if DAT was updated)
  4. For any newly-outdated files: set version_status = 'outdated', fire notifications,
     optionally add update to wanted_games

On library scan (triggered by chokidar or manual):
  1. Hash new/modified files
  2. Match against dat_entries (sync) + queue full MD5/SHA1 (background)
  3. Set initial version_status
```

### DAT File Management UI

A dedicated "Version Sources" page in Settings lets users:
- Upload No-Intro and Redump DAT files per platform
- See when each DAT was imported and how many entries it contains
- Trigger a re-import if a newer DAT is available
- View which of their files matched vs. unmatched in each DAT

### Notification Behaviour

When a game transitions to `version_status = 'outdated'`:
1. The game card gains an amber badge showing current vs. latest version
2. A toast notification appears in the UI activity feed
3. If `notification_targets` are configured and `notify_on` includes `'update_available'`, an external notification is sent (Discord embed, Telegram message, or generic webhook payload)
4. If the quality profile has "auto-upgrade" enabled, the update is added directly to `wanted_games` with status `wanted`, and the search service picks it up on its next cycle

The old file is never deleted automatically — the user must confirm removal after the new version is imported successfully.

---

## 10. Project Naming

**Chosen name: Preservarr**

The name signals the tool's alignment with the emulation community's core value — ROM preservation — while fitting naturally into the -arr ecosystem. It works equally well for retro cartridge games and modern platforms like Switch, and doesn't pigeonhole the project as purely nostalgic.

---

## 11. Key Differences from Questarr

| Feature | Questarr | Preservarr |
|---|---|---|
| Target audience | General gaming / PC | Emulator users |
| Platform scope | All platforms (IGDB broad) | Console-only, ROM-format-aware |
| File handling | Generic download only | ROM format awareness (CHD, NSZ, No-Intro naming) |
| Metadata | IGDB only | IGDB + ScreenScraper (hash-based ID) |
| Library scanning | Not primary focus | Core feature (hash-based ROM identification) |
| Version tracking | None | titledb (Switch), No-Intro DATs, Redump DATs |
| Prowlarr integration | Basic Torznab | Full: category mapping, multi-stage queries, result scoring, quality profiles |
| Ownfoil integration | None | Optional first-class integration (file routing + version sync) |
| Emulator outputs | None | Playlist/gamelist export (Phase 3) |

---

## 12. Open Source Considerations

- **License**: GPL-3.0 (consistent with Questarr, Sonarr, Radarr)
- **IGDB Terms**: Non-commercial self-hosted use is permitted under IGDB API terms; attribution required
- **ScreenScraper Terms**: Self-hosted personal use is permitted; do not scrape aggressively (rate limit all calls)
- **ROM content**: The application should explicitly not host, distribute, or link to ROM files. It is a management tool only, analogous to how Sonarr/Radarr do not host video content.

---

## 13. Bootstrapping from Questarr

Questarr uses the same stack (Node/Express/TypeScript, Drizzle + SQLite, React + Vite + Tailwind + shadcn/ui, TanStack Query, Docker) and has been reviewed in detail. The recommended approach is **a fresh repo with selective file copying** — not a fork-and-strip. This avoids inheriting Questarr's monolithic `routes.ts` (2,631 lines, all game-specific) while still capturing the high-value infrastructure work.

### Copy directly (domain-agnostic, high effort to recreate)

| File | Notes |
|---|---|
| `server/auth.ts` | JWT + bcrypt implementation, ~107 lines, clean |
| `server/middleware.ts` | Rate limiting, input sanitisation |
| `server/downloaders.ts` | 137 KB of qBittorrent / Transmission / SABnzbd / NZBGet / Deluge / rtorrent integrations |
| `server/torznab.ts` + `newznab.ts` | Torznab/Newznab protocol parsers, reusable verbatim |
| `server/logger.ts` | Pino logger setup |
| `server/db.ts` | Drizzle + SQLite setup, WAL mode |
| `drizzle.config.ts` | Drizzle Kit configuration |
| `Dockerfile` + `entrypoint.sh` | Multi-stage build, privilege dropping, migration hook |
| `docker-compose.yml` | Single-service setup, adapt volume paths |
| `client/src/lib/queryClient.ts` | TanStack Query setup with JWT-aware fetch |
| `client/src/lib/auth.tsx` | Auth context + provider |
| `client/src/components/ui/` | All shadcn/ui components, verbatim |
| `shared/title-utils.ts` | Title normalisation logic — directly relevant to the search query builder |

### Rewrite from scratch (game-specific, not salvageable)

- `shared/schema.ts` — Questarr's tables are game-centric; Preservarr's schema is defined in Section 5
- `server/routes.ts` — all 2,631 lines assume games/indexers/downloaders; start fresh with modular route files
- `server/cron.ts` — job logic is hardcoded for IGDB fetching and game completion; rewrite for ROM-specific jobs
- `server/igdb.ts` — adapt rather than copy; Preservarr uses IGDB too but with different query patterns
- All page components — all UIs are game-specific

### Note on route structure

Questarr puts all routes in a single `routes.ts` file. For Preservarr, prefer modular route files from the start (e.g. `routes/games.ts`, `routes/indexers.ts`, `routes/downloaders.ts`) to keep the codebase navigable as it grows.

---

## 14. Immediate Next Steps

1. Set up the GitHub repository with the monorepo structure (`client/`, `server/`, `shared/`)
2. Copy infrastructure files from Questarr (see Section 13), adapt Docker setup for Preservarr
3. Define the Drizzle schema (`shared/schema.ts`) for the tables in Section 5
4. Implement platform configuration and the IGDB metadata pipeline first — this gives you a working UI to browse against before any download logic exists
5. Add the library scanner with hash computation second — so you can immediately see your existing ROMs and their identification status
6. Layer in Prowlarr integration third, starting with the connection test + indexer list, then the search query builder, then result scoring
7. Add the version check service in Phase 2, starting with titledb for Switch (simplest — one JSON file, no user setup), then No-Intro DATs for retro
8. Add Ownfoil integration as a Switch-specific optional module in Phase 3

---

## 15. Progress Log

### Completed — 2026-04-03: Project Scaffolding & Schema

**Bootstrapped from Questarr.** Cloned Doezer/Questarr, stripped git history, and initialised a fresh repo. Followed the fork-and-strip approach rather than the plan's recommended fresh-repo-with-copy (user preference).

**Files kept (domain-agnostic infrastructure):**
- `server/auth.ts` — JWT + bcrypt auth (updated to use Preservarr types & settings)
- `server/middleware.ts` — rate limiting, input sanitisation (updated to use key-value settings)
- `server/downloaders.ts` — qBittorrent / Transmission / rTorrent / SABnzbd / NZBGet / Deluge integrations (types inlined, no longer depends on schema)
- `server/torznab.ts`, `server/newznab.ts` — protocol parsers (updated imports)
- `server/prowlarr.ts` — Prowlarr API client (updated imports)
- `server/igdb.ts` — IGDB metadata client (updated to use key-value settings)
- `server/logger.ts`, `server/db.ts`, `server/ssl.ts`, `server/ssrf.ts`, `server/socket.ts`, `server/config.ts`, `server/config-loader.ts`, `server/types.ts`, `server/vite.ts`, `server/migrate.ts`, `server/run-migrations.ts`, `server/storage.ts`
- `client/src/lib/auth.tsx`, `client/src/lib/queryClient.ts`, `client/src/lib/utils.ts`
- `client/src/components/ui/*` — all shadcn/ui components
- `client/src/pages/auth/login.tsx`, `client/src/pages/auth/setup.tsx`, `client/src/pages/not-found.tsx`
- `client/src/components/LoadingFallback.tsx`, `client/src/components/SearchBar.tsx`, `client/src/components/EmptyState.tsx`, `client/src/components/PathBrowser.tsx`
- `shared/title-utils.ts`
- Build/deploy: `Dockerfile`, `entrypoint.sh`, `docker-compose.yml`, `drizzle.config.ts`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`, `eslint.config.js`

**Files deleted (Questarr-specific, to be rewritten):**
- `server/routes.ts` (monolithic, 2,631 lines), `server/cron.ts`, `server/xrel.ts`, `server/rss.ts`, `server/search.ts`
- `shared/schema.ts` (old), `shared/download-categorizer.ts`
- All Questarr page components and game-specific UI components
- All migrations, tests, scripts, docs, images, `.github/`, `unraid/`

**New files created:**
- `shared/schema.ts` — full Drizzle schema with all 14 tables from Section 5: `platforms`, `games`, `game_files`, `wanted_games`, `version_sources`, `dat_entries`, `download_history`, `search_history`, `indexers`, `quality_profiles`, `download_clients`, `notification_targets`, `settings`, `users`. Includes relations, indexes, and Zod validation schemas.
- `server/storage.ts` — complete data access layer with CRUD methods for all entities.
- `server/index.ts` — cleaned entry point with health check, no Questarr-specific routes/cron/rss.
- `client/src/App.tsx` — minimal router with placeholder dashboard, auth pages, Preservarr branding.
- `client/src/components/AppSidebar.tsx` — Preservarr navigation (Dashboard, Platforms, Downloads, Indexers, Downloaders, Settings).
- `client/src/components/Header.tsx` — simplified header with theme toggle.
- `migrations/0000_deep_boom_boom.sql` — initial migration generated by Drizzle Kit.

**Renamed:** package.json `name` → `preservarr`, version → `0.1.0`, all Questarr branding replaced.

**Type-checks clean:** zero TypeScript errors across the entire project.

---

### Completed — 2026-04-04: Platform Seed, API Routes & Core UI

**Platform seed migration** (`migrations/0001_seed_platforms.sql`):
- 13 default platforms seeded via SQL migration (split GB/GBC/GBA and DS/3DS into separate platforms for accurate IGDB metadata):
  - Nintendo Switch, Nintendo 64, SNES / Super Famicom, Game Boy, Game Boy Color, Game Boy Advance, Nintendo DS, Nintendo 3DS, PlayStation, PlayStation 2, PlayStation Portable, Sega Genesis / Mega Drive, Dreamcast
- Each platform populated with file extensions, naming standard, version source, Torznab categories, and IGDB platform ID

**Modular API routes** (`server/routes/`):
- `server/routes/auth.ts` — `/api/auth/status` (first-run check), `/api/auth/setup` (create admin), `/api/auth/login`, `/api/auth/me`
- `server/routes/platforms.ts` — `GET /api/platforms` (with game counts), `GET /api/platforms/:slug`, `PATCH /api/platforms/:id` (enable/disable, edit categories), `GET /api/platforms/:slug/stats`
- `server/routes/games.ts` — `GET /api/games` (filter by platform/search, enriched with wanted status + file counts), `GET /api/games/:id` (with files, wanted, platform), `POST /api/games`, `PATCH /api/games/:id`, `POST /api/games/:id/wanted`, `PATCH /api/games/:id/wanted`
- `server/routes/settings.ts` — `GET /api/settings` (bulk), `GET/PUT /api/settings/:key`, `PUT /api/settings` (bulk update)
- All routes registered in `server/index.ts`; auth routes are public, all others require JWT

**Core UI pages**:
- `client/src/pages/dashboard.tsx` — stats cards (platforms, games, wanted, downloads) + clickable platform overview list
- `client/src/pages/platforms/index.tsx` — platform card grid with file extension labels, naming standard / version source badges, game counts; separate section for disabled platforms
- `client/src/pages/platforms/platform.tsx` — game poster grid (3:4 aspect ratio cover art) with wanted status badges, file count badges, local search filter, back navigation
- `client/src/pages/games/game.tsx` — game detail with cover art, description, release date, region, IGDB ID, title ID, genres, alternate names, and file list with version status badges (green/amber/grey)
- All pages wired into `client/src/App.tsx` with Wouter routing: `/`, `/platforms`, `/platforms/:slug`, `/games/:id`
- `getPageTitle()` updated for all new routes

**Type-checks clean:** zero TypeScript errors, Vite build succeeds.

---

### Completed — 2026-04-04: IGDB Metadata Pipeline & Quality Profiles

**IGDB metadata pipeline** (`server/routes/igdb.ts`, `client/src/components/IgdbSearchModal.tsx`):
- `GET /api/igdb/search?q=&platformId=` — searches IGDB with optional platform filtering (matches against the platform's `igdbPlatformId`, falls back to unfiltered results)
- `POST /api/igdb/import` — imports a single IGDB game into the local DB for a given platform (cover art URL rewritten to `t_cover_big`, release date formatted, genres extracted). Deduplicates by igdbId + platformId.
- `POST /api/igdb/import/batch` — batch import using `igdbClient.getGamesByIds()` for efficiency. Returns `{ imported, skipped, failed, games }`.
- `GET /api/igdb/status` — verifies IGDB credentials are configured and working
- IGDB search modal (`IgdbSearchModal.tsx`) — full search dialog with cover art thumbnails, year, rating, genre badges, one-click "Add" per result, duplicate detection (greys out already-imported games)
- "Add Games" button added to platform page toolbar, opens IGDB search modal scoped to that platform
- Platform page now tracks existing IGDB IDs via `useMemo` to prevent duplicate imports

**Quality profiles** (`server/routes/quality-profiles.ts`, `client/src/pages/quality-profiles.tsx`):
- Full CRUD API: `GET /api/quality-profiles`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` — all enriched with platform data, validates platformId and array types
- Quality profiles settings page with:
  - Profile list showing format priority chain (e.g. `NSZ > NSP > XCI`), region order, min seeders, auto-upgrade badge
  - Create/edit dialog with platform-aware format suggestions (selecting Switch shows NSZ/NSP/XCI/XCZ buttons), ordered region picker with drag reordering and common region suggestions, min seeders input, auto-upgrade toggle
  - Inline delete with confirmation
- Route `/quality-profiles` added to App.tsx with Wouter routing
- "Quality Profiles" added to sidebar under Management section (with `SlidersHorizontal` icon)

**Type-checks clean:** zero TypeScript errors, Vite build succeeds.

---

### Completed — 2026-04-04: Questarr Rebranding Cleanup

Replaced all remaining Questarr references across the codebase with Preservarr branding:
- `client/index.html` — title → "Preservarr - ROM Management", removed Questarr favicon refs, updated meta description
- `client/src/pages/auth/setup.tsx` — removed Questarr v1.0 migration alert (not relevant), updated Twitch app name suggestion to "Preservarr"
- `.env.example` — header updated
- `server/config.ts` — default JWT secret renamed
- `server/torznab.ts`, `server/newznab.ts`, `server/prowlarr.ts`, `server/downloaders.ts` — User-Agent strings → `Preservarr/1.0`, comments updated
- `server/ssl.ts` — self-signed cert CN/org → Preservarr
- `vite.config.ts` — Codecov bundle name → preservarr
- `package.json` — repository URL → ImSoHM02/Preservarr
- `Dockerfile` — user/group → preservarr, labels updated (title, author, source, version)
- `entrypoint.sh` — user/group refs → preservarr, banner text updated
- `docker-compose.yml` — image → `ghcr.io/imsohm02/preservarr:latest`
- `docker-compose.migrate.yml` — **deleted** (Questarr PG→SQLite migration tool, not applicable)

Only `preservarr-plan.md` retains Questarr references (intentional — documents project origin and differences).

---

### Completed — 2026-04-04: Initial Setup Page Fix

**Bug fixed** (`client/src/pages/auth/setup.tsx`):
- Root cause: setup page was querying `/api/config` (non-existent endpoint). `config` resolved to `undefined`, making the Zod schema require IGDB fields while the UI hid them — form validation silently failed on every submit.
- Secondary issue: `/api/auth/setup` never accepted IGDB credentials anyway.
- Fix: removed the dead config query and the IGDB section from setup entirely. IGDB credentials belong in Settings post-login, which is where they now live.

---

### Completed — 2026-04-05: Library Scanner, Search Service, Indexers, Download Clients

**New dependencies installed:** `chokidar`, `crc-32`, `p-queue`, `node-cron`, `@types/node-cron`

**Library scanner** (`server/scanner.ts`):
- `runFullScan()` — walks all configured library paths, identifies files by extension against enabled platforms, computes CRC32 (fast, synchronous per file), creates stub game records for unmatched filenames, inserts `game_files` records
- Background MD5/SHA1 computation via `p-queue` (concurrency 2) — updates `game_files` after fast scan completes; cross-references `dat_entries` for version info
- No-Intro filename parser — extracts title, region `(USA)`, revision `(Rev 1)` from standard ROM filenames
- `startWatcher()` / `stopWatcher()` — chokidar filesystem watcher on all configured paths, depth 1, auto-imports new files and emits `scanner:file-removed` on deletion
- Socket.IO events: `scanner:started`, `scanner:progress`, `scanner:complete`, `scanner:file-added`, `scanner:file-removed`
- Watcher started automatically on server boot; restarted when library paths change

**Search service** (`server/search.ts`):
- `buildSearchStages()` — 5-stage query builder per Section 8: (1) normalised title with article stripped, (2) subtitle stripped, (3) platform hint variants, (4) alternate regional names from IGDB, (5) broad keyword fallback
- `scoreResult()` — 0–100 score with signals: platform keyword (+30), preferred region (+20), preferred format (+20), No-Intro `[!]` tag (+10), seeder threshold (+10), file size present (+10), known-good scene group (+5), bad flags (`[BIOS]`, `[BADS]`, etc.) (−50)
- `searchForGame()` — tries each stage in order, stops at first stage with results, logs to `search_history`, sorts by score then seeders

**API routes** (`server/routes/`):
- `server/routes/library.ts` — `GET /api/library/paths`, `PUT /api/library/paths`, `DELETE /api/library/paths/:slug`, `GET /api/library/scan` (status), `POST /api/library/scan` (trigger, async 202)
- `server/routes/indexers.ts` — full CRUD + `POST /:id/test` (Torznab connection test) + `POST /prowlarr/sync` (fetch & upsert from Prowlarr) + `POST /search/:gameId` (game search)
- `server/routes/download-clients.ts` — full CRUD + `POST /:id/test` + `GET /:id/queue` + `GET /queue/all` (aggregated across all enabled clients); passwords masked in all responses
- `POST /api/games/:id/search` added to `server/routes/games.ts`
- All new routes registered in `server/index.ts`

**Frontend pages** (all lazy-loaded, routed in `App.tsx`):
- `client/src/pages/settings.tsx` — library path config (per-platform slug → directory), scan trigger with live progress bar, IGDB credentials, Prowlarr URL/key
- `client/src/pages/indexers.tsx` — list/add/edit/delete indexers, enable toggle, test connection, Prowlarr sync button, category codes per indexer
- `client/src/pages/downloaders.tsx` — list/add/edit/delete download clients (qBittorrent, Transmission, rTorrent, NZBGet, SABnzbd), test connection
- `client/src/pages/downloads.tsx` — live download queue view aggregated across all enabled clients, auto-refreshes every 10 s, shows progress bar, speed, seeds per item
- `client/src/pages/games/game.tsx` — Search button triggers multi-stage search and opens results dialog; dialog shows scored results with size/seeds/indexer, manual query override input, "show low-score results" toggle, link copy; "Add to Wanted" button

**Type-checks clean:** zero TypeScript errors, Vite build succeeds.

---

---

### Completed — 2026-04-05: Send-to-Client, Import Pipeline, IGDB Status Badge

**Phase 1 is now complete.**

**Schema & migration** (`migrations/0002_download_client_tracking.sql`):
- Added `download_client_id` and `external_id` columns to `download_history` — enables the import poller to track which client holds a given download and query it by ID.

**Send-to-client** (`server/routes/download-clients.ts`):
- `POST /api/download-clients/:id/add` — takes `{ url, title, gameId, indexerId?, sizeBytes?, seeders?, score? }`, calls `DownloaderManager.addDownload()`, creates a `download_history` entry with `downloadClientId` and `externalId`, marks `wanted_games.status = 'downloading'`.

**Import pipeline** (`server/importer.ts`):
- `pollImports()` — runs every 30 s; queries all `download_history` entries with `status = 'downloading'` and an `externalId`; detects completion via `progress >= 100` or known-complete status strings (seeding, pausedUP, etc.); finds the ROM file via `findRomFile()` (tries direct file, sub-folder, then dir scan); moves to the platform's library path if different from the download dir; marks history as `imported` and `wanted_games.status = 'owned'`. The chokidar watcher picks up the moved file automatically.
- Started automatically on server boot from `server/index.ts`.

**Search results dialog** (`client/src/pages/games/game.tsx`):
- Download button now sends to the selected client via `POST /api/download-clients/:id/add` — closes dialog and invalidates game query on success.
- Auto-selects the only client when exactly one is configured.
- Shows a `Select` picker when multiple clients are enabled.
- Shows a warning when no clients are configured.

**IGDB status badge** (`client/src/pages/settings.tsx`):
- Green "Connected" / red "Not configured" badge in the IGDB API card title, driven by `GET /api/igdb/status`.
- Re-checks automatically after saving IGDB credentials.

**Type-checks clean:** zero TypeScript errors, Vite build succeeds.

---

### What's Next — Phase 2

1. **No-Intro DAT file import UI** — upload DAT per platform → parse XML → bulk-insert `dat_entries` → re-hash existing `game_files`. This unlocks version badges on game cards.
2. **titledb sync for Switch** — fetch and cache `US.en.json`, cross-reference by Title ID, flag `version_status = 'outdated'`, optionally auto-add update to `wanted_games`.
3. **Version check service** — scheduled daily job that re-checks all files against their platform's version source (titledb / No-Intro / Redump), fires notifications, optionally triggers auto-upgrade.
4. **ScreenScraper integration** — richer emulation-specific art (wheel art, snap video, regional box art) sourced by hash match.
5. **Notification support** — Discord webhook, Telegram, Apprise on import / update-available / download-failed.
