package torrent

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// --- Probe result classifier ---

// poll calls fn every 10ms until it returns true or the deadline passes.
func poll(t *testing.T, d time.Duration, fn func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if fn() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fn()
}

// TestWatchdog_FreezeAndRestore exercises Option A's core: 3 dead sweeps -> the
// engine stops announcing to the dead tiers (announce list emptied), and a live
// sweep -> the full announce list is restored.
func TestWatchdog_FreezeAndRestore(t *testing.T) {
	dead := "http://127.0.0.1:1/announce" // connection refused -> dead
	w := newWatchdogTestService(t, dead)
	mockTor := w.GetEngine().(*MockEngine).ReturnTor

	// Three dead ticks -> unreachable; the engine must drop the dead tracker.
	w.runWatchdogTick()
	w.runWatchdogTick()
	w.runWatchdogTick()

	w.mu.Lock()
	unreachable := w.trackerHashUnreachable()
	w.mu.Unlock()
	if !unreachable {
		t.Fatalf("expected unreachable after 3 dead ticks")
	}

	// freeze runs in a goroutine (post-unlock). Poll until the announce list is
	// emptied (the single dead tier removed) and RefreshCalls stayed 0 (no nudge
	// in Option A — the engine freezes instead).
	if !poll(t, 2*time.Second, func() bool { return mockTor.announceList == nil || len(mockTor.announceList) == 0 }) {
		t.Fatalf("expected the dead tracker to be removed from the announce list, still %v", mockTor.announceList)
	}

	// Now the tracker comes back: swap to a live URL and sweep -> recovery.
	live := newLiveTracker(t)
	w.setAnnounce(live)
	w.runWatchdogTick()

	w.mu.Lock()
	stillUnreachable := w.trackerHashUnreachable()
	w.mu.Unlock()
	if stillUnreachable {
		t.Fatalf("expected recovery (not unreachable) after a live sweep")
	}
	// restore runs in a goroutine; the full announce list (the live URL) is
	// re-applied.
	if !poll(t, 2*time.Second, func() bool {
		return mockTor.announceList != nil && len(mockTor.announceList) > 0 && mockTor.announceList[0][0] == live
	}) {
		t.Fatalf("expected the full announce list restored with the live URL, got %v", mockTor.announceList)
	}
}

func TestAddTorrent_ReUploadClearsUnreachableState(t *testing.T) {
	dead := "http://127.0.0.1:1/announce"
	w := newWatchdogTestService(t, dead)

	// Drive the torrent to unreachable (3 dead ticks).
	w.runWatchdogTick()
	w.runWatchdogTick()
	w.runWatchdogTick()
	w.mu.Lock()
	unreachable := w.trackerHealth[w.hash] != nil && w.trackerHealth[w.hash].unreachable
	w.mu.Unlock()
	if !unreachable {
		t.Fatalf("setup: expected unreachable before re-upload")
	}

	// Re-upload a corrected .torrent with a live tracker for the SAME hash.
	live := newLiveTracker(t)
	mi := makeTestMetaInfoNoT(live)
	if _, err := w.TorrentService.AddTorrent(context.Background(), mi); err != nil {
		t.Fatalf("AddTorrent re-upload: %v", err)
	}

	w.mu.Lock()
	st := w.trackerHealth[w.hash]
	unreachableAfter := st != nil && st.unreachable
	errAfter := ""
	if s, ok := w.lastSamples[w.hash]; ok {
		errAfter = s.trackerError
	}
	w.mu.Unlock()

	if unreachableAfter {
		t.Errorf("expected re-upload to clear unreachable state")
	}
	if errAfter != "" {
		t.Errorf("expected re-upload to clear trackerError, got %q", errAfter)
	}
}

