# Soup 🥣

**Soup** is a specialized interface for qBittorrent that integrates rich media metadata (via TMDB) to provide a beautiful and informative view of your downloads.

## Features
- **Torrent Upload:** Easily add new torrents via file upload or magnet links (Planned).
- **Rich Metadata:** Automatically matches torrents to movies/shows to display titles, years, plots, and cast.
- **Local Caching:** Uses SQLite (Drizzle ORM) to cache metadata and minimize API calls.
- **Web Dashboard:** Modern, Material Design inspired UI with dark/light mode support.
- **CLI Interface:** Fast command-line tool for quick library management.
- **Strict DX:** Built with TypeScript, OOP, and TDD for long-term maintainability.

## Getting Started

### Prerequisites
- Node.js (v20+)
- `pnpm` installed globally (`npm install -g pnpm`)
- A qBittorrent instance accessible via API (v2)
- A [TMDB API Key](https://www.themoviedb.org/documentation/api)

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Set up your environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and provide your `TMDB_API_KEY` and qBittorrent credentials.

## Web Dashboard

The web dashboard consists of a React frontend and a Fastify API server.

### 1. Start the API Server
The server handles qBittorrent communication and metadata matching.
```bash
pnpm --filter @soup/server dev
```
Runs at `http://localhost:3001`.

### 2. Start the Web App
```bash
pnpm --filter @soup/web dev
```
Runs at `http://localhost:5173`.

## CLI Usage

The CLI provides a quick way to interact with your library from the terminal.

#### List Torrents
```bash
pnpm --filter @soup/cli start list
```

#### Show Details
```bash
pnpm --filter @soup/cli start show <torrent-hash>
```

## Development

### Monorepo Structure
- `apps/web`: React + Tailwind CSS (Vite)
- `apps/server`: Fastify API Server
- `apps/cli`: Commander-based CLI
- `packages/core`: Core models, TMDB provider, and QB client
- `packages/database`: SQLite schema and Drizzle client

### Testing
We use Vitest for testing. To run tests across the entire monorepo:
```bash
pnpm test
```

## Status
Current Phase: **MVP Phase 2 (Completed)**
- [x] Core Models & TDD
- [x] qBittorrent & TMDB Integration
- [x] Live Sync Engine (Delta-based real-time updates)
- [x] CLI Interface
- [x] Web Dashboard UI (Material 3, Responsive)
- [x] Torrent Management (Start, Pause, Delete, Upload)
- [ ] Global Stats & Speed Limits (Phase 2)
- [ ] File Management & Network Storage (Phase 3)
