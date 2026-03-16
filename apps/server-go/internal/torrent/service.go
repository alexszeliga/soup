package torrent

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/metadata"
	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	"github.com/anacrolix/torrent/metainfo"
)

type torrentSample struct {
	bytesRead    int64
	bytesWritten int64
	timestamp    time.Time
	
	// EMA Speeds
	emaDl float64
	emaUp float64

	// Cumulative stats (from DB + session delta)
	totalReadBase    int64
	totalWrittenBase int64
	seedingTimeBase  float64 // in seconds
	addedOn          int64
	name             string
	isSequential     bool
	isNonMedia       bool
	savePath         string
	metadata         *models.MediaMetadata
}

// Configuration Constants
const (
	EmaSmoothingAlpha   = 0.3
	TelemetrySyncInterval = 10 * time.Second
)

// MetadataWaitTimeout is how long we block the lifecycle routine before continuing without metadata.
// Exported for testing purposes.
var MetadataWaitTimeout = 60 * time.Second

// Preferences stores application-wide settings.
type Preferences struct {
	UseAltSpeedLimits bool   `json:"use_alt_speed_limits"`
	AltDlLimit         int64  `json:"alt_dl_limit"`
	AltUpLimit         int64  `json:"alt_up_limit"`
	GlobalDlLimit      int64  `json:"dl_limit"`
	GlobalUpLimit      int64  `json:"up_limit"`
	SavePath           string `json:"save_path"`
	MediaRoot          string `json:"media_root"`
	Dht                bool   `json:"dht"`
	Pex                bool   `json:"pex"`
}

// TorrentService orchestrates the BitTorrent engine and its persistence.
type TorrentService struct {
	engine   models.TorrentEngine
	repo     repository.Repository
	tmdb     *metadata.TMDBProvider
	dataDir  string // Root directory for torrent downloads
	isDocker bool
	
	// Speed tracking
	mu         sync.Mutex
	lastSamples map[string]*torrentSample // Using pointers for in-memory stability

	// Preferences
	prefs Preferences
}

func NewTorrentService(engine models.TorrentEngine, repo repository.Repository, tmdb *metadata.TMDBProvider, dataDir string, isDocker bool) *TorrentService {
	s := &TorrentService{
		engine:      engine,
		repo:        repo,
		tmdb:        tmdb,
		dataDir:     dataDir,
		isDocker:    isDocker,
		lastSamples: make(map[string]*torrentSample),
		prefs: Preferences{
			AltDlLimit:    1024 * 1024, // 1MB default
			AltUpLimit:    1024 * 1024,
			GlobalDlLimit: -1,          // unlimited
			GlobalUpLimit: -1,
			SavePath:      dataDir,
			Dht:           false, // Disabled by default
			Pex:           false, // Disabled by default
		},
	}
	
	// Load preferences from DB
	s.loadPreferences()

	// Apply initial limits and network settings
	s.applyLimits()
	s.applyNetworkSettings()

	// Start background telemetry syncer
	go s.telemetryLoop()
	
	return s
}

func (s *TorrentService) loadPreferences() {
	ctx := context.Background()
	all, err := s.repo.GetAllPreferences(ctx)
	if err != nil {
		log.Printf("Failed to load preferences: %v", err)
		return
	}

	// Boolean switches
	if v, ok := all["use_alt_speed_limits"]; ok {
		s.prefs.UseAltSpeedLimits = v == "true"
	}
	if v, ok := all["dht"]; ok {
		s.prefs.Dht = v == "true"
	}
	if v, ok := all["pex"]; ok {
		s.prefs.Pex = v == "true"
	}

	// Numbers
	if v, ok := all["alt_dl_limit"]; ok {
		fmt.Sscanf(v, "%d", &s.prefs.AltDlLimit)
	}
	if v, ok := all["alt_up_limit"]; ok {
		fmt.Sscanf(v, "%d", &s.prefs.AltUpLimit)
	}
	if v, ok := all["dl_limit"]; ok {
		fmt.Sscanf(v, "%d", &s.prefs.GlobalDlLimit)
	}
	if v, ok := all["up_limit"]; ok {
		fmt.Sscanf(v, "%d", &s.prefs.GlobalUpLimit)
	}

	// Paths (with .env fallbacks)
	if v, ok := all["save_path"]; ok && v != "" {
		s.prefs.SavePath = v
	} else {
		s.prefs.SavePath = os.Getenv("LOCAL_DOWNLOAD_ROOT")
		if s.prefs.SavePath == "" {
			s.prefs.SavePath = s.dataDir
		}
	}

	if v, ok := all["media_root"]; ok && v != "" {
		s.prefs.MediaRoot = v
	} else {
		s.prefs.MediaRoot = os.Getenv("MEDIA_ROOT")
	}
}

