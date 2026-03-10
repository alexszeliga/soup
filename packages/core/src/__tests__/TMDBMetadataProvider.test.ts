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
          poster_path: '/path.jpg',
          popularity: 100,
          vote_count: 50
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

  it('should pick the most popular match among results', async () => {
    const mockMovieResponse = { results: [] };
    const mockTvResponse = {
      results: [
        {
          id: 1,
          name: 'The Office (UK)',
          first_air_date: '2001-07-09',
          overview: 'British version.',
          poster_path: '/uk.jpg',
          popularity: 50,
          vote_count: 1000
        },
        {
          id: 2,
          name: 'The Office (US)',
          first_air_date: '2005-03-24',
          overview: 'American version.',
          poster_path: '/us.jpg',
          popularity: 500, // Much more popular
          vote_count: 15000
        }
      ]
    };

    const mockCreditsResponse = { cast: [] };

    // 1. Movie Search (Empty)
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMovieResponse
    });

    // 2. TV Search (With results)
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTvResponse
    });

    // 3. Credits fetch for best match
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreditsResponse
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.search('The Office');

    expect(result?.id).toBe('tmdb-tv-2');
    expect(result?.title).toBe('The Office (US)');
  });

  it('should search for candidates and return multiple results', async () => {
    const mockMovieResponse = {
      results: [
        { id: 1, title: 'Movie 1', release_date: '2021-01-01', overview: 'Plot 1', poster_path: '/p1.jpg', popularity: 10, vote_count: 1 }
      ]
    };
    const mockTvResponse = {
      results: [
        { id: 2, name: 'TV Show 1', first_air_date: '2022-01-01', overview: 'Plot 2', poster_path: '/p2.jpg', popularity: 10, vote_count: 1 }
      ]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMovieResponse
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTvResponse
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const results = await provider.searchCandidates('Query');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('tmdb-movie-1');
    expect(results[1].id).toBe('tmdb-tv-2');
  });

  it('should fetch specific metadata by ID', async () => {
    const mockResponse = {
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
      overview: 'Plot...',
      poster_path: '/path.jpg',
      popularity: 100,
      vote_count: 100
    };

    const mockCreditsResponse = { cast: [{ name: 'Brad Pitt' }] };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreditsResponse
    });

    const provider = new TMDBMetadataProvider('fake-api-key');
    const result = await provider.getById('tmdb-movie-550');

    expect(result?.id).toBe('tmdb-movie-550');
    expect(result?.title).toBe('Fight Club');
    expect(result?.cast).toContain('Brad Pitt');
  });
});
