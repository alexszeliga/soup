package models

import "testing"

// TestIsComplete follows the Soup TDD standard.
// In Go, tests MUST start with 'Test' and take '*testing.T' as an argument.
func TestIsComplete(t *testing.T) {
	// 1. Arrange (Setup)
	// We're creating a struct. This will fail because 'Torrent' doesn't exist yet!
	torrent := &Torrent{
		Progress: 1.0,
	}

	// 2. Act
	result := torrent.IsComplete()

	// 3. Assert
	if result != true {
		t.Errorf("Expected IsComplete() to be true for progress 1.0, got %v", result)
	}

	// Test incomplete
	torrent.Progress = 0.5
	if torrent.IsComplete() != false {
		t.Errorf("Expected IsComplete() to be false for progress 0.5, got %v", torrent.IsComplete())
	}
}
