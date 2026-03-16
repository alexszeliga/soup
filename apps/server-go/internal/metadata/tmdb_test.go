package metadata

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTMDBProvider_Search(t *testing.T) {
	// 1. Setup Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/search/multi" {
			resp := TMDBSearchResponse{
				Results: []TMDBResult{
					{
						ID:         1,
						Name:       "The Office",
						MediaType:  "tv",
						Popularity: 500,
					},
					{
						ID:         2,
						Title:      "Obscure Movie",
						MediaType:  "movie",
						Popularity: 10,
					},
				},
			}
			_ = json.NewEncoder(w).Encode(resp)
		}
	}))
	defer ts.Close()

	// 2. Initialize Provider
	p := NewTMDBProvider("fake-key")
	p.BaseURL = ts.URL

	// 3. Act
	results, err := p.Search("The Office", 0, "tv")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	// 4. Assert
	if len(results) == 0 {
		t.Fatal("Expected results, got none")
	}
	if results[0].ID != "tmdb-tv-1" {
		t.Errorf("Expected first result to be tmdb-tv-1, got %s", results[0].ID)
	}
}

func TestTMDBProvider_Ranking(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := TMDBSearchResponse{
			Results: []TMDBResult{
				{
					ID:         100,
					Title:      "Popular Movie with Office in name",
					MediaType:  "movie",
					Popularity: 1000,
				},
				{
					ID:         200,
					Name:       "The Office",
					MediaType:  "tv",
					Popularity: 500,
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	p := NewTMDBProvider("fake-key")
	p.BaseURL = ts.URL

	// "The Office" should win because it is an exact title match
	results, _ := p.Search("The Office", 0, "")
	if results[0].ID != "tmdb-tv-200" {
		t.Errorf("Ranking failed. Expected tmdb-tv-200 to win, got %s", results[0].ID)
	}
}

func TestTMDBProvider_GetByID(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/movie/123" {
			item := TMDBResult{
				ID:          123,
				Title:       "Sample Movie",
				ReleaseDate: "2024-01-01",
				Overview:    "Plot...",
			}
			_ = json.NewEncoder(w).Encode(item)
		} else if r.URL.Path == "/movie/123/credits" {
			credits := TMDBCreditsResponse{
				Cast: []struct {
					Name string `json:"name"`
				}{
					{Name: "Actor A"},
				},
			}
			_ = json.NewEncoder(w).Encode(credits)
		}
	}))
	defer ts.Close()

	p := NewTMDBProvider("fake-key")
	p.BaseURL = ts.URL

	meta, err := p.GetByID("tmdb-movie-123")
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}

	if meta.Title != "Sample Movie" {
		t.Errorf("Expected Title 'Sample Movie', got '%s'", meta.Title)
	}
	if len(meta.Cast) == 0 || meta.Cast[0] != "Actor A" {
		t.Errorf("Cast mismatch: %v", meta.Cast)
	}
}
