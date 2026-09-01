package ingestion

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
)

type MockRepo struct {
	repository.Repository
}

func (m *MockRepo) SaveTask(ctx context.Context, task *models.IngestionTask) error { return nil }
func (m *MockRepo) GetTask(ctx context.Context, id string) (*models.IngestionTask, error) {
	return nil, nil
}
func (m *MockRepo) GetTasks(ctx context.Context) ([]*models.IngestionTask, error) {
	return []*models.IngestionTask{}, nil
}
func (m *MockRepo) DeleteTask(ctx context.Context, id string) error { return nil }
func (m *MockRepo) DeleteFinishedTasks(ctx context.Context) error   { return nil }
func (m *MockRepo) GetTorrents(ctx context.Context) ([]repository.TorrentRecord, error) {
	return []repository.TorrentRecord{}, nil
}
func (m *MockRepo) SaveTorrent(ctx context.Context, hash, name, savePath, magnet string) error {
	return nil
}
func (m *MockRepo) SetTorrentName(ctx context.Context, hash, name string) error { return nil }

func TestIngestion_EmpiricalCopy(t *testing.T) {
	// 1. Setup temp directories
	tmpDir, _ := os.MkdirTemp("", "soup-ingest-test-*")
	defer os.RemoveAll(tmpDir)

	downloadDir := filepath.Join(tmpDir, "downloads")
	mediaRoot := filepath.Join(tmpDir, "media")
	_ = os.MkdirAll(downloadDir, 0755)
	_ = os.MkdirAll(mediaRoot, 0755)

	// 2. Create a dummy source file
	torrentName := "Sintel"
	fileName := "sintel.mp4"
	absSourceDir := filepath.Join(downloadDir, torrentName)
	_ = os.MkdirAll(absSourceDir, 0755)

	sourceFile := filepath.Join(absSourceDir, fileName)
	content := []byte("fake movie data")
	_ = os.WriteFile(sourceFile, content, 0644)

	// 3. Initialize Service
	repo := &MockRepo{}
	service := NewIngestionService(mediaRoot, repo)

	// 4. Act: Enqueue and process task
	destRelPath := "Movies/Sintel (2010)/Sintel (2010).mp4"
	mapping := map[string]string{
		sourceFile: destRelPath,
	}

	task := service.EnqueueTask("h1", downloadDir, mapping)

	maxWait := 5 * time.Second
	start := time.Now()
	for {
		if time.Since(start) > maxWait {
			t.Fatalf("Timed out waiting for ingestion task")
		}

		if task.Status == models.TaskCompleted {
			break
		}
		if task.Status == models.TaskFailed {
			t.Fatalf("Task failed: %s", task.Error)
		}
		time.Sleep(100 * time.Millisecond)
	}

	// 5. Assert: File actually exists at destination
	absDest := filepath.Join(mediaRoot, destRelPath)
	if _, err := os.Stat(absDest); os.IsNotExist(err) {
		t.Errorf("Expected file to be copied to %s, but it doesn't exist", absDest)
	}

	// 6. Assert: Content matches
	gotContent, _ := os.ReadFile(absDest)
	if string(gotContent) != string(content) {
		t.Errorf("Content mismatch. Expected %s, got %s", string(content), string(gotContent))
	}
}

// ThrottledReader simulates slow reading for speed testing
type ThrottledReader struct {
	r         io.Reader
	bytesPerS int
	lastRead  time.Time
}

func (tr *ThrottledReader) Read(p []byte) (n int, err error) {
	if tr.lastRead.IsZero() {
		tr.lastRead = time.Now()
	}

	n, err = tr.r.Read(p)
	if n > 0 {
		// Calculate sleep time to maintain rate
		expectedDuration := time.Duration(n) * time.Second / time.Duration(tr.bytesPerS)
		actualDuration := time.Since(tr.lastRead)
		if expectedDuration > actualDuration {
			time.Sleep(expectedDuration - actualDuration)
		}
		tr.lastRead = time.Now()
	}
	return
}

