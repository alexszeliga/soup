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
- [ ] **Global Stats:** Real-time aggregate upload/download speeds in the web header.
- [ ] **Speed Limits:** Toggle global speed limits and "Alternative Speed Limits".
- [x] **App Preferences:** View and modify key qBittorrent settings (e.g. save paths).
- [x] **Configuration Management:** Establish a plan to extract magic numbers and configs to a unified configuration layer.
- [x] **UI/UX Hardening:** Replace all browser-native `alert()` and `confirm()` dialogs with integrated Material 3 components.
    - [x] Implement a reusable `ConfirmDialog` component for destructive actions.
    - [x] Implement a `Snackbar` system for non-intrusive error/success feedback.
    - [x] Update `App.tsx`, `SettingsModal.tsx`, and `TorrentDetailModal.tsx` to use the new systems.
- [ ] **Resilient Media Parsing:** Enhance regex in `Torrent.ts` to handle complex scene names (e.g., dual-language, non-standard tags).
- [ ] **UI Error Boundaries:** Implement React Error Boundaries around `TorrentList` to isolate metadata rendering failures.
- [ ] **Local File Download:** Allow users to download individual torrent files directly to their browser for local use.
- [ ] **Emoji Wipeout:** Remove all emojis from the codebase and UI, replacing them with icons or text.

### Phase 3: Advanced Workflow
- [x] **Detailed View:** Implement a Material 3 Modal for deep-dive torrent management ([docs/torrent-detail-view.md](docs/torrent-detail-view.md)).
- [x] **Manual Metadata Management:** Support "Unmatch" and "Mark as Non-Media" within the Detailed View, with a fallback visual style for generic assets.
- [x] **File Selection:** View torrent file lists and set download priorities.
- [x] **File Management:** Move/copy files to media server ingestion directories.
- [x] **Advanced Matcher:** Manual search/override for incorrect metadata matches.

### Phase 4: Architecture & Infrastructure
- [ ] **Deployment:** Plan and implement a container hosting strategy.

## Handoff Notes (Session 1)
- **App Management:** Use `make up` to start all services, `make down` to stop, and `make status` to check health. Logs are available in `server.log` and `web.log`, or via `make tail`.
- **Ingestion System:** Files are copied via a persistent `TaskQueue`. You can monitor progress in the web header's "Activity" (📦) popover. Ingestion uses the `MEDIA_ROOT` environment variable and suggests Jellyfin-standard paths.
- **Database Location:** The active database is located at `apps/server/soup.db`. If you add columns to the schema, you must manually handle migrations in `MetadataCache.ts` or nuke this file to trigger recreation.
- **qBittorrent v5.0+ Compatibility:** Crucial! Use `/torrents/stop` and `/torrents/start`. The old `/pause` and `/resume` endpoints are removed and will return 404.
- **Security Headers:** All state-changing POST/DELETE requests *must* include `Referer: <base_url>/` and `Origin: <origin>` to bypass CSRF protection.
- **Auth:** Cookies must be parsed to extract *only* the `SID` (e.g., `sidMatch[0]`) to ensure reliability.
- **Build Chain:** The project uses ESM with NodeNext resolution. Always run `pnpm -r build` before testing or starting the CLI/Server to ensure sub-path exports are resolved from `dist`.
- **UI Logic:** Torrent "activity" is determined by an explicit list of active states from the API. If not in that list, the UI should show the "Start" action.
- **Design:** Maintain the "Google Cloud Console" feel: `max-w-[1400px]` centered content with generous padding.
