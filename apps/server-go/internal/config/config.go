package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all application-level configuration.
type Config struct {
	Port         string
	TMDBApiKey   string
	DataDir      string // Where downloads go
	EngineDBPath string // Where .torrent.db goes
	MediaRoot    string // Where library goes
	SyncInterval int
	WebDistPath  string
	IsDocker     bool
}

// Load reads configuration from environment variables and an optional .env file.
func Load() *Config {
	// 1. Overload with .env if it exists
	envPath := os.Getenv("SOUP_ENV")
	if envPath == "" {
		envPath = "../../.env"
	}

	if err := godotenv.Overload(envPath); err == nil {
		fmt.Printf("Loaded configuration from %s\n", envPath)
	}

	webDistPath, inDocker := os.LookupEnv("WEB_DIST_PATH")

	// 2. Determine Port: Prefer DEV_API_PORT, then SOUP_PORT, then fallback
	port := getEnv("DEV_API_PORT", "")
	if port == "" {
		port = getEnv("SOUP_PORT", "3001")
	}

	return &Config{
		Port:         port,
		TMDBApiKey:   getEnv("TMDB_API_KEY", ""),
		DataDir:      getEnv("LOCAL_DOWNLOAD_ROOT", getEnv("DATA_DIR", "./downloads")),
		EngineDBPath: getEnv("DB_PATH", getEnv("ENGINE_DB_PATH", "./soup.db")),
		MediaRoot:    getEnv("MEDIA_ROOT", "./media"),
		SyncInterval: getEnvInt("DEV_SYNC_INTERVAL", 500),
		WebDistPath:  webDistPath,
		IsDocker:     inDocker,
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}
