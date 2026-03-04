import { eq } from 'drizzle-orm';
import { DatabaseInstance } from '@soup/database';
import { metadata as metadataSchema, torrents as torrentsSchema } from '@soup/database/schema.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';

/**
 * Persistence service for caching MediaMetadata locally using SQLite.
 * 
 * This minimizes API calls to providers like TMDB and ensures metadata 
 * is preserved even if the torrent is renamed or moved in qBittorrent.
 */
export class MetadataCache {
  /**
   * Creates an instance of MetadataCache.
   * 
   * @param db - The database instance.
   */
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Initializes the database schema if it does not exist.
   * 
   * Creates the `metadata` and `torrents` tables.
   * 
   * @returns A promise that resolves when tables are ensured.
   */
  public async ensureTables(): Promise<void> {
    this.db.run(`CREATE TABLE IF NOT EXISTS metadata (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      year INTEGER NOT NULL,
      plot TEXT NOT NULL,
      cast TEXT NOT NULL,
      poster_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS torrents (
      hash TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      metadata_id TEXT REFERENCES metadata(id),
      is_non_media INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      torrent_hash TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      completed_bytes INTEGER NOT NULL DEFAULT 0,
      file_map TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);

    // Ensure is_non_media column exists for migrations from older versions
    try {
      this.db.run(`ALTER TABLE torrents ADD COLUMN is_non_media INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Column already exists, ignore error
    }
  }

  /**
   * Retrieves cached metadata for a specific torrent hash.
   * 
   * @param hash - The SHA-1 hash of the torrent.
   * @returns The cached MediaMetadata object, or null if not found or marked as non-media.
   */
  public async getMetadataForTorrent(hash: string): Promise<MediaMetadata | null> {
    const result = await this.db.query.torrents.findFirst({
      where: eq(torrentsSchema.hash, hash),
      with: {
        metadata: true,
      },
    });

    if (!result || !result.metadata || result.isNonMedia) {
      return null;
    }

    const meta = result.metadata;

    return new MediaMetadata({
      id: meta.id,
      title: meta.title,
      year: meta.year,
      plot: meta.plot,
      cast: JSON.parse(meta.cast),
      posterPath: meta.posterPath,
    });
  }

  /**
   * Returns true if the torrent has been manually marked as non-media content.
   * 
   * @param hash - The torrent hash.
   * @returns Non-media status.
   */
  public async isNonMedia(hash: string): Promise<boolean> {
    const result = await this.db.query.torrents.findFirst({
      where: eq(torrentsSchema.hash, hash),
    });
    return !!result?.isNonMedia;
  }

  /**
   * Marks or unmarks a torrent as non-media content.
   * 
   * Performs an upsert to ensure the status is persisted even if the torrent 
   * record does not yet exist in the database.
   * 
   * @param hash - The torrent hash.
   * @param isNonMedia - True to mark as non-media.
   * @param name - The torrent name (required for initial insertion).
   */
  public async setNonMedia(hash: string, isNonMedia: boolean, name: string): Promise<void> {
    const now = Date.now();
    
    this.db.insert(torrentsSchema).values({
      hash,
      name,
      isNonMedia,
      metadataId: isNonMedia ? null : undefined,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: torrentsSchema.hash,
      set: {
        isNonMedia,
        metadataId: isNonMedia ? null : undefined,
        updatedAt: now,
      }
    }).run();
  }

  /**
   * Saves or updates metadata for a torrent in the local cache.
   * 
   * Performs an upsert on both the metadata and the torrent-to-metadata mapping.
   * 
   * @param torrent - The torrent being cached.
   * @param metadata - The metadata to associate with the torrent.
   * @returns A promise that resolves when saving is complete.
   */
  public async saveMetadataForTorrent(torrent: Torrent, metadata: MediaMetadata): Promise<void> {
    const now = Date.now();

    // 1. Upsert metadata
    this.db.insert(metadataSchema).values({
      id: metadata.id,
      title: metadata.title,
      year: metadata.year,
      plot: metadata.plot,
      cast: JSON.stringify(metadata.cast),
      posterPath: metadata.posterPath,
      createdAt: now,
    }).onConflictDoUpdate({
      target: metadataSchema.id,
      set: {
        title: metadata.title,
        year: metadata.year,
        plot: metadata.plot,
        cast: JSON.stringify(metadata.cast),
        posterPath: metadata.posterPath,
      }
    }).run();

    // 2. Upsert torrent record (reset isNonMedia if we are saving metadata)
    this.db.insert(torrentsSchema).values({
      hash: torrent.hash,
      name: torrent.name,
      metadataId: metadata.id,
      isNonMedia: false,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: torrentsSchema.hash,
      set: {
        name: torrent.name,
        metadataId: metadata.id,
        isNonMedia: false,
        updatedAt: now,
      }
    }).run();
  }

  /**
   * Clears the metadata association for a specific torrent.
   * 
   * @param hash - The torrent hash to unmatch.
   * @returns A promise that resolves when the update is complete.
   */
  public async unmatchTorrent(hash: string): Promise<void> {
    this.db.update(torrentsSchema)
      .set({ metadataId: null, updatedAt: Date.now() })
      .where(eq(torrentsSchema.hash, hash))
      .run();
  }
}
