package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/alexszeliga/soup/apps/server-go/internal/config"
	"github.com/alexszeliga/soup/apps/server-go/internal/ingestion"
	"github.com/alexszeliga/soup/apps/server-go/internal/metadata"
	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	"github.com/alexszeliga/soup/apps/server-go/internal/server"
	"github.com/alexszeliga/soup/apps/server-go/internal/system"
	"github.com/alexszeliga/soup/apps/server-go/internal/torrent"
	anatorrent "github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
	"golang.org/x/time/rate"
)

func main() {
	// Handle subcommands
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		runMigration()
		return
	}

	// 1. Load Configuration
	cfg := config.Load()

	// 2. Initialize Persistence (Repository)
	repo, err := repository.NewSqliteRepository(cfg.EngineDBPath)
	if err != nil {
		log.Fatalf("failed to initialize repository: %s", err)
	}
	defer func() {
		log.Println("Closing repository...")
		_ = repo.Close()
	}()

	// Load Network Preferences for Engine Init
	ctx := context.Background()
	dhtPref, _ := repo.GetPreference(ctx, "dht")
	pexPref, _ := repo.GetPreference(ctx, "pex")
	
	dhtEnabled := dhtPref == "true"
	pexEnabled := pexPref == "true"

	// 3. Initialize the Native Engine
	tCfg := anatorrent.NewDefaultClientConfig()
	tCfg.NoDHT = !dhtEnabled
	tCfg.DisablePEX = !pexEnabled

	// Load Spoofing Identity if available
	spoofFile := "spoof.json"
	if _, err := os.Stat(spoofFile); err == nil {
		data, err := os.ReadFile(spoofFile)
		if err == nil {
			var id struct {
				UserAgent    string `json:"userAgent"`
				PeerIDPrefix string `json:"peerIdPrefix"`
			}
			if err := json.Unmarshal(data, &id); err == nil {
				log.Printf("Applying Spoof Identity: %s (%s)", id.UserAgent, id.PeerIDPrefix)
				tCfg.HTTPUserAgent = id.UserAgent
				tCfg.Bep20 = id.PeerIDPrefix
				tCfg.ExtendedHandshakeClientVersion = id.UserAgent
			}
		}
	}

	absDataDir, _ := filepath.Abs(cfg.DataDir)
	tCfg.DataDir = absDataDir
	_ = os.MkdirAll(absDataDir, 0755)

	absDBPath, _ := filepath.Abs(cfg.EngineDBPath)
	dbDir := filepath.Dir(absDBPath)
	_ = os.MkdirAll(dbDir, 0755)

	pc, err := storage.NewSqlitePieceCompletion(dbDir)
	if err != nil {
		log.Fatalf("failed to initialize piece completion: %s", err)
	}
	tCfg.DefaultStorage = storage.NewFileWithCompletion(absDataDir, pc)

	// Initialize Rate Limiters (Unlimited by default)
	dlLimit := rate.NewLimiter(rate.Inf, 1024*1024) // 1MB burst
	upLimit := rate.NewLimiter(rate.Inf, 1024*1024)
	tCfg.DownloadRateLimiter = dlLimit
	tCfg.UploadRateLimiter = upLimit

	engine, err := anatorrent.NewClient(tCfg)
	if err != nil {
		log.Fatalf("failed to create torrent client: %s", err)
	}
	defer func() {
		log.Println("Closing BitTorrent engine...")
		engine.Close()
	}()

	// 4. Initialize Metadata Provider
	var tmdb *metadata.TMDBProvider
	if cfg.TMDBApiKey != "" {
		fmt.Println("TMDB Metadata Provider initialized.")
		tmdb = metadata.NewTMDBProvider(cfg.TMDBApiKey)
	}

	// 5. Initialize Torrent Service
	ts := torrent.NewTorrentService(&models.EngineWrapper{
		Client:          engine,
		PieceCompletion: pc,
		DlLimit:         dlLimit,
		UpLimit:         upLimit,
		DhtEnabled:      dhtEnabled,
		PexEnabled:      pexEnabled,
	}, repo, tmdb, absDataDir, cfg.IsDocker)

	// Restore persisted torrents
	if err := ts.RestoreState(context.Background()); err != nil {
		log.Printf("Failed to restore state: %v", err)
	}

	// 6. Initialize Ingestion Service
	ingest := ingestion.NewIngestionService(cfg.MediaRoot, repo)
	if err := ingest.RestoreState(context.Background()); err != nil {
		log.Printf("Failed to restore ingestion state: %v", err)
	}
	fmt.Printf("Ingestion Service active (Media Root: %s)\n", cfg.MediaRoot)

	// 7. Initialize System Services
	ss := system.NewStorageService()
	ids := system.NewIdentityService("spoof.json")
	ids.StartAutoSync(context.Background())

	// Auto-add any .torrent files found in DATA_DIR (useful for discovery/spoofing)
	tFiles, _ := filepath.Glob(filepath.Join(absDataDir, "*.torrent"))
	for _, tf := range tFiles {
		f, err := os.Open(tf)
		if err == nil {
			mi, err := metainfo.Load(f)
			if err == nil {
				log.Printf("Auto-adding discovery torrent: %s", tf)
				_, _ = ts.AddTorrent(context.Background(), mi)
			}
			_ = f.Close()
		}
	}

	// 8. Start the Web Bridge
	go func() {
		fmt.Printf("Starting Soup-Go Web Bridge on port %s...\n", cfg.Port)
		if err := server.Start(cfg.Port, ts, tmdb, ingest, ss, cfg); err != nil {
			log.Fatalf("failed to start server: %s", err)
		}
	}()

	fmt.Println("Soup-Go is active. Use 'Ctrl+C' to stop.")

	// --- Graceful Shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	
	sig := <-quit
	log.Printf("Shutting down (received signal: %v)...", sig)
	// defer blocks will now execute correctly
}

func runMigration() {
	cfg := config.Load()
	
	// Get QB_URL from environment or fallback to common local default
	defaultQB := os.Getenv("QB_URL")
	if defaultQB == "" {
		defaultQB = "http://localhost:8080/api/v2"
	}

	oldDbPath := flag.String("old-db", "../server/soup.db", "Path to the old TypeScript soup.db")
	qbUrl := flag.String("qb-url", defaultQB, "qBittorrent API URL")
	flag.CommandLine.Parse(os.Args[2:])

	repo, err := repository.NewSqliteRepository(cfg.EngineDBPath)
	if err != nil {
		log.Fatalf("Failed to open new repository: %v", err)
	}
	defer repo.Close()

	migrator := system.NewMigrationService(*oldDbPath, repo, *qbUrl)
	if err := migrator.Run(context.Background()); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
}
