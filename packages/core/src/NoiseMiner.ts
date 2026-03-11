import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';
import { MetadataCache } from './MetadataCache.js';

/**
 * Service responsible for extracting and persisting "noise" tokens from 
 * torrent names once they have been successfully matched to media metadata.
 * 
 * These tokens help the parser distinguish between titles and technical 
 * release information in future matching attempts.
 */
export class NoiseMiner {
  /**
   * Creates an instance of NoiseMiner.
   * 
   * @param cache - The metadata cache for persisting noise tokens.
   */
  constructor(private readonly cache: MetadataCache) {}

  /**
   * Extracts novel noise tokens from a torrent name given its confirmed metadata.
   * 
   * @param name - Raw torrent name.
   * @param metadata - Confirmed metadata.
   */
  public async mine(name: string, metadata: MediaMetadata): Promise<void> {
    // 1. Normalize: Replace . and _ with spaces
    let clean = name.replace(/[._]/g, ' ').trim();

    // 2. Subtract Title and Year
    const titleRegex = new RegExp(metadata.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    clean = clean.replace(titleRegex, '');
    clean = clean.replace(new RegExp(metadata.year.toString(), 'g'), '');

    // 3. Tokenize and Filter
    const tokens = clean.split(/\s+/)
      .map(t => t.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')) // Strip residual punctuation
      .filter(t => t.length > 0)
      // Filter out tokens already covered by static noise in Torrent.ts
      .filter(t => !Torrent.isStaticNoise(t));

    if (tokens.length > 0) {
      await this.cache.incrementNoise(tokens);
    }
  }
}
