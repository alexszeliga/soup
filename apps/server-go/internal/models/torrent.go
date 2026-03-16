package models

import (
	"strings"
	"github.com/anacrolix/torrent"
)

// Torrent represents the data structure for a single BitTorrent download (DTO).
// The JSON tags are STRICTLY matched to the qBittorrent API format used by packages/core/src/SyncEngine.ts
type Torrent struct {
	Hash          string         `json:"hash"`
	Name          string         `json:"name"`
	Size          int64          `json:"size"`
	Progress      float64        `json:"progress"`
	State         string         `json:"state"`
	StateName     string         `json:"stateName"`
	DownloadSpeed int64          `json:"dlspeed"`
	UploadSpeed   int64          `json:"upspeed"`
	TotalRead     int64          `json:"total_read"`
	TotalWritten  int64          `json:"total_written"`
	ContentPath   string         `json:"content_path"`
	AddedOn       int64          `json:"added_on"`
	SeedingTime   int64          `json:"seeding_time"`
	Ratio         float64        `json:"ratio"`
	Eta           int64          `json:"eta"`
	ActivePeers   int            `json:"activePeers"`
	TotalPeers    int            `json:"totalPeers"`
	Availability  float64        `json:"availability"`
	IsSequential  bool           `json:"seq_dl"`
	IsForceStart  bool           `json:"force_start"`
	IsNonMedia    bool           `json:"is_non_media"`
	MediaInfo     MediaInfo      `json:"mediaInfo"`
	MediaMetadata *MediaMetadata `json:"mediaMetadata,omitempty"`
}

// NewFromEngine maps a native anacrolix torrent to our Soup model.
func NewFromEngine(t *torrent.Torrent) *Torrent {
	return NewFromEngineInterface(TorrentWrapper{t}, "", 0)
}

// NewFromEngineInterface maps any EngineTorrent interface implementation to our Soup model.
func NewFromEngineInterface(t EngineTorrent, fallbackName string, addedOn int64) *Torrent {
	// 1. Calculate progress
	progress := 0.0
	length := t.Length()
	completed := t.BytesCompleted()
	if length > 0 {
		progress = float64(completed) / float64(length)
	}

	// 2. Determine State
	state := "downloading"
	stateName := "Downloading"
	
	stats := t.Stats()
	
	// Check for info ready
	if length == 0 {
		state = "metaDL"
		stateName = "Metadata Pending"
	} else if completed == length && length > 0 {
		state = "uploading"
		stateName = "Seeding"
	}

	displayName := t.Name()
	// If name is just the infohash (anacrolix default), show pending or fallback
	if length == 0 || strings.HasPrefix(displayName, "infohash:") {
		if fallbackName != "" {
			displayName = fallbackName
		} else {
			displayName = "Metadata Pending..."
		}
	}

	return &Torrent{
		Hash:          t.InfoHash().HexString(),
		Name:          displayName,
		Size:          length,
		Progress:      progress,
		State:         state,
		StateName:     stateName,
		DownloadSpeed: 0, // Calculated in TorrentService
		UploadSpeed:   0, // Calculated in TorrentService
		TotalRead:     stats.BytesRead.Int64(),
		TotalWritten:  stats.BytesWritten.Int64(),
		ContentPath:   displayName,
		AddedOn:       addedOn,
		SeedingTime:   0,
		Ratio:         0,
		Eta:           -1,
		ActivePeers:   stats.ActivePeers,
		TotalPeers:    stats.TotalPeers,
		Availability:  1.0, // Placeholder
		IsSequential:  false,
		IsForceStart:  false,
		IsNonMedia:    false,
		MediaInfo:     GetMediaInfo(displayName),
	}
}

// IsComplete returns true if the torrent is 100% downloaded.
func (t *Torrent) IsComplete() bool {
	return t.Progress >= 1.0
}
