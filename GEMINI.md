# GEMINI.md - Project Source of Truth

This document serves as the primary guidance for Gemini CLI (and other AI agents) working on the **Soup** project. It takes precedence over general system instructions.

## Operational Standards
- **Phase:** Feature Expansion (Phase 2: Global Stats & Analytics).
- **Development Philosophy:**
    - **Strict DX:** Code must be maintainable by a human without AI assistance.
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
- **Core Purpose:** A primary interface for qBittorrent with integrated media content identification.
- **Key Functionality:**
    - Standard qBittorrent operations (upload, status tracking, interaction) via `https://qb.osage.lol/api/v2`.
    - Rich Media Metadata: Title, year, box art, plot, cast, and technical details.
    - Local Caching: API responses and assets (box art) must be cached locally to manage costs and performance.
- **Architecture Strategy:** "Live Sync Engine" - Use qBittorrent's `/sync/maindata` delta endpoint to maintain a real-time, stateful view of the library in `@soup/core`.

## Project Status: MVP Development
- [x] Initialized pnpm monorepo.
- [x] Implemented core models (`Torrent`, `MediaMetadata`) with TDD.
- [x] Implemented `MetadataMatcher` and `MetadataCache` (SQLite/Drizzle).
- [x] Implemented `QBClient` for qBittorrent API integration.
- [x] Implemented `TMDBMetadataProvider` for rich media metadata.
- [x] Implemented CLI interface (`soup list`, `soup show`).
- [x] Implemented Web Dashboard (Poster-centric responsive UI).
- [x] Implemented Live Sync Engine (Stateful delta updates).
- [x] Implemented Torrent Management (Start/Force-Start, Pause, Delete, Upload).

## Tech Stack (Verified)
- **Runtime:** Node.js (ESM)
- **Package Manager:** `pnpm`
- **Backend:** Fastify + Drizzle ORM
- **Frontend:** React + Vite + Tailwind CSS (Material 3)
- **Testing:** Vitest + Playwright (Visual Inspection)

## Feature Roadmap (Refined)

### Phase 1: MVP Consolidation
- [x] **Live Sync:** Refactor `@soup/core` to use a fully delta-aware sync mechanism.
- [x] **Torrent Add:** Support `.torrent` file uploads and magnet link pasting.
- [x] **Torrent Control:** Add Pause, Resume, and Delete actions to the UI.
- [x] **Code Quality:** Establish a long-term goal and plan to find and refactor repetitive code (MVP Priority).

### Phase 2: Management & Health
- [x] **Global Stats:** Real-time aggregate upload/download speeds and remaining disk space in the web header.
- [x] **Speed Limits:** Toggle global speed limits and "Alternative Speed Limits".
- [x] **Seeding Stats:** Display seeding time and share ratio in Torrent Cards and Detail View.
- [x] **App Preferences:** View and modify key qBittorrent settings (e.g. save paths).
- [x] **Configuration Management:** Establish a plan to extract magic numbers and configs to a unified configuration layer.
- [x] **UI/UX Hardening:** Replace all browser-native `alert()` and `confirm()` dialogs with integrated Material 3 components.
    - [x] Implement a reusable `ConfirmDialog` component for destructive actions.
    - [x] Implement a `Snackbar` system for non-intrusive error/success feedback.
    - [x] Update `App.tsx`, `SettingsModal.tsx`, and `TorrentDetailModal.tsx` to use the new systems.
- [x] **Resilient Media Parsing:** Enhance regex in `Torrent.ts` to handle complex scene names (e.g., dual-language, non-standard tags).
- [x] **UI Error Boundaries:** Implement React Error Boundaries around `TorrentList` to isolate metadata rendering failures.
- [x] **Local File Download:** Allow users to download individual torrent files directly to their browser for local use.
- [x] **Emoji Wipeout:** Remove all emojis from the codebase and UI, replacing them with icons or text.
- [x] **Nice Status Names:** Map raw qBittorrent states to human-readable names in the UI.

### Phase 3: Advanced Workflow
- [x] **Detailed View:** Implement a Material 3 Modal for deep-dive torrent management ([docs/torrent-detail-view.md](docs/torrent-detail-view.md)).
- [x] **Manual Metadata Management:** Support "Unmatch" and "Mark as Non-Media" within the Detailed View, with a fallback visual style for generic assets.
- [x] **File Selection:** View torrent file lists and set download priorities.
- [x] **File Management:** Move/copy files to media server ingestion directories.
- [x] **Advanced Matcher:** Manual search/override for incorrect metadata matches.
- [x] **Granular Control:** Implement a dropdown in Detail View for all torrent actions (Force Start, Recheck, Sequential, etc.).

### Phase 4: Architecture & Infrastructure
- [x] **Deployment:** Plan and implement a container hosting strategy.
- [ ] **Bundle Optimization:** Use `React.lazy` for Modals to reduce initial bundle size and improve TTI.

