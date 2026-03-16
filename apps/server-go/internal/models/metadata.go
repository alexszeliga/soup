package models

// MediaMetadata represents rich information about a movie or TV show.
type MediaMetadata struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Year       int      `json:"year"`
	Plot       string   `json:"plot"`
	Cast       []string `json:"cast"`
	PosterPath string   `json:"posterPath"`
}
