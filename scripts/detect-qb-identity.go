package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Identity struct {
	UserAgent    string    `json:"userAgent"`
	PeerIDPrefix string    `json:"peerIdPrefix"`
	DetectedAt   time.Time `json:"detectedAt"`
}

func main() {
	log.Println("Starting Bombproof Identity Verification...")

	// 1. Setup Mock Tracker
	targetIdentityChan := make(chan Identity, 1)
	soupIdentityChan := make(chan Identity, 1)
	
	http.HandleFunc("/announce", func(w http.ResponseWriter, r *http.Request) {
		ua := r.Header.Get("User-Agent")
		peerID := r.URL.Query().Get("peer_id")
		
		log.Printf("[Tracker] Incoming announce: UA=%s, PeerID=%s, Query=%s", ua, peerID, r.URL.RawQuery)

		if ua != "" && peerID != "" {
			prefix := peerID[:8]
			id := Identity{
				UserAgent:    ua,
				PeerIDPrefix: prefix,
				DetectedAt:   time.Now(),
			}
			
			if strings.Contains(r.URL.RawQuery, "soup=true") {
				select {
				case soupIdentityChan <- id:
				default:
				}
			} else {
				select {
				case targetIdentityChan <- id:
				default:
				}
			}
		}
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{Addr: ":9999"}
	go func() {
		_ = srv.ListenAndServe()
	}()
	defer srv.Close()

	// 2. STAGE 1: Detect qBittorrent Target
	tmpDir, _ := os.MkdirTemp("", "qb-detect-*")
	defer os.RemoveAll(tmpDir)
	
	torrentPath := filepath.Join(tmpDir, "detect.torrent")
	trackerURL := "http://172.17.0.1:9999/announce"
	dummyContent := fmt.Sprintf("d8:announce%d:%s4:infod6:lengthi1e4:name6:detect12:piece lengthi16384e6:pieces20:00000000000000000000ee", len(trackerURL), trackerURL)
	_ = os.WriteFile(torrentPath, []byte(dummyContent), 0644)

	log.Println("[Stage 1] Detecting latest qBittorrent identity...")
	containerCmd := fmt.Sprintf("apk add --no-cache qbittorrent-nox && qbittorrent-nox --webui-port=8081 --profile=/config /detect.torrent")
	
	targetCmd := exec.Command("docker", "run", "--rm",
		"-v", torrentPath+":/detect.torrent",
		"alpine:latest", "sh", "-c", containerCmd)
	
	if err := targetCmd.Start(); err != nil {
		log.Fatalf("Failed to start target docker: %v", err)
	}

	var targetId Identity
	select {
	case targetId = <-targetIdentityChan:
		log.Printf("TARGET DETECTED: UA=%s, PeerID=%s", targetId.UserAgent, targetId.PeerIDPrefix)
		_ = exec.Command("docker", "ps", "-q", "--filter", "ancestor=alpine:latest").Run()
	case <-time.After(60 * time.Second):
		log.Fatal("Timeout waiting for Target identity")
	}

	// 3. Prepare spoof.json for Soup-Go
	data, _ := json.MarshalIndent(targetId, "", "  ")
	_ = os.WriteFile("apps/server-go/spoof.json", data, 0644)
	log.Println("Wrote spoof.json to apps/server-go/")

	// 4. STAGE 2: Verify Soup-Go matches
	log.Println("[Stage 2] Verifying Soup-Go identity...")
	
	soupTrackerURL := "http://127.0.0.1:9999/announce?soup=true"
	soupDummyContent := fmt.Sprintf("d8:announce%d:%s4:infod6:lengthi1e4:name11:soup-detect12:piece lengthi16384e6:pieces20:00000000000000000000ee", len(soupTrackerURL), soupTrackerURL)
	soupTorrentPath := filepath.Join(tmpDir, "soup.torrent")
	_ = os.WriteFile(soupTorrentPath, []byte(soupDummyContent), 0644)

	// Create an EMPTY .env in the tmpDir to satisfy the loader without project pollution
	emptyEnv := filepath.Join(tmpDir, "empty.env")
	_ = os.WriteFile(emptyEnv, []byte("TMDB_API_KEY=dummy\n"), 0644)

	soupCmd := exec.Command("go", "run", "main.go")
	soupCmd.Dir = "apps/server-go"
	soupCmd.Stdout = os.Stdout
	soupCmd.Stderr = os.Stderr
	
	soupCmd.Env = []string{
		"PORT=3001",
		"DATA_DIR="+tmpDir,
		"ENGINE_DB_PATH="+filepath.Join(tmpDir, "detect.db"),
		"LOCAL_DOWNLOAD_ROOT="+tmpDir,
		"MEDIA_ROOT="+tmpDir,
		"SOUP_ENV="+emptyEnv, 
		"PATH="+os.Getenv("PATH"),
		"HOME="+os.Getenv("HOME"),
	}
	
	if err := soupCmd.Start(); err != nil {
		log.Fatalf("Failed to start soup-go: %v", err)
	}
	defer func() {
		if soupCmd.Process != nil {
			_ = soupCmd.Process.Kill()
		}
	}()

	var soupId Identity
	select {
	case soupId = <-soupIdentityChan:
		log.Printf("SOUP-GO DETECTED: UA=%s, PeerID=%s", soupId.UserAgent, soupId.PeerIDPrefix)
	case <-time.After(45 * time.Second):
		log.Fatal("Timeout waiting for Soup-Go identity")
	}

	// 5. Final Comparison
	if soupId.UserAgent == targetId.UserAgent && soupId.PeerIDPrefix == targetId.PeerIDPrefix {
		log.Println("BOMBPROOF VERIFICATION SUCCESSFUL!")
		log.Printf("Soup-Go is now perfectly impersonating %s", targetId.UserAgent)
	} else {
		log.Println("VERIFICATION FAILED!")
		log.Printf("Target: UA=%s, PeerID=%s", targetId.UserAgent, targetId.PeerIDPrefix)
		log.Printf("Actual: UA=%s, PeerID=%s", soupId.UserAgent, soupId.PeerIDPrefix)
		os.Exit(1)
	}
}
