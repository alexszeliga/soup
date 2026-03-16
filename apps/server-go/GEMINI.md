# Soup-Go: The Native Re-engineering

This project is a high-performance Go-native re-engineering of the **Soup** media manager.

**Primary Source of Truth:** [https://github.com/alexszeliga/soup](https://github.com/alexszeliga/soup)

## Architectural Vision
- **Standalone:** No external BitTorrent client (qBittorrent) required.
- **Low Latency:** Real-time WebSocket push for UI updates (500ms intervals).
- **High Performance:** Go's concurrency model for disk I/O and networking.
- **Single Binary:** CLI and Server are the same application.

## Engineering Mandates

### 1. Zero-Emoji Policy
Emojis are strictly forbidden in the codebase, UI, logs, and shell output. Use signal-focused text or standard terminal formatting.

### 2. Interface-Driven Design (SOLID)
Never depend on raw third-party structs (e.g., `torrent.Torrent`). All engine interactions MUST go through interfaces (`TorrentEngine`, `EngineTorrent`) to ensure the system is deterministic and testable via sturdy mocks.

### 3. State-Aware Concurrency
The BitTorrent lifecycle is asynchronous. You MUST NOT call state-dependent methods (like `DownloadAll()`, `Files()`, or `Name()`) before metadata is ready.
- **Protocol:** Always await `<-t.GotInfo()` before initiating downloads or metadata enrichment.

### 4. Persistence First (Bun ORM)
All domain state (Torrents, Metadata, Tasks) MUST be persisted via **Bun ORM**.
- **Source of Truth:** The database is the authority. Services should restore their state from SQLite on startup (`RestoreState`).
- **No In-Memory Hacks:** Avoid volatile lists; if it matters, it belongs in the repo.

### 5. Uncle Bob / Clean Signals
- **TDD:** Follow Red-Green-Refactor.
- **Test Output:** Zero pollution. No `fmt.Println` or `log` calls in tests. Test output should only contain the signals provided by the Go test runner.

### 6. Environment Sovereignty
Use `godotenv.Overload` to ensure the local `.env` file is the absolute source of truth, preventing shell environment pollution from causing port or directory regressions.

### 7. Self-Healing Identity (Spoofing)
The engine must always impersonate the latest stable version of qBittorrent to maintain compatibility with private trackers. 
- **Protocol:** Use the `IdentityService` to auto-detect and sync the latest qBittorrent identity every 14 days via Stage 1 (Docker) and Stage 2 (Local Verification) discovery.

## Quality & Validation Standards

| Soup Standard | Go Implementation | Status |
| :--- | :--- | :--- |
| **TDD (Red-Green-Refactor)** | `go test` (Native) | [x] Active |
| **Strict Formatting** | `go fmt` (Native) | [x] Active |
| **Linting & Vet** | `go vet` & `golangci-lint` | [x] Active |
| **Clean Signals** | No logs in test output | [x] Active |
| **Zero-Emoji Policy** | No emojis in code/UI | [x] Active |
| **Handoff Validation** | `make handoff` | [x] Active |

## Refactor Phases

### Phase 1: Minimal Viable Engine (Completed)
- [x] Initialize a `torrent.Client`.
- [x] Add a Magnet link/Torrent file.
- [x] Track download progress and print to console.
- [x] Implement absolute environment pathing.

### Phase 2: REST & WebSocket API (Completed)
- [x] Implement a Go web server (Fiber) to mock qBittorrent API.
- [x] Push updates via WebSockets every 500ms.
- [x] Implement Torrent Control (Add/Delete/Focus).
- [x] Implement File Listing and Metadata Search.

### Phase 3: Domain Logic & Persistence (Completed)
- [x] Port `NoiseMiner` (Regex cleanup) to Go.
- [x] Port `TMDBMetadataProvider` to Go.
- [x] Port `IngestionService` (File movement) to Go.
- [x] Implement SQLite Persistence Layer (Bun ORM).
- [x] Implement `TorrentService` for sturdy lifecycle management.

### Phase 4: Hardening & Parity (Completed)
- [x] Real-time EMA speed calculation.
- [x] Sequential downloading (Piece priority-based).
- [x] Persistent Ingestion Task queue (SQLite backed).
- [x] Multi-file Ingestion support.
- [x] Web-based Folder Explorer (Host filesystem navigation).
- [x] Automated Identity Spoofing (qBittorrent impersonation).
- [x] Native Docker support (`docker-compose.go.yml`).

### Phase 5: Advanced Control (Active)
- [ ] Global speed limits & Alt-speed toggling (Engine level).
- [ ] Multi-form torrent file upload in `TorrentService`.
- [ ] Port-forwarding (UPnP/NAT-PMP).
- [ ] Torrent migration script (TS -> Go).
