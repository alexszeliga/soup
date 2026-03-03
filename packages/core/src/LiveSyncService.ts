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

        // If we don't have metadata yet, and the name has changed, try matching again.
        // This handles magnet links that resolve to a real name later.
        if (!metadata && torrent.name !== existing.name) {
          metadata = await this.fetchMetadata(torrent);
        }

        // Merge properties into a new object that satisfies TorrentWithMetadata.
        // We use Object.assign to preserve methods from the Torrent instance.
        const updated = Object.assign(torrent, {
          mediaMetadata: metadata,
          files: torrent.files || existing.files
        }) as TorrentWithMetadata;

        this.torrentsWithMetadata.set(torrent.hash, updated);
      }
    }

    // 3. Add new torrents
    for (const torrent of delta.added) {
      const metadata = await this.fetchMetadata(torrent);

      const added = Object.assign(torrent, {
        mediaMetadata: metadata,
        files: torrent.files
      }) as TorrentWithMetadata;

      this.torrentsWithMetadata.set(torrent.hash, added);
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

    // Update in-memory state immediately
    this.torrentsWithMetadata.set(hash, Object.assign(existing, {
      mediaMetadata: metadata
    }) as TorrentWithMetadata);
  }

  /**
   * Helper to fetch metadata for a torrent, checking cache first then matching.
   * 
   * @param torrent - The torrent to fetch metadata for.
   * @returns MediaMetadata or null.
   */
  private async fetchMetadata(torrent: Torrent): Promise<MediaMetadata | null> {
    let metadata = await this.cache.getMetadataForTorrent(torrent.hash);
    
    if (!metadata) {
      metadata = await this.matcher.match(torrent);
      if (metadata) {
        await this.cache.saveMetadataForTorrent(torrent, metadata);
      }
    }

    return metadata;
  }

  /**
   * Returns all current torrents enriched with their media metadata.
   * 
   * @returns Array of torrents with metadata.
   */
  public getTorrentsWithMetadata(): TorrentWithMetadata[] {
    return Array.from(this.torrentsWithMetadata.values());
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