func (s *TorrentService) savePreferences() {
	ctx := context.Background()
	_ = s.repo.SavePreference(ctx, "use_alt_speed_limits", fmt.Sprintf("%v", s.prefs.UseAltSpeedLimits))
	_ = s.repo.SavePreference(ctx, "dht", fmt.Sprintf("%v", s.prefs.Dht))
	_ = s.repo.SavePreference(ctx, "pex", fmt.Sprintf("%v", s.prefs.Pex))
	_ = s.repo.SavePreference(ctx, "alt_dl_limit", fmt.Sprintf("%d", s.prefs.AltDlLimit))
	_ = s.repo.SavePreference(ctx, "alt_up_limit", fmt.Sprintf("%d", s.prefs.AltUpLimit))
	_ = s.repo.SavePreference(ctx, "dl_limit", fmt.Sprintf("%d", s.prefs.GlobalDlLimit))
	_ = s.repo.SavePreference(ctx, "up_limit", fmt.Sprintf("%d", s.prefs.GlobalUpLimit))
	_ = s.repo.SavePreference(ctx, "save_path", s.prefs.SavePath)
	_ = s.repo.SavePreference(ctx, "media_root", s.prefs.MediaRoot)
}

func (s *TorrentService) applyLimits() {
	var dl, up int64
	if s.prefs.UseAltSpeedLimits {
		dl = s.prefs.AltDlLimit
		up = s.prefs.AltUpLimit
	} else {
		dl = s.prefs.GlobalDlLimit
		up = s.prefs.GlobalUpLimit
	}

	// Apply to engine
	s.engine.SetRateLimits(dl, up)
}

func (s *TorrentService) applyNetworkSettings() {
	s.engine.SetDht(s.prefs.Dht)
	s.engine.SetPex(s.prefs.Pex)
}

func (s *TorrentService) GetPreferences() Preferences {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.prefs
}

func (s *TorrentService) UpdatePreferences(p PartialPreferences) {
	s.mu.Lock()
	restartRequired := false

	if p.SavePath != nil {
		s.prefs.SavePath = *p.SavePath
	}
	if p.MediaRoot != nil {
		s.prefs.MediaRoot = *p.MediaRoot
	}
	if p.Dht != nil {
		if *p.Dht != s.prefs.Dht {
			restartRequired = true
		}
		s.prefs.Dht = *p.Dht
	}
	if p.Pex != nil {
		if *p.Pex != s.prefs.Pex {
			restartRequired = true
		}
		s.prefs.Pex = *p.Pex
	}
	if p.AltDlLimit != nil {
		s.prefs.AltDlLimit = *p.AltDlLimit
	}
	if p.AltUpLimit != nil {
		s.prefs.AltUpLimit = *p.AltUpLimit
	}
	if p.GlobalDlLimit != nil {
		s.prefs.GlobalDlLimit = *p.GlobalDlLimit
	}
	if p.GlobalUpLimit != nil {
		s.prefs.GlobalUpLimit = *p.GlobalUpLimit
	}
	
	s.savePreferences()
	s.applyLimits()
	s.applyNetworkSettings()
	s.mu.Unlock()

	if restartRequired {
		if s.isDocker {
			log.Println("[Preferences] Network settings changed (DHT/PEX). Restarting engine container to apply changes...")
			go func() {
				time.Sleep(1 * time.Second) // Give time for response to reach client
				os.Exit(0)
			}()
		} else {
			log.Println("[Preferences] Network settings changed (DHT/PEX). Please RESTART the server manually to apply changes.")
		}
	}
}

func (s *TorrentService) ToggleAltSpeeds() bool {
	s.mu.Lock()
	s.prefs.UseAltSpeedLimits = !s.prefs.UseAltSpeedLimits
	s.savePreferences()
	s.applyLimits()
	active := s.prefs.UseAltSpeedLimits
	s.mu.Unlock()
	return active
}

