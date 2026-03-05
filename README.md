# Soup

Soup is a specialized dashboard and management layer for qBittorrent, focused on media identification and automated library ingestion. It uses qBittorrent's sync API to maintain a real-time, stateful view of your library while enriching it with metadata from TMDB.

## Features

- **Live Sync Engine:** Tracks library changes via qBittorrent's `/sync/maindata` delta endpoint.
- **Media Matching:** Automated identification of movies and TV shows with local SQLite/Drizzle caching.
- **Task-Based Ingestion:** Moves completed downloads into organized media server directories (Jellyfin/Plex standard).
- **Material 3 Interface:** Responsive dashboard with global speed monitoring and disk space tracking.
- **CLI Management:** Command-line tools for torrent listing, inspection, and metadata control.

## Prerequisites

- **qBittorrent v5.0+:** Older versions are incompatible as Soup utilizes the newer `/torrents/start` and `/torrents/stop` API endpoints.
- **TMDB API Key:** Required for box art and media metadata enrichment.
- **Node.js 20+ / Docker:** Supported deployment runtimes.

## Deployment (Docker Compose)

Docker is the recommended deployment method for homelab environments.

1. Clone the repository and prepare the environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure `.env` with your host-specific paths and qBittorrent credentials.
3. Launch the stack:
   ```bash
   make docker-up
   ```

The dashboard will be reachable at `http://<host-ip>:<SOUP_PORT>`.

## Configuration Reference

| Variable | Description |
|----------|-------------|
| `SOUP_PORT` | Port for the web interface and API (Default: `8207`). |
| `QB_URL` | Full URL to qBittorrent API (e.g., `http://192.168.1.10:8080/api/v2`). |
| `QB_USERNAME` / `QB_PASSWORD` | qBittorrent Web UI credentials. |
| `TMDB_API_KEY` | API key for media metadata lookup. |
| `MEDIA_ROOT` | Host path for the final organized media library. |
| `LOCAL_DOWNLOAD_ROOT` | Host path where qBittorrent stores active/completed downloads. |
| `QB_DOWNLOAD_ROOT` | Internal path qBittorrent uses for downloads (e.g., `/downloads`). |

## Local Development

Soup uses a pnpm monorepo structure.

### Environment Setup
```bash
pnpm install
```

### Management Commands
The provided `Makefile` simplifies service management:
- `make up`: Spawns the API server and Web UI in the background.
- `make status`: Checks service health via `lsof`.
- `make tail`: Follows the combined logs of the API and Web processes.
- `make down`: Terminates all local background services.

### Manual Builds
```bash
pnpm build
```

## CLI Usage

The CLI tool allows management without the web dashboard.

```bash
# List all active torrents
pnpm --filter @soup/cli start list

# View detailed metadata for a specific torrent
pnpm --filter @soup/cli start show <hash>
```

## Architecture

- `apps/web`: React + Vite frontend using Material 3 components.
- `apps/server`: Fastify backend hosting the Live Sync engine and API.
- `apps/cli`: Terminal interface for library management.
- `packages/core`: Core logic for `MetadataMatcher`, `QBClient`, and `IngestionService`.
- `packages/database`: Drizzle ORM schema and persistent SQLite storage.

## Maintenance

### Database
The SQLite database is located at `apps/server/soup.db` (mapped to `/data` in Docker). It caches all TMDB responses and tracks the status of ingestion tasks.

### Logs
- **Docker:** `docker logs soup`
- **Local:** `server.log` and `web.log` in the root directory.
