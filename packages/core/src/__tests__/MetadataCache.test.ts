import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetadataCache } from '../MetadataCache.js';
import { Torrent } from '../Torrent.js';
import { MediaMetadata } from '../MediaMetadata.js';
import { createDatabase, DatabaseInstance } from '@soup/database';
import { torrents as torrentsSchema } from '@soup/database/schema.js';
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
      is_non_media INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should ensure all tables exist via ensureTables', async () => {
    const freshDbPath = './ensure-tables-test.db';
    if (fs.existsSync(freshDbPath)) fs.unlinkSync(freshDbPath);

    const freshDb = createDatabase(freshDbPath);
    const freshCache = new MetadataCache(freshDb);

    await freshCache.ensureTables();

    // Verify tables exist by attempting to select from them
    // If they don't exist, these will throw
    expect(() => freshDb.run('SELECT count(*) FROM metadata')).not.toThrow();
    expect(() => freshDb.run('SELECT count(*) FROM torrents')).not.toThrow();
    expect(() => freshDb.run('SELECT count(*) FROM tasks')).not.toThrow();

    if (fs.existsSync(freshDbPath)) fs.unlinkSync(freshDbPath);
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

  it('should mark a torrent as non-media', async () => {
    const hash = 'h1';
    const name = 'Non-Media File';
    await db.insert(torrentsSchema).values({
      hash,
      name,
      updatedAt: Date.now(),
      isNonMedia: false
    }).run();

    await cache.setNonMedia(hash, true, name);
    const isNonMedia = await cache.isNonMedia(hash);
    expect(isNonMedia).toBe(true);

    const metadata = await cache.getMetadataForTorrent(hash);
    expect(metadata).toBeNull();
  });

  it('should persist non-media status even if torrent record did not exist', async () => {
    const torrent = new Torrent({
      hash: 'new-hash',
      name: 'Untracked File',
      progress: 0,
      state: 'downloading',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p'
    });

    await cache.setNonMedia(torrent.hash, true, torrent.name);
    
    // Verify it exists in DB
    const isNonMedia = await cache.isNonMedia(torrent.hash);
    expect(isNonMedia).toBe(true);
  });
});
