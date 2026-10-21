package torrent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"reflect"
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
	Interval:      60 * time.Second,
	DeadThreshold: 3,
	ProbeTimeout:  10 * time.Second,
}

// trackerHealthState is the per-torrent watchdog bookkeeping kept in-memory.
type trackerHealthState struct {
	deadStreak      int
	unreachable     bool
	recoveryNudged  bool // re-announce nudge already sent for the current unreachable episode
	lastAnnounceErr string
	// lastResult[announceURL] = last probe classification. Drives the engine
	// freeze: dead URLs are removed from the announce list, live ones restored.
	lastResult map[string]probeResult
	// needFreeze/needRestore are one-shot flags: set under the lock by
	// applyProbeResult and cleared by performProbeActions (which runs the engine
	// op only AFTER the lock is released, since engine calls must not run while
	// the service lock is held).
	needFreeze  bool
	needRestore bool
	// frozen is the persistent "engine is not announcing to the dead tiers" state.
	// Set when we escalate to unreachable, cleared when a live probe recovers the
	// tracker. Drives hadFrozen() so recovery knows to restore the full list.
	frozen bool
}

// probeTier captures the result of probing one announce URL.
type probeTier struct {
	url string
	res probeResult
}

// probeTiers probes every announce URL (in tier order, one per tier) and records
// each result. Unlike the aggregate result, this tells the watchdog EXACTLY which
// URLs are dead so it can drop them from the engine's announce list while leaving
// surviving tiers announcing.
func probeTiers(cfg watchdogConfig, urls []string) []probeTier {
	out := make([]probeTier, 0, len(urls))
	for _, u := range urls {
		out = append(out, probeTier{url: u, res: probeAnnounceURL(cfg, u)})
	}
	return out
}

// aggregateProbeResult folds per-tier results into the escalation signal used to
// decide whether the torrent's announce tiers are all dead.
func aggregateProbeResult(tiers []probeTier) probeResult {
	allDead := true
	for _, p := range tiers {
		switch p.res {
		case probeOK, probeDegraded:
			return p.res
		case probeUnknown:
			allDead = false // a timeout is ambiguous: don't declare all-dead
		}
	}
	if allDead {
		return probeDead
	}
	return probeUnknown
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
		// Probe one URL per tier (first in each tier), in tier order. Per-URL
		// results let the watchdog drop only the dead tiers and detect recovery.
		// applyProbeResult holds+releases s.mu; it returns which engine ops (freeze
		// / restore) to run, which we launch only AFTER the lock is free (no
		// deadlock), before sweeping the next torrent.
		tiers := probeTiers(cfg, urls)
		freeze, restore := s.applyProbeResult(hash, et, tiers)
		s.performProbeActions(hash, et, freeze, restore)
	}
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

// applyProbeResult folds per-URL probe results into the per-torrent health state
// and drives escalation, the immediate "check the tracker" note, and the engine
// freeze (stop announcing to dead trackers) / restore (resume when they come
// back). Per-URL results let us drop only the dead tiers while leaving surviving
// tiers announcing.
func (s *TorrentService) applyProbeResult(hash string, et models.EngineTorrent, tiers []probeTier) (freeze, restore bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name := et.Name()
	h := hash
	st := s.trackerHealth[h]
	if st == nil {
		st = &trackerHealthState{lastResult: map[string]probeResult{}}
		s.trackerHealth[h] = st
	}
	if st.lastResult == nil {
		st.lastResult = map[string]probeResult{}
	}
	// Record each URL's latest classification.
	for _, p := range tiers {
		st.lastResult[p.url] = p.res
	}

	res := aggregateProbeResult(tiers)
	switch res {
	case probeOK, probeDegraded:
		// At least one tracker answered: healthy again. Capture whether we are
		// currently frozen BEFORE clearing the flag, so we can schedule a restore
		// (re-adding the dead tiers we removed) as a one-shot action below.
		wasFrozen := st.frozen
		if st.unreachable {
			st.unreachable = false
			st.recoveryNudged = false
			log.Printf("[Tracker] %s (%s): tracker reachable again — resuming announces", name, h)
		}
		st.deadStreak = 0
		st.frozen = false // clear for the next (re-)dead episode
		st.recoveryNudged = false
		s.clearTrackerErrorLocked(h, "tracker reachable")
		// If we had frozen the engine (dropped dead tiers), restore the full
		// announce list so recovered trackers announce again. performProbeActions
		// runs it after the lock is released (holding s.mu across the engine op
		// serializes it against a concurrent freeze — see that method).
		if wasFrozen {
			st.needRestore = true
			restore = true
		}
	case probeDead:
		st.deadStreak++
		// Surface the trouble immediately on the FIRST all-dead sweep.
		if !st.unreachable {
			s.setTrackerErrorLocked(h, fmt.Sprintf("all announce tiers dead (%d probe) — tracker may be unreachable", st.deadStreak))
		}
		if st.deadStreak >= s.watchdogCfg.DeadThreshold && !st.unreachable {
			st.unreachable = true
			st.frozen = true
			msg := fmt.Sprintf("UNREACHABLE — all announce tiers dead (%d consecutive sweeps). Announcing suspended; re-checking every minute and will resume automatically.", st.deadStreak)
			s.setTrackerErrorLocked(h, msg)
			log.Printf("[Tracker] %s (%s): UNREACHABLE — all announce tiers dead. Stopping announces.", name, h)
			// Freeze the engine (drop dead tiers); run after the lock is released.
			st.needFreeze = true
			freeze = true
		}
	case probeUnknown:
		// Ambiguous (timeouts): neither escalates nor clears.
	}
	return freeze, restore
}