func TestIngestion_SpeedCalculation(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "soup-speed-test-*")
	defer os.RemoveAll(tmpDir)

	downloadDir := filepath.Join(tmpDir, "downloads")
	mediaRoot := filepath.Join(tmpDir, "media")
	_ = os.MkdirAll(downloadDir, 0755)
	_ = os.MkdirAll(mediaRoot, 0755)

	// Create a 1MB file
	data := make([]byte, 1024*1024)
	srcFile := filepath.Join(downloadDir, "throttled.dat")
	_ = os.WriteFile(srcFile, data, 0644)

	repo := &MockRepo{}
	service := NewIngestionService(mediaRoot, repo)

	// Since we can't easily inject ThrottledReader into processTask,
	// let's manually call copyReader with it to verify the logic.
	task := &models.IngestionTask{
		ID:     "test-speed",
		Status: models.TaskProcessing,
	}

	completedBytes := int64(0)
	totalBytes := int64(len(data))
	lastUpdate := time.Now()
	lastBytes := int64(0)

	// Throttled to 100KB/s
	throttled := &ThrottledReader{
		r:         bytes.NewReader(data),
		bytesPerS: 100 * 1024,
	}

	dest := filepath.Join(mediaRoot, "throttled.dat")

	// We run copyReader in a goroutine and poll for speed
	done := make(chan error)
	go func() {
		done <- service.copyReader(throttled, dest, &completedBytes, totalBytes, task, &lastUpdate, &lastBytes)
	}()

	var maxSpeed int64
	start := time.Now()
	for time.Since(start) < 5*time.Second {
		speed := task.CurrentSpeed
		if speed > maxSpeed {
			maxSpeed = speed
		}

		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("copyReader failed: %v", err)
			}
			goto check
		default:
			time.Sleep(50 * time.Millisecond)
		}
	}

check:
	if maxSpeed == 0 {
		t.Errorf("Speed calculation failed. maxSpeed was 0")
	} else {
		t.Logf("Detected max throttled speed: %d bytes/s", maxSpeed)
	}
}

func TestSuggestPath(t *testing.T) {
	repo := &MockRepo{}
	service := NewIngestionService("/media", repo)

	tests := []struct {
		title    string
		filename string
		year     int
		expected string
	}{
		{
			"The Office",
			"The.Office.US.S03E01.1080p.mkv",
			0,
			"The Office/Season 03/The Office - S03E01.mkv",
		},
		{
			"The Office",
			"The Office S3E1.mp4",
			0,
			"The Office/Season 03/The Office - S03E01.mp4",
		},
		{
			"Star Wars: Episode IV",
			"Star.Wars.Episode.IV.1977.mkv",
			1977,
			"Star Wars - Episode IV (1977)/Star Wars - Episode IV (1977).mkv",
		},
		{
			"Fight Club",
			"Fight.Club.1999.1080p.BluRay.mkv",
			1999,
			"Fight Club (1999)/Fight Club (1999).mkv",
		},
	}

	for _, tt := range tests {
		result := service.SuggestPath(tt.title, tt.filename, tt.year)
		if result != tt.expected {
			t.Errorf("SuggestPath(%q, %q, %d) = %q; want %q", tt.title, tt.filename, tt.year, result, tt.expected)
		}
	}
}

func TestResolveSourcePath(t *testing.T) {
	repo := &MockRepo{}
	service := NewIngestionService("/media", repo)

	t.Run("Multi-file file directly under content path", func(t *testing.T) {
		result := service.ResolveSourcePath("The.Office", "S01E01.mkv", "/mnt/downloads/The.Office")
		expected := "/mnt/downloads/The.Office/S01E01.mkv"
		if result != expected {
			t.Errorf("Expected %q, got %q", expected, result)
		}
	})

	t.Run("Multi-file with subdirectories", func(t *testing.T) {
		result := service.ResolveSourcePath("The.Office", "Season 1/S01E01.mkv", "/mnt/downloads/The.Office")
		expected := "/mnt/downloads/The.Office/Season 1/S01E01.mkv"
		if result != expected {
			t.Errorf("Expected %q, got %q", expected, result)
		}
	})

	t.Run("Multi-file with internal top folder", func(t *testing.T) {
		// The bencode file list includes a folder; DisplayPath keeps it, and
		// the data really lives under contentPath/folder/... so we must NOT
		// strip it (the old TrimPrefix heuristic got this case wrong).
		result := service.ResolveSourcePath("The.Office", "The.Office/Season 1/S01E01.mkv", "/mnt/downloads/The.Office")
		expected := "/mnt/downloads/The.Office/The.Office/Season 1/S01E01.mkv"
		if result != expected {
			t.Errorf("Expected %q, got %q", expected, result)
		}
	})

	t.Run("Single-file torrent with contentPath", func(t *testing.T) {
		// For single-file torrents, relPath equals torrentName exactly and the
		// file lives at localRoot itself.
		name := "The Curse of Oak Island 2014 S13E22 1080p WEB-DL H264 AC3 SNAKE.mkv"
		result := service.ResolveSourcePath(name, name, "/downloads/"+name)
		expected := "/downloads/" + name
		if result != expected {
			t.Errorf("Expected %q, got %q", expected, result)
		}
	})

	t.Run("Absolute relPath passes through", func(t *testing.T) {
		result := service.ResolveSourcePath("name", "/abs/path/file.mkv", "/local/root")
		if result != "/abs/path/file.mkv" {
			t.Errorf("Expected /abs/path/file.mkv, got %q", result)
		}
	})
}

