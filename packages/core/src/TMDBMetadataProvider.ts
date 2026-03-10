import { MediaMetadata } from './MediaMetadata.js';
import { MetadataProvider } from './MetadataProvider.js';

interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  poster_path: string | null;
  popularity: number;
  vote_count: number;
  media_type?: 'movie' | 'tv' | 'person';
}

interface TMDBSearchResponse {
  results: TMDBResult[];
}

interface TMDBCreditsResponse {
  cast: { name: string }[];
}

/**
 * Metadata provider implementation using The Movie Database (TMDB) API.
 * 
 * Supports both Movie and TV Show searches with a preference for Movie results
 * if both match the title.
 */
export class TMDBMetadataProvider implements MetadataProvider {
  /**
   * Creates an instance of TMDBMetadataProvider.
   * 
   * @param apiKey - The TMDB API key.
   * @param baseUrl - The base URL for the TMDB API.
   * @param imageBaseUrl - The base URL for TMDB images.
   */
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://api.themoviedb.org/3',
    private readonly imageBaseUrl: string = 'https://image.tmdb.org/t/p/w500'
  ) {}

  /**
   * Orchestrates a search across TMDB categories using the Multi Search API.
   * 
   * Strategy:
   * 1. Perform a Multi Search to get combined movie and TV results.
   * 2. Apply a scoring algorithm:
   *    - Exact title match (case-insensitive) = Huge boost.
   *    - Media type match (matching our regex hint) = Significant boost.
   *    - Popularity = Tie-breaker.
   * 
   * @param title - The clean title from the torrent.
   * @param year - Optional release year filter.
   * @param typeHint - Optional hint if we detected it's likely a movie or TV show.
   * @returns MediaMetadata or null if no confident results were found.
   */
  public async search(title: string, year?: number, typeHint: 'movie' | 'tv' | 'unknown' = 'unknown'): Promise<MediaMetadata | null> {
    const data = await this.fetchMultiSearch(title);
    if (!data?.results || data.results.length === 0) return null;

    // Filter by year if provided (since multi search doesn't support year param)
    let candidates = data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
    
    if (year) {
      candidates = candidates.filter(r => {
        const date = r.release_date || r.first_air_date;
        if (!date) return false;
        return new Date(date).getFullYear() === year;
      });
    }

    if (candidates.length === 0) return null;

    // Scoring and Ranking
    const ranked = candidates.map(item => {
      let score = 0;
      const itemTitle = (item.title || item.name || '').toLowerCase();
      const queryTitle = title.toLowerCase();

      // 1. Exact match boost
      if (itemTitle === queryTitle) {
        score += 1000;
      } else if (itemTitle.includes(queryTitle) || queryTitle.includes(itemTitle)) {
        score += 100;
      }

      // 2. Type match boost
      if (typeHint !== 'unknown' && item.media_type === typeHint) {
        score += 500;
      }

      // 3. Popularity (weighted)
      score += Math.min(item.popularity, 100);

      return { item, score };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0].item;
    const cast = await this.fetchCredits(best.media_type as 'movie' | 'tv', best.id.toString());
    return this.mapToMetadata(best.media_type as 'movie' | 'tv', best, cast);
  }

  private async fetchMultiSearch(query: string): Promise<TMDBSearchResponse | null> {
    const url = new URL(`${this.baseUrl}/search/multi`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('query', query);

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return await response.json() as TMDBSearchResponse;
  }

  /**
   * Returns a combined list of movie and TV show candidates for a query.
   * 
   * @param query - The search query.
   * @returns List of potential MediaMetadata matches.
   */
  public async searchCandidates(query: string): Promise<MediaMetadata[]> {
    const [movieData, tvData] = await Promise.all([
      this.fetchSearchData('movie', query),
      this.fetchSearchData('tv', query)
    ]);

    const candidates: MediaMetadata[] = [];

    if (movieData?.results) {
      candidates.push(...movieData.results.map(item => this.mapToMetadata('movie', item, [])));
    }

    if (tvData?.results) {
      candidates.push(...tvData.results.map(item => this.mapToMetadata('tv', item, [])));
    }

    return candidates;
  }

  /**
   * Retrieves specific metadata by its TMDB-formatted ID (e.g., 'tmdb-movie-123').
   * 
   * @param id - The unique ID.
   * @returns MediaMetadata if found, otherwise null.
   */
  public async getById(id: string): Promise<MediaMetadata | null> {
    const match = id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return null;

    const type = match[1] as 'movie' | 'tv';
    const tmdbId = match[2];

    const [item, credits] = await Promise.all([
      this.fetchItemDetails(type, tmdbId),
      this.fetchCredits(type, tmdbId)
    ]);

    if (!item) return null;

    return this.mapToMetadata(type, item, credits);
  }

  /**
   * Internal helper to perform category-specific searches and fetch cast details.
   * 
   * @param type - 'movie' or 'tv'.
   * @param title - The title query.
   * @param year - The year filter.
   * @returns MediaMetadata instance or null.
   */
  private async performSearch(type: 'movie' | 'tv', title: string, year?: number): Promise<MediaMetadata | null> {
    const data = await this.fetchSearchData(type, title, year);
    if (!data?.results || data.results.length === 0) return null;

    // Sort by popularity descending to pick the most relevant match
    const sorted = [...data.results].sort((a, b) => {
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      return b.vote_count - a.vote_count;
    });

    const item = sorted[0];
    const cast = await this.fetchCredits(type, item.id.toString());

    return this.mapToMetadata(type, item, cast);
  }

  private async fetchSearchData(type: 'movie' | 'tv', query: string, year?: number): Promise<TMDBSearchResponse | null> {
    const url = new URL(`${this.baseUrl}/search/${type}`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('query', query);
    if (year) {
      const yearParam = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      url.searchParams.set(yearParam, year.toString());
    }

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return await response.json() as TMDBSearchResponse;
  }

  private async fetchItemDetails(type: 'movie' | 'tv', id: string): Promise<TMDBResult | null> {
    const url = new URL(`${this.baseUrl}/${type}/${id}`);
    url.searchParams.set('api_key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return await response.json() as TMDBResult;
  }

  private async fetchCredits(type: 'movie' | 'tv', id: string): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/${type}/${id}/credits`);
    url.searchParams.set('api_key', this.apiKey);
    
    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = await response.json() as TMDBCreditsResponse;
    return data.cast ? data.cast.slice(0, 5).map(c => c.name) : [];
  }

  private mapToMetadata(type: 'movie' | 'tv', item: TMDBResult, cast: string[]): MediaMetadata {
    const name = item.title || item.name || 'Unknown';
    const releaseDate = item.release_date || item.first_air_date;

    return new MediaMetadata({
      id: `tmdb-${type}-${item.id}`,
      title: name,
      year: releaseDate ? new Date(releaseDate).getFullYear() : 0,
      plot: item.overview,
      cast,
      posterPath: item.poster_path ? `${this.imageBaseUrl}${item.poster_path}` : '',
    });
  }
}
