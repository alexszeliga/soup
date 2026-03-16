# Plan: Deep Parity & Telemetry Hardening (COMPLETED)

This plan addressed inconsistencies between the Go engine and the qBittorrent-standard UI expectations. All objectives have been implemented and verified.

## Status: DONE
- [x] Fix erratic speed indicators using smoothing (EMA).
- [x] Implement persistent seeding time and ratio tracking.
- [x] Map advanced torrent states (metaDL, stalled, etc.).
- [x] Expose global network health (DHT nodes, swarm peers).
- [x] Provide aggregate Download/Upload speeds in global stats.
- [x] Implement a third telemetry indicator for Ingestion (File Transfer) speed.
- [x] Persist ingestion tasks to SQLite.
- [x] Implement character-perfect identity spoofing (qBittorrent 5.1.4).
- [x] Support sequential downloading piece priority.

## Summary of Changes
The Go-native engine now provides perfect parity with the legacy TypeScript/qBittorrent backend while delivering significantly lower latency via WebSockets and improved engine-level control for sequential downloading and identity stealth.
