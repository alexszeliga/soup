package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/sqliteshim"
)

type bunRepo struct {
	db *bun.DB
}

// NewSqliteRepository initializes a new SQLite-backed repository using Bun ORM.
func NewSqliteRepository(dbPath string) (Repository, error) {
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	sqldb, err := sql.Open(sqliteshim.ShimName, dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	db := bun.NewDB(sqldb, sqlitedialect.New())

	repo := &bunRepo{db: db}
	if err := repo.migrate(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return repo, nil
}

func (r *bunRepo) migrate(ctx context.Context) error {
	models := []interface{}{
		(*TorrentRecord)(nil),
		(*MetadataRecord)(nil),
		(*TaskRecord)(nil),
		(*PreferenceRecord)(nil),
		(*NoiseTokenRecord)(nil),
	}

	for _, model := range models {
		_, err := r.db.NewCreateTable().
			Model(model).
			IfNotExists().
			Exec(ctx)
		if err != nil {
			return err
		}
	}

	// Manual column migrations for existing tables
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE torrents ADD COLUMN total_read INTEGER DEFAULT 0")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE torrents ADD COLUMN total_written INTEGER DEFAULT 0")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE torrents ADD COLUMN seeding_time INTEGER DEFAULT 0")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE torrents ADD COLUMN is_non_media BOOLEAN DEFAULT FALSE")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE torrents ADD COLUMN is_sequential BOOLEAN DEFAULT FALSE")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE tasks ADD COLUMN save_path TEXT")

	return nil
}

func (r *bunRepo) UnmatchTorrent(ctx context.Context, hash string) error {
	_, err := r.db.NewDelete().
		Model((*MetadataRecord)(nil)).
		Where("hash = ?", hash).
		Exec(ctx)
	return err
}

