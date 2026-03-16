package metadata

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/alexszeliga/soup/apps/server-go/internal/models"
)

type TMDBResult struct {
	ID           int     `json:"id"`
	Title        string  `json:"title"`
	Name         string  `json:"name"`
	ReleaseDate  string  `json:"release_date"`
	FirstAirDate string  `json:"first_air_date"`
	Overview     string  `json:"overview"`
	PosterPath   string  `json:"poster_path"`
	Popularity   float64 `json:"popularity"`
	MediaType    string  `json:"media_type"`
}

type TMDBSearchResponse struct {
	Results []TMDBResult `json:"results"`
}

type TMDBCreditsResponse struct {
	Cast []struct {
		Name string `json:"name"`
	} `json:"cast"`
}

type TMDBProvider struct {
	ApiKey       string
	BaseURL      string
	ImageBaseURL string
	Client       *http.Client
}

func NewTMDBProvider(apiKey string) *TMDBProvider {
	return &TMDBProvider{
		ApiKey:       apiKey,
		BaseURL:      "https://api.themoviedb.org/3",
		ImageBaseURL: "https://image.tmdb.org/t/p/w500",
		Client:       &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *TMDBProvider) Search(title string, year int, typeHint string) ([]*models.MediaMetadata, error) {
	if p.ApiKey == "" {
		return nil, fmt.Errorf("TMDB API key is missing")
	}

	u, _ := url.Parse(fmt.Sprintf("%s/search/multi", p.BaseURL))
	q := u.Query()
	q.Set("api_key", p.ApiKey)
	q.Set("query", title)
	u.RawQuery = q.Encode()

	log.Printf("[TMDB] GET %s", u.String())

	resp, err := p.Client.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDB API error: %s", resp.Status)
	}

	var searchResp TMDBSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, err
	}

	log.Printf("[TMDB] Found %d results for '%s'", len(searchResp.Results), title)

	var candidates []TMDBResult
	for _, r := range searchResp.Results {
		if r.MediaType != "movie" && r.MediaType != "tv" {
			continue
		}

		if year > 0 {
			date := r.ReleaseDate
			if date == "" {
				date = r.FirstAirDate
			}
			if date != "" && len(date) >= 4 {
				y := date[:4]
				if y != fmt.Sprintf("%d", year) {
					// We still include it but it will have a lower score
				}
			}
		}
		candidates = append(candidates, r)
	}

	if len(candidates) == 0 {
		return []*models.MediaMetadata{}, nil
	}

	type rankedResult struct {
		item  TMDBResult
		score float64
	}

	var ranked []rankedResult
	queryTitle := strings.ToLower(title)

	for _, item := range candidates {
		var score float64
		itemTitle := strings.ToLower(item.Title)
		if itemTitle == "" {
			itemTitle = strings.ToLower(item.Name)
		}

		// 1. Exact match boost
		if itemTitle == queryTitle {
			score += 1000
		} else if strings.Contains(itemTitle, queryTitle) || strings.Contains(queryTitle, itemTitle) {
			score += 100
		}

		// 2. Type match boost
		if typeHint != "" && typeHint != "unknown" && item.MediaType == typeHint {
			score += 500
		}

		// 3. Popularity
		pScore := item.Popularity
		if pScore > 100 {
			pScore = 100
		}
		score += pScore

		ranked = append(ranked, rankedResult{item: item, score: score})
	}

	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score
	})

	// Return top 10 candidates
	limit := 10
	if len(ranked) < limit {
		limit = len(ranked)
	}

	var results []*models.MediaMetadata
	for i := 0; i < limit; i++ {
		best := ranked[i].item
		// We don't fetch credits for all search results to save API calls
		results = append(results, p.mapToMetadata(best, nil))
	}

	return results, nil
}

func (p *TMDBProvider) fetchCredits(mediaType string, id int) ([]string, error) {
	u, _ := url.Parse(fmt.Sprintf("%s/%s/%d/credits", p.BaseURL, mediaType, id))
	q := u.Query()
	q.Set("api_key", p.ApiKey)
	u.RawQuery = q.Encode()

	resp, err := p.Client.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	var creditsResp TMDBCreditsResponse
	if err := json.NewDecoder(resp.Body).Decode(&creditsResp); err != nil {
		return nil, err
	}

	var cast []string
	limit := 5
	if len(creditsResp.Cast) < limit {
		limit = len(creditsResp.Cast)
	}
	for i := 0; i < limit; i++ {
		cast = append(cast, creditsResp.Cast[i].Name)
	}

	return cast, nil
}

func (p *TMDBProvider) mapToMetadata(item TMDBResult, cast []string) *models.MediaMetadata {
	name := item.Title
	if name == "" {
		name = item.Name
	}
	date := item.ReleaseDate
	if date == "" {
		date = item.FirstAirDate
	}
	year := 0
	if len(date) >= 4 {
		_, _ = fmt.Sscanf(date[:4], "%d", &year)
	}

	poster := ""
	if item.PosterPath != "" {
		poster = fmt.Sprintf("%s%s", p.ImageBaseURL, item.PosterPath)
	}

	mediaType := item.MediaType
	if mediaType == "" {
		// Fallback for direct ID lookups where media_type isn't in the object root
		// but we might know it from the ID prefix.
	}

	return &models.MediaMetadata{
		ID:         fmt.Sprintf("tmdb-%s-%d", mediaType, item.ID),
		Title:      name,
		Year:       year,
		Plot:       item.Overview,
		Cast:       cast,
		PosterPath: poster,
	}
}

func (p *TMDBProvider) GetByID(id string) (*models.MediaMetadata, error) {
	if p.ApiKey == "" {
		return nil, fmt.Errorf("TMDB API key is missing")
	}

	// id format: tmdb-movie-123 or tmdb-tv-123
	parts := strings.Split(id, "-")
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid metadata id format")
	}

	mediaType := parts[1]
	tmdbID := parts[2]

	u, _ := url.Parse(fmt.Sprintf("%s/%s/%s", p.BaseURL, mediaType, tmdbID))
	q := u.Query()
	q.Set("api_key", p.ApiKey)
	u.RawQuery = q.Encode()

	log.Printf("[TMDB] GET %s", u.String())

	resp, err := p.Client.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDB API error (%s): %s", u.String(), resp.Status)
	}

	var item TMDBResult
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, err
	}

	log.Printf("[TMDB] Found item: %s", item.Title)

	// MediaType might not be in the response for direct lookup, so we inject it
	item.MediaType = mediaType

	cast, _ := p.fetchCredits(mediaType, item.ID)

	return p.mapToMetadata(item, cast), nil
}
