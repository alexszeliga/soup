package system

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"fmt"
	"log"
	"net/http"
	"net/url"
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
	Hash         string `json:"hash"`
	Name         string `json:"name"`
	SavePath     string `json:"save_path"`
	AddedOn      int64  `json:"added_on"`
	TotalRead    int64  `json:"total_downloaded"` // Go engine uses TotalRead for lifetime download
	TotalWritten int64  `json:"total_uploaded"`   // Go engine uses TotalWritten for lifetime upload
	SeedingTime  int64  `json:"seeding_time"`
}

type qbTracker struct {
	URL string `json:"url"`
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
	tokenRows, err := oldDb.Query("SELECT token, hit_count FROM noise_tokens")
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
	log.Printf("[Migration] Connecting to qBittorrent at %s...", s.qbUrl)
	qbTorrents, err := s.fetchQBTorrents()
	if err != nil {
		return fmt.Errorf("CRITICAL: could not connect to qBittorrent at %s. Ensure qBittorrent is running and accessible. Error: %w", s.qbUrl, err)
	}
	log.Printf("[Migration] Found %d torrents in qBittorrent.", len(qbTorrents))

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

		// Find details from qBittorrent
		var qbt *qbTorrent
		for i := range qbTorrents {
			if strings.ToLower(qbTorrents[i].Hash) == strings.ToLower(hash) {
				qbt = &qbTorrents[i]
				break
			}
		}

		if qbt == nil {
			log.Printf("[Migration] Warning: Torrent %s not found in qBittorrent swarm, skipping engine takeover", hash)
			continue
		}

		// 100% RELIABLE TAKEOVER: Fetch the actual .torrent file from qB
		// This contains the full 'Info' dict, bypassing 'Metadata Pending' stalls.
		magnet := ""
		_, err := s.exportTorrent(qbt.Hash)
		if err == nil {
			// We store the magnet representation for persistence, 
			// but we'll use the bytes for the initial add if we were adding fresh.
			// Actually, let's build a Rich Magnet with trackers as a fallback.
			trackers, _ := s.fetchQBTrackers(qbt.Hash)
			magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s&dn=%s", qbt.Hash, url.QueryEscape(qbt.Name))
			for _, tr := range trackers {
				if strings.HasPrefix(tr.URL, "http") || strings.HasPrefix(tr.URL, "udp") {
					magnet += "&tr=" + url.QueryEscape(tr.URL)
				}
			}
		} else {
			log.Printf("[Migration] Warning: Could not export .torrent for %s, falling back to simple magnet", hash)
			magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s", qbt.Hash)
		}

		// Port to new repo with all stats
		if err := s.repo.MigrateTorrent(ctx, hash, qbt.Name, qbt.SavePath, magnet, qbt.AddedOn, qbt.TotalRead, qbt.TotalWritten, qbt.SeedingTime); err != nil {
			log.Printf("[Migration] Error migrating torrent %s: %v", hash, err)
		}
		
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
	
	// Force flush WAL to main DB file
	if err := s.repo.Checkpoint(ctx); err != nil {
		log.Printf("[Migration] Warning: Checkpoint failed: %v", err)
	}

	log.Println("[Migration] NOTE: Please RESTART the soup-go server (docker restart soup-go) to apply changes.")
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

func (s *MigrationService) fetchQBTrackers(hash string) ([]qbTracker, error) {
	resp, err := http.Get(s.qbUrl + "/torrents/trackers?hash=" + hash)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var trackers []qbTracker
	if err := json.NewDecoder(resp.Body).Decode(&trackers); err != nil {
		return nil, err
	}
	return trackers, nil
}

func (s *MigrationService) exportTorrent(hash string) ([]byte, error) {
	resp, err := http.Get(s.qbUrl + "/torrents/export?hash=" + hash)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
