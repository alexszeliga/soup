package ingestion

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/alexszeliga/soup/apps/server-go/internal/repository"
)

// IngestionService handles media-standard path suggestions and file operations.
type IngestionService struct {
	MediaRoot  string
	RemoteRoot string // Path prefix from engine to strip
	Tasks      []*models.IngestionTask
	repo       repository.Repository
	mu         sync.RWMutex
}

func NewIngestionService(mediaRoot string, repo repository.Repository) *IngestionService {
	return &IngestionService{
		MediaRoot: mediaRoot,
		repo:      repo,
		Tasks:     make([]*models.IngestionTask, 0),
	}
}

// RestoreState loads persisted tasks from the repository.
func (s *IngestionService) RestoreState(ctx context.Context) error {
	tasks, err := s.repo.GetTasks(ctx)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, t := range tasks {
		// If a task was left in 'processing' or 'queued', it effectively failed on restart
		if t.Status == models.TaskProcessing || t.Status == models.TaskQueued {
			t.Status = models.TaskFailed
			t.Error = "Task interrupted by server restart"
			_ = s.repo.SaveTask(ctx, t)
		}
		s.Tasks = append(s.Tasks, t)
	}

	return nil
}

// SuggestPath suggests a Jellyfin-compatible path for a file.
func (s *IngestionService) SuggestPath(title string, filename string, year int) string {
	ext := filepath.Ext(filename)
	cleanTitle := s.sanitizeTitle(title)
	titleWithYear := cleanTitle
	if year > 0 {
		titleWithYear = fmt.Sprintf("%s (%d)", cleanTitle, year)
	}

	// 1. TV Show Pattern (S01E01, etc)
	tvPatterns := []string{
		`(?i)S(\d{1,2})E(\d{1,2})`,
		`(?i)(\d{1,2})x(\d{1,2})`,
	}

	for _, p := range tvPatterns {
		re := regexp.MustCompile(p)
		match := re.FindStringSubmatch(filename)
		if match != nil {
			season := fmt.Sprintf("%02s", match[1])
			episode := fmt.Sprintf("%02s", match[2])
			return filepath.Join(
				titleWithYear,
				fmt.Sprintf("Season %s", season),
				fmt.Sprintf("%s - S%sE%s%s", titleWithYear, season, episode, ext),
			)
		}
	}

	// 2. Movie Pattern
	return filepath.Join(titleWithYear, titleWithYear+ext)
}

func (s *IngestionService) sanitizeTitle(title string) string {
	r := strings.NewReplacer(":", " -")
	title = r.Replace(title)
	// Remove other illegal characters
	re := regexp.MustCompile(`[\\*?"<>|]`)
	return strings.TrimSpace(re.ReplaceAllString(title, ""))
}

// MapRemoteToLocalPath maps a "remote" path (as reported by the engine) to a local filesystem path.
func (s *IngestionService) MapRemoteToLocalPath(remotePath, remoteRoot, localRoot string) string {
	if remoteRoot != "" && strings.HasPrefix(remotePath, remoteRoot) {
		rel := strings.TrimPrefix(remotePath, remoteRoot)
		return filepath.Join(localRoot, rel)
	}
	return remotePath
}

// ResolveSourcePath resolves the absolute source path for a file in a torrent.
func (s *IngestionService) ResolveSourcePath(torrentName, relPath, remoteRoot, localRoot string) string {
	// 1. If relPath is already absolute, use it
	if filepath.IsAbs(relPath) {
		return filepath.Clean(relPath)
	}

	// 2. Join localRoot (Save Path) with relPath
	abs := filepath.Join(localRoot, relPath)
	
	// 3. Strip remoteRoot if it was absolute from the engine
	if remoteRoot != "" && strings.HasPrefix(abs, remoteRoot) {
		rel := strings.TrimPrefix(abs, remoteRoot)
		abs = filepath.Join(localRoot, rel)
	}

	return filepath.Clean(abs)
}

// EnqueueTask adds a new copy task to the service.
func (s *IngestionService) EnqueueTask(torrentHash string, savePath string, fileMap map[string]string) *models.IngestionTask {
	s.mu.Lock()
	defer s.mu.Unlock()

	task := &models.IngestionTask{
		ID:          fmt.Sprintf("copy-%s-%d", torrentHash, time.Now().Unix()),
		TorrentHash: torrentHash,
		Status:      models.TaskQueued,
		SavePath:    savePath,
		FileMap:     fileMap,
		Retries:     0,
	}

	s.Tasks = append(s.Tasks, task)
	_ = s.repo.SaveTask(context.Background(), task)

	go s.processTask(task)

	return task
}

func (s *IngestionService) GetTasks() []*models.IngestionTask {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a deep copy (snapshot) to prevent data races during JSON marshaling
	snapshot := make([]*models.IngestionTask, len(s.Tasks))
	for i, t := range s.Tasks {
		// Create a new struct copy
		taskCopy := *t
		snapshot[i] = &taskCopy
	}
	return snapshot
}