type PartialPreferences struct {
	SavePath      *string `json:"save_path"`
	MediaRoot     *string `json:"media_root"`
	Dht           *bool   `json:"dht"`
	Pex           *bool   `json:"pex"`
	AltDlLimit    *int64  `json:"alt_dl_limit"`
	AltUpLimit    *int64  `json:"alt_up_limit"`
	GlobalDlLimit *int64  `json:"dl_limit"`
	GlobalUpLimit *int64  `json:"up_limit"`
}

// RestoreState re-adds all persisted torrents from the database.
func (s *TorrentService) RestoreState(ctx context.Context) error {
	records, err := s.repo.GetTorrents(ctx)
	if err != nil {
		return fmt.Errorf("failed to load torrents from db: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, rec := range records {
		log.Printf("Restoring torrent: %s (SavePath: %s)", rec.Hash, rec.SavePath)
		t, err := s.engine.AddMagnet(rec.MagnetURI, rec.SavePath)
		if err != nil {
			log.Printf("Failed to restore torrent %s: %v", rec.Hash, err)
			continue
		}

		// Retrieve persisted states
		isSeq, _ := s.repo.IsSequential(ctx, rec.Hash)
		isNonMedia, _ := s.repo.IsNonMedia(ctx, rec.Hash)

		// Initialize sample with base stats from DB
		s.lastSamples[rec.Hash] = &torrentSample{
			timestamp:        time.Now(),
			totalReadBase:    rec.TotalRead,
			totalWrittenBase: rec.TotalWritten,
			seedingTimeBase:  float64(rec.SeedingTime),
			addedOn:          rec.AddedOn,
			name:             rec.Name,
			savePath:         rec.SavePath,
			isNonMedia:       isNonMedia,
			isSequential:     isSeq,
		}

		// Apply sequential if needed
		if isSeq {
			t.SetSequential(true)
		}

		// Manage Lifecycle (Async)
		go s.manageLifecycle(t)
	}

	return nil
}

// AddMagnet adds a new magnet link, ensures it persists, and manages its lifecycle.
func (s *TorrentService) AddMagnet(ctx context.Context, uri string) (models.EngineTorrent, error) {
	// Use default save path if not specified
	savePath := s.prefs.SavePath
	t, err := s.engine.AddMagnet(uri, savePath)
	if err != nil {
		return nil, err
	}

	hash := t.InfoHash().HexString()

	// 1. Persist the magnet for future restarts
	if err := s.repo.SaveTorrent(ctx, hash, t.Name(), savePath, uri); err != nil {
		log.Printf("Failed to persist torrent %s: %v", hash, err)
	}

	// 2. Initialize telemetry sample
	s.mu.Lock()
	s.lastSamples[hash] = &torrentSample{
		timestamp: time.Now(),
		addedOn:   time.Now().Unix(),
		savePath:  savePath,
	}
	s.mu.Unlock()

	// 3. Manage Lifecycle (Async)
	go s.manageLifecycle(t)

	return t, nil
}

// AddTorrent adds a new torrent from metainfo, ensures it persists, and manages its lifecycle.
func (s *TorrentService) AddTorrent(ctx context.Context, mi *metainfo.MetaInfo) (models.EngineTorrent, error) {
	savePath := s.prefs.SavePath
	t, err := s.engine.AddTorrent(mi, savePath)
	if err != nil {
		return nil, err
	}

	hash := t.InfoHash().HexString()

	// 1. Persist (We use the magnet representation for simple recovery)
	magnet := mi.Magnet(nil, nil).String()
	if err := s.repo.SaveTorrent(ctx, hash, t.Name(), savePath, magnet); err != nil {
		log.Printf("Failed to persist torrent %s: %v", hash, err)
	}

	// 2. Initialize telemetry sample
	s.mu.Lock()
	s.lastSamples[hash] = &torrentSample{
		timestamp: time.Now(),
		addedOn:   time.Now().Unix(),
		savePath:  savePath,
	}
	s.mu.Unlock()

	// 3. Manage Lifecycle (Async)
	go s.manageLifecycle(t)

	return t, nil
}

func (s *TorrentService) manageLifecycle(t models.EngineTorrent) {
	hash := t.InfoHash().HexString()

	// 1. Ensure we allow data transfer (needed to find peers for metadata)
	t.AllowDataDownload()
	t.AllowDataUpload()

	// 2. Trigger Download Watcher
	// We run this in a background goroutine so it triggers DownloadAll as soon as 
	// metadata arrives, even if the discovery routine below times out.
	go func() {
		<-t.GotInfo()
		
		// 1. Update in-memory name and persist to DB
		torrentHash := t.InfoHash().HexString()
		s.mu.Lock()
		if sample, ok := s.lastSamples[torrentHash]; ok {
			sample.name = t.Name()
			_ = s.repo.SetTorrentName(context.Background(), torrentHash, sample.name)
		}
		s.mu.Unlock()

		// 2. If we already have some bytes but aren't complete, it's likely a migration
		// or restart. Trigger a recheck to be sure.
		if t.BytesCompleted() > 0 && t.BytesCompleted() < t.Length() {
			log.Printf("[Lifecycle] Existing data detected for %s, triggering recheck...", t.Name())
			_ = t.VerifyData()
		}

		t.DownloadAll()
		log.Printf("[Lifecycle] Metadata arrived, download started for: %s", t.Name())
	}()

	// 3. Discovery Routine (Wait for metadata with timeout for TMDB matching)
	select {
	case <-t.GotInfo():
		log.Printf("[Matcher] Metadata received for: %s", t.Name())
	case <-time.After(MetadataWaitTimeout):
		log.Printf("[Matcher] Metadata wait timed out for %s. Auto-matching will be deferred.", hash)
		return // Discovery routine finishes, but the Watcher goroutine above remains active
	}

	// 4. Automatic Metadata Matching
	if s.tmdb != nil {
		// Check if manually marked as non-media or already matched
		isNonMedia, _ := s.repo.IsNonMedia(context.Background(), hash)
		if isNonMedia {
			return
		}

		meta, err := s.repo.GetMetadata(context.Background(), hash)
		if err == nil && meta != nil {
			// Update in-memory cache if missing
			s.mu.Lock()
			if sample, ok := s.lastSamples[hash]; ok {
				sample.metadata = meta
			}
			s.mu.Unlock()
			return 
		}

		// Perform match using our NoiseMiner logic
		if !t.HasInfo() {
			return // Can't match without info
		}

		info := models.GetMediaInfo(t.Name())
		if info.Title != "" {
			log.Printf("[Matcher] Searching TMDB for: %s (Year: %d, Type: %s)", info.Title, info.Year, info.Type)
			candidates, err := s.tmdb.Search(info.Title, info.Year, info.Type)
			if err != nil {
				log.Printf("[Matcher] Search error for %s: %v", info.Title, err)
			} else if len(candidates) > 0 {
				meta := candidates[0]
				log.Printf("[Matcher] Matched metadata for %s: %s (%d)", hash, meta.Title, meta.Year)
				_ = s.repo.SaveMetadata(context.Background(), hash, meta)
				
				// Update in-memory cache
				s.mu.Lock()
				if sample, ok := s.lastSamples[hash]; ok {
					sample.metadata = meta
				}
				s.mu.Unlock()
			} else {
				log.Printf("[Matcher] No results found for: %s", info.Title)
			}
		} else {
			log.Printf("[Matcher] Failed to extract title from: %s", t.Name())
		}
	}
}

// List returns the combined state of the engine and the metadata cache.
func (s *TorrentService) List(ctx context.Context) ([]*models.Torrent, error) {
	engineTorrents := s.engine.Torrents()
	list := make([]*models.Torrent, 0, len(engineTorrents))

	// 1. Fetch all records once to avoid N+1 queries during sample population
	records, _ := s.repo.GetTorrents(ctx)
	recordMap := make(map[string]repository.TorrentRecord)
	for _, r := range records {
		recordMap[r.Hash] = r
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()

	for _, et := range engineTorrents {
		hash := et.InfoHash().HexString()
		
		sample, ok := s.lastSamples[hash]
		if !ok {
			// Initialize from DB if possible to avoid 0-flicker
			sample = &torrentSample{timestamp: now, addedOn: now.Unix()}
			if rec, found := recordMap[hash]; found {
				sample.addedOn = rec.AddedOn
				sample.name = rec.Name
				sample.savePath = rec.SavePath
				sample.totalReadBase = rec.TotalRead
				sample.totalWrittenBase = rec.TotalWritten
				sample.seedingTimeBase = float64(rec.SeedingTime)
				sample.isNonMedia = rec.IsNonMedia
				sample.isSequential = rec.IsSequential
			}
			s.lastSamples[hash] = sample
		}

		// 2. Perform Stats Calculation BEFORE creating DTO
		stats := et.Stats()
		currentRead := stats.BytesRead.Int64()
		currentWritten := stats.BytesWritten.Int64()
		
		duration := now.Sub(sample.timestamp).Seconds()
		if duration > 0 {
			// EMA Speed Smoothing
			instDl := float64(currentRead-sample.bytesRead) / duration
			instUp := float64(currentWritten-sample.bytesWritten) / duration
			sample.emaDl = (EmaSmoothingAlpha * instDl) + ((1 - EmaSmoothingAlpha) * sample.emaDl)
			sample.emaUp = (EmaSmoothingAlpha * instUp) + ((1 - EmaSmoothingAlpha) * sample.emaUp)

			// Update Seeding Time Accumulator (Only if actually seeding)
			// State is determined by NewFromEngineInterface logic essentially, but we can pre-check
			isComplete := et.Length() > 0 && et.BytesCompleted() == et.Length()
			if isComplete && sample.emaUp > 0 {
				sample.seedingTimeBase += duration
			}
		}

		// 3. Construct the BaseInfo with the LATEST accumulated stats
		contentPath := sample.savePath
		if sample.name != "" {
			contentPath = filepath.Join(sample.savePath, sample.name)
		}

		baseInfo := models.TorrentBaseInfo{
			Name:             sample.name,
			AddedOn:          sample.addedOn,
			TotalReadBase:    sample.totalReadBase,
			TotalWrittenBase: sample.totalWrittenBase,
			SeedingTimeBase:  int64(sample.seedingTimeBase),
			IsNonMedia:       sample.isNonMedia,
			IsSequential:     sample.isSequential,
			ContentPath:      contentPath,
			Metadata:         sample.metadata,
		}

		if !sample.isNonMedia && sample.metadata == nil {
			if meta, err := s.repo.GetMetadata(ctx, hash); err == nil && meta != nil {
				sample.metadata = meta
				baseInfo.Metadata = meta
			}
		}

		// 4. Map to DTO
		t := models.NewFromEngineInterface(et, baseInfo)
		
		// 5. Apply calculated EMA speeds to DTO
		t.DownloadSpeed = int64(sample.emaDl)
		t.UploadSpeed = int64(sample.emaUp)

		// 6. Refine State and ETA based on calculated speeds
		if t.DownloadSpeed > models.StalledThreshold {
			if t.Progress < 1.0 {
				remaining := t.Size - int64(float64(t.Size)*t.Progress)
				t.Eta = remaining / t.DownloadSpeed
			}
		} else if t.State == "downloading" {
			t.State = "stalledDL"
			t.StateName = "Stalled"
		}

		if t.State == "uploading" && t.UploadSpeed < models.StalledThreshold {
			t.State = "stalledUP"
			t.StateName = "Seeding (Stalled)"
		}

		// Update sample for next tick
		sample.bytesRead = currentRead
		sample.bytesWritten = currentWritten
		sample.timestamp = now

		list = append(list, t)
	}

	// Clean up samples for removed torrents
	for hash := range s.lastSamples {
		found := false
		for _, et := range engineTorrents {
			if et.InfoHash().HexString() == hash {
				found = true
				break
			}
		}
		if !found {
			delete(s.lastSamples, hash)
		}
	}

	return list, nil
}

func (s *TorrentService) telemetryLoop() {
	ticker := time.NewTicker(TelemetrySyncInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		// Safe snapshoting of current stats
		type statSnap struct {
			totalRead    int64
			totalWritten int64
			seedingTime  int64
		}
		targets := make(map[string]statSnap)
		for k, v := range s.lastSamples {
			targets[k] = statSnap{
				totalRead:    v.totalReadBase + v.bytesRead,
				totalWritten: v.totalWrittenBase + v.bytesWritten,
				seedingTime:  int64(v.seedingTimeBase),
			}
		}
		s.mu.Unlock()

		ctx := context.Background()
		for hash, snap := range targets {
			_ = s.repo.UpdateTorrentStats(ctx, hash, snap.totalRead, snap.totalWritten, snap.seedingTime)
		}
	}
}

// GetFiles returns the list of files for a specific torrent hash.
func (s *TorrentService) GetFiles(hash string) ([]models.EngineFile, error) {
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			if !t.HasInfo() {
				return []models.EngineFile{}, fmt.Errorf("metadata pending")
			}
			return t.Files(), nil
		}
	}
	return nil, fmt.Errorf("torrent not found")
}

