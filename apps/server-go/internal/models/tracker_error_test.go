package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestTorrent_TrackerErrorOmittedWhenHealthy(t *testing.T) {
	d := Torrent{
		Hash:       "aabbcc",
		Name:     "Healthy",
	}
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	s := string(b)
	if contains(s, "TrackerError") || contains(s, "tracker_error") {
		t.Errorf("healthy DTO should omit TrackerError, got %s", s)
	}
}

func TestTorrent_TrackerErrorPresentWhenFailing(t *testing.T) {
	at := time.Unix(1700000000, 0)
	d := Torrent{
		Hash:           "aabbcc",
		Name:           "Failing",
		TrackerError:   "404 from dead-tracker.example.com",
		TrackerErrorAt: at,
	}
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !contains(string(b), "404 from dead-tracker.example.com") {
		t.Errorf("failing DTO should carry TrackerError text, got %s", string(b))
	}
}

func contains(s, sub string) bool {
	if len(s) < len(sub) {
		return false
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