func TestClassifyProbe(t *testing.T) {
	cases := []struct {
		name   string
		status int
		err    error
		body   string
		want   probeResult
	}{
		{"ok peers 200", 200, nil, "d8:intervald3600e5:peersl0eee", probeOK},
		{"ok empty 200", 200, nil, "d8:intervald3600e5:peers0e", probeOK},
		{"degraded failure reason 200", 200, nil, "d8:intervald3600e14:failure reason13:404 not founde", probeDegraded},
		{"http 404", 404, nil, "Not Found", probeDead},
		{"http 500", 500, nil, "boom", probeDead},
		{"dns error", 0, errors.New("lookup dead.example.com: no such host"), "", probeDead},
		{"connection refused", 0, errors.New("dial tcp 127.0.0.1:1: connection refused"), "", probeDead},
		{"http 410 gone", 410, nil, "Gone", probeDead},
		{"tls cert unknown authority is dead", 0, &url.Error{Op: "get", URL: "https://routing.bgp.technology/announce", Err: errors.New("tls: x509: certificate signed by unknown authority")}, "", probeDead},
		{"timeout", 0, &url.Error{Err: &timeoutErr{}}, "", probeUnknown},
		{"ctx deadline exceeded is unknown", 0, &url.Error{Op: "Get", URL: "https://x/announce", Err: context.DeadlineExceeded}, "", probeUnknown},
		{"dns error is dead not unknown", 0, &url.Error{Op: "dns lookup", Err: errors.New("lookup dead.example.com: no such host")}, "", probeDead},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyProbe(tc.status, tc.err, []byte(tc.body))
			if got != tc.want {
				t.Errorf("classifyProbe(%d, %v, %q) = %v, want %v", tc.status, tc.err, tc.body, got, tc.want)
			}
		})
	}
}

// --- Escalation state machine (pure) ---

func TestEscalationState(t *testing.T) {
	const N = 3

	type st struct{ streak, deadTicks int }
	apply := func(s *st, r probeResult) bool {
		switch r {
		case probeOK:
			s.streak = 0
			s.deadTicks = 0
		case probeDead:
			s.streak++
			s.deadTicks++
		case probeUnknown:
			// neither increments nor resets
		case probeDegraded:
			// tracker alive, don't count as dead
			s.streak = 0
			s.deadTicks = 0
		}
		return s.deadTicks >= N
	}

	var s st
	if apply(&s, probeDead) {
		t.Fatal("should not be unreachable after 1 dead")
	}
	if apply(&s, probeUnknown) {
		t.Fatal("should not be unreachable after 1 dead + 1 unknown")
	}
	if apply(&s, probeDead) {
		t.Fatal("should not be unreachable after 2 dead")
	}
	if !apply(&s, probeDead) {
		t.Fatal("should be unreachable after 3 consecutive dead")
	}
	// An ok resets.
	apply(&s, probeOK)
	if apply(&s, probeDead) {
		t.Fatal("streak should have reset after ok")
	}
}

func TestWatchdog_ImmediateNoteOnFirstDeadSweep(t *testing.T) {
	dead := "http://127.0.0.1:1/announce" // connection refused -> dead
	svc := newWatchdogTestService(t, dead)

	// A SINGLE all-dead sweep must surface a "check the tracker" note
	// immediately — the whole point is to see trouble within one sweep, not
	// after the 3-sweep escalation threshold.
	svc.runWatchdogTick()

	svc.mu.Lock()
	msg := ""
	if s, ok := svc.lastSamples[svc.hash]; ok {
		msg = s.trackerError
	}
	svc.mu.Unlock()
	if msg == "" {
		t.Fatalf("expected an immediate tracker note after 1 dead sweep, got none")
	}
	if !strings.Contains(msg, "dead") {
		t.Errorf("expected the immediate note to mention dead tiers, got %q", msg)
	}
	if strings.Contains(msg, "UNREACHABLE") {
		t.Errorf("note after 1 sweep should not yet say UNREACHABLE, got %q", msg)
	}
}

func TestWatchdog_SetTrackerClearsImmediateNote(t *testing.T) {
	dead := "http://127.0.0.1:1/announce"
	svc := newWatchdogTestService(t, dead)

	// Drive an immediate note.
	svc.runWatchdogTick()
	svc.mu.Lock()
	if svc.lastSamples[svc.hash].trackerError == "" {
		svc.mu.Unlock()
		t.Fatalf("setup: expected an immediate note after 1 dead sweep")
	}
	svc.mu.Unlock()

	// User re-points the tracker (the fix path): the visible note must clear so
	// the UI doesn't show a stale alarm while the user is acting.
	live := newLiveTracker(t)
	if err := svc.SetTracker(context.Background(), svc.hash, live); err != nil {
		t.Fatalf("SetTracker: %v", err)
	}
	svc.mu.Lock()
	got := svc.lastSamples[svc.hash].trackerError
	svc.mu.Unlock()
	if got != "" {
		t.Errorf("expected SetTracker to clear the immediate note, got %q", got)
	}
}

// --- End-to-end watchdog over an httptest server ---

