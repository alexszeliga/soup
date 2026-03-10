# Dynamic Regex Learning: "The Noise Miner"

This document defines the architecture for a self-learning filename cleaner in **Mammal Soup**.

## Objective
Improve the accuracy of media title extraction by dynamically identifying and storing "noise" tokens (release groups, technical specs, scene tags) that are not part of the standard static library.

## Logic: The Mining Process
Mining occurs immediately after a **high-confidence metadata match** (either automatic or manual linking).

### 1. Token Extraction
Given a raw filename and its confirmed metadata:
*   **Source:** `The.Blues.Brothers.1980.Extended.Cut.1080p.BluRay.x264-DON`
*   **Confirmed Title:** `The Blues Brothers`
*   **Confirmed Year:** `1980`

**Subtraction Steps:**
1.  **Normalize:** Replace `.` and `_` with spaces.
2.  **Subtract Title/Year:** Remove "The Blues Brothers" and "1980" from the string.
3.  **Tokenize:** Split the remaining string (`Extended Cut 1080p BluRay x264-DON`) into individual tokens.
4.  **Filter Static Noise:** Remove tokens already covered by the static regex in `Torrent.ts` (e.g., `1080p`, `BluRay`, `x264`).
5.  **Clean Tokens:** Strip residual punctuation (e.g., `-DON` -> `DON`).

**Resulting Novel Noise:** `Extended`, `Cut`, `DON`.

### 2. Persistence (Home Scale)
Novel tokens are stored in the SQLite database to track frequency.

**Table Schema:** `noise_tokens`
*   `token` (TEXT, Primary Key)
*   `hit_count` (INTEGER): Incremented every time the token is mined.
*   `updated_at` (INTEGER): Last time the token was seen.

### 3. Promotion Heuristic
A token is promoted to the **Active Cleaning Set** once it meets the following criteria:
*   `hit_count >= 5` (Default threshold).
*   Token length `> 2` characters (to avoid stripping valid short words).

## Integration Flow

### `LiveSyncService` (The Miner)
*   After `fetchMetadata` or `linkMetadata` succeeds, trigger `mineNoise()`.
*   Pass the raw name and metadata to the extractor.
*   Update the `noise_tokens` table via the `MetadataCache`.

### `MetadataCache` (The Vault)
*   Provides `incrementNoise(tokens)` and `getActiveNoiseTokens()`.

### `Torrent.ts` (The Cleaner)
*   Modify `getMediaInfo()` to accept an optional `dynamicNoise: string[]` parameter.
*   Include these tokens in the systematic noise-stripping loop.

## Scalability: From Home to Industry

| Feature | Home Use (Current) | Industrial Grade (Future) |
| :--- | :--- | :--- |
| **Logic** | Simple Frequency (Hit Count) | Bayesian Probability (TF-IDF) |
| **Storage** | Local SQLite | Global PostgreSQL + Redis Cluster |
| **Consensus** | Instant (Single User) | Global (Statistical majority across all users) |
| **Safety** | User can manually delete DB rows | Multi-stage sandboxing & Admin verification |

## Testing (TDD)
A new test suite will verify that:
1.  Adding a series of torrents from a new group (e.g., `-MML`) eventually results in `-MML` being stripped from the title extraction.
2.  Valid title words are not accidentally mined (e.g., matching a movie titled *Extended* shouldn't break the cleaning of other movies).
