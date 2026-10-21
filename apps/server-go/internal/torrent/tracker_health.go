package torrent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/anacrolix/torrent/metainfo"
)

// probeResult classifies a single announce-URL probe.
type probeResult int

const (
	probeUnknown  probeResult = iota // timeout / transient — neither counts nor resets
	probeOK                          // tracker returned a usable announce response
	probeDegraded                    // tracker alive but returned an error reason (e.g. 400 "no such torrent")
	probeDead                        // tracker host/path is gone (404/5xx/DNS/refused)
)

// watchdogConfig controls cadence and thresholds. Exported fields so tests can
// shorten the interval without touching production values.
type watchdogConfig struct {
	// Interval between full sweeps over all torrents.
	Interval time.Duration
	// Consecutive all-tiers-dead probes required before a torrent is flagged
	// unreachable.
	DeadThreshold int
	// Per-probe HTTP timeout.
	ProbeTimeout time.Duration
	// HTTP client (tests inject an httptest-scoped client).
	Client *http.Client
	// PeerID used as the User-Agent so trackers see our real identity.
	PeerID string
}

var defaultWatchdogCfg = watchdogConfig{
	Interval:      15 * time.Minute,
	DeadThreshold: 3,
	ProbeTimeout:  10 * time.Second,
}

// trackerHealthState is the per-torrent watchdog bookkeeping kept in-memory.
type trackerHealthState struct {
	deadStreak      int
	unreachable     bool
	recoveryNudged  bool // re-announce nudge already sent for the current unreachable episode
	lastAnnounceErr string
}

// announceURLsFor resolves the announce URLs for a torrent: prefer the saved
// canonical .torrent (source of truth), fall back to the DB magnet.
func (s *TorrentService) announceURLsFor(hash string) []string {
	// 1. Saved canonical file.
	mi, err := s.loadCanonicalMetaInfo(hash)
	if err == nil && mi != nil {
		if urls := mi.UpvertedAnnounceList().DistinctValues(); len(urls) > 0 {
			return urls
		}
		if mi.Announce != "" {
			return []string{mi.Announce}
		}
	}
	// 2. DB magnet fallback.
	if rec, err := s.repo.GetTorrent(context.Background(), hash); err == nil && rec != nil {
		if urls := trackersFromMagnet(rec.MagnetURI); len(urls) > 0 {
			return urls
		}
	}
	return nil
}

// loadCanonicalMetaInfo reads and decodes the saved .torrent file for a hash.
func (s *TorrentService) loadCanonicalMetaInfo(hash string) (*metainfo.MetaInfo, error) {
	return metainfo.LoadFromFile(s.canonicalTorrentPath(hash))
}

// runWatchdogTick performs one sweep over all engine torrents, probing each
// torrent's announce URLs and updating per-torrent health state. Exported for
// tests; the background loop calls it every cfg.Interval.
func (s *TorrentService) runWatchdogTick() {
	cfg := s.watchdogCfg
	for _, et := range s.engine.Torrents() {
		hash := et.InfoHash().HexString()
		urls := s.announceURLsFor(hash)
		if len(urls) == 0 {
			continue // no trackers to probe
		}
		// Probe one URL per tier (first in each tier), in tier order; stop early
		// on the first healthy response.
		res := probeAnnounceList(cfg, urls)
		s.applyProbeResult(hash, et, res)
	}
}

// probeAnnounceList probes each announce URL once and returns the aggregate
// result: OK if any URL is healthy (OK or degraded, i.e. the host answered),
// DEAD if every URL is dead, UNKNOWN if all were unknown (timeouts).
func probeAnnounceList(cfg watchdogConfig, urls []string) probeResult {
	allDead := true
	sawUnknown := false
	for _, u := range urls {
		r := probeAnnounceURL(cfg, u)
		switch r {
		case probeOK, probeDegraded:
			return r // a live tracker -> healthy
		case probeDead:
			// keep probing; only dead if ALL are dead
		case probeUnknown:
			sawUnknown = true
		}
	}
	if allDead && !sawUnknown {
		return probeDead
	}
	// Mix of dead + unknown, or all unknown: treat as unknown (don't escalate).
	return probeUnknown
}

