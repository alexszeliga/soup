import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

export function createDatabase(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema });
}

export type DatabaseInstance = ReturnType<typeof createDatabase>;
