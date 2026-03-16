package models

// DiskStats represents filesystem storage information.
type DiskStats struct {
	Label        string  `json:"label"`
	Path         string  `json:"path"`
	Total        int64   `json:"total"`
	Free         int64   `json:"free"`
	Used         int64   `json:"used"`
	UsagePercent float64 `json:"usagePercent"`
}
