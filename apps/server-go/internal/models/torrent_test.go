package models

import (
	"testing"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
)

// Mock for Stability testing
type MockEngineTorrent struct {
	EngineTorrent
	hash string
}

func (m *MockEngineTorrent) InfoHash() metainfo.Hash { return metainfo.NewHashFromHex(m.hash) }
func (m *MockEngineTorrent) Length() int64           { return 1000 }
func (m *MockEngineTorrent) BytesCompleted() int64   { return 500 }
func (m *MockEngineTorrent) Name() string            { return "Test" }
func (m *MockEngineTorrent) Stats() torrent.TorrentStats {
	return torrent.TorrentStats{}
}

func TestIsComplete(t *testing.T) {
	torrent := &Torrent{
		Progress: 1.0,
	}

	if !torrent.IsComplete() {
		t.Errorf("Expected IsComplete() to be true for progress 1.0")
	}

	torrent.Progress = 0.5
	if torrent.IsComplete() {
		t.Errorf("Expected IsComplete() to be false for progress 0.5")
	}
}

func TestTorrentStability(t *testing.T) {
	mock := &MockEngineTorrent{hash: "0123456789abcdef0123456789abcdef01234567"}
	
	base := TorrentBaseInfo{
		Name:             "Persistent Name",
		AddedOn:          123456789,
		TotalReadBase:    1000,
		TotalWrittenBase: 2000,
		ContentPath:      "/mnt/downloads/Test",
	}

	// Map the DTO
	dto := NewFromEngineInterface(mock, base)

	// Verify critical UI fields
	if dto.AddedOn != 123456789 {
		t.Errorf("Stability Fail: AddedOn flickered. Expected 123456789, got %d", dto.AddedOn)
	}

	if dto.TotalRead != 1000 { // 1000 base + 0 current
		t.Errorf("Stability Fail: TotalRead flickered. Expected 1000, got %d", dto.TotalRead)
	}

	if dto.ContentPath != base.ContentPath {
		t.Errorf("Stability Fail: ContentPath flickered. Expected %s, got %s", base.ContentPath, dto.ContentPath)
	}
}
