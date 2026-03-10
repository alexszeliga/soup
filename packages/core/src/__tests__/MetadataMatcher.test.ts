import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataMatcher } from '../MetadataMatcher.js';
import { Torrent } from '../Torrent.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { MetadataProvider } from '../MetadataProvider.js';
import { FuseLocalMatcher } from '../LocalMatcher.js';

describe('MetadataMatcher', () => {
  let mockProvider: MetadataProvider;
  let matcher: MetadataMatcher;
  let localMatcher: FuseLocalMatcher;

  const sampleMetadata = new MediaMetadata({
    id: '1',
    title: 'The Simpsons',
    year: 1989,
    plot: 'Yellow people.',
    cast: [],
    posterPath: '/simpsons.jpg'
  });

  beforeEach(() => {
    mockProvider = {
      search: vi.fn(),
      getById: vi.fn(),
      searchCandidates: vi.fn(),
    } as unknown as MetadataProvider;
    
    localMatcher = new FuseLocalMatcher([sampleMetadata]);
    matcher = new MetadataMatcher(mockProvider, localMatcher);
  });

  it('should return a local match if title is similar enough', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The.Simpsons.S01E01.720p',
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const result = await matcher.match(torrent);

    expect(result).toEqual(sampleMetadata);
    expect(mockProvider.search).not.toHaveBeenCalled();
  });

  it('should handle typos via fuzzy matching', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The.Simpons.S01E01.720p', // Missing 's'
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const result = await matcher.match(torrent);

    expect(result).toEqual(sampleMetadata);
    expect(mockProvider.search).not.toHaveBeenCalled();
  });

  it('should fallback to provider if no local match is found', async () => {
    const movieMeta = new MediaMetadata({
      id: '2',
      title: 'The Matrix',
      year: 1999,
      plot: 'Red pill.',
      cast: [],
      posterPath: '/matrix.jpg'
    });
    vi.mocked(mockProvider.search).mockResolvedValue(movieMeta);

    const torrent = new Torrent({
      hash: 'h2',
      name: 'The.Matrix.1999.1080p',
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p2'
    });

    const result = await matcher.match(torrent);

    expect(result).toEqual(movieMeta);
    expect(mockProvider.search).toHaveBeenCalledWith('The Matrix', 1999);
  });

  it('should NOT match if the distance is too large', async () => {
    // Star Wars should not match The Simpsons
    const torrent = new Torrent({
      hash: 'h3',
      name: 'Star.Wars.1977.1080p',
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p3'
    });

    vi.mocked(mockProvider.search).mockResolvedValue(null);

    const result = await matcher.match(torrent);

    expect(result).toBeNull();
    expect(mockProvider.search).toHaveBeenCalled();
  });
});
