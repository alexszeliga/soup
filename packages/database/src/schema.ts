import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const metadata = sqliteTable('metadata', {
  id: text('id').primaryKey(), // TMDB ID
  title: text('title').notNull(),
  year: integer('year').notNull(),
  plot: text('plot').notNull(),
  cast: text('cast').notNull(), // JSON string
  posterPath: text('poster_path').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const metadataRelations = relations(metadata, ({ many }) => ({
  torrents: many(torrents),
}));

export const torrents = sqliteTable('torrents', {
  hash: text('hash').primaryKey(),
  name: text('name').notNull(),
  metadataId: text('metadata_id').references(() => metadata.id),
  isNonMedia: integer('is_non_media', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
});

export const torrentsRelations = relations(torrents, ({ one }) => ({
  metadata: one(metadata, {
    fields: [torrents.metadataId],
    references: [metadata.id],
  }),
}));

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  torrentHash: text('torrent_hash').notNull(),
  type: text('type', { enum: ['copy', 'move'] }).notNull(),
  status: text('status', { enum: ['queued', 'processing', 'completed', 'failed'] }).notNull(),
  progress: integer('progress').notNull().default(0), // 0-100
  totalBytes: integer('total_bytes').notNull().default(0),
  completedBytes: integer('completed_bytes').notNull().default(0),
  fileMap: text('file_map').notNull(), // JSON string: { source: destination }
  errorMessage: text('error_message'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
