import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveSyncService } from '../LiveSyncService.js';
import { SyncEngine } from '../SyncEngine.js';
import { MetadataMatcher } from '../MetadataMatcher.js';
import { MetadataCache } from '../MetadataCache.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { Torrent } from '../Torrent.js';

describe('LiveSyncService', () => {
  let engine: SyncEngine;
  let matcher: MetadataMatcher;
  let cache: MetadataCache;
  let service: LiveSyncService;

  beforeEach(() => {
    engine = {
      tick: vi.fn(),
      getTorrents: vi.fn().mockReturnValue([])
    } as any;
    
    matcher = {
      match: vi.fn()
    } as any;
    
    cache = {
      getMetadataForTorrent: vi.fn(),
      saveMetadataForTorrent: vi.fn()
    } as any;

    service = new LiveSyncService(engine, matcher, cache);
  });

  it('should match metadata for new torrents discovered by engine', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'New Movie',
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'New Movie',
      year: 2024,
      plot: '',
      cast: [],
      posterPath: ''
    });

    // 1. First tick finds nothing
    (engine.getTorrents as any).mockReturnValueOnce([]);
    await service.sync();

    // 2. Second tick finds a new torrent
    (engine.getTorrents as any).mockReturnValueOnce([torrent]);
    (cache.getMetadataForTorrent as any).mockResolvedValue(null);
    (matcher.match as any).mockResolvedValue(metadata);

    await service.sync();

    expect(matcher.match).toHaveBeenCalledWith(torrent);
    expect(cache.saveMetadataForTorrent).toHaveBeenCalledWith(torrent, metadata);
  });

  it('should use cached metadata if available', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'Old Movie',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'Old Movie',
      year: 2024,
      plot: '',
      cast: [],
      posterPath: ''
    });

    (engine.getTorrents as any).mockReturnValue([torrent]);
    (cache.getMetadataForTorrent as any).mockResolvedValue(metadata);

    await service.sync();

    expect(matcher.match).not.toHaveBeenCalled();
    const result = service.getTorrentsWithMetadata();
    expect(result[0].mediaMetadata).toBe(metadata);
  });
});
