# Local Fuzzy Matching Strategy: "The Fuzzy Barrier"

This document outlines the plan to implement a local-first, typo-tolerant metadata matching layer for **Mammal Soup** using **Fuse.js**.

## Core Objective
Minimize external API calls to TMDB by resolving new torrents against existing metadata records in the local SQLite database, even when filenames contain typos or residual "scene junk."

## The "Barrier" Architecture
Currently, the `MetadataMatcher` acts as a pass-through to the `MetadataProvider` (TMDB). We will insert a Fuse.js indexing layer into this flow:

1. **Regex Parsing:** `Torrent.ts` cleans the raw filename (e.g., `The.Sopranos.S01E01...` -> `The Sopranos`).
2. **Local Cache Check:**
   - **Step 1 (Exact):** Check if the exact title exists in the DB.
   - **Step 2 (Fuzzy):** If no exact match, query the in-memory Fuse.js index.
3. **Threshold Logic:**
   - If a match is found with a confidence score **< 0.3**, link to existing metadata and **skip the API**.
   - If the score is higher or no match is found, fallback to the **TMDB API**.
4. **Index Update:** When a new TMDB match is made, the `LiveSyncService` pushes the result into the live Fuse.js index.

## Benefits for "Gory" Filenames
- **Successive Matches:** Adding 20 episodes of a show hits TMDB exactly **once**. Subsequent episodes match Episode 1's metadata locally in ~1ms.
- **Regex Failures:** If the regex leaves a tag like `Extended Cut` in the title, Fuse.js will still see it as a 90%+ match for the clean record in the database.
- **Scene Typos:** Handles common scene typos (e.g., `The Soprano` vs `The Sopranos`).

## Architecture: Swappable Providers
To ensure long-term maintainability, the local matching logic will be abstracted behind an interface. While **Fuse.js** is the initial implementation, the system should be designed to swap in more industrial solutions (e.g., SQLite Trigrams, Meilisearch, or Vector Databases) without modifying the core `MetadataMatcher` logic.

### Local Matcher Interface
We will define a `LocalMatcher` interface that handles:
- `search(query: string): Promise<LocalMatch | null>`
- `addToIndex(metadata: MediaMetadata): void`
- `reindex(metadata: MediaMetadata[]): void`

## Implementation Details

### Initial Provider: FuseLocalMatcher
- Implementation of the `LocalMatcher` interface using Fuse.js.
- Memory-resident index primed from SQLite on startup.

### File Changes
- **`packages/core/src/MetadataCache.ts`**:
  - Add `getAllMetadata()` to retrieve all unique media records for indexing.
- **`packages/core/src/MetadataMatcher.ts`**:
  - Implement the Fuse.js indexing logic.
  - Set `threshold: 0.3` and `ignoreLocation: true`.
  - Update `match()` to check local results first.
- **`packages/core/src/LiveSyncService.ts`**:
  - Ensure the matcher is updated whenever new metadata is saved to the cache.

## Testing Strategy (TDD)
A new test suite in `MetadataMatcher.test.ts` will verify:
1. **Perfect Match:** Identical titles result in 0.0 distance.
2. **Typo Tolerance:** `Simpons` matches `Simpsons`.
3. **Residual Junk:** `The Blues Brothers Extended Cut` matches `The Blues Brothers`.
4. **Safety Threshold:** `Star Wars` does **not** match `Star Trek`.

## Tuning Parameters
| Parameter | Value | Reason |
|-----------|-------|--------|
| `keys` | `['title']` | Primary search field. |
| `threshold` | `0.3` | Balanced typo tolerance vs. false positives. |
| `ignoreLocation` | `true` | Allows matches even if title is buried in filename noise. |
| `includeScore` | `true` | Required for threshold verification. |
