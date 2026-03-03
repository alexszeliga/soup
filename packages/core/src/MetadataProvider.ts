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
}
