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
   * Orchestrates a search across TMDB categories.
   * 
   * Strategy:
   * 1. Search Movies first.
   * 2. If no movie match, search TV Shows.
   * 
   * @param title - The clean title from the torrent.
   * @param year - Optional release year filter.
   * @returns MediaMetadata or null if no results were found.
   */
  public async search(title: string, year?: number): Promise<MediaMetadata | null> {
    // 1. Try Movie Search
    const movieResult = await this.performSearch('movie', title, year);
    if (movieResult) return movieResult;

    // 2. Try TV Search (if movie fails)
    const tvResult = await this.performSearch('tv', title, year);
    return tvResult;
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
    const searchUrl = new URL(`${this.baseUrl}/search/${type}`);
    searchUrl.searchParams.set('api_key', this.apiKey);
    searchUrl.searchParams.set('query', title);
    if (year) {
      const yearParam = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      searchUrl.searchParams.set(yearParam, year.toString());
    }

    const response = await fetch(searchUrl.toString());
    if (!response.ok) return null;

    const data = await response.json() as TMDBSearchResponse;
    if (!data.results || data.results.length === 0) return null;

    const item = data.results[0];
    const id = item.id;
    const name = item.title || item.name || 'Unknown';
    const releaseDate = item.release_date || item.first_air_date;

    // Fetch credits
    const creditsUrl = new URL(`${this.baseUrl}/${type}/${id}/credits`);
    creditsUrl.searchParams.set('api_key', this.apiKey);
    const creditsResponse = await fetch(creditsUrl.toString());
    const creditsData = creditsResponse.ok ? await creditsResponse.json() as TMDBCreditsResponse : { cast: [] };
    const cast = creditsData.cast ? creditsData.cast.slice(0, 5).map(c => c.name) : [];

    return new MediaMetadata({
      id: `tmdb-${type}-${id}`,
      title: name,
      year: releaseDate ? new Date(releaseDate).getFullYear() : 0,
      plot: item.overview,
      cast,
      posterPath: item.poster_path ? `${this.imageBaseUrl}${item.poster_path}` : '',
    });
  }
}
