  Deep Dive Summary

  Architecture Overview

  Current State (Dual Backend):
  - Go Backend (apps/server-go/): Native BitTorrent engine using anacrolix/torrent, Fiber web framework, SQLite persistence, WebSocket real-time updates (500ms)
  - Legacy TS Backend (apps/server/): Fastify API that proxies to qBittorrent via @soup/core package
  - Shared Web Frontend (apps/web/): React + Vite, works with both backends
  - Shared Core (packages/core/): TypeScript business logic tightly coupled to qBittorrent API
  - CLI (apps/cli/): Remote management client using the same API

  Key Dependencies on Legacy Code

  | Component | Legally TS Dependency | Notes |
  |-----------|----------------------|-------|
  | packages/core | High | 14 TS files, QBClient, LiveSyncService all depend on qBittorrent |
  | packages/database | Medium | Drizzle ORM schema shared, but used by both |
  | apps/web | Low | API-agnostic, uses WebSocket + REST |
  | apps/cli | Low | Calls the API endpoints (backend-agnostic) |
  | apps/server | Self | The legacy server itself (4 TS files) |

  ---

  Migration Plan: Remove Legacy TypeScript Backend

  Current Production State (as of commit da0d6f5):
  - Go backend is functional and running in production
  - Current changes add: new `/api/torrents/:hash/suggest-paths` endpoint
  - All other changes are formatting-only (tabs to spaces, whitespace cleanup)
  - No breaking changes introduced
  - Debug file `apps/server-go/check.go` has been removed

  Phase 1: API Parity Audit ✅ (Already Done)

  The Go backend already implements:
  - ✅ Torrent CRUD (add, delete, list)
  - ✅ Torrent control (start, stop, recheck, sequential)
  - ✅ File priority management
  - ✅ Metadata linking (TMDB)
  - ✅ Ingestion service with background tasks
  - ✅ WebSocket real-time updates
  - ✅ Preferences management
  - ✅ System/storage endpoints

  Current API Status:
  - ✅ /api/torrents/:hash/suggest-paths - NOW ADDED (was missing)
  - ✅ /api/ingest/libraries - exists
  - ✅ /api/config - returns backend type (soup-go)
  - ✅ DELETE /api/torrents/:hash - exists (singular, frontend loops for batch)

  ---

  Phase 2: API Endpoint Normalization ✅ COMPLETE (current changes)

  Status: Go backend API is fully compatible with frontend.

  Completed Tasks:

  1. ✅ Endpoint naming normalized:
     - /api/libraries and /api/ingest/libraries both work
     - /api/torrents/:hash/suggest-paths - NOW ADDED (was missing)

  2. ✅ `/api/config` response:
     Returns: { backend: "soup-go", syncInterval: 2000, tmdbImageBase, env }

  3. ✅ DELETE route: /api/torrents/:hash?deleteFiles=true (frontend loops for batch)

  ---

  Phase 3: Deprecate `packages/core` qBittorrent-Dependent Code ⏳ PENDING

  Status: Not yet started. These files are still required for legacy server.

  Files to Remove (16 files):

  ---

  Phase 4: Remove Legacy Server Application

  Files to Delete:
  apps/server/
  ├── src/
  │   └── index.ts              # Main server file (417 lines)
  ├── package.json
  ├── tsconfig.json
  └── .env.example (if exists)

  Package.json Updates:
  Root `package.json`:
  {
    "scripts": {
      "dev": "pnpm --filter @soup/server-go dev",
      "build": "pnpm --filter @soup/server-go build",
      // Remove "@soup/server" references
      "start": "node apps/server-go/dist/main.js"
    }
  }

  Web `package.json`:
  {
    "scripts": {
      "dev": "vite --host",
      // Remove reference to legacy server in dev workflow
    }
  }

  ---

  Phase 5: Remove CLI Reference to Legacy API (If Any)

  The CLI currently uses SOUP_URL environment variable. Verify it points to Go backend:

  - Default: http://localhost:8207 (should match Go server port)
  - Update apps/cli/src/client.ts if any legacy-specific endpoints are called

  ---

  Phase 6: Update Docker Compose & Environment

  Remove legacy service:
  # docker-compose.yml - DELETE THIS ENTIRE FILE or keep as legacy reference
  services:
    soup:
      build: .
      container_name: soup
      # ... entire legacy service config

  Update root `.env`:
  # Remove these lines:
  # QB_URL=
  # QB_USERNAME=
  # QB_PASSWORD=
  # QB_DOWNLOAD_ROOT=

  # Keep Go-specific vars:
  SOUP_GO_PORT=3002
  MEDIA_ROOT=/media
  LOCAL_DOWNLOAD_ROOT=/downloads
  TMDB_API_KEY=

  ---

  Phase 7: Frontend Compatibility Verification

  The web frontend in /apps/web/src uses:
  - import.meta.env.VITE_API_URL || '/api' (already API-agnostic)
  - WebSocket at /ws (Go supports this)
  - REST endpoints (Go implements all)

  Potential issues to fix:
  1. If frontend calls DELETE /api/torrents?hashes=... (batch delete), either:
     - Add batch delete to Go, OR
     - Update frontend to loop over hashes

  2. If frontend expects specific error formats, ensure Go returns compatible structure

  ---

  Phase 8: Database Migration (If Schema Differs)

  Both use SQLite but may have different schemas:

  Go schema (apps/server-go/internal/repository/models.go):
  Tables: torrents, metadata, tasks, preferences, noise_tokens

  TS schema (packages/database/src/schema.ts):
  Tables: metadata, preferences, download_sessions, noise_tokens

  Action: Merge schemas or deprecate TS-specific tables (download_sessions)

  ---

  Phase 9: Remove `apps/server` Directory ⏳ PENDING

  Status: Not yet started.

  Once all above steps are verified:
  rm -rf apps/server/

  Update pnpm workspace:
  // pnpm-workspace.yaml
  packages:
    - "apps/*"
    - "packages/*"
    # Remove: "apps/server"

  ---

  Phase 10: Final Cleanup

  1. Remove root `Dockerfile` (legacy, only used by TS server)
  2. Delete `docker-compose.yml` (keep docker-compose.go.yml as active)
  3. Update `README.md` to reflect Go-only architecture
  4. Remove any CI/CD references to legacy server
  5. Run full test suite to verify no broken dependencies

  ---

  Execution Timeline

  | Phase | Files/Modules Affected | Risk Level | Time Estimate |
  |-------|------------------------|------------|---------------|
  | 1. Audit | N/A | None | ✅ Done |
  | 2. API Normalization | apps/server-go/internal/server/server.go | Low | 1-2 hours |
  | 3. Deprecate Core | packages/core/src/* (16 files) | Low-Medium | 2-3 hours |
  | 4. Remove Legacy Server | apps/server/ (entire dir) | Low | 30 min |
  | 5. CLI Compatibility | apps/cli/ | Low | 30 min |
  | 6. Docker/Env | docker-compose.yml, .env | Low | 1 hour |
  | 7. Frontend Fix | apps/web/src/ | Medium | 1-2 hours |
  | 8. DB Migration | packages/database/ | High | 2-3 hours |
  | 9. Delete Server | apps/server/* | Medium | 30 min |
  | 10. Cleanup | Root configs, docs | Low | 1 hour |

  Current Status (as of da0d6f5):
  ✅ Go backend is production-ready
  ✅ Current changes are safe (formatting + new endpoint)
  ⏳ Phase 3-10 pending (legacy removal)

  Timeline: 10-15 hours of focused work (remaining phases only)

  Post-Migration Verification

  # 1. Build Go backend only
  cd apps/server-go && go build && ./main

  # 2. Build frontend
  cd apps/web && pnpm build

  # 3. Run integration test
  # - Start Go server
  # - Navigate to web UI
  # - Test torrent add, ingestion, metadata linking, WebSocket updates

  # 4. Run CLI commands
  SOUP_URL=http://localhost:8207 soup list
  SOUP_URL=http://localhost:8207 soup add <magnet>

  # 5. No TS server references found
  grep -r "@soup/server" apps/ packages/  # Should return nothing

  ---

  This plan removes ~20-25 TypeScript files, eliminates the Fastify server, removes qBittorrent dependency, and simplifies the codebase to a single Go-based architecture while maintaining full feature parity. The web UI and CLI remain unchanged from the user's perspective.