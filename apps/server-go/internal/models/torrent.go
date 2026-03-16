package models

import (
	"strings"
)

// Constants for DTO logic
const (
	RatioCap         = 9.99
	StalledThreshold = 1024 // 1 KB/s
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

// TorrentBaseInfo provides the necessary persistence context to avoid 0-flicker during mapping.
type TorrentBaseInfo struct {
	Name             string
	AddedOn          int64
	TotalReadBase    int64
	TotalWrittenBase int64
	SeedingTimeBase  int64
	IsNonMedia       bool
	IsSequential     bool
	ContentPath      string
	Metadata         *MediaMetadata
}

// NewFromEngineInterface maps any EngineTorrent interface implementation to our Soup model.
// It REQUIRES baseInfo to ensure stable fields (added_on, total stats) from the first frame.
func NewFromEngineInterface(t EngineTorrent, base TorrentBaseInfo) *Torrent {
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
		if base.Name != "" {
			displayName = base.Name
		} else {
			displayName = "Metadata Pending..."
		}
	}

	totalRead := base.TotalReadBase + stats.BytesRead.Int64()
	totalWritten := base.TotalWrittenBase + stats.BytesWritten.Int64()

	var ratio float64
	if totalRead > 0 {
		ratio = float64(totalWritten) / float64(totalRead)
	} else if totalWritten > 0 {
		ratio = RatioCap
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
		TotalRead:     totalRead,
		TotalWritten:  totalWritten,
		ContentPath:   base.ContentPath,
		AddedOn:       base.AddedOn,
		SeedingTime:   base.SeedingTimeBase,
		Ratio:         ratio,
		Eta:           -1,
		ActivePeers:   stats.ActivePeers,
		TotalPeers:    stats.TotalPeers,
		Availability:  1.0, // Placeholder until pieces mapped
		IsSequential:  base.IsSequential,
		IsForceStart:  false,
		IsNonMedia:    base.IsNonMedia,
		MediaInfo:     GetMediaInfo(displayName),
		MediaMetadata: base.Metadata,
	}
}

// IsComplete returns true if the torrent is 100% downloaded.
func (t *Torrent) IsComplete() bool {
	return t.Progress >= 1.0
}
