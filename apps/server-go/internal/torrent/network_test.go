package torrent

import (
	"testing"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
)

type NetworkMockEngine struct {
	models.TorrentEngine
	dhtEnabled bool
	pexEnabled bool
}

func (m *NetworkMockEngine) SetDht(enabled bool) { m.dhtEnabled = enabled }
func (m *NetworkMockEngine) SetPex(enabled bool) { m.pexEnabled = enabled }
func (m *NetworkMockEngine) SetRateLimits(dl, up int64) {}
func (m *NetworkMockEngine) Torrents() []models.EngineTorrent { return nil }

func TestTorrentService_NetworkDefaults(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()
	engine := &NetworkMockEngine{}
	
	// Initialize service
	_ = NewTorrentService(engine, repo, nil, "/tmp", false)

	// 1. Verify DHT and PEX are disabled by default in the engine
	if engine.dhtEnabled {
		t.Error("Expected DHT to be disabled by default")
	}
	if engine.pexEnabled {
		t.Error("Expected PEX to be disabled by default")
	}
}

func TestTorrentService_NetworkToggle(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()
	engine := &NetworkMockEngine{}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	// 1. Enable DHT
	service.UpdatePreferences(PartialPreferences{
		Dht: boolPtr(true),
	})
	if !engine.dhtEnabled {
		t.Error("Expected DHT to be enabled in engine after update")
	}

	// 2. Enable PEX
	service.UpdatePreferences(PartialPreferences{
		Pex: boolPtr(true),
	})
	if !engine.pexEnabled {
		t.Error("Expected PEX to be enabled in engine after update")
	}
}

func boolPtr(b bool) *bool { return &b }
