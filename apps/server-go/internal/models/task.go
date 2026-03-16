package models

import (
	"time"
)

// TaskStatus represents the current state of a background task.
type TaskStatus string

const (
	TaskQueued     TaskStatus = "queued"
	TaskProcessing TaskStatus = "processing"
	TaskCompleted  TaskStatus = "completed"
	TaskFailed     TaskStatus = "failed"
)

// IngestionTask represents a unit of work for moving or copying files.
type IngestionTask struct {
	ID             string            `json:"id"`
	TorrentHash    string            `json:"torrentHash"`
	Status         TaskStatus        `json:"status"`
	Progress       int               `json:"progress"`
	CurrentFile    string            `json:"currentFile"`
	CurrentSpeed   int64             `json:"currentSpeed"` // bytes/sec
	SavePath       string            `json:"savePath"`
	FileMap        map[string]string `json:"fileMap"` // source (rel) -> destination (rel to lib)
	Error          string            `json:"error,omitempty"`
	Retries        int               `json:"retries"`
	NextRetryAt    time.Time         `json:"nextRetryAt,omitempty"`
	CompletedBytes int64             `json:"completedBytes"`
	TotalBytes     int64             `json:"totalBytes"`
}
