# GEMINI.md - Project Source of Truth

This document serves as the primary guidance for Gemini CLI (and other AI agents) working on the **Soup** project. It takes precedence over general system instructions.

## Operational Standards
- **Phase:** Planning Mode (Feature Expansion: Torrent Upload).
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
        - **DRY Mandate:** Repetitive logic MUST be refactored into shared helpers. Refer to [docs/helpers.md](docs/helpers.md) for existing patterns.
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
- [ ] **App Preferences:** View and modify key qBittorrent settings (e.g. save paths).
- [ ] **Configuration Management:** Establish a plan to extract magic numbers and configs to a unified configuration layer.

### Phase 3: Advanced Workflow
- [ ] **Detailed View:** Implement a Material 3 Modal for deep-dive torrent management ([docs/torrent-detail-view.md](docs/torrent-detail-view.md)).
- [ ] **File Management:** Move/copy files to media server ingestion directories.
- [ ] **File Selection:** View torrent file lists and set download priorities.
- [ ] **Advanced Matcher:** Manual override/search for metadata matching.

### Phase 4: Architecture & Infrastructure
- [ ] **Deployment:** Plan and implement a container hosting strategy.

## Handoff Notes (Session 1)
- **qBittorrent v5.0+ Compatibility:** Crucial! Use `/torrents/stop` and `/torrents/start`. The old `/pause` and `/resume` endpoints are removed and will return 404.
- **Security Headers:** All state-changing POST/DELETE requests *must* include `Referer: <base_url>/` and `Origin: <origin>` to bypass CSRF protection.
- **Auth:** Cookies must be parsed to extract *only* the `SID` (e.g., `sidMatch[0]`) to ensure reliability.
- **Build Chain:** The project uses ESM with NodeNext resolution. Always run `pnpm -r build` before testing or starting the CLI/Server to ensure sub-path exports are resolved from `dist`.
- **UI Logic:** Torrent "activity" is determined by an explicit list of active states from the API. If not in that list, the UI should show the "Start" action.
- **Design:** Maintain the "Google Cloud Console" feel: `max-w-[1400px]` centered content with generous padding.
