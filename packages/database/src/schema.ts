import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const metadata = sqliteTable('metadata', {
  hash: text('hash').primaryKey(), // torrent hash
  data: text('data').notNull(), // JSON string containing all metadata
  updatedAt: integer('updated_at').notNull(),
});

export const torrents = sqliteTable('torrents', {
  hash: text('hash').primaryKey(),
  name: text('name').notNull(),
  isNonMedia: integer('is_non_media', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
});

export const noiseTokens = sqliteTable('noise_tokens', {
  token: text('token').primaryKey(),
  hitCount: integer('hit_count').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

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
