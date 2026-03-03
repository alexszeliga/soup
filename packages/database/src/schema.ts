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
