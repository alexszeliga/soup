package models

import (
	"github.com/anacrolix/torrent"
)

// Torrent represents the data structure for a single BitTorrent download (DTO).
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
	ContentPath   string         `json:"contentPath"`
	AddedOn       int64          `json:"added_on"`
	SeedingTime   int64          `json:"seeding_time"`
	Ratio         float64        `json:"ratio"`
	Eta           int64          `json:"eta"`
	ActivePeers   int            `json:"activePeers"`
	TotalPeers    int            `json:"totalPeers"`
	Availability  float64        `json:"availability"`
	IsSequential  bool           `json:"isSequential"`
	IsForceStart  bool           `json:"isForceStart"`
	IsNonMedia    bool           `json:"isNonMedia"`
	MediaInfo     MediaInfo      `json:"mediaInfo"`
	MediaMetadata *MediaMetadata `json:"mediaMetadata,omitempty"`
}

// NewFromEngine maps a native anacrolix torrent to our Soup model.
func NewFromEngine(t *torrent.Torrent) *Torrent {
	return NewFromEngineInterface(TorrentWrapper{t})
}

// NewFromEngineInterface maps any EngineTorrent interface implementation to our Soup model.
func NewFromEngineInterface(t EngineTorrent) *Torrent {
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
		stateName = "Fetching Metadata"
	} else if completed == length && length > 0 {
		state = "uploading"
		stateName = "Seeding"
	}

	return &Torrent{
		Hash:          t.InfoHash().HexString(),
		Name:          t.Name(),
		Size:          length,
		Progress:      progress,
		State:         state,
		StateName:     stateName,
		DownloadSpeed: 0, // Calculated in TorrentService
		UploadSpeed:   0, // Calculated in TorrentService
		TotalRead:     stats.BytesRead.Int64(),
		TotalWritten:  stats.BytesWritten.Int64(),
		ContentPath:   t.Name(),
		AddedOn:       0,
		SeedingTime:   0,
		Ratio:         0,
		Eta:           -1,
		ActivePeers:   stats.ActivePeers,
		TotalPeers:    stats.TotalPeers,
		Availability:  1.0, // Placeholder
		IsSequential:  false,
		IsForceStart:  false,
		MediaInfo:     GetMediaInfo(t.Name()),
	}
}

// IsComplete returns true if the torrent is 100% downloaded.
func (t *Torrent) IsComplete() bool {
	return t.Progress >= 1.0
}
