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

  public getTorrentsWithMetadata(): TorrentWithMetadata[] {
    return Array.from(this.torrentsWithMetadata.values());
  }

  public getServerState(): any {
    return this.engine.getServerState();
  }
}
