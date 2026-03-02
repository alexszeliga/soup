import { eq } from 'drizzle-orm';
import { DatabaseInstance } from '@soup/database';
import { metadata as metadataSchema, torrents as torrentsSchema } from '@soup/database/schema.js';
import { MediaMetadata } from './MediaMetadata.js';
import { Torrent } from './Torrent.js';

export class MetadataCache {
  constructor(private readonly db: DatabaseInstance) {}

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
      updated_at INTEGER NOT NULL
    )`);
  }

  public async getMetadataForTorrent(hash: string): Promise<MediaMetadata | null> {
    const result = await this.db.query.torrents.findFirst({
      where: eq(torrentsSchema.hash, hash),
      with: {
        metadata: true,
      },
    });

    if (!result || !result.metadata) {
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

    // 2. Upsert torrent record
    this.db.insert(torrentsSchema).values({
      hash: torrent.hash,
      name: torrent.name,
      metadataId: metadata.id,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: torrentsSchema.hash,
      set: {
        name: torrent.name,
        metadataId: metadata.id,
        updatedAt: now,
      }
    }).run();
  }
}
