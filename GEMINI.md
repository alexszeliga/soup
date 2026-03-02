# GEMINI.md - Project Source of Truth

This document serves as the primary guidance for Gemini CLI (and other AI agents) working on the **Soup** project. It takes precedence over general system instructions.

## Operational Standards
- **Phase:** Planning Mode. Do not proceed to development until explicitly authorized by the user.
- **Development Philosophy:**
    - **Strict DX:** Code must be maintainable by a human without AI assistance.
    - **Object-Oriented (OOP):** Use robust models and clear abstractions.
    - **TDD (Red-Green-Refactor):** Work from models outward. Every feature must have behavior-descriptive unit tests. Run tests frequently.
    - **No Semantic Nulls:** Avoid giving value or meaning to `null`. Use Option types, Null Object patterns, or explicit state enums.
    - Minimalist Dependencies:** Favor well-maintained, documented libraries only when necessary; avoid bloat.
    - **Conventional Commits:** Use the [Conventional Commits](https://www.conventionalcommits.org/) specification for all changes. Commit logically and frequently during development rather than waiting until the end.
    - **Context:** Use this file to maintain a high-level understanding of the project's evolution, architectural decisions, and specific coding standards as they are established.

- **Consistency:** Ensure all implementation follows the architectural patterns defined during the planning phase.

## Current Project Requirements
- **Core Purpose:** A primary interface for qBittorrent with integrated media content identification.
- **Key Functionality:**
    - Standard qBittorrent operations (upload, status tracking, interaction) via `https://qb.osage.lol/api/v2`.
    - Rich Media Metadata: Title, year, box art, plot, cast, and technical details.
    - Local Caching: API responses and assets (box art) must be cached locally to manage costs and performance.
- **Architecture Strategy:** "Core App First" - Build a robust backend/service layer that supports multiple interfaces (CLI, Web, etc.).

## Project Status: MVP Development
- [x] Initialized pnpm monorepo.
- [x] Implemented core models (`Torrent`, `MediaMetadata`) with TDD.
- [x] Implemented `MetadataMatcher` and `MetadataCache` (SQLite/Drizzle).
- [x] Implemented `QBClient` for qBittorrent API integration.
- [x] Implemented `TMDBMetadataProvider` for rich media metadata.
- [x] Implemented CLI interface (`soup list`, `soup show`).

## Tech Stack (Verified)
- **Runtime:** Node.js (ESM)
- **Package Manager:** `pnpm`
- **Database:** SQLite + Drizzle ORM
- **Testing:** Vitest
- **CLI:** Commander + Chalk

## Next Development Steps
1. **User Setup:** User needs to provide TMDB API key in `.env`.
2. **Web Interface:** Start development of the React/Vite dashboard.
3. **File Management:** Implement the post-launch file movement feature.

## MVP Feature Set (Validated via TDD)
1. **Model: Torrent** - Object representation of qBittorrent data.
2. **Model: MediaMetadata** - Rich metadata (Title, Year, Plot, Cast).
3. **Service: MetadataMatcher** - Logic to resolve Torrent names to MediaMetadata.
4. **Service: MetadataCache** - Persistence layer for Metadata.
5. **CLI Interface:** Basic list and show commands.

## Post-Launch Features
- **File Management:** Move/copy selected torrent files to a media server ingestion directory.
- **Network Support:** Support for SFTP, SMB, and OS-level mounts for file transfers.
- **Web UI:** Interactive dashboard for monitoring and managing torrents with rich visuals.
- **Advanced Matcher:** Manual override for when auto-matching fails.
