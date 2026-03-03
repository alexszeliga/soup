import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetadataCache } from '../MetadataCache.js';
import { Torrent } from '../Torrent.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { createDatabase, DatabaseInstance } from '@soup/database';
import * as fs from 'fs';

describe('MetadataCache Service', () => {
  let db: DatabaseInstance;
  let cache: MetadataCache;
  const dbPath = './test-cache-unique.db';

  beforeEach(() => {
    db = createDatabase(dbPath);
    cache = new MetadataCache(db);
    
    // Create tables manually for testing if migrations are not used
    db.run(`CREATE TABLE IF NOT EXISTS metadata (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      year INTEGER NOT NULL,
      plot TEXT NOT NULL,
      cast TEXT NOT NULL,
      poster_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS torrents (
      hash TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      metadata_id TEXT REFERENCES metadata(id),
      updated_at INTEGER NOT NULL
    )`);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should save and retrieve metadata for a torrent', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The Great Movie',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 100,
      contentPath: 'p1'
    });

    const metadata = new MediaMetadata({
      id: 'tmdb-123',
      title: 'The Great Movie',
      year: 2024,
      plot: 'A great movie.',
      cast: ['Actor One'],
      posterPath: '/path.jpg'
    });

    await cache.saveMetadataForTorrent(torrent, metadata);
    const retrieved = await cache.getMetadataForTorrent(torrent.hash);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(metadata.id);
    expect(retrieved?.title).toBe(metadata.title);
  });

  it('should unmatch a torrent', async () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'Movie',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const metadata = new MediaMetadata({
      id: 'm1',
      title: 'Movie',
      year: 2024,
      plot: '',
      cast: [],
      posterPath: ''
    });

    await cache.saveMetadataForTorrent(torrent, metadata);
    await cache.unmatchTorrent(torrent.hash);

    const retrieved = await cache.getMetadataForTorrent(torrent.hash);
    expect(retrieved).toBeNull();
  });
});
