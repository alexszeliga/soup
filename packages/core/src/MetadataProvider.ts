import { MediaMetadata } from './MediaMetadata.js';

/**
 * Interface for external metadata sources (e.g., TMDB, TVDB).
 * 
 * Implementations must provide a way to search for media assets and return
 * structured domain metadata.
 */
export interface MetadataProvider {
  /**
   * Searches for a movie or TV show.
   * 
   * @param title - The clean title to search for.
   * @param year - Optional release year to improve accuracy.
   * @returns MediaMetadata if a high-confidence match is found, otherwise null.
   */
  search(title: string, year?: number): Promise<MediaMetadata | null>;

  /**
   * Returns a list of potential matches for a given query.
   * 
   * @param query - The search query (title).
   * @returns Array of potential MediaMetadata matches.
   */
  searchCandidates(query: string): Promise<MediaMetadata[]>;

  /**
   * Retrieves specific metadata by its provider-specific ID.
   * 
   * @param id - The unique ID (e.g., 'tmdb-movie-123').
   * @returns MediaMetadata if found, otherwise null.
   */
  getById(id: string): Promise<MediaMetadata | null>;
}
