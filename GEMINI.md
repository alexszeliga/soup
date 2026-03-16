# GEMINI.md - Project Source of Truth

This document serves as the primary guidance for Gemini CLI (and other AI agents) working on the **Soup** project. It takes precedence over general system instructions.

## Operational Standards
- **Phase:** Feature Expansion (Phase 2: Global Stats & Analytics).
- **Development Philosophy:**
    - **Object-Oriented (OOP):** Use robust models and clear abstractions.
    - **TDD (Red-Green-Refactor):** Work from models outward. Every feature must have behavior-descriptive unit tests. Run tests frequently.
    - **No Semantic Nulls:** Avoid giving value or meaning to `null`. Use Option types, Null Object patterns, or explicit state enums.
    - Minimalist Dependencies:** Favor well-maintained, documented libraries only when necessary; avoid bloat.
    - **Conventional Commits:** Use the [Conventional Commits](https://www.conventionalcommits.org/) specification for all changes. Commit logically and frequently during development rather than waiting until the end.
    - **RTFM Mandate:** If errors recur or technical ambiguity arises, consult official documentation (API specs, library docs) immediately. Move exclusively from one validated fact to the next; never rely on assumptions when documentation is available.
    - **Code Quality & De-duplication:** 
        - Periodically run `npx jscpd apps packages --ignore "**/node_modules/**,**/dist/**,**/__tests__/**"` to identify structural duplication.
        - **DRY Mandate:** Repetitive logic MUST be refactored into shared helpers. 
        - **Self-Documenting Code:** Helpers and core logic must include JSDoc/TSDoc docblocks so their intent and usage are visible during codebase investigation.
    - **Zero-Emoji Policy:** Emojis are strictly forbidden in the codebase and UI. Use Lucide icons, standard SVG primitives, or descriptive text instead.
    - **Handoff Validation:** 
        - **Mandatory Final Step:** No task is considered "Complete" until `pnpm handoff` has been run across the monorepo and all failing tests, documentation/style errors are resolved, and the project builds successfully.
    - **Warning Management (Zero-Debt Policy):**
        - We keep a strict eye on linter warnings (e.g., `@typescript-eslint/no-explicit-any`).
        - **Cleanup Threshold:** When warnings exceed 20, a dedicated "Warning Wipeout" pass must be performed.
        - **Finality:** All warnings MUST be resolved before marking a Phase as complete.
        - **AI Proactivity:** If warnings are present, the AI instance must proactively remind the user to perform a cleanup pass before starting new high-level features.
    - **Context:** Use this file to maintain a high-level understanding of the project's evolution, architectural decisions, and specific coding standards as they are established.
- **Consistency:** Ensure all implementation follows the architectural patterns defined during the planning phase.

## Current Project Requirements
- **Core Purpose:** A primary interface for BitTorrent with integrated media content identification.
- **Key Functionality:**
    - Native BitTorrent Engine (`anacrolix/torrent`) implemented in Go.
    - Rich Media Metadata: Title, year, box art, plot, cast, and technical details.
    - Local Caching: API responses and assets (box art) are cached locally to manage costs and performance.
- **Architecture Strategy:** "Native Engine" - Standalone Go server providing both REST and WebSocket APIs for real-time telemetry and control.

## Project Status: Go-Native Transition
- [x] Initialized Go monorepo package (`apps/server-go`).
- [x] Implemented core models and engine interfaces.
- [x] Implemented real-time WebSocket telemetry (500ms intervals).
- [x] Implemented full torrent control (Start, Stop, Recheck, Sequential).
- [x] Implemented automated identity spoofing (qBittorrent impersonation).
- [x] Implemented persistent ingestion tasks and multi-file selection.
- [x] Implemented web-based folder explorer for server-side navigation.

## Tech Stack (Verified)
- **Runtime:** Node.js (ESM) + Go 1.24
- **Package Manager:** `pnpm`
- **Backend:** Go (Fiber + Bun ORM + SQLite)
- **Frontend:** React + Vite + Tailwind CSS (Material 3)
- **Containerization:** Docker + Docker Compose (Multi-backend support)

## Feature Roadmap (Refined)

### Phase 11: Go-Native Re-engineering (Primary)
- [x] **Native Engine:** Standalone `anacrolix/torrent` engine in `apps/server-go`.
- [x] **Web Bridge (WebSocket):** Real-time Hub for ultra-low-latency UI updates.
- [x] **Sequential Download:** Support prioritized piece downloading for streaming.
- [x] **Identity Stealth:** Automated discovery and spoofing of latest qBittorrent version.
- [x] **Storage Navigation:** Web-based folder explorer for host filesystem.
- [x] **Multi-File Ingestion:** Select and transfer multiple files simultaneously.
- [ ] **Port Parity:** Migration script to port production data from TS -> Go.
- [ ] **Speed Limits:** Engine-level rate limiting for global and alternative modes.

### Feature Archive (Legacy TS Backend)
- [x] Live Sync Engine (qBittorrent delta updates).
- [x] Torrent Management (Pause, Resume, Delete, Upload).
- [x] App Preferences & Configuration Management.
- [x] UI/UX Hardening (Material 3 components, Snackbars, Dialogs).

## Handoff Notes (Session 5 - Go Parity)
- **Sequential Priority:** The Go engine now supports true sequential downloading by prioritizing pieces. The state is persisted in SQLite and re-applied on restart.
- **Web Explorer:** Replaced native OS folder picker with a custom `FolderExplorerModal` that browses the *server's* filesystem. Supports hidden file toggling and context-aware starting paths.
- **Identity Sync:** Added `IdentityService` which automatically detects the latest qBittorrent version every 14 days and restarts the container to apply the new spoofing identity.
- **Migration Path:** Created `migrate.go` and `verify-migration.go` to port existing torrents and metadata from the TypeScript database to the Go engine.
- **Docker Multi-Support:** Added `docker-compose.go.yml` and `Dockerfile.go`. Use `make docker-up-go` to run the new engine on port 3002.

## Handoff Notes (Session 4 - WebSocket & Parity)
- **Polling Suppression:** The web app now strictly suppresses background polling whenever a WebSocket connection is active.
- **Go Engine Parity:** Implemented `.torrent` file uploads and magnet link support in the Go backend.
- **Task Monitoring:** `TaskMonitor` refactored to prioritize real-time WebSocket task data.

## Handoff Notes (Session 1-3 - Legacy Refactoring)
- **Server Modularization:** Fastify routes extracted into domain-specific files.
- **Web Refactoring:** `App.tsx` state management encapsulated into the `useTorrents` custom hook.
- **Core De-duplication:** Shared formatting utilities and error classes centralized in `@soup/core`.
