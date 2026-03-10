import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TMDBMetadataProvider } from '../TMDBMetadataProvider.js';

describe('TMDBMetadataProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should search using multi-search and pick the best match', async () => {
    const mockMultiResponse = {
      results: [
        {
          id: 1,
          name: 'The Office',
          media_type: 'tv',
          first_air_date: '2005-03-24',
          overview: 'American version.',
          poster_path: '/us.jpg',
          popularity: 500,
          vote_count: 15000
        },
        {
          id: 2,
          title: 'Obscure Office Movie',
          media_type: 'movie',
          release_date: '2010-01-01',
          overview: 'Not what you want.',
          poster_path: '/obscure.jpg',
          popularity: 10,
          vote_count: 5
        }
      ]
    };

    const mockCreditsResponse = { cast: [] };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMultiResponse
    });

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreditsResponse
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.search('The Office', undefined, 'tv');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search/multi'));
    expect(result?.id).toBe('tmdb-tv-1');
    expect(result?.title).toBe('The Office');
  });

  it('should prioritize exact title matches over popularity', async () => {
    const mockMultiResponse = {
      results: [
        {
          id: 100,
          title: 'Popular Movie with Office in name',
          media_type: 'movie',
          release_date: '2024-01-01',
          overview: '...',
          popularity: 1000,
          vote_count: 5000
        },
        {
          id: 200,
          name: 'The Office',
          media_type: 'tv',
          first_air_date: '2005-03-24',
          overview: '...',
          popularity: 500,
          vote_count: 15000
        }
      ]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMultiResponse
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cast: [] })
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.search('The Office');

    // "The Office" should win because it is an exact title match (1000 points) 
    // even if it is less popular than the other movie.
    expect(result?.id).toBe('tmdb-tv-200');
  });

  it('should filter by year in search', async () => {
    const mockMultiResponse = {
      results: [
        {
          id: 1,
          title: 'Movie',
          media_type: 'movie',
          release_date: '2020-01-01',
          popularity: 100,
          vote_count: 100
        },
        {
          id: 2,
          title: 'Movie',
          media_type: 'movie',
          release_date: '2024-01-01',
          popularity: 100,
          vote_count: 100
        }
      ]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMultiResponse
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cast: [] })
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.search('Movie', 2024);

    expect(result?.year).toBe(2024);
    expect(result?.id).toBe('tmdb-movie-2');
  });
});
