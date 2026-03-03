import { MediaMetadata } from './MediaMetadata.js';
import { MetadataProvider } from './MetadataProvider.js';
import { Torrent } from './Torrent.js';

/**
 * Domain service responsible for matching a raw Torrent object to 
 * structured MediaMetadata using an external provider (e.g., TMDB).
 */
export class MetadataMatcher {
  /**
   * Creates an instance of MetadataMatcher.
   * 
   * @param provider - The metadata provider.
   */
  constructor(private readonly provider: MetadataProvider) {}

  /**
   * Attempts to find a media match for the given torrent.
   * 
   * 1. Extracts parsed title/year from the Torrent model.
   * 2. Performs a search using the configured MetadataProvider.
   * 
   * @param torrent - The torrent to match.
   * @returns MediaMetadata if a match was found, otherwise null.
   */
  public async match(torrent: Torrent): Promise<MediaMetadata | null> {
    const { title, year } = torrent.getMediaInfo();
    
    // Explicitly handle the search
    const result = await this.provider.search(title, year ?? undefined);
    
    return result;
  }
}
