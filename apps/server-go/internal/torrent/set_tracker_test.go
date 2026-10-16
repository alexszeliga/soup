package torrent

import (
	"context"
	"testing"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
)

func TestSetTracker_UpdatesEngineFileDBAndClearsError(t *testing.T) {
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("repo: %v", err)
	}
	defer repo.Close()

	tmp := t.TempDir()
	hash := "0123456789abcdef0123456789abcdef01234567"

	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "Tracker Set", GotInfoChan: infoChan}
	eng := &MockEngine{ReturnTor: mockTor}
	svc := NewTorrentService(eng, repo, nil, tmp, false)

	// Seed state: existing sample with a stale tracker error.
	svc.mu.Lock()
	svc.lastSamples[hash] = &torrentSample{name: "Tracker Set", timestamp: time.Now(), trackerError: "old error"}
	svc.trackerHealth[hash] = &trackerHealthState{unreachable: true, deadStreak: 5, recoveryNudged: true}
	svc.mu.Unlock()

	// A canonical file already exists for the hash (so the service can read current metainfo).
	svc.saveCanonicalTorrentFile(hash, makeTestMetaInfoNoT("http://old-tracker.example.com/announce"))

	newURL := "http://new-tracker.example.com/announce"
	if err := svc.SetTracker(context.Background(), hash, newURL); err != nil {
		t.Fatalf("SetTracker: %v", err)
	}

	// 1. Engine received the refreshed metainfo with the new tracker.
	if eng.RefreshCalls != 1 {
		t.Fatalf("expected RefreshTorrent called once, got %d", eng.RefreshCalls)
	}
	if eng.LastRefreshMI == nil {
		t.Fatal("expected LastRefreshMI to be set")
	}
	got := eng.LastRefreshMI.UpvertedAnnounceList().DistinctValues()
	if len(got) != 1 || got[0] != newURL {
		t.Errorf("expected engine metainfo announce = [%s], got %v", newURL, got)
	}

	// 2. Saved canonical file now has the new tracker.
	saved, err := svc.loadCanonicalMetaInfo(hash)
	if err != nil {
		t.Fatalf("load saved: %v", err)
	}
	sg := saved.UpvertedAnnounceList().DistinctValues()
	if len(sg) != 1 || sg[0] != newURL {
		t.Errorf("expected saved file announce = [%s], got %v", newURL, sg)
	}

	// 3. DB magnet updated to the new tracker.
	rec, err := repo.GetTorrent(context.Background(), hash)
	if err != nil {
		t.Fatalf("GetTorrent: %v", err)
	}
	if rec.MagnetURI == "" {
		t.Fatal("expected DB magnet to be set")
	}
	if !contains(rec.MagnetURI, "new-tracker.example.com") {
		t.Errorf("expected DB magnet to reference new tracker, got %s", rec.MagnetURI)
	}
	if contains(rec.MagnetURI, "old-tracker.example.com") {
		t.Errorf("DB magnet must not reference old tracker, got %s", rec.MagnetURI)
	}

	// 4. Error state cleared.
	svc.mu.Lock()
	errNow := svc.lastSamples[hash].trackerError
	health := svc.trackerHealth[hash]
	unreachable := health != nil && health.unreachable
	svc.mu.Unlock()
	if errNow != "" {
		t.Errorf("expected trackerError cleared, got %q", errNow)
	}
	if unreachable {
		t.Errorf("expected unreachable cleared after SetTracker")
	}
}