func (r *bunRepo) SetNonMedia(ctx context.Context, hash string, isNonMedia bool) error {
	record := &TorrentRecord{
		Hash:       hash,
		IsNonMedia: isNonMedia,
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (hash) DO UPDATE").
		Set("is_non_media = EXCLUDED.is_non_media").
		Exec(ctx)
	return err
}

func (r *bunRepo) IsNonMedia(ctx context.Context, hash string) (bool, error) {
	record := new(TorrentRecord)
	err := r.db.NewSelect().
		Model(record).
		Column("is_non_media").
		Where("hash = ?", hash).
		Scan(ctx)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return record.IsNonMedia, nil
}

func (r *bunRepo) SetSequential(ctx context.Context, hash string, isSequential bool) error {
	record := &TorrentRecord{
		Hash:         hash,
		IsSequential: isSequential,
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (hash) DO UPDATE").
		Set("is_sequential = EXCLUDED.is_sequential").
		Exec(ctx)
	return err
}

func (r *bunRepo) IsSequential(ctx context.Context, hash string) (bool, error) {
	record := new(TorrentRecord)
	err := r.db.NewSelect().
		Model(record).
		Column("is_sequential").
		Where("hash = ?", hash).
		Scan(ctx)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return record.IsSequential, nil
}

func (r *bunRepo) SaveTorrent(ctx context.Context, hash string, name string, magnet string) error {
	record := &TorrentRecord{
		Hash:      hash,
		Name:      name,
		MagnetURI: magnet,
		AddedOn:   time.Now().Unix(),
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (hash) DO UPDATE").
		Set("name = EXCLUDED.name").
		Set("magnet_uri = EXCLUDED.magnet_uri").
		Exec(ctx)
	return err
}

func (r *bunRepo) MigrateTorrent(ctx context.Context, hash, name, magnet string, addedOn, totalRead, totalWritten, seedingTime int64) error {
	record := &TorrentRecord{
		Hash:         hash,
		Name:         name,
		MagnetURI:    magnet,
		AddedOn:      addedOn,
		TotalRead:    totalRead,
		TotalWritten: totalWritten,
		SeedingTime:  seedingTime,
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (hash) DO UPDATE").
		Set("name = EXCLUDED.name").
		Set("magnet_uri = EXCLUDED.magnet_uri").
		Set("added_on = EXCLUDED.added_on").
		Set("total_read = EXCLUDED.total_read").
		Set("total_written = EXCLUDED.total_written").
		Set("seeding_time = EXCLUDED.seeding_time").
		Exec(ctx)
	return err
}

func (r *bunRepo) SetTorrentName(ctx context.Context, hash string, name string) error {
	_, err := r.db.NewUpdate().
		Model((*TorrentRecord)(nil)).
		Set("name = ?", name).
		Where("hash = ?", hash).
		Exec(ctx)
	return err
}

func (r *bunRepo) Checkpoint(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, "PRAGMA wal_checkpoint(FULL)")
	return err
}


func (r *bunRepo) GetTorrents(ctx context.Context) ([]TorrentRecord, error) {
	var records []TorrentRecord
	err := r.db.NewSelect().
		Model(&records).
		Scan(ctx)
	if err != nil {
		return nil, err
	}
	return records, nil
}

func (r *bunRepo) UpdateTorrentStats(ctx context.Context, hash string, totalRead, totalWritten, seedingTime int64) error {
	_, err := r.db.NewUpdate().
		Model((*TorrentRecord)(nil)).
		Set("total_read = ?", totalRead).
		Set("total_written = ?", totalWritten).
		Set("seeding_time = ?", seedingTime).
		Where("hash = ?", hash).
		Exec(ctx)
	return err
}

func (r *bunRepo) DeleteTorrent(ctx context.Context, hash string) error {
	_, err := r.db.NewDelete().
		Model((*TorrentRecord)(nil)).
		Where("hash = ?", hash).
		Exec(ctx)
	return err
}

func (r *bunRepo) SaveMetadata(ctx context.Context, hash string, meta *models.MediaMetadata) error {
	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	record := &MetadataRecord{
		Hash: hash,
		Data: string(data),
	}

	_, err = r.db.NewInsert().
		Model(record).
		On("CONFLICT (hash) DO UPDATE").
		Set("data = EXCLUDED.data").
		Set("updated_at = current_timestamp").
		Exec(ctx)
	return err
}

func (r *bunRepo) GetMetadata(ctx context.Context, hash string) (*models.MediaMetadata, error) {
	record := new(MetadataRecord)
	err := r.db.NewSelect().
		Model(record).
		Where("hash = ?", hash).
		Scan(ctx)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var meta models.MediaMetadata
	if err := json.Unmarshal([]byte(record.Data), &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

func (r *bunRepo) SaveTask(ctx context.Context, task *models.IngestionTask) error {
	fileMap, err := json.Marshal(task.FileMap)
	if err != nil {
		return err
	}

	record := &TaskRecord{
		ID:          task.ID,
		TorrentHash: task.TorrentHash,
		Status:      string(task.Status),
		Progress:    task.Progress,
		CurrentFile: task.CurrentFile,
		SavePath:    task.SavePath,
		FileMap:     string(fileMap),
		Error:       task.Error,
	}

	_, err = r.db.NewInsert().
		Model(record).
		On("CONFLICT (id) DO UPDATE").
		Set("status = EXCLUDED.status").
		Set("progress = EXCLUDED.progress").
		Set("current_file = EXCLUDED.current_file").
		Set("save_path = EXCLUDED.save_path").
		Set("error = EXCLUDED.error").
		Set("updated_at = current_timestamp").
		Exec(ctx)
	return err
}

func (r *bunRepo) GetTask(ctx context.Context, id string) (*models.IngestionTask, error) {
	record := new(TaskRecord)
	err := r.db.NewSelect().
		Model(record).
		Where("id = ?", id).
		Scan(ctx)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	t := &models.IngestionTask{
		ID:          record.ID,
		TorrentHash: record.TorrentHash,
		Status:      models.TaskStatus(record.Status),
		Progress:    record.Progress,
		CurrentFile: record.CurrentFile,
		SavePath:    record.SavePath,
		Error:       record.Error,
	}
	if err := json.Unmarshal([]byte(record.FileMap), &t.FileMap); err != nil {
		return nil, err
	}
	return t, nil
}

func (r *bunRepo) GetTasks(ctx context.Context) ([]*models.IngestionTask, error) {
	var records []TaskRecord
	err := r.db.NewSelect().
		Model(&records).
		Scan(ctx)
	if err != nil {
		return nil, err
	}

	var tasks []*models.IngestionTask
	for _, rec := range records {
		t := &models.IngestionTask{
			ID:          rec.ID,
			TorrentHash: rec.TorrentHash,
			Status:      models.TaskStatus(rec.Status),
			Progress:    rec.Progress,
			CurrentFile: rec.CurrentFile,
			SavePath:    rec.SavePath,
			Error:       rec.Error,
		}
		if err := json.Unmarshal([]byte(rec.FileMap), &t.FileMap); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

func (r *bunRepo) DeleteTask(ctx context.Context, id string) error {
	_, err := r.db.NewDelete().
		Model((*TaskRecord)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	return err
}

func (r *bunRepo) DeleteFinishedTasks(ctx context.Context) error {
	_, err := r.db.NewDelete().
		Model((*TaskRecord)(nil)).
		Where("status IN (?)", bun.List([]string{"completed", "failed"})).
		Exec(ctx)
	return err
}

func (r *bunRepo) SavePreference(ctx context.Context, key string, value string) error {
	record := &PreferenceRecord{
		Key:   key,
		Value: value,
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (key) DO UPDATE").
		Set("value = EXCLUDED.value").
		Exec(ctx)
	return err
}

func (r *bunRepo) GetPreference(ctx context.Context, key string) (string, error) {
	record := new(PreferenceRecord)
	err := r.db.NewSelect().
		Model(record).
		Where("key = ?", key).
		Scan(ctx)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return record.Value, err
}

func (r *bunRepo) GetAllPreferences(ctx context.Context) (map[string]string, error) {
	var records []PreferenceRecord
	err := r.db.NewSelect().
		Model(&records).
		Scan(ctx)
	if err != nil {
		return nil, err
	}

	res := make(map[string]string)
	for _, rec := range records {
		res[rec.Key] = rec.Value
	}
	return res, nil
}

func (r *bunRepo) SaveNoiseToken(ctx context.Context, token string, hitCount int) error {
	record := &NoiseTokenRecord{
		Token:    token,
		HitCount: hitCount,
	}
	_, err := r.db.NewInsert().
		Model(record).
		On("CONFLICT (token) DO UPDATE").
		Set("hit_count = EXCLUDED.hit_count").
		Set("updated_at = current_timestamp").
		Exec(ctx)
	return err
}

func (r *bunRepo) GetNoiseTokens(ctx context.Context) (map[string]int, error) {
	var records []NoiseTokenRecord
	err := r.db.NewSelect().
		Model(&records).
		Scan(ctx)
	if err != nil {
		return nil, err
	}

	res := make(map[string]int)
	for _, rec := range records {
		res[rec.Token] = rec.HitCount
	}
	return res, nil
}

func (r *bunRepo) Close() error {
	return r.db.Close()
}
