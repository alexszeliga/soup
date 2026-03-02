import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import { QBClient } from '@soup/core/QBClient.js';
import { TMDBMetadataProvider } from '@soup/core/TMDBMetadataProvider.js';
import { MetadataMatcher } from '@soup/core/MetadataMatcher.js';
import { MetadataCache } from '@soup/core/MetadataCache.js';
import { SyncEngine } from '@soup/core/SyncEngine.js';
import { LiveSyncService } from '@soup/core/LiveSyncService.js';
import { createDatabase } from '@soup/database';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: '*', // For development
});

const qbUrl = process.env.QB_URL || 'https://qb.osage.lol/api/v2';
const tmdbApiKey = process.env.TMDB_API_KEY!;
const dbPath = process.env.DB_PATH || './soup.db';

if (!tmdbApiKey) {
  console.error('Error: TMDB_API_KEY is not defined in .env');
  process.exit(1);
}

const db = createDatabase(dbPath);
const qb = new QBClient(qbUrl);
const tmdb = new TMDBMetadataProvider(tmdbApiKey);
const matcher = new MetadataMatcher(tmdb);
const cache = new MetadataCache(db);
const engine = new SyncEngine(qb);
const liveSync = new LiveSyncService(engine, matcher, cache);

await cache.ensureTables();

// Background Sync Loop
const startSync = async () => {
  while (true) {
    try {
      await liveSync.sync();
    } catch (error) {
      fastify.log.error(error, 'Sync error');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

startSync();

fastify.get('/api/torrents', async (request, reply) => {
  return liveSync.getTorrentsWithMetadata();
});

fastify.get('/api/state', async (request, reply) => {
  return liveSync.getServerState();
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
