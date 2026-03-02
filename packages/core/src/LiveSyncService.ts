import { SyncEngine } from './SyncEngine.js';
import { MetadataMatcher } from './MetadataMatcher.js';
import { MetadataCache } from './MetadataCache.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';

export interface TorrentWithMetadata extends Torrent {
  mediaMetadata: MediaMetadata | null;
}

export class LiveSyncService {
  private torrentsWithMetadata: Map<string, TorrentWithMetadata> = new Map();

  constructor(
    private readonly engine: SyncEngine,
    private readonly matcher: MetadataMatcher,
    private readonly cache: MetadataCache
  ) {}

  public async sync(): Promise<void> {
    await this.engine.tick();
    const engineTorrents = this.engine.getTorrents();
    const engineHashes = new Set(engineTorrents.map(t => t.hash));

    // 1. Remove torrents that are no longer in engine
    for (const hash of this.torrentsWithMetadata.keys()) {
      if (!engineHashes.has(hash)) {
        this.torrentsWithMetadata.delete(hash);
      }
    }

    // 2. Update existing or add new torrents
    for (const torrent of engineTorrents) {
      const existing = this.torrentsWithMetadata.get(torrent.hash);
      
      if (existing) {
        // Update properties, preserve metadata
        this.torrentsWithMetadata.set(torrent.hash, {
          ...torrent,
          mediaMetadata: existing.mediaMetadata
        } as TorrentWithMetadata);
      } else {
        // New torrent found
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
  }

  public getTorrentsWithMetadata(): TorrentWithMetadata[] {
    return Array.from(this.torrentsWithMetadata.values());
  }

  public getServerState(): any {
    return this.engine.getServerState();
  }
}
