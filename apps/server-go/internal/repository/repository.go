package repository

import (
	"context"
	"github.com/alexszeliga/soup/apps/server-go/internal/models"
)

// Repository defines the interface for persistent storage.
// It follows the "No-Waste" roadmap by providing a single source of truth for all services.
type Repository interface {
	// Torrent Persistence (for re-adding on restart)
	SaveTorrent(ctx context.Context, hash string, name string, savePath string, magnet string) error
	MigrateTorrent(ctx context.Context, hash, name, savePath, magnet string, addedOn, totalRead, totalWritten, seedingTime int64) error
	SetTorrentName(ctx context.Context, hash string, name string) error
	Checkpoint(ctx context.Context) error

	GetTorrents(ctx context.Context) ([]TorrentRecord, error)
	DeleteTorrent(ctx context.Context, hash string) error
	UpdateTorrentStats(ctx context.Context, hash string, totalRead, totalWritten, seedingTime int64) error

	// Metadata Cache
	SaveMetadata(ctx context.Context, hash string, metadata *models.MediaMetadata) error
	GetMetadata(ctx context.Context, hash string) (*models.MediaMetadata, error)
	UnmatchTorrent(ctx context.Context, hash string) error
	SetNonMedia(ctx context.Context, hash string, isNonMedia bool) error
	IsNonMedia(ctx context.Context, hash string) (bool, error)
	SetSequential(ctx context.Context, hash string, isSequential bool) error
	IsSequential(ctx context.Context, hash string) (bool, error)

	// Ingestion Tasks
	SaveTask(ctx context.Context, task *models.IngestionTask) error
	GetTask(ctx context.Context, id string) (*models.IngestionTask, error)
	GetTasks(ctx context.Context) ([]*models.IngestionTask, error)
	DeleteTask(ctx context.Context, id string) error
	DeleteFinishedTasks(ctx context.Context) error

	// Preferences
	SavePreference(ctx context.Context, key string, value string) error
	GetPreference(ctx context.Context, key string) (string, error)
	GetAllPreferences(ctx context.Context) (map[string]string, error)

	// Noise Tokens
	SaveNoiseToken(ctx context.Context, token string, hitCount int) error
	GetNoiseTokens(ctx context.Context) (map[string]int, error)

	Close() error
}
