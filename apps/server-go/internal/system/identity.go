package system

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type Identity struct {
	UserAgent    string    `json:"userAgent"`
	PeerIDPrefix string    `json:"peerIdPrefix"`
	DetectedAt   time.Time `json:"detectedAt"`
}

type IdentityService struct {
	spoofFilePath string
	current       Identity
	mu            sync.RWMutex
}

func NewIdentityService(spoofFilePath string) *IdentityService {
	s := &IdentityService{
		spoofFilePath: spoofFilePath,
	}
	s.loadLocal()
	return s
}

func (s *IdentityService) loadLocal() {
	data, err := os.ReadFile(s.spoofFilePath)
	if err == nil {
		_ = json.Unmarshal(data, &s.current)
	}
}

func (s *IdentityService) GetCurrent() Identity {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// StartAutoSync runs the discovery loop.
func (s *IdentityService) StartAutoSync(ctx context.Context) {
	// 1. Initial check on startup
	go s.SyncCycle()

	// 2. Ticker for every 14 days
	ticker := time.NewTicker(14 * 24 * time.Hour)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.SyncCycle()
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func (s *IdentityService) SyncCycle() {
	log.Println("[IdentitySync] Starting automated spoof discovery cycle...")
	
	target, err := s.DetectTarget()
	if err != nil {
		log.Printf("[IdentitySync] ERROR: Discovery failed: %v", err)
		return
	}

	s.mu.RLock()
	changed := target.UserAgent != s.current.UserAgent || target.PeerIDPrefix != s.current.PeerIDPrefix
	s.mu.RUnlock()
if changed {
	log.Printf("[IdentitySync] CRITICAL: New qBittorrent identity detected! Target: %s", target.UserAgent)

	data, _ := json.MarshalIndent(target, "", "  ")
	if err := os.WriteFile(s.spoofFilePath, data, 0644); err != nil {
		log.Printf("[IdentitySync] Failed to save spoof.json: %v", err)
		return
	}

	log.Println("[IdentitySync] identity updated. Restarting application to apply changes...")
	// The bombproof way: exit and let Docker restart us
	os.Exit(0)
} else {
	log.Printf("[IdentitySync] Current identity (%s) is still up to date.", s.current.UserAgent)
}
}


func (s *IdentityService) DetectTarget() (Identity, error) {
	// Setup Mock Tracker
	identityChan := make(chan Identity, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/announce", func(w http.ResponseWriter, r *http.Request) {
		ua := r.Header.Get("User-Agent")
		peerID := r.URL.Query().Get("peer_id")
		if ua != "" && peerID != "" {
			select {
			case identityChan <- Identity{
				UserAgent:    ua,
				PeerIDPrefix: peerID[:8],
				DetectedAt:   time.Now(),
			}:
			default:
			}
		}
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{Addr: ":9998", Handler: mux}
	go srv.ListenAndServe()
	defer srv.Close()

	// Prepare dummy torrent
	tmpDir, _ := os.MkdirTemp("", "soup-sync-*")
	defer os.RemoveAll(tmpDir)
	
	torrentPath := filepath.Join(tmpDir, "detect.torrent")
	// Use 172.17.0.1 (default Docker bridge) to reach host
	trackerURL := "http://172.17.0.1:9998/announce"
	dummyContent := fmt.Sprintf("d8:announce%d:%s4:infod6:lengthi1e4:name6:detect12:piece lengthi16384e6:pieces20:00000000000000000000ee", len(trackerURL), trackerURL)
	_ = os.WriteFile(torrentPath, []byte(dummyContent), 0644)

	// Run Container
	containerName := "soup-identity-probe"
	// Kill any existing probe first
	_ = exec.Command("docker", "rm", "-f", containerName).Run()

	containerCmd := "apk add --no-cache qbittorrent-nox && qbittorrent-nox --webui-port=8081 --profile=/config /detect.torrent"
	cmd := exec.Command("docker", "run", "--rm",
		"--name", containerName,
		"-v", torrentPath+":/detect.torrent",
		"alpine:latest", "sh", "-c", containerCmd)
	
	if err := cmd.Start(); err != nil {
		return Identity{}, fmt.Errorf("docker start failed: %w (ensure /var/run/docker.sock is mounted)", err)
	}

	select {
	case id := <-identityChan:
		// Success! Kill it immediately
		_ = exec.Command("docker", "rm", "-f", containerName).Run()
		return id, nil
	case <-time.After(60 * time.Second):
		// Cleanup potentially hung container
		_ = exec.Command("docker", "rm", "-f", containerName).Run()
		return Identity{}, fmt.Errorf("detection timed out")
	}
}
