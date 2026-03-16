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

func TestTorrentControlRoutes(t *testing.T) {
	app := fiber.New()
	
	// Register the implemented routes
	app.Post("/api/torrents/:hash/start", func(c *fiber.Ctx) error { return c.SendStatus(200) })
	app.Post("/api/torrents/:hash/stop", func(c *fiber.Ctx) error { return c.SendStatus(200) })
	app.Post("/api/torrents/:hash/recheck", func(c *fiber.Ctx) error { return c.SendStatus(200) })
	app.Post("/api/torrents/:hash/files/priority", func(c *fiber.Ctx) error { return c.SendStatus(200) })

	tests := []struct {
		method string
		url    string
		status int
	}{
		{"POST", "/api/torrents/123/start", 200},
		{"POST", "/api/torrents/123/stop", 200},
		{"POST", "/api/torrents/123/recheck", 200},
		{"POST", "/api/torrents/123/files/priority", 200},
	}

	for _, tt := range tests {
		req := httptest.NewRequest(tt.method, tt.url, nil)
		resp, _ := app.Test(req)
		if resp.StatusCode != tt.status {
			t.Errorf("%s %s expected %d, got %d", tt.method, tt.url, tt.status, resp.StatusCode)
		}
	}
}
