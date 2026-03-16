package torrent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
)

// --- Mocks ---

type MockFile struct {
	models.EngineFile
	Name string
}

func (m *MockFile) DisplayPath() string { return m.Name }
func (m *MockFile) Length() int64      { return 100 }
func (m *MockFile) BytesCompleted() int64 { return 100 }
func (m *MockFile) Priority() int      { return 1 }
func (m *MockFile) SetPriority(p int)  {}

type MockTorrent struct {
	models.EngineTorrent
	HashStr               string // 40-char hex
	NameStr               string
	AllowDownloadCalled   bool
	DisallowDownloadCalled bool
	VerifyDataCalled      bool
	DownloadAllCalled     bool
	GotInfoChan           chan struct{}
	mu                    sync.Mutex
}

func (m *MockTorrent) GotInfo() <-chan struct{} {
	return m.GotInfoChan
}

func (m *MockTorrent) HasInfo() bool {
	select {
	case <-m.GotInfoChan:
		return true
	default:
		return false
	}
}
func (m *MockTorrent) DownloadAll()  { m.mu.Lock(); defer m.mu.Unlock(); m.DownloadAllCalled = true }
func (m *MockTorrent) Drop()         {}
func (m *MockTorrent) Name() string  { return m.NameStr }
func (m *MockTorrent) Length() int64 { return 1000 }
func (m *MockTorrent) BytesCompleted() int64 { return 1000 }
func (m *MockTorrent) InfoHash() metainfo.Hash {
	h := metainfo.NewHashFromHex(m.HashStr)
	return h
}
func (m *MockTorrent) Files() []models.EngineFile {
	return []models.EngineFile{&MockFile{Name: "test.mkv"}}
}

func (m *MockTorrent) Stats() torrent.TorrentStats {
	return torrent.TorrentStats{}
}

func (m *MockTorrent) NumPieces() int { return 1 }

// Satisfy expanded control methods
func (m *MockTorrent) AllowDataDownload()    { m.mu.Lock(); defer m.mu.Unlock(); m.AllowDownloadCalled = true }
func (m *MockTorrent) DisallowDataDownload() { m.mu.Lock(); defer m.mu.Unlock(); m.DisallowDownloadCalled = true }
func (m *MockTorrent) AllowDataUpload()      {}
func (m *MockTorrent) DisallowDataUpload()   {}
func (m *MockTorrent) VerifyData() error     { m.mu.Lock(); defer m.mu.Unlock(); m.VerifyDataCalled = true; return nil }
func (m *MockTorrent) CancelPieces(s, e int) {}
func (m *MockTorrent) SetSequential(b bool)  {}

type MockEngine struct {
	models.TorrentEngine
	AddedMagnet   string
	AddedSavePath string
	ReturnTor     *MockTorrent
}

func (m *MockEngine) AddMagnet(uri string, savePath string) (models.EngineTorrent, error) {
	m.AddedMagnet = uri
	m.AddedSavePath = savePath
	return m.ReturnTor, nil
}

func (m *MockEngine) AddTorrent(mi *metainfo.MetaInfo, savePath string) (models.EngineTorrent, error) {
	m.AddedSavePath = savePath
	return m.ReturnTor, nil
}

func (m *MockEngine) Torrents() []models.EngineTorrent {
	if m.ReturnTor == nil {
		return nil
	}
	return []models.EngineTorrent{m.ReturnTor}
}

func (m *MockEngine) DhtNodes() int { return 0 }

func (m *MockEngine) SetRateLimits(dl, up int64) {}
func (m *MockEngine) SetDht(enabled bool)        {}
func (m *MockEngine) SetPex(enabled bool)        {}

// --- Tests ---

func TestTorrentService_DelayedMetadata(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	gotInfoChan := make(chan struct{})
	mockTor := &MockTorrent{
		HashStr:     hash,
		GotInfoChan: gotInfoChan,
	}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	// Set short timeout for testing
	originalTimeout := MetadataWaitTimeout
	MetadataWaitTimeout = 50 * time.Millisecond
	defer func() { MetadataWaitTimeout = originalTimeout }()

	// 1. Trigger AddMagnet
	_, _ = service.AddMagnet(context.Background(), "magnet:?xt=urn:btih:"+hash)

	// 2. Wait longer than the timeout
	time.Sleep(100 * time.Millisecond)
	
	mockTor.mu.Lock()
	if mockTor.DownloadAllCalled {
		mockTor.mu.Unlock()
		t.Fatal("DownloadAll called before metadata was ready")
	}
	mockTor.mu.Unlock()

	// 3. Signal metadata ready AFTER timeout
	close(gotInfoChan)

	// 4. Verify DownloadAll is eventually called (it should be, if we fix the bug)
	time.Sleep(100 * time.Millisecond)
	mockTor.mu.Lock()
	if !mockTor.DownloadAllCalled {
		mockTor.mu.Unlock()
		t.Fatal("DownloadAll was NOT called after metadata became ready (delayed beyond timeout)")
	}
	mockTor.mu.Unlock()
}

