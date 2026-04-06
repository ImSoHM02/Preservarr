# Preservarr

Preservarr is a self-hosted ROM manager for the `-arr` ecosystem.  
It helps you discover, download, import, and track console game files with platform-aware workflows.

## Features

- Platform/game library management UI
- IGDB metadata import (covers, descriptions, genres, dates)
- Prowlarr indexer sync and multi-stage search
- Download client support:
  - qBittorrent
  - Transmission
  - rTorrent
  - NZBGet
  - SABnzbd
- Post-download import pipeline:
  - Detect completed downloads
  - Move payload into `<library path>/<Game Title>/`
  - Track files in the game Files tab
- Library scanner + watcher for existing and newly added files
- Version sources:
  - No-Intro / Redump DAT upload
  - Nintendo Switch titledb sync

## Requirements

- Docker + Docker Compose (recommended)
- Or Node.js 20+ for local development
- Optional integrations:
  - IGDB credentials (via Twitch developer app)
  - Prowlarr URL + API key
  - Download client credentials

## Installation (Docker)

### Option A: Use the published image

```bash
git clone https://github.com/ImSoHM02/Preservarr.git
cd Preservarr
docker compose up -d
```

This repository includes a minimal compose file at `docker-compose.yml` that starts Preservarr and persists data to `./data`.

### Option B: Build locally

```bash
git clone https://github.com/ImSoHM02/Preservarr.git
cd Preservarr
docker build -t ghcr.io/imsohm02/preservarr:latest .
docker compose up -d
```

## Integrating with an Existing Media Stack

If Preservarr runs in a separate compose stack from your downloader/Prowlarr:

- Attach it to the same Docker network (or otherwise ensure connectivity).
- Use container DNS names in settings (not localhost/IP), for example:
  - `http://prowlarr:9696`
  - `http://gluetun:8080` (if qBittorrent is behind gluetun)
- Mount the same host storage path in Preservarr and downloader using the same container path.

Example `preservarr` service snippet:

```yaml
preservarr:
  image: ghcr.io/imsohm02/preservarr:latest
  container_name: preservarr
  pull_policy: always
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=Etc/UTC
  volumes:
    - ./preservarr/data:/app/data
    - /path/to/media:/library
  ports:
    - 5000:5000
  restart: unless-stopped
```

## First-Time Setup

1. Open Preservarr in your browser (`http://<host>:5000`).
2. Create the admin account on the setup page.
3. Go to **Settings**:
   1. Configure **Library Paths** (per platform slug).
   2. Add **IGDB** credentials.
   3. Add **Prowlarr** URL + API key.
4. Go to **Indexers** and run **Prowlarr Sync**.
5. Go to **Downloaders** and add/test your download client.
6. Optional: configure **Quality Profiles**.
7. Optional: configure **Version Sources** (DAT files / titledb).

## How to Use

1. Open **Platforms** and select a platform.
2. Click **Add Games** to import titles from IGDB.
3. Open a game and click **Search**.
4. Pick a result and send it to your configured download client.
5. After completion, importer moves files into:
   - `<library path>/<Game Title>/`
6. Open **Settings → Library Scan** and run a scan if you want immediate re-indexing.
7. Open the game page to see indexed files in the **Files** section.

## Development

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run check
npm run lint
npm run build
```

## Troubleshooting

- Import not moving files:
  - Verify Preservarr can see downloader paths inside the container.
  - Ensure the same host mount is present in both downloader and Preservarr with the same container path.
- Connection tests fail in Docker:
  - Use container names (`prowlarr`, `gluetun`, etc.), not `localhost`.
- Files tab is empty:
  - Run **Library Scan** from Settings.
  - Confirm files are under the configured library root.

## Legal

Preservarr is a management/automation tool.  
It does not host or distribute copyrighted game content.
