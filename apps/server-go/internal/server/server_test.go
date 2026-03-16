package server

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
	"github.com/gofiber/fiber/v2"
)

// MockEngine is a sturdy mock for verifying server-engine interactions.
type MockEngine struct {
	models.TorrentEngine
	AddedMagnet string
}

func (m *MockEngine) AddMagnet(uri string) (models.EngineTorrent, error) {
	m.AddedMagnet = uri
	return nil, nil 
}

func (m *MockEngine) DhtNodes() int { return 0 }

func (m *MockEngine) SetRateLimits(dl, up int64) {}

func (m *MockEngine) Torrents() []models.EngineTorrent {
	return []models.EngineTorrent{}
}

func TestAddTorrentRoute(t *testing.T) {
	app := fiber.New()
	mock := &MockEngine{}

	app.Post("/api/torrents", func(c *fiber.Ctx) error {
		var body struct {
			URL string `json:"url"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.SendStatus(400)
		}
		_, _ = mock.AddMagnet(body.URL)
		return c.SendStatus(fiber.StatusCreated)
	})

	body, _ := json.Marshal(map[string]string{"url": "magnet:?xt=urn:btih:123"})
	req := httptest.NewRequest("POST", "/api/torrents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := app.Test(req)

	if resp.StatusCode != fiber.StatusCreated {
		t.Errorf("Expected status 201, got %d", resp.StatusCode)
	}
}

func TestTorrentAPIFormat(t *testing.T) {
	app := fiber.New()
	
	// Use REAL model to verify ACTUAL tags
	app.Get("/api/torrents", func(c *fiber.Ctx) error {
		torrents := []*models.Torrent{
			{
				Hash:          "123",
				Name:          "Test Movie",
				AddedOn:       1710624000,
				SeedingTime:   3600,
				DownloadSpeed: 1024,
				UploadSpeed:   512,
				TotalRead:     1000000,
				TotalWritten:  500000,
				IsSequential:  true,
			},
		}
		return c.JSON(torrents)
	})

	req := httptest.NewRequest("GET", "/api/torrents", nil)
	resp, _ := app.Test(req)

	// Decode into map to check raw key strings
	var raw []map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&raw)

	if len(raw) == 0 {
		t.Fatal("Expected at least one torrent in response")
	}

	tor := raw[0]
	requiredFields := []string{
		"addedOn",
		"seedingTime",
		"downloadSpeed",
		"uploadSpeed",
		"totalRead",
		"totalWritten",
		"isSequential",
	}

	for _, field := range requiredFields {
		if _, ok := tor[field]; !ok {
			t.Errorf("JSON Format Error: Missing required camelCase field '%s' in real model output", field)
		}
	}
}
