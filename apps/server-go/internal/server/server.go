package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/config"
	"github.com/alexszeliga/soup/apps/server-go/internal/ingestion"
	"github.com/alexszeliga/soup/apps/server-go/internal/metadata"
	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/system"
	"github.com/alexszeliga/soup/apps/server-go/internal/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/websocket/v2"
)

// Start initializes and runs the Fiber web server.
func Start(port string, ts *torrent.TorrentService, tmdb *metadata.TMDBProvider, ingest *ingestion.IngestionService, ss *system.StorageService, cfg *config.Config) error {
	app := fiber.New(fiber.Config{
		AppName: "Soup-Go API",
	})

	// Create and start the WebSocket Hub
	hub := NewHub()
	go hub.Run()

	// 1. WebSocket Broadcaster Worker
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		var lastStorageUpdate time.Time
		var cachedStorage []models.DiskStats

		for range ticker.C {
			// 1. Get Torrents from Service (includes calculated speeds)
			torrents, _ := ts.List(context.Background())

			// 2. Get Tasks
			var tasks []*models.IngestionTask
			if ingest != nil {
				tasks = ingest.GetTasks()
			}

			prefs := ts.GetPreferences()

			// 3. Get Storage (Throttled to every 5s)
			if time.Since(lastStorageUpdate) > 5*time.Second {
				locations := map[string]string{
					"Library":   prefs.MediaRoot,
					"Downloads": prefs.SavePath,
				}
				cachedStorage = ss.GetStorageOverview(locations)
				lastStorageUpdate = time.Now()
			}

			// 4. Get State (Calculate aggregate speeds)
			var totalDl, totalUp, totalIngest int64
			for _, t := range torrents {
				totalDl += t.DownloadSpeed
				totalUp += t.UploadSpeed
			}
			for _, tk := range tasks {
				if tk.Status == models.TaskProcessing {
					totalIngest += tk.CurrentSpeed
				}
			}

			state := fiber.Map{
				"dl_info_speed":        totalDl,
				"up_info_speed":        totalUp,
				"ingest_info_speed":    totalIngest,
				"dht_nodes":            ts.GetEngine().DhtNodes(),
				"use_alt_speed_limits": prefs.UseAltSpeedLimits,
				"connection_status":    "connected",
			}

			// 5. Broadcast to each client (potentially tailored)
			hub.ForEach(func(c *client) {
				focus := c.getFocus()
				
				payload := fiber.Map{
					"torrents": torrents,
					"tasks":    tasks,
					"state":    state,
					"storage":  cachedStorage,
				}

				// If client has a focus, optionally enrich with file data
				if focus != "" {
					files, _ := ts.GetFiles(focus)
					if len(files) > 0 {
						type fileDTO struct {
							Name     string  `json:"name"`
							Size     int64   `json:"size"`
							Progress float64 `json:"progress"`
							Priority int     `json:"priority"`
							Index    int     `json:"index"`
						}
						fileList := make([]fileDTO, len(files))
						for i, f := range files {
							progress := 0.0
							if f.Length() > 0 {
								progress = float64(f.BytesCompleted()) / float64(f.Length())
							}
							fileList[i] = fileDTO{
								Name:     f.DisplayPath(),
								Size:     f.Length(),
								Progress: progress,
								Priority: int(f.Priority()),
								Index:    i,
							}
						}
						payload["focusedFiles"] = fileList
					}
				}

				syncData, err := json.Marshal(fiber.Map{
					"type":    "sync",
					"payload": payload,
				})
				if err == nil {
					select {
					case c.send <- syncData:
					default:
						// Hub handles cleanup usually, but we can drop here if slow
					}
				}
			})
		}
	}()

	app.Use(logger.New())

	// WebSocket Endpoint
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		client := &client{
			hub:  hub,
			conn: c,
			send: make(chan []byte, 256),
		}
		hub.register <- client

		go client.writePump()

		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				hub.unregister <- client
				break
			}

			// Handle inbound messages
			var inbound struct {
				Type string `json:"type"`
				Hash string `json:"hash"`
			}
			if err := json.Unmarshal(msg, &inbound); err == nil {
				if inbound.Type == "focus" {
					client.setFocus(inbound.Hash)
				}
			}
		}
	}))

	// --- REST Routes ---

	app.Get("/api/torrents", func(c *fiber.Ctx) error {
		torrents, _ := ts.List(c.Context())
		return c.JSON(torrents)
	})

	app.Get("/api/torrents/focus/:hash", func(c *fiber.Ctx) error {
		hash := c.Params("hash")
		torrents, _ := ts.List(c.Context())
		for _, t := range torrents {
			if t.Hash == hash {
				return c.JSON([]*models.Torrent{t})
			}
		}
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Torrent not found"})
	})

	app.Get("/api/torrents/:hash/files", func(c *fiber.Ctx) error {
		hash := c.Params("hash")
		files, err := ts.GetFiles(hash)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}

		type fileDTO struct {
			Name     string  `json:"name"`
			Size     int64   `json:"size"`
			Progress float64 `json:"progress"`
			Priority int     `json:"priority"`
			Index    int     `json:"index"`
		}
		list := make([]fileDTO, len(files))
		for i, f := range files {
			progress := 0.0
			if f.Length() > 0 {
				progress = float64(f.BytesCompleted()) / float64(f.Length())
			}
			list[i] = fileDTO{
				Name:     f.DisplayPath(),
				Size:     f.Length(),
				Progress: progress,
				Priority: int(f.Priority()),
				Index:    i,
			}
		}
		if list == nil {
			return c.JSON([]interface{}{})
		}
		return c.JSON(list)
	})

	app.Get("/api/torrents/:hash/files/:index/download", func(c *fiber.Ctx) error {
		hash := c.Params("hash")
		index, err := strconv.Atoi(c.Params("index"))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid file index"})
		}

		files, err := ts.GetFiles(hash)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Torrent not found"})
		}

		if index < 0 || index >= len(files) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
		}

		file := files[index]
		prefs := ts.GetPreferences()
		fullPath := filepath.Join(prefs.SavePath, file.Path())
		
		return c.Download(fullPath)
	})

	app.Post("/api/torrents", func(c *fiber.Ctx) error {
		file, err := c.FormFile("torrents")
		if err == nil {
			f, err := file.Open()
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to open file"})
			}
			defer func() {
				_ = f.Close()
			}()

			mi, err := metainfo.Load(f)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid torrent file"})
			}

			t, err := ts.AddTorrent(c.Context(), mi)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}

			return c.Status(fiber.StatusCreated).JSON(fiber.Map{"hash": t.InfoHash().HexString()})
		}

		var body struct {
			URL string `json:"url"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}

		t, err := ts.AddMagnet(c.Context(), body.URL)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"hash": t.InfoHash().HexString()})
	})

	app.Delete("/api/torrents/:hash", func(c *fiber.Ctx) error {
		hash := c.Params("hash")
		deleteFiles := c.Query("deleteFiles") == "true"
		if err := ts.Remove(c.Context(), hash, deleteFiles); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove torrent"})
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	// Torrent Control Actions
	app.Post("/api/torrents/:hash/start", func(c *fiber.Ctx) error {
		if err := ts.Start(c.Context(), c.Params("hash")); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/stop", func(c *fiber.Ctx) error {
		if err := ts.Stop(c.Context(), c.Params("hash")); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/recheck", func(c *fiber.Ctx) error {
		if err := ts.Recheck(c.Context(), c.Params("hash")); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/sequential", func(c *fiber.Ctx) error {
		var body struct {
			Sequential bool `json:"sequential"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}
		if err := ts.SetSequential(c.Params("hash"), body.Sequential); err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/files/priority", func(c *fiber.Ctx) error {
		var body struct {
			Indices  []int `json:"indices"`
			Priority int   `json:"priority"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}
		hash := c.Params("hash")
		for _, idx := range body.Indices {
			if err := ts.SetFilePriority(hash, idx, body.Priority); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
			}
		}
		return c.SendStatus(fiber.StatusOK)
	})

	// Metadata Management
	app.Post("/api/torrents/:hash/metadata", func(c *fiber.Ctx) error {
		var body struct {
			MetadataId string `json:"metadataId"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}
		if err := ts.LinkMetadata(c.Context(), c.Params("hash"), body.MetadataId); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/unmatch", func(c *fiber.Ctx) error {
		if err := ts.Unmatch(c.Context(), c.Params("hash")); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/non-media", func(c *fiber.Ctx) error {
		var body struct {
			IsNonMedia bool `json:"isNonMedia"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}
		if err := ts.SetNonMedia(c.Context(), c.Params("hash"), body.IsNonMedia); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/torrents/:hash/action", func(c *fiber.Ctx) error {
		var body struct {
			Action string      `json:"action"`
			Value  interface{} `json:"value"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}

		hash := c.Params("hash")
		var err error
		switch body.Action {
		case "resume":
			err = ts.Start(c.Context(), hash)
		case "pause":
			err = ts.Stop(c.Context(), hash)
		case "recheck":
			err = ts.Recheck(c.Context(), hash)
		case "toggleSequential":
			// We need current state to toggle, but for now let's just assume we toggle or send value
			val, _ := body.Value.(bool)
			err = ts.SetSequential(hash, val)
		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown action"})
		}

		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.SendStatus(fiber.StatusOK)
	})

	app.Get("/api/metadata/search", func(c *fiber.Ctx) error {
		query := c.Query("query")
		if tmdb == nil || query == "" {
			return c.JSON([]interface{}{})
		}
		candidates, err := tmdb.Search(query, 0, "unknown")
		if err != nil {
			return c.JSON([]interface{}{})
		}
		return c.JSON(candidates)
	})

	app.Get("/api/ingest/libraries", func(c *fiber.Ctx) error {
		if ingest == nil {
			return c.JSON([]string{})
		}
		prefs := ts.GetPreferences()
		entries, err := os.ReadDir(prefs.MediaRoot)
		if err != nil {
			return c.JSON([]string{})
		}
		var libs []string
		for _, e := range entries {
			if e.IsDir() {
				libs = append(libs, e.Name())
			}
		}
		if libs == nil {
			return c.JSON([]string{})
		}
		return c.JSON(libs)
	})

	app.Get("/api/ingest/suggest-paths", func(c *fiber.Ctx) error {
		hash := c.Query("hash")
		showAll := c.Query("showAll") == "true"
		if hash == "" || ingest == nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing hash or ingest service"})
		}

		torrents, _ := ts.List(c.Context())
		var target *models.Torrent
		for _, t := range torrents {
			if t.Hash == hash {
				target = t
				break
			}
		}

		if target == nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Torrent not found"})
		}

		files, err := ts.GetFiles(hash)
		if err != nil {
			// Might be metadata pending
			return c.Status(fiber.StatusAccepted).JSON([]interface{}{})
		}

		type suggestionDTO struct {
			Index         int    `json:"index"`
			OriginalName  string `json:"originalName"`
			SourcePath    string `json:"sourcePath"`
			SuggestedPath string `json:"suggestedPath"`
		}

		var suggestions []suggestionDTO
		title := target.Name
		year := 0
		if target.MediaMetadata != nil {
			title = target.MediaMetadata.Title
			year = target.MediaMetadata.Year
		}

		for i, f := range files {
			// Only suggest paths for files > 5MB to avoid samples/nfo noise, UNLESS showAll is true
			if !showAll && f.Length() < 5*1024*1024 {
				continue
			}

			relPath := f.DisplayPath()
			suggested := ingest.SuggestPath(title, filepath.Base(relPath), year)
			
			suggestions = append(suggestions, suggestionDTO{
				Index:         i,
				OriginalName:  filepath.Base(relPath),
				SourcePath:    relPath,
				SuggestedPath: suggested,
			})
		}

		if suggestions == nil {
			return c.JSON([]interface{}{})
		}
		return c.JSON(suggestions)
	})

	app.Post("/api/ingest", func(c *fiber.Ctx) error {
		if ingest == nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Ingestion service not initialized"})
		}
		var body struct {
			Hash     string            `json:"hash"`
			Library  string            `json:"library"`
			Mapping  map[string]string `json:"mapping"`
			SavePath string            `json:"savePath"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}

		log.Printf("[Ingestion] Start request for %s (mapping count: %d)", body.Hash, len(body.Mapping))

		torrents, _ := ts.List(c.Context())
		var targetName string
		for _, t := range torrents {
			if t.Hash == body.Hash {
				targetName = t.Name
				break
			}
		}

		if targetName == "" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Torrent not found"})
		}

		prefs := ts.GetPreferences()
		absMapping := make(map[string]string)
		for rel, dest := range body.Mapping {
			src := ingest.ResolveSourcePath(targetName, rel, "", body.SavePath)
			log.Printf("[Ingestion] Resolved %s + %s -> %s", body.SavePath, rel, src)
			
			// Ensure destination includes the selected library
			absDest := dest
			if body.Library != "" {
				absDest = filepath.Join(prefs.MediaRoot, body.Library, dest)
			}
			absMapping[src] = absDest
		}

		task := ingest.EnqueueTask(body.Hash, body.SavePath, absMapping)
		return c.Status(fiber.StatusAccepted).JSON(task)
	})

	app.Get("/api/tasks", func(c *fiber.Ctx) error {
		if ingest == nil {
			return c.JSON([]interface{}{})
		}
		return c.JSON(ingest.GetTasks())
	})

	app.Post("/api/tasks/clear", func(c *fiber.Ctx) error {
		if ingest == nil {
			return c.SendStatus(fiber.StatusServiceUnavailable)
		}
		ingest.ClearFinishedTasks()
		return c.SendStatus(fiber.StatusOK)
	})

	app.Get("/api/preferences", func(c *fiber.Ctx) error {
		return c.JSON(ts.GetPreferences())
	})

	app.Post("/api/preferences", func(c *fiber.Ctx) error {
		var body torrent.PartialPreferences
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
		}
		ts.UpdatePreferences(body)
		return c.SendStatus(fiber.StatusOK)
	})

	app.Post("/api/toggle-alt-speeds", func(c *fiber.Ctx) error {
		active := ts.ToggleAltSpeeds()
		return c.JSON(fiber.Map{"enabled": active})
	})

	app.Get("/api/system/explore", func(c *fiber.Ctx) error {
		path := c.Query("path")
		showHidden := c.Query("showHidden") == "true"
		if path == "" {
			path = "/"
		}

		entries, err := os.ReadDir(path)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		type entryDTO struct {
			Name  string `json:"name"`
			Path  string `json:"path"`
			IsDir bool   `json:"isDir"`
		}

		var result []entryDTO
		
		// Add "up" if not at root
		parent := filepath.Dir(filepath.Clean(path))
		if parent != path {
			result = append(result, entryDTO{
				Name:  "..",
				Path:  parent,
				IsDir: true,
			})
		}

		for _, e := range entries {
			// Filter hidden items
			if !showHidden && len(e.Name()) > 0 && e.Name()[0] == '.' {
				continue
			}

			if e.IsDir() {
				result = append(result, entryDTO{
					Name:  e.Name(),
					Path:  filepath.Join(path, e.Name()),
					IsDir: true,
				})
			}
		}

		if result == nil {
			return c.JSON([]interface{}{})
		}
		return c.JSON(result)
	})

	app.Get("/api/state", func(c *fiber.Ctx) error {
		torrents, _ := ts.List(c.Context())
		var totalDl, totalUp int64
		for _, t := range torrents {
			totalDl += t.DownloadSpeed
			totalUp += t.UploadSpeed
		}
		prefs := ts.GetPreferences()
		return c.JSON(fiber.Map{
			"dl_info_speed":        totalDl,
			"up_info_speed":        totalUp,
			"dht_nodes":            ts.GetEngine().DhtNodes(),
			"use_alt_speed_limits": prefs.UseAltSpeedLimits,
			"connection_status":    "connected",
		})
	})

	app.Get("/api/system/storage", func(c *fiber.Ctx) error {
		prefs := ts.GetPreferences()
		locations := map[string]string{
			"Library":   prefs.MediaRoot,
			"Downloads": prefs.SavePath,
		}
		return c.JSON(ss.GetStorageOverview(locations))
	})

	app.Get("/api/config", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"backend":       "soup-go",
			"syncInterval":  2000,
			"tmdbImageBase": "https://image.tmdb.org/t/p/w500",
			"env":           "development",
		})
	})

	// --- Static Frontend Serving ---
	if cfg.WebDistPath != "" {
		fmt.Printf("Serving frontend from: %s\n", cfg.WebDistPath)
		app.Static("/", cfg.WebDistPath)

		// SPA Fallback: Any route that doesn't match API or static files should serve index.html
		app.Get("/*", func(c *fiber.Ctx) error {
			// Skip API routes
			if len(c.Path()) >= 4 && c.Path()[:4] == "/api" {
				return c.Next()
			}
			return c.SendFile(filepath.Join(cfg.WebDistPath, "index.html"))
		})
	} else {
		app.Get("/", func(c *fiber.Ctx) error {
			return c.SendString("Soup-Go Engine is Running (API Only)")
		})
	}

	fmt.Printf("API Bridge ready on port %s\n", port)
	return app.Listen(":" + port)
}
