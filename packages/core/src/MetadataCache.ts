import { eq, sql, gt, and } from 'drizzle-orm';
import { DatabaseInstance } from '@soup/database';
import { 
  metadata as metadataSchema, 
  torrents as torrentsSchema,
  noiseTokens as noiseTokensSchema
} from '@soup/database/schema.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';

/**
 * Persistence service for caching MediaMetadata locally using SQLite.
 * 
 * This minimizes API calls to providers like TMDB and ensures metadata 
 * is preserved even if the torrent is renamed or moved in qBittorrent.
 */
export class MetadataCache {
  private readonly MAX_BUSY_RETRIES = 5;
  private readonly BUSY_RETRY_DELAY_MS = 100;

  /**
   * Creates an instance of MetadataCache.
   * 
   * @param db - The database instance.
   */
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Helper to execute DB operations with retry logic for SQLITE_BUSY.
   * 
   * @param op - The operation to execute.
   * @returns The result of the operation.
   */
  private async withRetry<T>(op: () => T): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < this.MAX_BUSY_RETRIES; i++) {
      try {
        return op();
      } catch (err: unknown) {
        lastError = err;
        if (err && typeof err === 'object' && ('code' in err || 'message' in err)) {
          const e = err as { code?: string; message?: string };
          if (e.code === 'SQLITE_BUSY' || e.message?.includes('busy')) {
            await new Promise(resolve => setTimeout(resolve, this.BUSY_RETRY_DELAY_MS * Math.pow(2, i)));
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  /**
   * Initializes the database schema if it does not exist.
   * 
   * Creates the `metadata`, `torrents`, `tasks`, and `noise_tokens` tables.
   * 
   * @returns A promise that resolves when tables are ensured.
   */
  public async ensureTables(): Promise<void> {
    await this.withRetry(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS metadata (
        hash TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      this.db.run(`CREATE TABLE IF NOT EXISTS torrents (
        hash TEXT PRIMARY KEY,
        name TEXT NOT NULL,
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
      this.db.run(`CREATE TABLE IF NOT EXISTS noise_tokens (
        token TEXT PRIMARY KEY,
        hit_count INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`);

      // Ensure is_non_media column exists for migrations from older versions
      try {
        this.db.run(`ALTER TABLE torrents ADD COLUMN is_non_media INTEGER NOT NULL DEFAULT 0`);
      } catch {
        // Column already exists, ignore error
      }
    });
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
    });

    if (!result || result.isNonMedia) {
      return null;
    }

    // Retrieve metadata from the metadata table
    const metadataResult = await this.db.query.metadata.findFirst({
      where: eq(metadataSchema.hash, hash),
    });

    if (!metadataResult) {
      return null;
    }

    // Parse the JSON data
    const data = JSON.parse(metadataResult.data) as {
      id: string;
      title: string;
      year: number;
      plot: string;
      cast: string[];
      posterPath: string;
    };

    return new MediaMetadata({
      id: data.id,
      title: data.title,
      year: data.year,
      plot: data.plot,
      cast: data.cast,
      posterPath: data.posterPath,
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
    
    await this.withRetry(() => {
      this.db.transaction((tx) => {
        tx.insert(torrentsSchema).values({
          hash,
          name,
          isNonMedia,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: torrentsSchema.hash,
          set: {
            isNonMedia,
            updatedAt: now,
          }
        }).run();
      });
    });
  }

  /**
   * Saves or updates metadata for a torrent in the local cache.
   * 
   * Performs an upsert on both the metadata and the torrent.
   * 
   * @param torrent - The torrent being cached.
   * @param metadata - The metadata to associate with the torrent.
   * @returns A promise that resolves when saving is complete.
   */
  public async saveMetadataForTorrent(torrent: Torrent, metadata: MediaMetadata): Promise<void> {
    const now = Date.now();

    await this.withRetry(() => {
      this.db.transaction((tx) => {
        // 1. Upsert metadata (store as JSON in data field)
        tx.insert(metadataSchema).values({
          hash: torrent.hash,
          data: JSON.stringify({
            id: metadata.id,
            title: metadata.title,
            year: metadata.year,
            plot: metadata.plot,
            cast: metadata.cast,
            posterPath: metadata.posterPath,
          }),
          updatedAt: now,
        }).onConflictDoUpdate({
          target: metadataSchema.hash,
          set: {
            data: JSON.stringify({
              id: metadata.id,
              title: metadata.title,
              year: metadata.year,
              plot: metadata.plot,
              cast: metadata.cast,
              posterPath: metadata.posterPath,
            }),
            updatedAt: now,
          }
        }).run();

        // 2. Upsert torrent record
        tx.insert(torrentsSchema).values({
          hash: torrent.hash,
          name: torrent.name,
          isNonMedia: false,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: torrentsSchema.hash,
          set: {
            name: torrent.name,
            isNonMedia: false,
            updatedAt: now,
          }
        }).run();
      });
    });
  }

  /**
   * Increments the hit count for one or more noise tokens.
   * 
   * @param tokens - List of tokens to increment.
   */
  public async incrementNoise(tokens: string[]): Promise<void> {
    const now = Date.now();
    await this.withRetry(() => {
      for (const token of tokens) {
        this.db.insert(noiseTokensSchema).values({
          token,
          hitCount: 1,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: noiseTokensSchema.token,
          set: {
            hitCount: sql`${noiseTokensSchema.hitCount} + 1`,
            updatedAt: now,
          }
        }).run();
      }
    });
  }

  /**
   * Retrieves all noise tokens that meet the promotion criteria.
   * 
   * Promotion Criteria: hit_count >= 5 AND length > 2.
   * 
   * @returns List of active noise tokens.
   */
  public async getActiveNoiseTokens(): Promise<string[]> {
    const results = await this.db.select({ token: noiseTokensSchema.token })
      .from(noiseTokensSchema)
      .where(and(
        gt(noiseTokensSchema.hitCount, 4),
        sql`LENGTH(${noiseTokensSchema.token}) > 2`
      ));
    
    return results.map(r => r.token);
  }

  /**
   * Retrieves all unique MediaMetadata records stored in the cache.
   * 
   * Useful for initializing local fuzzy matching indexes.
   * 
   * @returns Array of unique MediaMetadata objects.
   */
  public async getAllUniqueMetadata(): Promise<MediaMetadata[]> {
    const results = await this.db.query.metadata.findMany();

    return results.map((meta) => {
      const data = JSON.parse(meta.data) as {
        id: string;
        title: string;
        year: number;
        plot: string;
        cast: string[];
        posterPath: string;
      };
      return new MediaMetadata({
        id: data.id,
        title: data.title,
        year: data.year,
        plot: data.plot,
        cast: data.cast,
        posterPath: data.posterPath,
      });
    });
  }

  /**
   * Clears the metadata association for a specific torrent.
   * 
   * @param hash - The torrent hash to unmatch.
   * @returns A promise that resolves when the update is complete.
   */
  public async unmatchTorrent(hash: string): Promise<void> {
    await this.withRetry(() => {
      this.db.delete(metadataSchema).where(eq(metadataSchema.hash, hash)).run();
    });
  }
}
