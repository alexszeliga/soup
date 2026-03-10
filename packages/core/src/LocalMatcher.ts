import Fuse from 'fuse.js';
import { MediaMetadata } from './MediaMetadata.js';

/**
 * Interface representing a match found by a LocalMatcher.
 */
export interface LocalMatch {
  /** The matched metadata. */
  metadata: MediaMetadata;
  /** Confidence score (0 to 1, where 0 is a perfect match). */
  score: number;
}

/**
 * Interface for a local metadata matcher that operates without external API calls.
 */
export interface LocalMatcher {
  /**
   * Searches the local index for a metadata match.
   * 
   * @param query - The title to search for.
   * @returns The best match if found and within threshold, otherwise null.
   */
  search(query: string): Promise<LocalMatch | null>;

  /**
   * Adds a new metadata record to the local index.
   * 
   * @param metadata - The metadata to add.
   */
  addToIndex(metadata: MediaMetadata): void;

  /**
   * Replaces the entire local index with a new set of metadata records.
   * 
   * @param metadata - The list of metadata records.
   */
  reindex(metadata: MediaMetadata[]): void;
}

/**
 * Implementation of LocalMatcher using Fuse.js for fuzzy string matching.
 */
export class FuseLocalMatcher implements LocalMatcher {
  private fuse: Fuse<MediaMetadata>;
  private readonly threshold = 0.3;

  /**
   * Creates an instance of FuseLocalMatcher.
   * 
   * @param initialMetadata - Initial set of metadata to index.
   */
  constructor(initialMetadata: MediaMetadata[] = []) {
    this.fuse = new Fuse(initialMetadata, {
      keys: ['title'],
      threshold: this.threshold,
      ignoreLocation: true,
      includeScore: true,
    });
  }

  /**
   * Searches the in-memory Fuse index for the query.
   * 
   * @param query - The title to search for.
   * @returns The best match if score <= threshold.
   */
  public async search(query: string): Promise<LocalMatch | null> {
    const results = this.fuse.search(query);
    
    if (results.length === 0) return null;

    const best = results[0];
    
    // Fuse score: 0.0 is perfect, 1.0 is total mismatch.
    // Our threshold is 0.3.
    if (best.score !== undefined && best.score <= this.threshold) {
      return {
        metadata: best.item,
        score: best.score
      };
    }

    return null;
  }

  /**
   * Adds a single metadata record to the existing Fuse index.
   * 
   * @param metadata - The metadata to add.
   */
  public addToIndex(metadata: MediaMetadata): void {
    this.fuse.add(metadata);
  }

  /**
   * Re-initializes the Fuse index with a fresh set of records.
   * 
   * @param metadata - The full list of metadata records.
   */
  public reindex(metadata: MediaMetadata[]): void {
    this.fuse.setCollection(metadata);
  }
}
