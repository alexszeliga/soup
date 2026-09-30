package main

import (
	"context"
	"encoding/hex"
	"testing"

	"github.com/anacrolix/torrent"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
)

func TestLoadOrCreatePeerID_StableAcrossRestarts(t *testing.T) {
	ctx := context.Background()
	dbPath := t.TempDir() + "/engine.db"
	bep20 := torrent.NewDefaultClientConfig().Bep20

	repo, err := repository.NewSqliteRepository(dbPath)
	if err != nil {
		t.Fatalf("NewSqliteRepository: %v", err)
	}

	// First run: generates and persists.
	pid1, err := loadOrCreatePeerID(ctx, repo, bep20)
	if err != nil {
		t.Fatalf("first loadOrCreatePeerID: %v", err)
	}
	if len(pid1) != 20 {
		t.Fatalf("expected 20-byte peer ID, got %d", len(pid1))
	}
	if len(bep20) > 0 && len(bep20) < 20 && pid1[:len(bep20)] != bep20 {
		t.Errorf("expected peer ID to start with Bep20 prefix %q, got %q", bep20, pid1)
	}
	repo.Close()

	// Simulated restart: new repository over the same DB, must get the same ID.
	repo2, err := repository.NewSqliteRepository(dbPath)
	if err != nil {
		t.Fatalf("reopen repository: %v", err)
	}
	defer repo2.Close()
	pid2, err := loadOrCreatePeerID(ctx, repo2, bep20)
	if err != nil {
		t.Fatalf("second loadOrCreatePeerID: %v", err)
	}
	if pid1 != pid2 {
		t.Errorf("peer ID changed across restarts: %q vs %q", pid1, pid2)
	}

	// Stored as hex in preferences.
	raw, err := repo2.GetPreference(ctx, "peer_id")
	if err != nil {
		t.Fatalf("GetPreference: %v", err)
	}
	if raw != hex.EncodeToString([]byte(pid1)) {
		t.Errorf("stored preference %q does not match peer ID %q", raw, pid1)
	}
}