func TestTorrentService_Lifecycle(t *testing.T) {
	repo, err := repository.NewSqliteRepository(":memory:")
	if err != nil {
		t.Fatalf("failed to create in-memory repo: %v", err)
	}
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	torrent := &MockTorrent{
		HashStr:     hash,
		NameStr:     "Test Torrent",
		GotInfoChan: infoChan,
	}
	engine := &MockEngine{ReturnTor: torrent}
	service := NewTorrentService(engine, repo, nil, "/tmp/downloads", false)

	magnet := "magnet:?xt=urn:btih:" + hash
	_, err = service.AddMagnet(context.Background(), magnet)
	if err != nil {
		t.Fatalf("failed to add magnet: %v", err)
	}

	time.Sleep(150 * time.Millisecond)
}

func TestTorrentService_RestoreState(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	hash := "0123456789abcdef0123456789abcdef01234567"
	_ = repo.SaveTorrent(ctx, hash, "RestoreTest", "/tmp", "magnet1")

	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "RestoreTest", GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	if err := service.RestoreState(ctx); err != nil {
		t.Fatalf("restore failed: %v", err)
	}
}

func TestTorrentService_RestoreStateWithCustomPath(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	ctx := context.Background()
	hash := "0123456789abcdef0123456789abcdef01234567"
	customPath := "/mnt/data/torrents"
	
	// Use MigrateTorrent to set all fields including custom savePath
	_ = repo.MigrateTorrent(ctx, hash, "PathTest", customPath, "magnet1", 0, 0, 0, 0)

	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: "PathTest", GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	if err := service.RestoreState(ctx); err != nil {
		t.Fatalf("restore failed: %v", err)
	}

	if engine.AddedSavePath != customPath {
		t.Errorf("Expected engine to receive custom savePath %s, got %s", customPath, engine.AddedSavePath)
	}
}

func TestTorrentService_SpeedCalculation(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	service.mu.Lock()
	service.lastSamples[hash] = &torrentSample{
		bytesRead: 1000,
		timestamp: time.Now().Add(-1 * time.Second),
		emaDl:     0,
	}
	service.mu.Unlock()

	list, err := service.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(list) != 1 {
		t.Fatalf("expected 1 torrent, got %d", len(list))
	}
}

func TestTorrentService_Control(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	ctx := context.Background()
	
	_ = service.Start(ctx, hash)
	if !mockTor.AllowDownloadCalled {
		t.Error("Start() did not call AllowDataDownload")
	}

	_ = service.Recheck(ctx, hash)
	if !mockTor.VerifyDataCalled {
		t.Error("Recheck() did not call VerifyData")
	}
}

func TestTorrentService_FilePriority(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)

	err := service.SetFilePriority(hash, 0, 7)
	if err != nil {
		t.Fatalf("SetFilePriority failed: %v", err)
	}
}

func TestTorrentService_DTOIntegrity(t *testing.T) {
	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	hash := "0123456789abcdef0123456789abcdef01234567"
	ctx := context.Background()
	
	// Mock a migrated torrent with stats
	_ = repo.SaveTorrent(ctx, hash, "Migrated Movie", "/tmp", "magnet:...")
	_ = repo.UpdateTorrentStats(ctx, hash, 1000, 2000, 3600)

	mockTor := &MockTorrent{HashStr: hash, NameStr: "Migrated Movie"}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, "/tmp", false)
	_ = service.RestoreState(ctx)

	list, _ := service.List(ctx)
	if len(list) == 0 {
		t.Fatal("Expected 1 torrent")
	}

	tor := list[0]
	
	// Marshall to JSON to verify tags
	data, _ := json.Marshal(tor)
	jsonStr := string(data)

	// Check for critical snake_case keys expected by SyncEngine.ts
	expectedKeys := []string{
		"\"dlspeed\":",
		"\"upspeed\":",
		"\"added_on\":",
		"\"seeding_time\":",
		"\"ratio\":",
		"\"total_read\":",
		"\"total_written\":",
		"\"content_path\":",
	}

	for _, key := range expectedKeys {
		if !strings.Contains(jsonStr, key) {
			t.Errorf("JSON missing critical key %s: %s", key, jsonStr)
		}
	}

	if tor.Ratio != 2.0 {
		t.Errorf("Expected ratio 2.0, got %f", tor.Ratio)
	}
}

func TestTorrentService_RemoveWithFiles(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "soup-test-*")
	defer os.RemoveAll(tmpDir)

	os.Setenv("LOCAL_DOWNLOAD_ROOT", tmpDir)
	defer os.Unsetenv("LOCAL_DOWNLOAD_ROOT")

	repo, _ := repository.NewSqliteRepository(":memory:")
	defer repo.Close()

	torrentName := "test-delete-me"
	torrentPath := filepath.Join(tmpDir, torrentName)
	_ = os.MkdirAll(torrentPath, 0755)
	
	dummyFile := filepath.Join(torrentPath, "data.txt")
	_ = os.WriteFile(dummyFile, []byte("hello"), 0644)

	hash := "0123456789abcdef0123456789abcdef01234567"
	infoChan := make(chan struct{})
	close(infoChan)
	mockTor := &MockTorrent{HashStr: hash, NameStr: torrentName, GotInfoChan: infoChan}
	engine := &MockEngine{ReturnTor: mockTor}
	service := NewTorrentService(engine, repo, nil, tmpDir, false)

	err := service.Remove(context.Background(), hash, true)
	if err != nil {
		t.Fatalf("Remove failed: %v", err)
	}

	if _, err := os.Stat(torrentPath); !os.IsNotExist(err) {
		t.Errorf("Expected file at %s to be deleted, but it still exists", torrentPath)
	}
}
