package models

import (
	"bytes"
	"encoding/json"
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
	FileMap        map[string]string `json:"-"` // source -> destination
	Error          string            `json:"errorMessage,omitempty"`
	Retries        int               `json:"retries"`
	NextRetryAt    time.Time         `json:"nextRetryAt,omitempty"`
	CompletedBytes int64             `json:"completedBytes"`
	TotalBytes     int64             `json:"totalBytes"`
}

// apiTask is the wire format the web UI expects: fileMap serialized as a
// JSON string (legacy TS contract) and the error surfaced as "errorMessage".
type apiTask struct {
	ID             string          `json:"id"`
	TorrentHash    string          `json:"torrentHash"`
	Status         TaskStatus      `json:"status"`
	Progress       int             `json:"progress"`
	CurrentFile    string          `json:"currentFile"`
	CurrentSpeed   int64           `json:"currentSpeed"`
	SavePath       string          `json:"savePath"`
	FileMap        json.RawMessage `json:"fileMap"`
	Error          string          `json:"errorMessage,omitempty"`
	Retries        int             `json:"retries"`
	NextRetryAt    *time.Time      `json:"nextRetryAt,omitempty"`
	CompletedBytes int64           `json:"completedBytes"`
	TotalBytes     int64           `json:"totalBytes"`
}

// MarshalJSON converts the task to the wire format expected by the web UI.
// fileMap is double-encoded: the map is marshaled, then that JSON is encoded
// as a string (legacy TS contract: the UI does JSON.parse(task.fileMap)).
func (t *IngestionTask) MarshalJSON() ([]byte, error) {
	fileMapBytes := []byte(`{}`)
	if t.FileMap != nil {
		b, err := json.Marshal(t.FileMap)
		if err != nil {
			return nil, err
		}
		fileMapBytes = b
	}
	fileMapStr, err := json.Marshal(string(fileMapBytes))
	if err != nil {
		return nil, err
	}
	nrt := t.NextRetryAt
	out := apiTask{
		ID:             t.ID,
		TorrentHash:    t.TorrentHash,
		Status:         t.Status,
		Progress:       t.Progress,
		CurrentFile:    t.CurrentFile,
		CurrentSpeed:   t.CurrentSpeed,
		SavePath:       t.SavePath,
		FileMap:        fileMapStr,
		Error:          t.Error,
		Retries:        t.Retries,
		CompletedBytes: t.CompletedBytes,
		TotalBytes:     t.TotalBytes,
	}
	if !nrt.IsZero() {
		out.NextRetryAt = &nrt
	}
	return json.Marshal(out)
}

// UnmarshalJSON accepts the wire format (fileMap as JSON string or object).
func (t *IngestionTask) UnmarshalJSON(data []byte) error {
	var wt apiTask
	if err := json.Unmarshal(data, &wt); err != nil {
		return err
	}
	t.ID = wt.ID
	t.TorrentHash = wt.TorrentHash
	t.Status = wt.Status
	t.Progress = wt.Progress
	t.CurrentFile = wt.CurrentFile
	t.CurrentSpeed = wt.CurrentSpeed
	t.SavePath = wt.SavePath
	t.Error = wt.Error
	t.Retries = wt.Retries
	t.NextRetryAt = time.Time{}
	if wt.NextRetryAt != nil {
		t.NextRetryAt = *wt.NextRetryAt
	}
	t.CompletedBytes = wt.CompletedBytes
	t.TotalBytes = wt.TotalBytes

	if len(wt.FileMap) > 0 {
		trimmed := bytes.TrimSpace(wt.FileMap)
		if len(trimmed) > 0 && trimmed[0] == '"' {
			// fileMap was a JSON-encoded string containing the map
			var inner string
			if err := json.Unmarshal(wt.FileMap, &inner); err != nil {
				return err
			}
			return json.Unmarshal([]byte(inner), &t.FileMap)
		}
		return json.Unmarshal(wt.FileMap, &t.FileMap)
	}
	return nil
}