// waitTask blocks until the task reaches a terminal state.
func waitTask(t *testing.T, task *models.IngestionTask) {
	t.Helper()
	start := time.Now()
	for {
		if time.Since(start) > 5*time.Second {
			t.Fatalf("Timed out waiting for task (status=%s)", task.Status)
		}
		if task.Status == models.TaskCompleted || task.Status == models.TaskFailed {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestIngestion_PartFileFallback(t *testing.T) {
	// The engine stores data at <path>.part until every piece of the file is
	// complete and promoted. Ingestion must find and copy the .part file when
	// the final name does not exist yet.
	tmpDir, _ := os.MkdirTemp("", "soup-part-test-*")
	defer os.RemoveAll(tmpDir)

	downloadDir := filepath.Join(tmpDir, "downloads")
	mediaRoot := filepath.Join(tmpDir, "media")
	_ = os.MkdirAll(downloadDir, 0755)
	_ = os.MkdirAll(mediaRoot, 0755)

	content := []byte("part file data")
	partFile := filepath.Join(downloadDir, "movie.mkv.part")
	_ = os.WriteFile(partFile, content, 0644)

	repo := &MockRepo{}
	service := NewIngestionService(mediaRoot, repo)

	mapping := map[string]string{
		filepath.Join(downloadDir, "movie.mkv"): "Movies/movie.mkv",
	}
	task := service.EnqueueTask("h-part", downloadDir, mapping)
	waitTask(t, task)

	if task.Status != models.TaskCompleted {
		t.Fatalf("Expected task completed, got %s (err=%s)", task.Status, task.Error)
	}
	dest := filepath.Join(mediaRoot, "Movies/movie.mkv")
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("Expected copied file at %s: %v", dest, err)
	}
	if string(got) != string(content) {
		t.Errorf("Content mismatch")
	}
}

func TestIngestion_MissingSource_PartialError(t *testing.T) {
	// One file exists, one does not: the task should still copy what exists
	// but surface the skipped file instead of silently producing a partial result.
	tmpDir, _ := os.MkdirTemp("", "soup-partial-test-*")
	defer os.RemoveAll(tmpDir)

	downloadDir := filepath.Join(tmpDir, "downloads")
	mediaRoot := filepath.Join(tmpDir, "media")
	_ = os.MkdirAll(downloadDir, 0755)
	_ = os.MkdirAll(mediaRoot, 0755)

	_ = os.WriteFile(filepath.Join(downloadDir, "present.mkv"), []byte("data"), 0644)

	repo := &MockRepo{}
	service := NewIngestionService(mediaRoot, repo)

	mapping := map[string]string{
		filepath.Join(downloadDir, "present.mkv"): "present.mkv",
		filepath.Join(downloadDir, "missing.mkv"): "missing.mkv",
	}
	task := service.EnqueueTask("h-partial", downloadDir, mapping)
	waitTask(t, task)

	if task.Status != models.TaskCompleted {
		t.Fatalf("Expected task completed, got %s (err=%s)", task.Status, task.Error)
	}
	if !strings.Contains(task.Error, "missing.mkv") {
		t.Errorf("Expected task.Error to mention missing file, got %q", task.Error)
	}
	if _, err := os.Stat(filepath.Join(mediaRoot, "present.mkv")); err != nil {
		t.Errorf("Expected present.mkv to be copied: %v", err)
	}
}

func TestIngestion_AllMissing_Fails(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "soup-missing-test-*")
	defer os.RemoveAll(tmpDir)

	downloadDir := filepath.Join(tmpDir, "downloads")
	mediaRoot := filepath.Join(tmpDir, "media")
	_ = os.MkdirAll(downloadDir, 0755)
	_ = os.MkdirAll(mediaRoot, 0755)

	repo := &MockRepo{}
	service := NewIngestionService(mediaRoot, repo)

	mapping := map[string]string{
		filepath.Join(downloadDir, "ghost.mkv"): "ghost.mkv",
	}
	task := service.EnqueueTask("h-missing", downloadDir, mapping)
	waitTask(t, task)

	if task.Status != models.TaskFailed {
		t.Fatalf("Expected task failed, got %s", task.Status)
	}
	if !strings.Contains(task.Error, "ghost.mkv") {
		t.Errorf("Expected task.Error to list the missing file, got %q", task.Error)
	}
}
