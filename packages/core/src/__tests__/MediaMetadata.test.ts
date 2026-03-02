import { describe, it, expect } from 'vitest';
import { MediaMetadata } from '../MediaMetadata.js';

describe('MediaMetadata Model', () => {
  it('should create a MediaMetadata instance with required properties', () => {
    const metaData = {
      id: 'tmdb-123',
      title: 'The Great Movie',
      year: 2024,
      plot: 'A great movie about something.',
      cast: ['Actor One', 'Actor Two'],
      posterPath: '/path/to/poster.jpg'
    };

    const metadata = new MediaMetadata(metaData);

    expect(metadata.id).toBe(metaData.id);
    expect(metadata.title).toBe(metaData.title);
    expect(metadata.year).toBe(metaData.year);
    expect(metadata.plot).toBe(metaData.plot);
    expect(metadata.cast).toEqual(metaData.cast);
    expect(metadata.posterPath).toBe(metaData.posterPath);
  });
});
