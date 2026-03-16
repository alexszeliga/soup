package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear relevant env vars
	os.Unsetenv("DEV_API_PORT")
	os.Unsetenv("SOUP_PORT")
	os.Unsetenv("TMDB_API_KEY")
	os.Unsetenv("LOCAL_DOWNLOAD_ROOT")
	os.Unsetenv("DB_PATH")
	os.Unsetenv("MEDIA_ROOT")
	os.Setenv("SOUP_ENV", "/non-existent") // Prevent loading project .env

	cfg := Load()

	if cfg.Port != "3001" {
		t.Errorf("Expected default port 3001, got %s", cfg.Port)
	}
	if cfg.DataDir != "./downloads" {
		t.Errorf("Expected default DataDir ./downloads, got %s", cfg.DataDir)
	}
	if cfg.EngineDBPath != "./soup.db" {
		t.Errorf("Expected default EngineDBPath ./soup.db, got %s", cfg.EngineDBPath)
	}
}

func TestLoad_PortFallbacks(t *testing.T) {
	os.Setenv("SOUP_ENV", "/non-existent")

	// 1. Test SOUP_PORT
	os.Setenv("SOUP_PORT", "4000")
	cfg := Load()
	if cfg.Port != "4000" {
		t.Errorf("Expected port 4000 from SOUP_PORT, got %s", cfg.Port)
	}

	// 2. Test DEV_API_PORT (priority)
	os.Setenv("DEV_API_PORT", "5000")
	cfg = Load()
	if cfg.Port != "5000" {
		t.Errorf("Expected port 5000 from DEV_API_PORT, got %s", cfg.Port)
	}

	// Cleanup
	os.Unsetenv("SOUP_PORT")
	os.Unsetenv("DEV_API_PORT")
}

func TestLoad_EnvOverrides(t *testing.T) {
	os.Setenv("SOUP_ENV", "/non-existent")
	os.Setenv("TMDB_API_KEY", "test-key")
	os.Setenv("LOCAL_DOWNLOAD_ROOT", "/tmp/downloads")
	os.Setenv("DB_PATH", "/tmp/test.db")
	os.Setenv("MEDIA_ROOT", "/tmp/media")

	cfg := Load()

	if cfg.TMDBApiKey != "test-key" {
		t.Errorf("Expected TMDBApiKey test-key, got %s", cfg.TMDBApiKey)
	}
	if cfg.DataDir != "/tmp/downloads" {
		t.Errorf("Expected DataDir /tmp/downloads, got %s", cfg.DataDir)
	}
	if cfg.EngineDBPath != "/tmp/test.db" {
		t.Errorf("Expected EngineDBPath /tmp/test.db, got %s", cfg.EngineDBPath)
	}
	if cfg.MediaRoot != "/tmp/media" {
		t.Errorf("Expected MediaRoot /tmp/media, got %s", cfg.MediaRoot)
	}

	// Cleanup
	os.Unsetenv("TMDB_API_KEY")
	os.Unsetenv("LOCAL_DOWNLOAD_ROOT")
	os.Unsetenv("DB_PATH")
	os.Unsetenv("MEDIA_ROOT")
}