// probeAnnounceURL performs a single GET against an announce URL with
// event=stopped&compact=1 and classifies the response.
func probeAnnounceURL(cfg watchdogConfig, raw string) probeResult {
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: cfg.ProbeTimeout}
	}
	q := url.Values{}
	q.Set("event", "stopped")
	q.Set("compact", "1")
	reqURL := raw
	if idx := strings.IndexByte(raw, '?'); idx >= 0 {
		reqURL = raw[:idx] + "?" + raw[idx+1:] + "&" + q.Encode()
	} else {
		reqURL = raw + "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, reqURL, nil)
	if err != nil {
		return probeUnknown
	}
	if cfg.PeerID != "" {
		req.Header.Set("User-Agent", cfg.PeerID)
	}
	resp, err := client.Do(req)
	if err != nil {
		return classifyProbe(0, err, nil)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	return classifyProbe(resp.StatusCode, nil, body)
}

// classifyProbe turns an HTTP response (or error) into a probeResult.
//
//  - 200 with a bencoded "failure reason": the tracker answered but the torrent
//    is unknown to it (degraded) — the tracker itself is healthy.
//  - 2xx/3xx otherwise: OK.
//  - 4xx/5xx (e.g. 404 path gone, 5xx server error): dead — the tracker (or the
//    release's announce path) is genuinely unreachable.
//  - transport connection errors (DNS failure, connection refused, RST): dead.
//  - a real timeout: unknown — ambiguous (slow network vs. dead), so it neither
//    escalates nor clears a streak.
//
// Only *genuine* timeouts are "unknown"; a TLS/cert or DNS error is a connection
// failure and is "dead", so it escalates and the UI can say "check the tracker".
func classifyProbe(status int, err error, body []byte) probeResult {
	if err != nil {
		if isTimeout(err) {
			return probeUnknown
		}
		return probeDead
	}
	switch {
	case status == http.StatusOK:
		if strings.Contains(string(body), "failure reason") {
			return probeDegraded
		}
		return probeOK
	case status >= 400:
		return probeDead
	default:
		// 2xx/3xx that isn't 200: treat as alive.
		return probeOK
	}
}

// isTimeout reports whether err is (or wraps) a real timeout error. Only the
// *url.Error case is checked: Go's net package wraps every transport error in a
// *url.Error whose Timeout() is true exactly for deadline/timeouts (and false for
// DNS failures, connection refused, TLS cert errors, etc. — those are "dead").
func isTimeout(err error) bool {
	var uerr *url.Error
	return errors.As(err, &uerr) && uerr.Timeout()
}

// applyProbeResult folds a probe result into the per-torrent health state and
// drives escalation / recovery / re-announce nudging.
func (s *TorrentService) applyProbeResult(hash string, et models.EngineTorrent, res probeResult) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name := et.Name()
	h := hash
	switch res {
	case probeOK:
		if st, ok := s.trackerHealth[h]; ok {
			st.deadStreak = 0
			st.unreachable = false
			st.recoveryNudged = false
		}
		s.clearTrackerErrorLocked(h, "tracker reachable again")
	case probeDegraded:
		// Tracker alive; not a health failure.
		if st, ok := s.trackerHealth[h]; ok {
			st.deadStreak = 0
			st.unreachable = false
			st.recoveryNudged = false
		}
		s.clearTrackerErrorLocked(h, "tracker reachable")
	case probeDead:
		st := s.trackerHealth[h]
		if st == nil {
			st = &trackerHealthState{}
			s.trackerHealth[h] = st
		}
		st.deadStreak++
		// Surface the trouble immediately, on the FIRST all-dead sweep, so the
		// user sees "check the tracker" within one sweep interval rather than
		// waiting for the escalation threshold. A live probe (OK/degraded) on a
		// later sweep clears this.
		if !st.unreachable {
			s.setTrackerErrorLocked(h, fmt.Sprintf("all announce tiers dead (%d probe) — tracker may be unreachable", st.deadStreak))
		}
		if st.deadStreak >= s.watchdogCfg.DeadThreshold && !st.unreachable {
			st.unreachable = true
			msg := fmt.Sprintf("UNREACHABLE — all announce tiers dead (%d consecutive sweeps). Re-upload the .torrent from the tracker to fix.", st.deadStreak)
			s.setTrackerErrorLocked(h, msg)
			log.Printf("[Tracker] %s (%s): UNREACHABLE — all announce tiers dead. Re-upload the .torrent from the tracker to fix.", name, h)
			// One re-announce nudge for complete torrents (see step 4).
			if isComplete(et) && !st.recoveryNudged {
				st.recoveryNudged = true
				go s.nudgeReAnnounce(h)
			}
		}
	case probeUnknown:
		// Neither increments nor resets the streak.
	}
}

