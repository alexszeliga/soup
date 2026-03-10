import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveSyncService } from '../LiveSyncService.js';
import { SyncEngine } from '../SyncEngine.js';
import { MetadataMatcher } from '../MetadataMatcher.js';
import { MetadataCache } from '../MetadataCache.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { Torrent } from '../Torrent.js';
import { MetadataProvider } from '../MetadataProvider.js';

describe('LiveSyncService', () => {
  let engine: SyncEngine;
  let matcher: MetadataMatcher;
  let cache: MetadataCache;
  let provider: MetadataProvider;
  let service: LiveSyncService;

  beforeEach(() => {
    engine = {
      tick: vi.fn().mockResolvedValue({ added: [], updated: [], removed: [], fullUpdate: false }),
      getTorrents: vi.fn().mockReturnValue([]),
      setFocus: vi.fn()
    } as any;
    
    matcher = {
      match: vi.fn(),
      addToIndex: vi.fn()
    } as any;
    
    cache = {
      getMetadataForTorrent: vi.fn(),
      saveMetadataForTorrent: vi.fn(),
      unmatchTorrent: vi.fn(),
      isNonMedia: vi.fn().mockResolvedValue(false),
      setNonMedia: vi.fn(),
      getActiveNoiseTokens: vi.fn().mockResolvedValue([]),
      incrementNoise: vi.fn()
    } as any;

    provider = {
      search: vi.fn(),
      searchCandidates: vi.fn(),
      getById: vi.fn()
    } as any;

    service = new LiveSyncService(engine, matcher, cache, provider);
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
    (engine.tick as any).mockResolvedValueOnce({ added: [], updated: [], removed: [], fullUpdate: true });
    await service.sync();

    // 2. Second tick finds a new torrent
    (engine.tick as any).mockResolvedValueOnce({ added: [torrent], updated: [], removed: [], fullUpdate: false });
    (cache.getMetadataForTorrent as any).mockResolvedValue(null);
    (matcher.match as any).mockResolvedValue(metadata);

    await service.sync();

    expect(matcher.match).toHaveBeenCalledWith(expect.objectContaining({ hash: torrent.hash }));
    expect(cache.saveMetadataForTorrent).toHaveBeenCalledWith(expect.objectContaining({ hash: torrent.hash }), metadata);
    expect(service.getTorrentsWithMetadata()).toHaveLength(1);
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

    (engine.tick as any).mockResolvedValue({ added: [torrent], updated: [], removed: [], fullUpdate: true });
    (cache.getMetadataForTorrent as any).mockResolvedValue(metadata);

    await service.sync();

    expect(matcher.match).not.toHaveBeenCalled();
    const result = service.getTorrentsWithMetadata();
    expect(result).toHaveLength(1);
    expect(result[0].mediaMetadata).toBe(metadata);
  });

  it('should retry matching if name changes and torrent currently has no metadata', async () => {
    const magnetHash = 'h1';
    const initialTorrent = new Torrent({
      hash: magnetHash,
      name: magnetHash, // Name is just the hash initially
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const updatedTorrent = new Torrent({
      hash: magnetHash,
      name: 'Resolved Movie Name',
      progress: 0.1,
      state: 'downloading',
      downloadSpeed: 100,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'Resolved Movie',
      year: 2024,
      plot: '',
      cast: [],
      posterPath: ''
    });

    // 1. Initial add - matching fails
    (engine.tick as any).mockResolvedValueOnce({ added: [initialTorrent], updated: [], removed: [], fullUpdate: true });
    (cache.getMetadataForTorrent as any).mockResolvedValue(null);
    (matcher.match as any).mockResolvedValue(null);

    await service.sync();
    expect(matcher.match).toHaveBeenCalledTimes(1);
    expect(service.getTorrentsWithMetadata()[0].mediaMetadata).toBeNull();

    // 2. Name updates - should retry matching
    (engine.tick as any).mockResolvedValueOnce({ added: [], updated: [updatedTorrent], removed: [], fullUpdate: false });
    (matcher.match as any).mockResolvedValue(metadata);

    await service.sync();
    
    // Should have been called twice (once for initial add, once for name change)
    expect(matcher.match).toHaveBeenCalledTimes(2);
    expect(matcher.match).toHaveBeenLastCalledWith(expect.objectContaining({ hash: updatedTorrent.hash }));
    expect(service.getTorrentsWithMetadata()[0].mediaMetadata).toBe(metadata);
  });

  it('should manually link metadata by ID', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'Unmatched Movie',
      progress: 0.5,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'tmdb-movie-550',
      title: 'Fight Club',
      year: 1999,
      plot: '...',
      cast: [],
      posterPath: ''
    });

    // Add torrent to service state first
    (engine.tick as any).mockResolvedValueOnce({ added: [torrent], updated: [], removed: [], fullUpdate: true });
    (cache.getMetadataForTorrent as any).mockResolvedValue(null);
    (matcher.match as any).mockResolvedValue(null);
    await service.sync();

    // Mock provider and cache for manual link
    (provider.getById as any).mockResolvedValue(metadata);

    await service.linkMetadata('h1', 'tmdb-movie-550');

    expect(provider.getById).toHaveBeenCalledWith('tmdb-movie-550');
    expect(cache.saveMetadataForTorrent).toHaveBeenCalledWith(expect.objectContaining({
      hash: torrent.hash,
      name: torrent.name
    }), metadata);
    
    const result = service.getTorrentsWithMetadata();
    expect(result[0].mediaMetadata).toBe(metadata);
  });

  it('should unmatch a torrent and clear its metadata', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'Movie to Unmatch',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'Movie',
      year: 2024,
      plot: '',
      cast: [],
      posterPath: ''
    });

    // 1. Initial state with metadata
    (engine.tick as any).mockResolvedValueOnce({ added: [torrent], updated: [], removed: [], fullUpdate: true });
    (cache.getMetadataForTorrent as any).mockResolvedValue(metadata);
    await service.sync();
    expect(service.getTorrentsWithMetadata()[0].mediaMetadata).toBe(metadata);

    // 2. Unmatch
    (cache.unmatchTorrent as any).mockResolvedValue(undefined);
    await service.unmatchTorrent('h1');

    expect(cache.unmatchTorrent).toHaveBeenCalledWith('h1');
    const result = service.getTorrentsWithMetadata()[0];
    expect(result.mediaMetadata).toBeNull();
    expect(result.isNonMedia).toBe(false);
  });

  it('should mark a torrent as non-media and update state', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'ISO File',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    // 1. Add to state
    (engine.tick as any).mockResolvedValueOnce({ added: [torrent], updated: [], removed: [], fullUpdate: true });
    await service.sync();

    // 2. Mark as non-media
    await service.markAsNonMedia('h1', true);

    expect(cache.setNonMedia).toHaveBeenCalledWith('h1', true, 'ISO File');
    const result = service.getTorrentsWithMetadata()[0];
    expect(result.isNonMedia).toBe(true);
    expect(result.mediaMetadata).toBeNull();

    // 3. Mark back as media
    await service.markAsNonMedia('h1', false);
    expect(cache.setNonMedia).toHaveBeenCalledWith('h1', false, 'ISO File');
    expect(service.getTorrentsWithMetadata()[0].isNonMedia).toBe(false);
  });

  it('should mine noise tokens from confirmed matches', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The.Matrix.1999.NOVELTAG.1080p',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: ''
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'The Matrix',
      year: 1999,
      plot: '',
      cast: [],
      posterPath: ''
    });

    // Mock initial state
    (engine.tick as any).mockResolvedValueOnce({ added: [torrent], updated: [], removed: [], fullUpdate: true });
    (cache.getMetadataForTorrent as any).mockResolvedValue(null);
    (matcher.match as any).mockResolvedValue(metadata);
    (cache.getActiveNoiseTokens as any).mockResolvedValue([]);

    await service.sync();

    // Should have called incrementNoise with 'NOVELTAG'
    // (1080p is already in static noise, so it should be filtered out)
    expect(cache.incrementNoise).toHaveBeenCalledWith(['NOVELTAG']);
  });
});