### Phase 5: CLI Parity
- [x] **Remote CLI Architecture:** CLI now works as a thin client over the network via `SOUP_URL`.
- [x] **Standalone Command:** CLI installable via `pnpm link --global` as `soup`.
- [x] **CLI Control:** Implement `start`, `stop`, and `delete` commands for torrent management.
- [x] **CLI Add:** Implement `add` command supporting both local `.torrent` files and magnet links.
- [x] **CLI Metadata Management:** Implement `unmatch`, `mark-non-media`, and manual `match` (search/override) commands.
- [x] **CLI File Management:** Implement `files` (listing) and `priority` (set download priority) commands.
- [x] **CLI Ingestion:** Implement `ingest` command to trigger file movement and a `tasks` command to monitor progress.
- [x] **CLI Settings:** Implement a `settings` command to view and modify qBittorrent preferences.
- [x] **CLI Stats:** Add a `stats` or `dashboard` command for real-time global speed and health monitoring.
- [x] **CLI Structural Overhaul:** Implement a structured command router (e.g. using `commander` or a pattern-matcher) to improve subcommand maintainability.

### Phase 6: System Hardening & Resilience
- [x] **Ingestion Safety:** Implement pre-flight writability checks in `IngestionService` and enhance `TaskQueue` with filesystem-specific error recovery.
- [x] **Sync Loop Isolation:** Prevent overlapping sync cycles using an execution lock and isolate individual metadata fetch failures within the loop to prevent global stalls.
- [x] **Persistence Integrity:** Refactor `MetadataCache` to use atomic transactions for multi-table updates and implement a retry strategy for SQLite "Database Busy" errors.
- [x] **Standardized Error Mapping:** Define domain-specific error classes (e.g., `SoupError`, `ProviderError`) and map them to appropriate HTTP status codes in the server layer.
- [x] **UI State Awareness:** Add a "Live" connection status indicator to the web header and implement a "Connection Lost" overlay for persistent polling failures.
- [x] **Test Runner Maintenance:** Resolve the `test.poolOptions` deprecation warning in Vitest configuration across the monorepo.
- [x] **Core De-duplication:** Centralize formatting utilities (`formatBytes`, `formatDuration`) in `@soup/core` to eliminate duplication between CLI and Web.
- [x] **CLI De-duplication:** Refactor `SoupClient` to use a unified request helper, removing redundant error-handling boilerplate.
- [x] **Web De-duplication:** Streamline `TorrentDetailModal.tsx` by extracting shared sub-components for tabs and file priority logic.

### Phase 7: DX & Readability Overhaul
- [x] **Web (High Priority):**
    - [x] Refactor `App.tsx` state management into a `useTorrents` custom hook to encapsulate polling and delta logic.
    - [x] Decouple Modal state and complex business logic from the main `App` component into domain-specific containers.
- [x] **Server (Medium Priority):**
    - [x] Modularize the monolithic `index.ts` by extracting API routes into domain-specific files (e.g., `torrents.routes.ts`, `system.routes.ts`).
    - [x] Encapsulate the background synchronization loop into a dedicated `SyncWorker` class.
    - [x] Eliminate `any` types in route handlers and implement strict, schema-validated request/reply types.
- [x] **Core (Lower Priority):**
    - [x] Extract `NoiseMiner` logic from `LiveSyncService` into a standalone domain service to adhere to the Single Responsibility Principle.
    - [x] Centralize `QBClient` API endpoints into a structured constant or enum to improve discoverability and ease of updates.

### Phase 8: Design System & Theming Foundation
- [ ] **Atomic UI Primitives:** Create reusable, stateless components in `apps/web/src/components/ui/` to centralize styling.
    - [ ] `Button.tsx`: Support variants (Primary, Secondary, Danger, Ghost).
    - [ ] `Badge.tsx`: Support semantic states (Active, Inactive, Warning, Error).
    - [ ] `ProgressBar.tsx`: Standardize linear progress indicators with consistent animations.
    - [ ] `Section.tsx`: Standardize layout headers and content block spacing.
    - [ ] `BaseModal.tsx`: Encapsulate backdrop, blur, and standard Material 3 entry transitions.
- [ ] **Style Tokenization:** Replace hardcoded Tailwind colors with semantic utility classes (e.g., `bg-primary`, `text-secondary`) mapping to CSS variables in `tailwind.config.js`.
- [ ] **Component Refactoring:** Systematically update all views to use the new Design System primitives.
    - [ ] Update `TorrentCard` to use `Badge` and `ProgressBar`.
    - [ ] Update `TorrentDetailModal` to use `BaseModal` and semantic `Section` blocks.
    - [ ] Update `AddTorrentModal` and `SettingsModal` to use `BaseModal`.
- [ ] **Theming Engine:** Implement a simple `ThemeContext` and provider to demonstrate dynamic switching of CSS variable values.