// Remove drops a torrent from the engine and deletes it from the database.
func (s *TorrentService) Remove(ctx context.Context, hash string, deleteFiles bool) error {
	// Find and drop from engine
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			torrentName := t.Name()
			t.Drop()

			if deleteFiles && torrentName != "" {
				path := filepath.Join(s.prefs.SavePath, torrentName)
				log.Printf("[Cleanup] Removing data for torrent %s at %s", hash, path)
				if err := os.RemoveAll(path); err != nil {
					log.Printf("[Cleanup] Failed to remove data at %s: %v", path, err)
				}
			}
			break
		}
	}

	// Remove from database
	return s.repo.DeleteTorrent(ctx, hash)
}

// Start resumes data transfer for a torrent.
func (s *TorrentService) Start(ctx context.Context, hash string) error {
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			t.AllowDataDownload()
			t.AllowDataUpload()
			t.DownloadAll()
			return nil
		}
	}
	return fmt.Errorf("torrent not found")
}

// Stop pauses data transfer for a torrent.
func (s *TorrentService) Stop(ctx context.Context, hash string) error {
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			t.DisallowDataDownload()
			t.DisallowDataUpload()
			t.CancelPieces(0, t.NumPieces())
			return nil
		}
	}
	return fmt.Errorf("torrent not found")
}