// nudgeReAnnounce re-adds the torrent's current metainfo via AddTorrentSpec,
// which merges trackers and re-ticks the announcers. Best-effort; errors are
// logged only.
// SetTracker replaces the announce list for a torrent with a single tracker URL,
// updating the engine (re-announce nudge), the saved canonical .torrent, and the
// DB magnet, and clearing any accumulated tracker-error state. Used by the manual
// API when the user fixes a tracker in the UI.
//
// The new URL takes over the first tier; additional tiers are dropped because we
// cannot preserve them without the original metainfo. If the torrent has no
// canonical file yet, this is a no-op for the file but still updates engine + DB.
func (s *TorrentService) SetTracker(ctx context.Context, hash, trackerURL string) error {
	trackerURL = strings.TrimSpace(trackerURL)
	if trackerURL == "" {
		return fmt.Errorf("tracker URL is empty")
	}
	if _, err := url.ParseRequestURI(trackerURL); err != nil {
		return fmt.Errorf("invalid tracker URL: %w", err)
	}

	// Build the new metainfo: prefer the saved canonical file (preserves name/
	// pieces), fall back to the engine's live metainfo for this hash.
	var mi *metainfo.MetaInfo
	if saved, err := s.loadCanonicalMetaInfo(hash); err == nil && saved != nil {
		cp := *saved
		mi = &cp
	} else {
		for _, et := range s.engine.Torrents() {
			if et.InfoHash().HexString() == hash {
				live := et.Metainfo()
				cp := live
				mi = &cp
				break
			}
		}
	}
	if mi == nil {
		return fmt.Errorf("no metainfo available for %s", hash)
	}

	mi.Announce = trackerURL
	mi.AnnounceList = [][]string{{trackerURL}}

	// 1. Nudge the engine (merge trackers / re-tick announcers).
	if err := s.engine.RefreshTorrent(mi); err != nil {
		return fmt.Errorf("refresh engine: %w", err)
	}

	// 2. Persist the canonical file (only if we had a real metainfo to save).
	s.saveCanonicalTorrentFile(hash, mi)

	// 3. Update the DB magnet.
	magnet := mi.Magnet(nil, nil).String() + "&tr=" + url.QueryEscape(trackerURL)
	rec, err := s.repo.GetTorrent(ctx, hash)
	name, savePath := "", ""
	if err == nil && rec != nil {
		name = rec.Name
		savePath = rec.SavePath
	}
	if name == "" {
		name = hash
	}
	if err := s.repo.SaveTorrent(ctx, hash, name, savePath, magnet); err != nil {
		return fmt.Errorf("save torrent: %w", err)
	}

	// 4. Clear tracker-error state (the user fixed it; re-evaluate from scratch).
	s.mu.Lock()
	if st, ok := s.trackerHealth[hash]; ok {
		st.deadStreak = 0
		st.unreachable = false
		st.recoveryNudged = false
	}
	if sample, ok := s.lastSamples[hash]; ok {
		sample.trackerError = ""
		sample.trackerErrorAt = time.Time{}
	}
	s.mu.Unlock()

	log.Printf("[Tracker] %s: tracker manually set to %s", hash, trackerURL)
	return nil
}

func (s *TorrentService) nudgeReAnnounce(hash string) {
	mi, err := s.loadCanonicalMetaInfo(hash)
	if err != nil || mi == nil {
		log.Printf("[Tracker] re-announce nudge for %s skipped: no canonical metainfo (%v)", hash, err)
		return
	}
	if err := s.engine.RefreshTorrent(mi); err != nil {
		log.Printf("[Tracker] re-announce nudge for %s failed: %v", hash, err)
	} else {
		log.Printf("[Tracker] re-announce nudge sent for %s", hash)
	}
}

func (s *TorrentService) setTrackerErrorLocked(h, msg string) {
	sample, ok := s.lastSamples[h]
	if !ok {
		sample = &torrentSample{timestamp: time.Now()}
		s.lastSamples[h] = sample
	}
	sample.trackerError = msg
	sample.trackerErrorAt = time.Now()
}

func (s *TorrentService) clearTrackerErrorLocked(h, reason string) {
	sample, ok := s.lastSamples[h]
	if !ok {
		return
	}
	if sample.trackerError != "" {
		log.Printf("[Tracker] %s (%s): healthy again (%s)", sample.name, h, reason)
	}
	sample.trackerError = ""
	sample.trackerErrorAt = time.Time{}
}

// startWatchdog launches the background tracker-health sweep loop.
func (s *TorrentService) startWatchdog() {
	go func() {
		ticker := time.NewTicker(s.watchdogCfg.Interval)
		defer ticker.Stop()
		for range ticker.C {
			s.runWatchdogTick()
		}
	}()
}

// isComplete reports whether the engine torrent has all its data.
func isComplete(et models.EngineTorrent) bool {
	return et.Length() > 0 && et.BytesCompleted() >= et.Length()
}

// trackersFromMagnet extracts announce URLs from a magnet URI's &tr= params.
func trackersFromMagnet(magnet string) []string {
	if magnet == "" {
		return nil
	}
	q := strings.TrimPrefix(magnet, "magnet:?")
	var urls []string
	// crude but robust: split on & and look for tr=
	for _, part := range strings.Split(q, "&") {
		if strings.HasPrefix(part, "tr=") {
			if u, err := url.QueryUnescape(strings.TrimPrefix(part, "tr=")); err == nil && u != "" {
				urls = append(urls, u)
			}
		}
	}
	return urls
}