// performProbeActions runs the engine operations that applyProbeResult requested.
// It MUST be called only after s.mu has been released (applyProbeResult uses a
// deferred unlock, so by the time it returns the lock is free). We clear the
// matching pending flag (a brief lock) so the same freeze/restore is not
// re-triggered by a later probe, then launch the engine call in a goroutine.
// The engine calls themselves run outside the service lock (and may briefly take
// the anacrolix client lock internally — independent of s.mu, so no deadlock).
func (s *TorrentService) performProbeActions(h string, et models.EngineTorrent, freeze, restore bool) {
	if !freeze && !restore {
		return
	}
	var st *trackerHealthState
	s.mu.Lock()
	if cur, ok := s.trackerHealth[h]; ok && cur != nil {
		st = cur
		if freeze {
			cur.needFreeze = false
		}
		if restore {
			cur.needRestore = false
		}
	}

	// We already hold s.mu (released by applyProbeResult just before the call). If
	// we unlocked here and then launched freeze/restore as fire-and-forget goroutines,
	// a later tick could immediately queue a *restore* that races the still-pending
	// *freeze* and re-adds the dead tier — cancelling the freeze. Instead we keep the
	// lock held across the engine op (released only at return) so a concurrent
	// applyProbeResult/List blocks until the freeze/restore completes, and the two
	// never interleave. The engine calls themselves (AnnounceList/SetTrackers ->
	// ModifyTrackers) take the anacrolix client lock, a different lock than s.mu, so
	// holding s.mu while they run cannot deadlock. (applyProbeResult never calls back
	// into performProbeActions, so there is no re-entrant s.mu here.)
	defer s.mu.Unlock()
	if st == nil {
		return
	}
	if freeze {
		s.freezeTrackers(h, et, st)
	}
	if restore {
		s.restoreTrackers(h, et)
	}
}

// freezeTrackers stops the engine announcing to dead announce tiers: it replaces
// the torrent's announce list with only the tiers whose latest probe was not
// dead. Best-effort; errors are logged. No-op if there is nothing to drop (which
// is the all-tiers-dead case anyway, handled by the empty keep-list).
func (s *TorrentService) freezeTrackers(h string, et models.EngineTorrent, st *trackerHealthState) {
	live, ok := s.engine.AnnounceList(et.InfoHash())
	if !ok {
		log.Printf("[Tracker] %s: cannot freeze — torrent not in engine", h)
		return
	}
	keep := metainfo.AnnounceList{}
	for _, tier := range live {
		var keptTier []string
		for _, u := range tier {
			if st.lastResult[u] != probeDead {
				keptTier = append(keptTier, u)
			}
		}
		if len(keptTier) > 0 {
			keep = append(keep, keptTier)
		}
	}
	dropped := len(live) > len(keep) || tiersLost(live, keep)
	if !dropped {
		return // nothing to drop; nothing to freeze
	}
	if !s.engine.SetTrackers(et.InfoHash(), keep) {
		log.Printf("[Tracker] %s: failed to freeze trackers (torrent not in engine?)", h)
		return
	}
	log.Printf("[Tracker] %s: froze announces — removed %d dead tracker(s), %d tier(s) remain", h, countDropped(live, keep), len(keep))
}

// restoreTrackers re-applies the torrent's full announce list (from the
// canonical .torrent / metainfo) so trackers we had frozen announce again after
// recovery. Best-effort; no-op if there was nothing frozen or no list to restore.
func (s *TorrentService) restoreTrackers(h string, et models.EngineTorrent) {
	mi, err := s.loadCanonicalMetaInfo(h)
	if err != nil || mi == nil {
		log.Printf("[Tracker] %s: cannot restore — no canonical .torrent to read", h)
		return
	}
	full := mi.UpvertedAnnounceList()
	if len(full) == 0 {
		log.Printf("[Tracker] %s: nothing to restore (empty announce list in canonical)", h)
		return
	}
	if !s.engine.SetTrackers(et.InfoHash(), full) {
		log.Printf("[Tracker] %s: failed to restore trackers (torrent not in engine?)", h)
		return
	}
	log.Printf("[Tracker] %s: restored announces — %d tracker tier(s) re-enabled", h, len(full))
}

// tiersLost reports whether live and keep differ in their set of URLs.
func tiersLost(live, keep metainfo.AnnounceList) bool {
	if len(live) != len(keep) {
		return true
	}
	for _, tier := range live {
		found := false
		for _, k := range keep {
			if reflect.DeepEqual(tier, k) {
				found = true
				break
			}
		}
		if !found {
			return true
		}
	}
	return false
}

// countDropped counts announce URLs present in live but absent from keep.
func countDropped(live, keep metainfo.AnnounceList) int {
	keepSet := map[string]struct{}{}
	for _, tier := range keep {
		for _, u := range tier {
			keepSet[u] = struct{}{}
		}
	}
	n := 0
	for _, tier := range live {
		for _, u := range tier {
			if _, ok := keepSet[u]; !ok {
				n++
			}
		}
	}
	return n
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