// Recheck triggers data verification.
func (s *TorrentService) Recheck(ctx context.Context, hash string) error {
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			return t.VerifyData()
		}
	}
	return fmt.Errorf("torrent not found")
}

// SetFilePriority sets download priority for a specific file.
func (s *TorrentService) SetFilePriority(hash string, index int, priority int) error {
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			files := t.Files()
			if index < 0 || index >= len(files) {
				return fmt.Errorf("file index out of range")
			}
			files[index].SetPriority(priority)
			return nil
		}
	}
	return fmt.Errorf("torrent not found")
}

// SetSequential toggles sequential download mode.
func (s *TorrentService) SetSequential(hash string, sequential bool) error {
	s.mu.Lock()
	if sample, ok := s.lastSamples[hash]; ok {
		sample.isSequential = sequential
	}
	s.mu.Unlock()

	// 1. Persist to DB
	_ = s.repo.SetSequential(context.Background(), hash, sequential)

	// 2. Apply to active engine torrent if found
	for _, t := range s.engine.Torrents() {
		if t.InfoHash().HexString() == hash {
			t.SetSequential(sequential)
			return nil
		}
	}

	return nil
}

func (s *TorrentService) Engine() models.EngineTorrent {
	// This is a bit of a hack since Engine interface doesn't return a single torrent
	// but the WebSocket broadcaster needs it.
	return nil
}

