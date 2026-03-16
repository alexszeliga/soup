package repository

import (
	"context"
	"testing"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
)

func TestSqliteRepo_Metadata(t *testing.T) {
	repo, err := NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("Failed to create repo: %v", err)
	}
	defer repo.Close()

	ctx := context.Background()
	hash := "test-hash"
	meta := &models.MediaMetadata{
		ID:         "tmdb-1",
		Title:      "The Movie",
		Year:       2024,
		Plot:       "A plot.",
		Cast:       []string{"Actor A", "Actor B"},
		PosterPath: "/poster.jpg",
	}

	// 1. Save and Retrieve
	if err := repo.SaveMetadata(ctx, hash, meta); err != nil {
		t.Errorf("Failed to save metadata: %v", err)
	}

	retrieved, err := repo.GetMetadata(ctx, hash)
	if err != nil {
		t.Errorf("Failed to get metadata: %v", err)
	}
	if retrieved == nil || retrieved.ID != meta.ID {
		t.Errorf("Metadata mismatch. Expected %s, got %v", meta.ID, retrieved)
	}

	// 2. Unmatch
	if err := repo.UnmatchTorrent(ctx, hash); err != nil {
		t.Errorf("Failed to unmatch: %v", err)
	}
	retrieved, _ = repo.GetMetadata(ctx, hash)
	if retrieved != nil {
		t.Error("Expected metadata to be deleted after unmatch")
	}
}

func TestSqliteRepo_NonMedia(t *testing.T) {
	repo, _ := NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	hash := "h1"

	// Should be false by default
	isNon, _ := repo.IsNonMedia(ctx, hash)
	if isNon {
		t.Error("Expected default IsNonMedia to be false")
	}

	// Set to true
	if err := repo.SetNonMedia(ctx, hash, true); err != nil {
		t.Errorf("Failed to set non-media: %v", err)
	}

	isNon, _ = repo.IsNonMedia(ctx, hash)
	if !isNon {
		t.Error("Expected IsNonMedia to be true")
	}
}

func TestSqliteRepo_Torrents(t *testing.T) {
	repo, _ := NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	hash := "th1"
	magnet := "magnet:?xt=urn:btih:th1"

	// Save
	if err := repo.SaveTorrent(ctx, hash, magnet); err != nil {
		t.Errorf("Failed to save torrent: %v", err)
	}

	// List
	list, _ := repo.GetTorrents(ctx)
	if len(list) != 1 || list[0].Hash != hash {
		t.Errorf("List mismatch. Got %v", list)
	}

	// Update stats
	if err := repo.UpdateTorrentStats(ctx, hash, 100, 200, 3600); err != nil {
		t.Errorf("Failed to update stats: %v", err)
	}

	list, _ = repo.GetTorrents(ctx)
	if list[0].TotalRead != 100 || list[0].TotalWritten != 200 || list[0].SeedingTime != 3600 {
		t.Errorf("Stats mismatch: %v", list[0])
	}

	// Delete
	if err := repo.DeleteTorrent(ctx, hash); err != nil {
		t.Errorf("Failed to delete: %v", err)
	}
	list, _ = repo.GetTorrents(ctx)
	if len(list) != 0 {
		t.Error("Expected torrent to be deleted")
	}
}

func TestSqliteRepo_Preferences(t *testing.T) {
	repo, _ := NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	key := "test_pref"
	val := "test_val"

	if err := repo.SavePreference(ctx, key, val); err != nil {
		t.Errorf("Failed to save pref: %v", err)
	}

	got, _ := repo.GetPreference(ctx, key)
	if got != val {
		t.Errorf("Expected %s, got %s", val, got)
	}

	all, _ := repo.GetAllPreferences(ctx)
	if all[key] != val {
		t.Error("Pref missing from GetAll")
	}
}

func TestSqliteRepo_NoiseTokens(t *testing.T) {
	repo, _ := NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	
	_ = repo.SaveNoiseToken(ctx, "TOKEN1", 5)
	_ = repo.SaveNoiseToken(ctx, "TOKEN2", 10)

	tokens, _ := repo.GetNoiseTokens(ctx)
	if tokens["TOKEN1"] != 5 || tokens["TOKEN2"] != 10 {
		t.Errorf("Noise tokens mismatch: %v", tokens)
	}

	// Update existing
	_ = repo.SaveNoiseToken(ctx, "TOKEN1", 6)
	tokens, _ = repo.GetNoiseTokens(ctx)
	if tokens["TOKEN1"] != 6 {
		t.Errorf("Expected hit count 6, got %d", tokens["TOKEN1"])
	}
}
