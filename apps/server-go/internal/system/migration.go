package system

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	_ "modernc.org/sqlite"
)

// MigrationService handles porting data from legacy TS backend.
type MigrationService struct {
	oldDbPath string
	repo      repository.Repository
	qbUrl     string
}

func NewMigrationService(oldDbPath string, repo repository.Repository, qbUrl string) *MigrationService {
	return &MigrationService{
		oldDbPath: oldDbPath,
		repo:      repo,
		qbUrl:     qbUrl,
	}
}

type oldMetadata struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Year       int    `json:"year"`
	Plot       string `json:"plot"`
	Cast       string `json:"cast"`
	PosterPath string `json:"poster_path"`
	CreatedAt  int64  `json:"created_at"`
}

type qbTorrent struct {
	Hash string `json:"hash"`
	Name string `json:"name"`
}

func (s *MigrationService) Run(ctx context.Context) error {
	log.Printf("[Migration] Starting migration from %s", s.oldDbPath)

	oldDb, err := sql.Open("sqlite", s.oldDbPath)
	if err != nil {
		return fmt.Errorf("failed to open old DB: %w", err)
	}
	defer oldDb.Close()

	// 1. Migrate Noise Tokens
	log.Println("[Migration] Migrating noise tokens...")
	tokenRows, err := oldDb.Query("SELECT token, hitCount FROM noise_tokens")
	if err == nil {
		defer tokenRows.Close()
		for tokenRows.Next() {
			var token string
			var count int
			if err := tokenRows.Scan(&token, &count); err == nil {
				_ = s.repo.SaveNoiseToken(ctx, token, count)
			}
		}
	}

	// 2. Fetch Torrent Info from qBittorrent
	log.Println("[Migration] Fetching torrent info from qBittorrent...")
	qbTorrents, err := s.fetchQBTorrents()
	if err != nil {
		return fmt.Errorf("failed to fetch qBittorrent info: %w", err)
	}

	// 3. Migrate Torrents and Metadata
	log.Println("[Migration] Migrating torrents and metadata...")
	rows, err := oldDb.Query("SELECT hash, metadata_id, is_non_media FROM torrents")
	if err != nil {
		return fmt.Errorf("failed to query old torrents: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var hash string
		var metadataId sql.NullString
		var isNonMedia bool
		if err := rows.Scan(&hash, &metadataId, &isNonMedia); err != nil {
			continue
		}

		// Find magnet
		var magnet string
		for _, qt := range qbTorrents {
			if strings.ToLower(qt.Hash) == strings.ToLower(hash) {
				magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s", qt.Hash)
				break
			}
		}

		if magnet == "" {
			log.Printf("[Migration] Warning: Torrent %s not found in qBittorrent swarm, skipping engine start", hash)
			continue
		}

		// Port to new repo
		_ = s.repo.SaveTorrent(ctx, hash, magnet)
		if isNonMedia {
			_ = s.repo.SetNonMedia(ctx, hash, true)
		}

		// Port Metadata if linked
		if metadataId.Valid && metadataId.String != "" {
			var m oldMetadata
			err := oldDb.QueryRow("SELECT id, title, year, plot, cast, poster_path, created_at FROM metadata WHERE id = ?", metadataId.String).
				Scan(&m.ID, &m.Title, &m.Year, &m.Plot, &m.Cast, &m.PosterPath, &m.CreatedAt)
			
			if err == nil {
				newMeta := &models.MediaMetadata{
					ID:         m.ID,
					Title:      m.Title,
					Year:       m.Year,
					Plot:       m.Plot,
					PosterPath: m.PosterPath,
				}
				_ = json.Unmarshal([]byte(m.Cast), &newMeta.Cast)
				_ = s.repo.SaveMetadata(ctx, hash, newMeta)
			}
		}
		count++
	}

	log.Printf("[Migration] SUCCESS: Migrated %d torrents and their metadata.", count)
	return nil
}

func (s *MigrationService) fetchQBTorrents() ([]qbTorrent, error) {
	resp, err := http.Get(s.qbUrl + "/torrents/info")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var torrents []qbTorrent
	if err := json.NewDecoder(resp.Body).Decode(&torrents); err != nil {
		return nil, err
	}
	return torrents, nil
}
