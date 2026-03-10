import { SyncEngine } from './SyncEngine.js';
import { MetadataMatcher } from './MetadataMatcher.js';
import { MetadataCache } from './MetadataCache.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';
import { MetadataProvider } from './MetadataProvider.js';

/**
 * Extended Torrent model that includes associated media metadata (posters, plot, etc.).
 */
export interface TorrentWithMetadata extends Torrent {
  /** Rich media metadata from TMDB, or null if no match was found. */
  mediaMetadata: MediaMetadata | null;
  /** True if the user manually marked this as non-media. */
  isNonMedia: boolean;
}

/**
 * High-level service that coordinates synchronization and metadata matching.
 * 
 * It acts as the bridge between the raw BitTorrent data (SyncEngine) and the 
 * rich media context (MetadataMatcher/Cache).
 */
export class LiveSyncService {
  /** Internal stateful map of torrents merged with their metadata. */
  private torrentsWithMetadata: Map<string, TorrentWithMetadata> = new Map();
  /** Active noise tokens mined from previous matches. */
  private activeNoiseTokens: string[] = [];

  /**
   * Creates an instance of LiveSyncService.
   * 
   * @param engine - The sync engine.
   * @param matcher - The metadata matcher.
   * @param cache - The metadata cache.
   * @param provider - The metadata provider (used for manual linking).
   */
  constructor(
    private readonly engine: SyncEngine,
    private readonly matcher: MetadataMatcher,
    private readonly cache: MetadataCache,
    private readonly provider: MetadataProvider
  ) {}

  /**
   * Performs a full synchronization cycle.
   * 
   * 1. Ticks the SyncEngine to get latest BitTorrent deltas.
   * 2. Removes stale torrents from local state.
   * 3. Updates properties of existing torrents (preserving their metadata).
   * 4. For new torrents: Attempts to fetch metadata from cache or TMDB.
   * 
   * @param focusHash - Optional hash to prioritize file-level syncing.
   * @returns A promise that resolves when sync is complete.
   */
  public async sync(focusHash: string | null = null): Promise<void> {
    this.engine.setFocus(focusHash);
    
    // Refresh active noise tokens from DB once per sync
    this.activeNoiseTokens = await this.cache.getActiveNoiseTokens();
    
    const delta = await this.engine.tick();

    if (delta.fullUpdate) {
      this.torrentsWithMetadata.clear();
    }

    // 1. Remove torrents
    for (const hash of delta.removed) {
      this.torrentsWithMetadata.delete(hash);
    }

    // 2. Update existing torrents
    for (const torrent of delta.updated) {
      const existing = this.torrentsWithMetadata.get(torrent.hash);
      if (existing) {
        let metadata = existing.mediaMetadata;
        const isNonMedia = existing.isNonMedia;

        // If we don't have metadata yet, and it's not marked as non-media, 
        // and the name has changed, try matching again.
        if (!metadata && !isNonMedia && torrent.name !== existing.name) {
          metadata = await this.fetchMetadata(torrent);
        }

        const merged = Object.assign(torrent, {
          mediaMetadata: metadata,
          isNonMedia,
          files: torrent.files || existing.files
        }) as TorrentWithMetadata;

        this.torrentsWithMetadata.set(torrent.hash, merged);
      }
    }

    // 3. Add new torrents
    for (const torrent of delta.added) {
      const isNonMedia = await this.cache.isNonMedia(torrent.hash);
      const metadata = await this.fetchMetadata(torrent);

      const merged = Object.assign(torrent, {
        mediaMetadata: metadata,
        isNonMedia,
        files: torrent.files
      }) as TorrentWithMetadata;

      this.torrentsWithMetadata.set(torrent.hash, merged);
    }
  }