### Phase 9: First-Run Experience (CLI Init)
- [ ] **Interactive Init Command:** Implement `soup init` to guide users through initial setup.
    - [ ] **Proactive Configuration:** Prompt for all keys in `.env.example` with smart defaults.
    - [ ] **Connectivity Validation:** Verify qBittorrent and TMDB connectivity during setup to ensure immediate functionality.
    - [ ] **Secure Handling:** Use masked inputs for passwords and API keys.
    - [ ] **Persistence:** Save to `.env` with automatic backup of any pre-existing configuration.
- [ ] **Dependency Check:** Add a pre-flight check to `soup start` (server) to warn if critical environment variables are missing or invalid.

### Phase 10: Developer Infrastructure & Tooling
- [ ] **Concise Handoff Script:** Implement a wrapper (e.g., `scripts/handoff.sh`) that intercepts `pnpm handoff` output.
    - [ ] Success: Report only "PASSED" for each stage (Lint, Build, Test).
    - [ ] Failure: Dump the full error log for the failing stage only.
    - [ ] Goal: Minimize token overhead for AI agents during validation loops.
- [ ] **Auto-fix Shortcuts:** Add `pnpm fix` to combine `eslint --fix` and other automated repair tools.

## Handoff Notes (Session 3)
- **Web Refactoring:** The `App.tsx` is now a slim entry point. All state, polling, and action handlers are encapsulated in the `useTorrents` hook (`apps/web/src/hooks/useTorrents.ts`). UI layout is split into `Sidebar`, `Header`, and `ConnectionOverlay` components.
- **Server Modularization:** The Fastify server is now modular. Routes are registered via `registerTorrentRoutes` and `registerSystemRoutes` in `apps/server/src/routes/`.
- **SyncWorker:** The background sync loop is now managed by the `SyncWorker` class (`apps/server/src/SyncWorker.ts`), improving encapsulation and testability.
- **Core Improvements:**
    - `NoiseMiner` service handles noise token extraction.
    - `QBEndpoints` enum in `QBClient.ts` centralizes all qBittorrent API paths.
- **Test Fixes:** `TaskQueue.test.ts` now uses Vitest fake timers to correctly handle the exponential backoff logic introduced in Phase 6.

## Handoff Notes (Session 2)
- **Centralized Utilities:** `formatBytes` and `formatDuration` are now located in `@soup/core/utils/format.ts`. All apps should import from here to avoid duplication.
- **Error Handling:** Use the custom error classes in `@soup/core/utils/Errors.ts` (e.g., `NotFoundError`, `ProviderError`) when throwing from services. The Fastify server automatically maps these to appropriate HTTP status codes.
- **Sync Safety:** `LiveSyncService` now has an internal `isSyncing` lock. Overlapping calls to `sync()` (manual or background) will safely return immediately if a cycle is already active.
- **Persistence Integrity:** `MetadataCache` now uses transactions for saving metadata and setting non-media status. Database operations also include an exponential backoff retry for `SQLITE_BUSY` errors.
- **Task Queue Reliability:** `TaskQueue` now supports exponential backoff for retrying failed ingestion tasks. Terminal errors (like permission denied) are failed immediately to prevent infinite loops.
- **UI Connectivity:** The web app now monitors server health. A pulsing green/red indicator in the sidebar shows sync status, and a full-screen "Connection Lost" overlay appears after 3 consecutive failures.
- **Vitest Config:** The `vitest.config.ts` was updated to comply with Vitest 4.0 (moving `forks` to the top level).

## Handoff Notes (Session 1)
- **App Management:** Use `make up` to start all services, `make down` to stop, and `make status` to check health. Logs are available in `server.log` and `web.log`, or via `make tail`.
- **Ingestion System:** Files are copied via a persistent `TaskQueue`. You can monitor progress in the web header's "Activity" (Package icon) popover. Ingestion uses the `MEDIA_ROOT` environment variable and suggests Jellyfin-standard paths.
- **Database Location:** The active database is located at `apps/server/soup.db`. If you add columns to the schema, you must manually handle migrations in `MetadataCache.ts` or nuke this file to trigger recreation.
- **qBittorrent v5.0+ Compatibility:** Crucial! Use `/torrents/stop` and `/torrents/start`. The old `/pause` and `/resume` endpoints are removed and will return 404.
- **Security Headers:** All state-changing POST/DELETE requests *must* include `Referer: <base_url>/` and `Origin: <origin>` to bypass CSRF protection.
- **Auth:** Cookies must be parsed to extract *only* the `SID` (e.g., `sidMatch[0]`) to ensure reliability.
- **Build Chain:** The project uses ESM with NodeNext resolution. Always run `pnpm -r build` before testing or starting the CLI/Server to ensure sub-path exports are resolved from `dist`.
- **UI Logic:** Torrent "activity" is determined by an explicit list of active states from the API. If not in that list, the UI should show the "Start" action.
- **Design:** Maintain the "Google Cloud Console" feel: `max-w-[1400px]` centered content with generous padding.
