package system

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
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
	s.mu.RLock()
	// Check if we have a fresh identity (less than 14 days old)
	isFresh := !s.current.DetectedAt.IsZero() && time.Since(s.current.DetectedAt) < 14*24*time.Hour
	currentUA := s.current.UserAgent
	s.mu.RUnlock()

	// 1. Initial check on startup (only if not fresh)
	if !isFresh {
		go s.SyncCycle()
	} else {
		log.Printf("[IdentitySync] Identity is fresh (%s old). Using cached spoof: %s", 
			time.Since(s.current.DetectedAt).Round(time.Hour), currentUA)
	}

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
	log.Println("[IdentitySync] Fetching latest qBittorrent version from GitHub...")
	
	target, err := s.FetchLatestVersion()
	if err != nil {
		log.Printf("[IdentitySync] ERROR: Version fetch failed: %v", err)
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

		log.Println("[IdentitySync] Identity updated. Restarting application to apply changes...")
		os.Exit(0)
	} else {
		log.Printf("[IdentitySync] Current identity (%s) is still up to date.", s.current.UserAgent)
	}
}

func (s *IdentityService) FetchLatestVersion() (Identity, error) {
	// 1. Fetch latest release tag from GitHub
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/qbittorrent/qBittorrent/releases/latest")
	if err != nil {
		return Identity{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Identity{}, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return Identity{}, err
	}

	// 2. Parse version (e.g., "release-4.6.3" -> "4.6.3")
	re := regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)`)
	matches := re.FindStringSubmatch(release.TagName)
	if len(matches) != 4 {
		return Identity{}, fmt.Errorf("failed to parse version from tag: %s", release.TagName)
	}

	major := matches[1]
	minor := matches[2]
	patch := matches[3]

	// 3. Construct Identity
	// User-Agent: qBittorrent/4.6.3
	// PeerID: -qB4630- (format: -qB + major + minor + patch + 0 + -)
	ua := fmt.Sprintf("qBittorrent/%s.%s.%s", major, minor, patch)
	prefix := fmt.Sprintf("-qB%s%s%s0-", major, minor, patch)

	return Identity{
		UserAgent:    ua,
		PeerIDPrefix: prefix,
		DetectedAt:   time.Now(),
	}, nil
}