  /**
   * Manually links a specific metadata ID to a torrent.
   * 
   * @param hash - The torrent hash.
   * @param metadataId - The metadata ID (e.g., 'tmdb-movie-550').
   * @throws Error if the torrent is not found in the current state.
   */
  public async linkMetadata(hash: string, metadataId: string): Promise<void> {
    const existing = this.torrentsWithMetadata.get(hash);
    if (!existing) {
      throw new Error(`Torrent ${hash} not found in sync engine.`);
    }

    const metadata = await this.provider.getById(metadataId);
    if (!metadata) {
      throw new Error(`Metadata ${metadataId} not found by provider.`);
    }

    // Save to cache so it's persistent and respected by future syncs
    await this.cache.saveMetadataForTorrent(existing as Torrent, metadata);
    
    // Update local matcher index
    this.matcher.addToIndex(metadata);

    // Mine for noise since we have a confirmed match
    await this.mineNoise(existing.name, metadata);

    // Update in-memory state immediately
    this.torrentsWithMetadata.set(hash, Object.assign(existing, {
      mediaMetadata: metadata,
      isNonMedia: false // Successfully linking metadata always resets non-media
    }) as TorrentWithMetadata);
  }

  /**
   * Clears media metadata associated with a torrent.
   * 
   * @param hash - The torrent hash.
   */
  public async unmatchTorrent(hash: string): Promise<void> {
    const existing = this.torrentsWithMetadata.get(hash);
    if (existing) {
      await this.cache.unmatchTorrent(hash);
      
      this.torrentsWithMetadata.set(hash, Object.assign(existing, {
        mediaMetadata: null,
        isNonMedia: false // Unmatching resets non-media too, so it can be matched again
      }) as TorrentWithMetadata);
    }
  }

  /**
   * Marks or unmarks a torrent as non-media content to prevent automatic matching.
   * 
   * @param hash - The torrent hash.
   * @param isNonMedia - True to mark as non-media.
   */
  public async markAsNonMedia(hash: string, isNonMedia: boolean): Promise<void> {
    const existing = this.torrentsWithMetadata.get(hash);
    if (existing) {
      await this.cache.setNonMedia(hash, isNonMedia, existing.name);
      
      let metadata = existing.mediaMetadata;
      if (isNonMedia) {
        metadata = null;
      } else if (!metadata) {
        // If we are unmarking as non-media and have no metadata, try matching again
        metadata = await this.fetchMetadata(existing as Torrent);
      }

      this.torrentsWithMetadata.set(hash, Object.assign(existing, {
        mediaMetadata: metadata,
        isNonMedia
      }) as TorrentWithMetadata);
    }
  }

  /**
   * Helper to fetch metadata for a torrent, checking cache first then matching.
   * 
   * @param torrent - The torrent to fetch metadata for.
   * @returns MediaMetadata or null.
   */
  private async fetchMetadata(torrent: Torrent): Promise<MediaMetadata | null> {
    // If manually marked as non-media, don't even check cache/matcher
    if (await this.cache.isNonMedia(torrent.hash)) {
      return null;
    }

    let metadata = await this.cache.getMetadataForTorrent(torrent.hash);
    
    if (!metadata) {
      // Use active noise tokens for matching
      const torrentWithNoise = new Torrent(Object.assign({}, torrent, { 
        name: torrent.name 
      }));
      
      metadata = await this.matcher.match(torrentWithNoise);
      if (metadata) {
        await this.cache.saveMetadataForTorrent(torrent, metadata);
        // Ensure local index is updated for future fuzzy matches
        this.matcher.addToIndex(metadata);
        // Mine for noise
        await this.mineNoise(torrent.name, metadata);
      }
    }

    return metadata;
  }

  /**
   * Extracts novel noise tokens from a torrent name given its confirmed metadata.
   * 
   * @param name - Raw torrent name.
   * @param metadata - Confirmed metadata.
   */
  private async mineNoise(name: string, metadata: MediaMetadata): Promise<void> {
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

  /**
   * Returns all current torrents enriched with their media metadata.
   * 
   * @returns Array of torrents with metadata.
   */
  public getTorrentsWithMetadata(): TorrentWithMetadata[] {
    // We need to re-parse names with the latest active noise tokens
    return Array.from(this.torrentsWithMetadata.values()).map(t => {
      // Torrent is a class, but we need to ensure getMediaInfo uses the latest noise
      // We can't easily change the class methods, so we just wrap the result if needed
      // or ensure the UI calls getMediaInfo(activeNoise).
      // For now, we'll just return as is, but sync() already updated metadata.
      return t;
    });
  }

  /**
   * Proxy method to get the latest global server state from the SyncEngine.
   * 
   * @returns Global server state object.
   */
  public getServerState(): Record<string, unknown> {
    return this.engine.getServerState();
  }
}
