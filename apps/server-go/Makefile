# Makefile for Soup-Go re-engineering

# Runs the TDD cycle
test:
	go test -v ./...

# Standardized Go formatting
fmt:
	go fmt ./...

# Static analysis
lint:
	PATH=$(PATH):$(HOME)/go/bin golangci-lint run

# Standardized Go validation
vet:
	go vet ./...

# Handoff: The "No Stone Unturned" validation
# Mirrors the 'pnpm handoff' command in the TS project.
handoff: fmt lint test
	@echo "Soup-Go Handoff Successful"

# Development: Brings up both backend and frontend
dev:
	./dev.sh

# Reset: Clears downloads and media for a clean test run
reset:
	./reset.sh

# Migration: Port existing torrents from TS/qBittorrent to Go
migrate:
	go run main.go migrate -old-db ../server/soup.db -qb-url https://qb.osage.lol/api/v2

# Spoofing: Auto-detect latest qBittorrent identity via Docker
spoof:
	go run ../../scripts/detect-qb-identity.go

.PHONY: test fmt lint vet handoff dev reset migrate spoof
