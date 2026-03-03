import { SyncEngine } from './SyncEngine.js';
import { MetadataMatcher } from './MetadataMatcher.js';
import { MetadataCache } from './MetadataCache.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';

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
   */
  constructor(
    private readonly engine: SyncEngine,
    private readonly matcher: MetadataMatcher,
    private readonly cache: MetadataCache
  ) {}

  /**
   * Performs a full synchronization cycle.
   * 
   * 1. Ticks the SyncEngine to get latest BitTorrent deltas.
   * 2. Removes stale torrents from local state.
   * 3. Updates properties of existing torrents (preserving their metadata).
   * 4. For new torrents: Attempts to fetch metadata from cache or TMDB.
   * 
   * @returns A promise that resolves when sync is complete.
   */
  public async sync(): Promise<void> {
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
        this.torrentsWithMetadata.set(torrent.hash, {
          ...torrent,
          mediaMetadata: existing.mediaMetadata
        } as TorrentWithMetadata);
      }
    }

    // 3. Add new torrents
    for (const torrent of delta.added) {
      let metadata = await this.cache.getMetadataForTorrent(torrent.hash);
      
      if (!metadata) {
        metadata = await this.matcher.match(torrent);
        if (metadata) {
          await this.cache.saveMetadataForTorrent(torrent, metadata);
        }
      }

      this.torrentsWithMetadata.set(torrent.hash, {
        ...torrent,
        mediaMetadata: metadata
      } as TorrentWithMetadata);
    }
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
  public getServerState(): any {
    return this.engine.getServerState();
  }
}
