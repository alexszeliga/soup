import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TMDBMetadataProvider } from '../TMDBMetadataProvider.js';

describe('TMDBMetadataProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should search for a movie and return media metadata', async () => {
    const mockSearchResponse = {
      results: [
        {
          id: 123,
          title: 'The Great Movie',
          release_date: '2024-05-20',
          overview: 'A great movie overview.',
          poster_path: '/path.jpg'
        }
      ]
    };

    const mockCreditsResponse = {
      cast: [
        { name: 'Actor One' },
        { name: 'Actor Two' }
      ]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse
    });

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreditsResponse
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.search('The Great Movie', 2024);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('The Great Movie');
    expect(result?.year).toBe(2024);
    expect(result?.cast).toEqual(['Actor One', 'Actor Two']);
  });
});