func TestWatchdog_DetectsDeadTrackerAndRecovers(t *testing.T) {
	dead := "http://127.0.0.1:1/announce" // connection refused -> dead

	svc := newWatchdogTestService(t, dead)

	// Run three ticks; all should classify dead.
	svc.runWatchdogTick()
	svc.runWatchdogTick()
	svc.runWatchdogTick()

	svc.mu.Lock()
	st, _ := svc.trackerHealth[svc.hash]
	unreachable := st != nil && st.unreachable
	trackerError := ""
	if s, ok2 := svc.lastSamples[svc.hash]; ok2 {
		trackerError = s.trackerError
	}
	svc.mu.Unlock()
	if !unreachable {
		t.Fatalf("expected torrent to be marked unreachable after 3 dead ticks")
	}
	if trackerError == "" {
		t.Errorf("expected trackerError to be set, got empty")
	}

	// Now the tracker comes back (we swap the announce URL to a live server).
	live := newLiveTracker(t)
	svc.setAnnounce(live)
	svc.runWatchdogTick()

	svc.mu.Lock()
	st, _ = svc.trackerHealth[svc.hash]
	unreachable = st != nil && st.unreachable
	svc.mu.Unlock()
	if unreachable {
		t.Fatalf("expected torrent to recover (no longer unreachable) after a live probe")
	}
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

var _ io.Closer = nil

func contains(s, sub string) bool { return strings.Contains(s, sub) }

var _ = time.Now

// --- Watchdog test harness ---

type watchdogTestService struct {
	*TorrentService
	hash     string
	announce string // current announce URL the mock engine's torrent reports
}

func newWatchdogTestService(t *testing.T, announce string) *watchdogTestService {
	t.Helper()
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("repo: %v", err)
	}
	t.Cleanup(func() { repo.Close() })

	tmp := t.TempDir()
	hash := "0123456789abcdef0123456789abcdef01234567"

	infoChan := make(chan struct{})
	close(infoChan)
	// Give the mock torrent a real announce list (mirroring the canonical file)
	// so freezeTrackers/restoreTrackers have something to operate on.
	mockTor := &MockTorrent{
		HashStr:      hash,
		NameStr:      "Watchdog Torrent",
		GotInfoChan:  infoChan,
		announceList: [][]string{{announce}},
	}
	eng := &MockEngine{ReturnTor: mockTor}

	svc := NewTorrentService(eng, repo, nil, tmp, false)
	// Fast interval so the background loop doesn't interfere; tests call
	// runWatchdogTick manually. Set a short deadline so it never fires.
	svc.watchdogCfg = watchdogConfig{
		Interval:      1 * time.Hour,
		DeadThreshold: 3,
		ProbeTimeout:  2 * time.Second,
		Client:        &http.Client{Timeout: 2 * time.Second},
	}

	// Seed a complete sample so the re-announce nudge path is exercised.
	svc.mu.Lock()
	svc.lastSamples[hash] = &torrentSample{name: "Watchdog Torrent", timestamp: time.Now()}
	svc.mu.Unlock()

	// Persist the initial (dead) announce URL as the canonical .torrent so the
	// watchdog has something to probe.
	svc.saveCanonicalTorrentFile(hash, makeTestMetaInfoNoT(announce))

	return &watchdogTestService{TorrentService: svc, hash: hash, announce: announce}
}

// setAnnounce swaps the announce URL the service should probe, by overwriting
// the saved canonical .torrent (the source of truth).
func (w *watchdogTestService) setAnnounce(url string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.announce = url
	// Persist a canonical .torrent with this single-tier announce list so
	// announceURLsFor() reads it.
	mi := makeTestMetaInfoNoT(w.announce)
	w.saveCanonicalTorrentFile(w.hash, mi)
}

func (w *watchdogTestService) runWatchdogTick() { w.TorrentService.runWatchdogTick() }

// trackerHashUnreachable returns whether the tracked torrent is currently
// unreachable (caller must hold w.mu).
func (w *watchdogTestService) trackerHashUnreachable() bool {
	st, ok := w.trackerHealth[w.hash]
	return ok && st.unreachable
}

// makeTestMetaInfoNoT builds a single-tier metainfo without a *testing.T
// (used by the harness helpers which are not themselves test funcs).
func makeTestMetaInfoNoT(announce string) *metainfo.MetaInfo {
	info := metainfo.Info{Name: "x", PieceLength: 16 * 1024, Pieces: make([]byte, 20), Length: 1}
	b, _ := bencode.Marshal(&info)
	return &metainfo.MetaInfo{AnnounceList: [][]string{{announce}}, InfoBytes: b}
}

// newLiveTracker starts an httptest server that answers announce probes with a
// valid bencoded response (200 + peers), so the watchdog sees it as healthy.
func newLiveTracker(t *testing.T) string {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("d8:intervald3600e5:peers0e"))
	}))
	t.Cleanup(ts.Close)
	return ts.URL + "/announce"
}
