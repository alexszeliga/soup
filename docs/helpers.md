# Soup Project Helpers & Abstractions

This document tracks centralized helpers and patterns intended to reduce code duplication (DRY) and ensure consistent behavior across the monorepo.

## 1. Core Package (`@soup/core`)

### `QBClient.post(endpoint, params)`
- **Location:** `packages/core/src/QBClient.ts`
- **Description:** A private helper that centralizes all qBittorrent POST requests, handling URL construction, standard headers (Cookies, Referer, Origin), and error reporting.
- **Usage:** All new qBittorrent write actions (Pause, Resume, Delete, etc.) **must** use this method instead of a raw `fetch`.

---

## 2. Web Application (`apps/web`)

### `performAction(hash, endpoint, targetState)`
- **Location:** `apps/web/src/App.tsx`
- **Description:** A helper that wraps torrent state-changing API calls. It automatically:
  1. Sets the UI to a "pending" loading state for that specific hash.
  2. Executes the POST request.
  3. Handles errors by rolling back the pending state.
- **Usage:** Use this for any button that triggers a qBittorrent action (Pause, Resume).

---

## 3. Server Application (`apps/server`)

### `handleTorrentAction(reply, action)`
- **Location:** `apps/server/src/index.ts`
- **Description:** A generic wrapper for Fastify route handlers that perform torrent operations. It handles consistent success/error response formatting and logging.
- **Usage:** Wrap all torrent-related POST/DELETE endpoints with this helper to ensure a uniform API contract.

---

## Maintenance
- **Review:** Periodically run `npx jscpd apps packages` to detect new duplication.
- **Rule:** If a pattern appears 3 or more times, it **must** be promoted to this list and refactored.
