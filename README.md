# Soup

Soup is a high-performance BitTorrent dashboard and media manager. It identifies your downloads, enriches them with TMDB metadata, and automates the ingestion process into your media library.

> **Note:** Soup is transitioning to a Go-native engine for superior performance and low-latency updates. The legacy TypeScript/qBittorrent backend remains supported but is no longer the primary focus.

## Features

- **Native Go Engine:** Standalone BitTorrent client (`anacrolix/torrent`) with no external dependencies required.
- **Ultra-Low Latency:** Real-time WebSocket telemetry pushes updates every 500ms.
- **Stealth Mode:** Automated identity spoofing to perfectly impersonate the latest qBittorrent version for private tracker compatibility.
- **Media Matching:** Automated identification of movies and TV shows via TMDB with local persistence.
- **Sequential Downloading:** Prioritizes piece downloading for immediate file previewing.
- **Web-Based Explorer:** Browse and select server-side storage paths directly from your browser.
- **Multi-File Ingestion:** Select and transfer multiple media files simultaneously to organized library roots.

## Prerequisites

- **TMDB API Key:** Required for box art and media metadata enrichment.
- **Docker:** Recommended for deployment.

## Deployment (Docker Compose)

The new Go-native engine is the default deployment target.

1. Clone the repository and prepare the environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure `.env` with your host-specific paths (`MEDIA_ROOT`, `LOCAL_DOWNLOAD_ROOT`) and `TMDB_API_KEY`.
3. Launch the Go-native stack:
   ```bash
   make docker-up-go
   ```

The dashboard will be reachable at `http://<host-ip>:3002`.

### Legacy Deployment
If you prefer to use qBittorrent as your backend:
```bash
make docker-up-legacy
```
The legacy dashboard runs on port `3001`.

## Management & Verification

The Go engine includes built-in tools for maintenance:

```bash
# Refresh qBittorrent identity spoofing (Docker required)
make spoof

# Migrate existing data from Legacy (TS) to Go
make migrate

# Verify migration success
make verify-migration
```

## CLI Usage

The Soup CLI is a "thin client" that can manage your Soup instance from any terminal.

```bash
# Global Installation
cd apps/cli && pnpm link --global

# Usage
soup list
soup show <hash>
```

## Architecture

- `apps/server-go`: High-performance Go-native BitTorrent engine and API.
- `apps/web`: React + Vite frontend using Material 3 and WebSockets.
- `apps/cli`: Standalone remote terminal interface.
- `apps/server`: Legacy Fastify backend (TypeScript).
- `packages/core`: Shared logic and models.

## Maintenance

### Database
The Go engine uses SQLite located at `apps/server-go/.torrent.db`. In Docker, this is mapped to the `./data` volume.

### Logs
- **Docker (Go):** `docker logs soup-go`
- **Docker (Legacy):** `docker logs soup`
