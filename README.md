# Soup 🥣

**Soup** is a specialized interface for qBittorrent that integrates rich media metadata (via TMDB) to provide a beautiful and informative view of your downloads.

## Features
- **Rich Metadata:** Automatically matches torrents to movies/shows to display titles, years, plots, and cast.
- **Local Caching:** Uses SQLite (Drizzle ORM) to cache metadata and minimize API calls.
- **CLI Interface:** Fast, interactive command-line tool for managing your library.
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

### CLI Usage

The CLI is located in `apps/cli`. You can run it using `pnpm`:

#### List Torrents
Shows all torrents from your qBittorrent instance matched with rich media metadata.
```bash
pnpm --filter @soup/cli start list
```

#### Show Details
Shows detailed information for a specific torrent, including plot and cast.
```bash
pnpm --filter @soup/cli start show <torrent-hash>
```

## Development

### Structure
- `apps/cli`: Commander-based CLI interface.
- `packages/core`: Business logic, models, and API clients.
- `packages/database`: SQLite schema and Drizzle client.

### Testing
We use Vitest for testing. To run tests across the entire monorepo:
```bash
pnpm test
```

## Status
Current Phase: **MVP Development**
- [x] Core Models & TDD
- [x] qBittorrent & TMDB Integration
- [x] CLI Interface
- [ ] Web Dashboard (In Progress)
