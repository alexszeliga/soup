import { describe, it, expect, vi } from 'vitest';
import { MetadataMatcher } from '../MetadataMatcher.js';
import { Torrent } from '../Torrent.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { MetadataProvider } from '../MetadataProvider.js';

describe('MetadataMatcher Service', () => {
  it('should match a torrent to media metadata using a provider', async () => {
    const mockMetadata = new MediaMetadata({
      id: 'tmdb-123',
      title: 'The Great Movie',
      year: 2024,
      plot: 'A great movie.',
      cast: ['Actor One'],
      posterPath: '/path.jpg'
    });

    const mockProvider: MetadataProvider = {
      search: vi.fn().mockResolvedValue(mockMetadata),
      searchCandidates: vi.fn(),
      getById: vi.fn()
    };

    const matcher = new MetadataMatcher(mockProvider);
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The.Great.Movie.2024.1080p.WEB-DL',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 100,
      contentPath: 'p1'
    });

    const result = await matcher.match(torrent);

    expect(mockProvider.search).toHaveBeenCalledWith('The Great Movie', 2024);
    expect(result).toBe(mockMetadata);
  });
});
