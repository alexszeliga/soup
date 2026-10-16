package torrent

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// makeTestMetaInfo builds a minimal valid metainfo with a single file and a
// single-tier announce list.
func makeTestMetaInfo(t *testing.T, announceURL string, fileContent []byte) *metainfo.MetaInfo {
	t.Helper()
	info := metainfo.Info{
		Name:        "test.bin",
		PieceLength: 16 * 1024,
		Pieces:      make([]byte, 20), // one empty piece
		Length:      int64(len(fileContent)),
	}
	infoBytes, err := bencode.Marshal(&info)
	if err != nil {
		t.Fatalf("marshal info: %v", err)
	}
	return &metainfo.MetaInfo{
		AnnounceList: [][]string{{announceURL}},
		InfoBytes:    infoBytes,
	}
}

// canonicalFileHash returns the real info-hash of a metainfo, matching how the
// engine and the saved-file naming derive it.
func canonicalFileHash(t *testing.T, mi *metainfo.MetaInfo) string {
	t.Helper()
	return mi.HashInfoBytes().String()
}

func TestAddTorrent_ReUploadOverwritesSavedTorrentAndMagnet(t *testing.T) {
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("failed to create in-memory repo: %v", err)
	}
	defer repo.Close()

	tmpDir := t.TempDir()

	// The engine-side torrent reports the real info-hash of the uploaded metainfo.
	hashB := canonicalFileHash(t, makeTestMetaInfo(t, "http://tracker-b.example.com/announce", []byte("data-b")))
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{
		HashStr:     hashB,
		NameStr:     "Test Torrent",
		GotInfoChan: infoChan,
	}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, tmpDir, false)

	miA := makeTestMetaInfo(t, "http://tracker-a.example.com/announce", []byte("data-a"))
	miB := makeTestMetaInfo(t, "http://tracker-b.example.com/announce", []byte("data-b"))

	// 1. Upload the first .torrent (canonical from the tracker).
	if _, err := service.AddTorrent(context.Background(), miA); err != nil {
		t.Fatalf("first AddTorrent failed: %v", err)
	}

	// 2. Re-upload a corrected .torrent for the same info-hash.
	if _, err := service.AddTorrent(context.Background(), miB); err != nil {
		t.Fatalf("second AddTorrent failed: %v", err)
	}

	// 3. The saved canonical .torrent must now decode with tracker B.
	torrentPath := filepath.Join(tmpDir, ".torrents", hashB+".torrent")
	raw, err := os.ReadFile(torrentPath)
	if err != nil {
		t.Fatalf("saved .torrent missing after re-upload: %v", err)
	}
	var saved metainfo.MetaInfo
	if err := bencode.Unmarshal(raw, &saved); err != nil {
		t.Fatalf("saved .torrent does not bdecode: %v", err)
	}
	got := saved.UpvertedAnnounceList().DistinctValues()
	if len(got) != 1 || got[0] != "http://tracker-b.example.com/announce" {
		t.Errorf("saved .torrent announce list = %v, want only [http://tracker-b.example.com/announce]", got)
	}

	// 4. The DB magnet must reference tracker B and not tracker A.
	records, err := repo.GetTorrents(context.Background())
	if err != nil {
		t.Fatalf("GetTorrents failed: %v", err)
	}
	var magnet string
	for _, r := range records {
		if r.Hash == hashB {
			magnet = r.MagnetURI
		}
	}
	if magnet == "" {
		t.Fatalf("no DB record for hash %s", hashB)
	}
	if containsStr(magnet, "tracker-b.example.com") == false {
		t.Errorf("DB magnet missing tracker B: %s", magnet)
	}
	if containsStr(magnet, "tracker-a.example.com") {
		t.Errorf("DB magnet still references dead tracker A: %s", magnet)
	}
}

func TestRestoreState_PrefersSavedFileOverMagnet(t *testing.T) {
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("failed to create in-memory repo: %v", err)
	}
	defer repo.Close()

	tmpDir := t.TempDir()
	ctx := context.Background()
	hash := "0123456789abcdef0123456789abcdef01234567"

	// Persist a torrent whose DB magnet would be used if the saved file were missing.
	_ = repo.SaveTorrent(ctx, hash, "FilePref", "/tmp", "magnet:?xt=urn:btih:"+hash)

	// A saved .torrent exists for this hash, so restore must use the file path.
	torrentDir := filepath.Join(tmpDir, ".torrents")
	if err := os.MkdirAll(torrentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	mi := makeTestMetaInfo(t, "http://tracker.example.com/announce", []byte("x"))
	raw, err := bencode.Marshal(mi)
	if err != nil {
		t.Fatalf("marshal mi: %v", err)
	}
	if err := os.WriteFile(filepath.Join(torrentDir, hash+".torrent"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "FilePref", GotInfoChan: infoChan}
	eng := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(eng, repo, nil, tmpDir, false)

	if err := service.RestoreState(ctx); err != nil {
		t.Fatalf("restore failed: %v", err)
	}

	// Restore must have taken the saved-file (AddTorrent) path, not the magnet path.
	if eng.AddedMagnet != "" {
		t.Errorf("expected restore to use saved .torrent file, but AddMagnet was called with %q", eng.AddedMagnet)
	}
}

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

