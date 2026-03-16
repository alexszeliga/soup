package system

import (
	"path/filepath"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"golang.org/x/sys/unix"
)

// StorageService handles filesystem storage queries.
type StorageService struct{}

func NewStorageService() *StorageService {
	return &StorageService{}
}

// GetDiskStats retrieves storage info for a specific directory.
func (s *StorageService) GetDiskStats(label string, dirPath string) (models.DiskStats, error) {
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		absPath = dirPath
	}

	var stat unix.Statfs_t
	err = unix.Statfs(absPath, &stat)
	if err != nil {
		return models.DiskStats{Label: label, Path: absPath}, err
	}

	// bsize is block size, blocks is total blocks, bavail is available to unprivileged users
	total := int64(stat.Bsize) * int64(stat.Blocks)
	free := int64(stat.Bsize) * int64(stat.Bavail)
	used := total - free

	usagePercent := 0.0
	if total > 0 {
		usagePercent = (float64(used) / float64(total)) * 100
	}

	return models.DiskStats{
		Label:        label,
		Path:         absPath,
		Total:        total,
		Free:         free,
		Used:         used,
		UsagePercent: usagePercent,
	}, nil
}

// GetStorageOverview aggregates stats for multiple configured paths.
func (s *StorageService) GetStorageOverview(locations map[string]string) []models.DiskStats {
	var results []models.DiskStats
	for label, path := range locations {
		stats, err := s.GetDiskStats(label, path)
		if err == nil {
			results = append(results, stats)
		} else {
			// Return a placeholder for failed paths to avoid breaking the UI
			results = append(results, models.DiskStats{
				Label: label,
				Path:  path,
			})
		}
	}
	return results
}
