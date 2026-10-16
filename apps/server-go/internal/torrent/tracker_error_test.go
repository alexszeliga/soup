package torrent

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	atorrent "github.com/anacrolix/torrent"
)

// emitTrackerError simulates the engine firing a tracker_announce_error status
// event for the given info-hash, by invoking the status callback registered
// through EngineWrapper.SetStatusCallback (here, on the mock).
func (m *MockEngine) emitTrackerError(t *testing.T, hash, url string) {
	if m.StatusCallback == nil {
		t.Fatal("StatusCallback not registered on mock engine")
	}
	m.StatusCallback(atorrent.StatusUpdatedEvent{
		Event:    atorrent.TrackerAnnounceError,
		Error:    errors.New("http 404"),
		Url:      url,
		InfoHash: hash,
	})
}

func TestTrackerAnnounceError_SurfacesInList(t *testing.T) {
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("repo: %v", err)
	}
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "Failing Torrent", GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	// Register the status callback the way main.go does after engine construction.
	engine.StatusCallback = service.OnStatusUpdated

	// Seed a sample so List() returns a row for this torrent.
	service.mu.Lock()
	service.lastSamples[hash] = &torrentSample{
		name:      "Failing Torrent",
		timestamp: time.Now(),
	}
	service.mu.Unlock()

	// Fire a tracker announce error for our hash.
	engine.emitTrackerError(t, hash, "http://dead-tracker.example.com/announce")

	list, _ := service.List(context.Background())
	if len(list) != 1 {
		t.Fatalf("expected 1 torrent in list, got %d", len(list))
	}
	dto := list[0]
	if dto.TrackerError == "" {
		t.Fatalf("expected TrackerError to be populated, got empty")
	}
	if !strings.Contains(dto.TrackerError, "dead-tracker.example.com") {
		t.Errorf("expected TrackerError to mention the tracker URL, got %q", dto.TrackerError)
	}
	if dto.TrackerErrorAt.IsZero() {
		t.Errorf("expected TrackerErrorAt to be set")
	}
}

func TestTrackerAnnounceError_DoesNotLeakAcrossTorrents(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hashA := "0123456789abcdef0123456789abcdef01234567"
	hashB := "fedcba9876543210fedcba9876543210fedcba98"
	infoChan := make(chan struct{})
	close(infoChan)
	torA := &MockTorrent{HashStr: hashA, NameStr: "A", GotInfoChan: infoChan}
	torB := &MockTorrent{HashStr: hashB, NameStr: "B", GotInfoChan: infoChan}
	eng := &MockEngine{ReturnTor: torA, ExtraTor: torB}
	service := NewTorrentService(eng, repo, nil, "/tmp", false)
	eng.StatusCallback = service.OnStatusUpdated

	service.mu.Lock()
	service.lastSamples[hashA] = &torrentSample{name: "A", timestamp: time.Now()}
	service.lastSamples[hashB] = &torrentSample{name: "B", timestamp: time.Now()}
	service.mu.Unlock()

	// Only hash A gets an error.
	eng.emitTrackerError(t, hashA, "http://dead.example.com/announce")

	list, _ := service.List(context.Background())
	if len(list) != 2 {
		t.Fatalf("expected 2 torrents, got %d", len(list))
	}
	for _, dto := range list {
		if dto.Hash == hashA {
			if dto.TrackerError == "" {
				t.Errorf("hash A should have a TrackerError")
			}
		} else if dto.Hash == hashB {
			if dto.TrackerError != "" {
				t.Errorf("hash B must NOT leak hash A's TrackerError, got %q", dto.TrackerError)
			}
		}
	}
}

func TestTrackerAnnounceSuccessful_ClearsError(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "Recover", GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)
	engine.StatusCallback = service.OnStatusUpdated

	service.mu.Lock()
	service.lastSamples[hash] = &torrentSample{name: "Recover", timestamp: time.Now()}
	service.mu.Unlock()

	// Error first.
	engine.emitTrackerError(t, hash, "http://dead.example.com/announce")
	// Then a successful announce clears it.
	engine.StatusCallback(atorrent.StatusUpdatedEvent{
		Event:    atorrent.TrackerAnnounceSuccessful,
		InfoHash: hash,
	})

	list, _ := service.List(context.Background())
	if len(list) != 1 {
		t.Fatalf("expected 1 torrent, got %d", len(list))
	}
	if list[0].TrackerError != "" {
		t.Errorf("expected TrackerError to be cleared after success, got %q", list[0].TrackerError)
	}
}
