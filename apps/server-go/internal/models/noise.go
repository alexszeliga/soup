package models

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// MediaInfo represents the extracted title and release info from a filename.
type MediaInfo struct {
	Title string `json:"title"`
	Year  int    `json:"year"`
	Type  string `json:"type"` // "movie", "tv", "unknown"
}

// NoiseToken represents a learned filename noise token (e.g. release group name).
type NoiseToken struct {
	Token     string    `json:"token"`
	HitCount  int       `json:"hitCount"`
	UpdatedAt time.Time `json:"updatedAt"`
}

var staticNoisePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(?:1080p|720p|2160p|4k|uhd|bluray|brrip|bdrip|web-?dl|hdtv|x264|x265|hevc|h264|h265|remux|redux)\b`),
	regexp.MustCompile(`(?i)\b(?:ac3|dts(?:-hd)?|dd(?:p|\+)?5\.?1|aac(?:2\.0)?|mp3|atmos|truehd|e-?ac3)\b`),
	regexp.MustCompile(`(?i)\b(?:german|english|french|multi|dual|truefrench|vostfr|subs?|japanese|korean|spanish|italian|russian)\b`),
	regexp.MustCompile(`(?i)\b(?:proper|repack|internal|unrated|extended|directors\.?cut|limited|collectors|edition|remastered|uncut|complete)\b`),
	regexp.MustCompile(`(?i)\b(?:dv|hdr(?:10)?|vost|subbed|dubbed)\b`),
	regexp.MustCompile(`(?i)\s+-\s*.*$`),
	regexp.MustCompile(`(?i)-[a-zA-Z0-9]+$`),
}

var tvPatterns = []struct {
	re       *regexp.Regexp
	titleIdx int
	yearIdx  int
}{
	{regexp.MustCompile(`(?i)^(.*?)\s+(\d{4})\s+S(\d{1,2})(?:E(\d{1,2}))?\b`), 1, 2},
	{regexp.MustCompile(`(?i)^(.*?)\s+S(\d{1,2})(?:E(\d{1,2}))?\b`), 1, -1},
	{regexp.MustCompile(`(?i)^(.*?)\s+Season\s+(\d{1,2})\b`), 1, -1},
	{regexp.MustCompile(`(?i)^(.*?)\s+(\d{1,2})x(\d{1,2})\b`), 1, -1},
}

var moviePattern = regexp.MustCompile(`(?i)^(.*?)\s+((?:19|20)\d{2})(?:\s+|$)`)

// GetMediaInfo parses a raw torrent name into structured MediaInfo.
func GetMediaInfo(name string) MediaInfo {
	// 1. Initial cleanup
	clean := strings.NewReplacer(".", " ", "_", " ").Replace(name)
	clean = strings.TrimSpace(clean)

	var title string = clean
	var year int
	var mType string = "unknown"

	// 2. Identify TV Shows
	for _, p := range tvPatterns {
		match := p.re.FindStringSubmatch(clean)
		if match != nil {
			title = strings.TrimSpace(match[p.titleIdx])
			if p.yearIdx != -1 {
				year, _ = strconv.Atoi(match[p.yearIdx])
			}
			mType = "tv"
			break
		}
	}

	// 3. Identify Movies
	if mType == "unknown" {
		match := moviePattern.FindStringSubmatch(clean)
		if match != nil {
			title = strings.TrimSpace(match[1])
			year, _ = strconv.Atoi(match[2])
			mType = "movie"
		}
	}

	// 4. Systematic Noise Stripping
	resultTitle := title
	for _, p := range staticNoisePatterns {
		resultTitle = p.ReplaceAllString(resultTitle, "")
	}

	// Final normalization
	spaceRe := regexp.MustCompile(`\s+`)
	resultTitle = spaceRe.ReplaceAllString(resultTitle, " ")
	resultTitle = strings.TrimSpace(resultTitle)

	if resultTitle == "" {
		resultTitle = title
	}

	return MediaInfo{
		Title: resultTitle,
		Year:  year,
		Type:  mType,
	}
}
