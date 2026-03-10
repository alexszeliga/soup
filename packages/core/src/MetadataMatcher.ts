import { MediaMetadata } from './MediaMetadata.js';
import { MetadataProvider } from './MetadataProvider.js';
import { Torrent } from './Torrent.js';
import { LocalMatcher } from './LocalMatcher.js';

/**
 * Domain service responsible for matching a raw Torrent object to 
 * structured MediaMetadata using an external provider (e.g., TMDB)
 * and a local fuzzy matching layer to minimize API calls.
 */
export class MetadataMatcher {
  /**
   * Creates an instance of MetadataMatcher.
   * 
   * @param provider - The primary external metadata provider.
   * @param localMatcher - Optional local fuzzy matching layer.
   */
  constructor(
    private readonly provider: MetadataProvider,
    private readonly localMatcher?: LocalMatcher
  ) {}

  /**
   * Attempts to find a media match for the given torrent.
   * 
   * 1. Extracts parsed title/year from the Torrent model.
   * 2. Checks the local fuzzy matching index first if available.
   * 3. Performs an external search if no local match is found.
   * 
   * @param torrent - The torrent to match.
   * @returns MediaMetadata if a match was found, otherwise null.
   */
  public async match(torrent: Torrent): Promise<MediaMetadata | null> {
    const { title, year, type } = torrent.getMediaInfo();
    
    // 1. Check Local Fuzzy Barrier
    if (this.localMatcher) {
      const localMatch = await this.localMatcher.search(title);
      if (localMatch) {
        // If the local match is high confidence, return it immediately
        return localMatch.metadata;
      }
    }

    // 2. Fallback to External Provider
    const result = await this.provider.search(title, year ?? undefined, type);
    
    return result;
  }

  /**
   * Updates the local fuzzy matching index with a new metadata record.
   * 
   * @param metadata - The metadata to add.
   */
  public addToIndex(metadata: MediaMetadata): void {
    if (this.localMatcher) {
      this.localMatcher.addToIndex(metadata);
    }
  }
}
