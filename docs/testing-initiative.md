# Soup Testing Initiative: Core Coverage

This document tracks the systematic effort to bring @soup/core to 90%+ test coverage using a strict Red-Green-Refactor workflow.

## Coverage Status (Updated March 4, 2026)
| File | Current Coverage | Status | Key Gaps |
| :--- | :--- | :--- | :--- |
| Config.ts | 92.85% | DONE | getClientConfig helper |
| MetadataCache.ts | 100.00% | DONE | None |
| QBClient.ts | 85.71% | ACTIVE | Sync Deltas, Preferences |
| IngestionService.ts | 74.24% | ACTIVE | Copy Task branches |
| TaskQueue.ts | 92.10% | DONE | clearFinished persistence |

---

## Workflow: Slow & Steady
For every test case:
1. Identify Gap: Pick a specific uncovered line or branch.
2. Red: Write a test that fails (proving the gap exists).
3. Green: Ensure the test passes with existing code (or fix bugs discovered).
4. Refactor: Clean up the test and implementation for clarity.
5. Verify: Run coverage to see the percentage move.

---

## Roadmap & Progress Log

### Phase 1: Configuration & Infrastructure
- [x] Config.ts: Validate NODE_ENV and PORT defaults.
- [x] Config.ts: Throw error on missing TMDB_API_KEY.
- [x] Config.ts: Singleton instance preservation.
- [x] MetadataCache.ts: ensureTables creates the torrent_metadata table.

### Phase 2: QBClient Deep Dive
- [x] QBClient.ts: login stores SID from cookies correctly.
- [x] QBClient.ts: login handles 401 Unauthorized errors.
- [x] QBClient.ts: pauseTorrents sends correct POST data.
- [x] QBClient.ts: deleteTorrents includes deleteFiles parameter.

### Phase 3: Ingestion & Pathing
- [x] IngestionService.ts: Move Path Mapping (remote-to-local) logic from API to Service.
- [x] IngestionService.ts: suggestPath sanitizes illegal characters in titles.
- [x] TaskQueue.ts: Task retries on failure (e.g., Disk Full, Permissions) up to max limit.

---

*Note: This file is updated after every successful test addition.*