// New Engine() method to expose the underlying engine for DhtNodes()
func (s *TorrentService) GetEngine() models.TorrentEngine {
	return s.engine
}

func (s *TorrentService) LinkMetadata(ctx context.Context, hash string, metadataId string) error {
	if s.tmdb == nil {
		return fmt.Errorf("TMDB provider not initialized")
	}

	meta, err := s.tmdb.GetByID(metadataId)
	if err != nil {
		return fmt.Errorf("failed to fetch metadata: %w", err)
	}

	// 1. Save to database
	if err := s.repo.SaveMetadata(ctx, hash, meta); err != nil {
		return fmt.Errorf("failed to save metadata: %w", err)
	}

	// 2. Mark as NOT non-media (just in case)
	_ = s.repo.SetNonMedia(ctx, hash, false)

	// 3. Update in-memory cache
	s.mu.Lock()
	if sample, ok := s.lastSamples[hash]; ok {
		sample.metadata = meta
		sample.isNonMedia = false
	}
	s.mu.Unlock()

	return nil
}

func (s *TorrentService) Unmatch(ctx context.Context, hash string) error {
	// 1. Clear from DB
	err := s.repo.UnmatchTorrent(ctx, hash)
	
	// 2. Clear from in-memory cache
	s.mu.Lock()
	if sample, ok := s.lastSamples[hash]; ok {
		sample.metadata = nil
	}
	s.mu.Unlock()

	return err
}

func (s *TorrentService) SetNonMedia(ctx context.Context, hash string, isNonMedia bool) error {
	s.mu.Lock()
	if sample, ok := s.lastSamples[hash]; ok {
		sample.isNonMedia = isNonMedia
		if isNonMedia {
			sample.metadata = nil
		}
	}
	s.mu.Unlock()
	return s.repo.SetNonMedia(ctx, hash, isNonMedia)
}