func (s *IngestionService) ClearFinishedTasks() {
	s.mu.Lock()
	defer s.mu.Unlock()

	var remaining []*models.IngestionTask
	for _, t := range s.Tasks {
		if t.Status == models.TaskQueued || t.Status == models.TaskProcessing {
			remaining = append(remaining, t)
		}
	}
	s.Tasks = remaining
	
	// Clear from persistent storage as well
	_ = s.repo.DeleteFinishedTasks(context.Background())
}

func (s *IngestionService) processTask(task *models.IngestionTask) {
	s.updateStatus(task, models.TaskProcessing)

	// Calculate total bytes
	var totalBytes int64
	resolvedMap := make(map[string]string)

	for absSrc, relDest := range task.FileMap {
		absDest := relDest
		if !filepath.IsAbs(absDest) {
			absDest = filepath.Join(s.MediaRoot, absDest)
		}

		log.Printf("[Ingestion] Checking source: %s", absSrc)
		info, err := os.Stat(absSrc)
		if err == nil {
			log.Printf("[Ingestion] Source found! Size: %d", info.Size())
			totalBytes += info.Size()
			resolvedMap[absSrc] = absDest
		} else {
			log.Printf("[Ingestion] Source NOT found at %s: %v", absSrc, err)
		}
	}

	if len(resolvedMap) == 0 {
		s.mu.Lock()
		task.Error = "No valid source files found"
		s.mu.Unlock()
		s.updateStatus(task, models.TaskFailed)
		return
	}

	s.mu.Lock()
	task.TotalBytes = totalBytes
	s.mu.Unlock()

	var completedBytes int64
	lastUpdate := time.Now()
	lastBytes := int64(0)

	for src, dest := range resolvedMap {
		s.mu.Lock()
		task.CurrentFile = filepath.Base(src)
		s.mu.Unlock()

		log.Printf("[Ingestion] Copying %s to %s", src, dest)

		sourceFile, err := os.Open(src)
		if err != nil {
			s.mu.Lock()
			task.Error = err.Error()
			s.mu.Unlock()
			s.updateStatus(task, models.TaskFailed)
			return
		}

		if err := s.copyReader(sourceFile, dest, &completedBytes, totalBytes, task, &lastUpdate, &lastBytes); err != nil {
			log.Printf("[Ingestion] Copy failed: %v", err)
			_ = sourceFile.Close()
			s.mu.Lock()
			task.Error = err.Error()
			s.mu.Unlock()
			s.updateStatus(task, models.TaskFailed)
			return
		}
		_ = sourceFile.Close()
	}

	s.updateStatus(task, models.TaskCompleted)
}

func (s *IngestionService) copyReader(source io.Reader, dest string, completedBytes *int64, totalBytes int64, task *models.IngestionTask, lastUpdate *time.Time, lastBytes *int64) error {
	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return err
	}

	destFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer func() {
		_ = destFile.Close()
	}()

	// High-performance copy with progress tracking
	buf := make([]byte, 128*1024) // 128KB buffer for more granularity
	alpha := 0.3

	for {
		n, err := source.Read(buf)
		if n > 0 {
			if _, wErr := destFile.Write(buf[:n]); wErr != nil {
				return wErr
			}
			*completedBytes += int64(n)
			
			now := time.Now()
			duration := now.Sub(*lastUpdate).Seconds()
			
			if duration >= 0.01 { // High-frequency updates (10ms)
				newProgress := 0
				if totalBytes > 0 {
					newProgress = int((*completedBytes * 100) / totalBytes)
				}
				bytesDiff := *completedBytes - *lastBytes
				instSpeed := float64(bytesDiff) / duration

				s.mu.Lock()
				task.Progress = newProgress
				task.CompletedBytes = *completedBytes
				task.CurrentSpeed = int64((alpha * instSpeed) + ((1 - alpha) * float64(task.CurrentSpeed)))
				s.mu.Unlock()

				_ = s.repo.SaveTask(context.Background(), task)
				*lastUpdate = now
				*lastBytes = *completedBytes
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	// Final speed calculation for this file if it was fast
	now := time.Now()
	duration := now.Sub(*lastUpdate).Seconds()
	if duration > 0.01 { // At least 10ms
		bytesDiff := *completedBytes - *lastBytes
		instSpeed := float64(bytesDiff) / duration
		s.mu.Lock()
		task.CurrentSpeed = int64((alpha * instSpeed) + ((1 - alpha) * float64(task.CurrentSpeed)))
		s.mu.Unlock()
	}

	// Ensure progress is 100% for this file's portion of the task
	s.mu.Lock()
	if totalBytes > 0 {
		task.Progress = int((*completedBytes * 100) / totalBytes)
	}
	task.CompletedBytes = *completedBytes
	s.mu.Unlock()

	return nil
}

func (s *IngestionService) updateStatus(task *models.IngestionTask, status models.TaskStatus) {
	s.mu.Lock()
	task.Status = status
	if status == models.TaskCompleted {
		task.Progress = 100
		task.CurrentSpeed = 0
	}
	s.mu.Unlock()

	_ = s.repo.SaveTask(context.Background(), task)
}
