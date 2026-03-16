package repository

import (
	"time"

	"github.com/uptrace/bun"
)

// TorrentRecord represents a persisted torrent in the database.
type TorrentRecord struct {
	bun.BaseModel `bun:"table:torrents,alias:t"`

	Hash         string    `bun:"hash,pk"`
	Name         string    `bun:"name"`
	MagnetURI    string    `bun:"magnet_uri,notnull"`
	CreatedAt    time.Time `bun:"created_at,default:current_timestamp"`
	TotalRead    int64     `bun:"total_read,default:0"`
	TotalWritten int64     `bun:"total_written,default:0"`
	SeedingTime  int64     `bun:"seeding_time,default:0"` // in seconds
	IsNonMedia   bool      `bun:"is_non_media,default:false"`
	IsSequential bool      `bun:"is_sequential,default:false"`
}

// MetadataRecord represents cached media metadata.
type MetadataRecord struct {
	bun.BaseModel `bun:"table:metadata,alias:m"`

	Hash      string    `bun:"hash,pk"`
	Data      string    `bun:"data,notnull"` // JSON string
	UpdatedAt time.Time `bun:"updated_at,default:current_timestamp"`
}

// TaskRecord represents a background task in the database.
type TaskRecord struct {
	bun.BaseModel `bun:"table:tasks,alias:tk"`

	ID          string    `bun:"id,pk"`
	TorrentHash string    `bun:"torrent_hash,notnull"`
	Status      string    `bun:"status,notnull"`
	Progress    int       `bun:"progress,notnull"`
	CurrentFile string    `bun:"current_file"`
	SavePath    string    `bun:"save_path"`
	FileMap     string    `bun:"file_map,notnull"` // JSON string
	Error       string    `bun:"error"`
	UpdatedAt   time.Time `bun:"updated_at,default:current_timestamp"`
}

// PreferenceRecord stores global application settings.
type PreferenceRecord struct {
	bun.BaseModel `bun:"table:preferences,alias:p"`

	ID    int64  `bun:"id,pk,autoincrement"`
	Key   string `bun:"key,unique,notnull"`
	Value string `bun:"value,notnull"`
}

// NoiseTokenRecord represents a learned filename noise token.
type NoiseTokenRecord struct {
	bun.BaseModel `bun:"table:noise_tokens,alias:nt"`

	Token     string    `bun:"token,pk"`
	HitCount  int       `bun:"hit_count,notnull,default:1"`
	UpdatedAt time.Time `bun:"updated_at,default:current_timestamp"`
}

