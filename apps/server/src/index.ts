import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
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

await fastify.register(multipart);

const qbUrl = process.env.QB_URL || 'https://qb.osage.lol/api/v2';
const qbUsername = process.env.QB_USERNAME;
const qbPassword = process.env.QB_PASSWORD;
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

// Login to qBittorrent before starting
try {
  fastify.log.info('Logging in to qBittorrent...');
  await qb.login(qbUsername, qbPassword);
  fastify.log.info('Login successful');
} catch (error) {
  fastify.log.error(error, 'Login failed');
}

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

fastify.post('/api/torrents', async (request, reply) => {
  const data = await request.file();
  
  if (data) {
    const buffer = await data.toBuffer();
    const file = new File([buffer as any], data.filename, { type: data.mimetype });
    await qb.addTorrents([], [file]);
    return { success: true };
  }
 else {
    const body = request.body as { url?: string };
    if (body?.url) {
      await qb.addTorrents([body.url]);
      return { success: true };
    }
  }

  reply.status(400).send({ error: 'No torrent file or magnet link provided' });
});

/**
 * Common wrapper for torrent action routes.
 * 
 * Handles:
 * 1. Execution of the provided async action.
 * 2. Standardized success response format.
 * 3. Consistent error logging and 500 status reporting.
 * 
 * @param reply - The Fastify reply object.
 * @param action - The async function to execute.
 * @returns Standard { success: true } or error object.
 */
async function handleTorrentAction(reply: any, action: () => Promise<void>) {
  try {
    await action();
    return { success: true };
  } catch (error: any) {
    fastify.log.error(error);
    reply.status(500).send({ error: error.message });
  }
}

fastify.post('/api/torrents/pause', async (request, reply) => {
  const { hashes } = request.body as { hashes: string[] };
  return handleTorrentAction(reply, () => qb.pauseTorrents(hashes));
});

fastify.post('/api/torrents/resume', async (request, reply) => {
  const { hashes } = request.body as { hashes: string[] };
  return handleTorrentAction(reply, () => qb.forceStartTorrents(hashes));
});

fastify.delete('/api/torrents', async (request, reply) => {
  const { hashes, deleteFiles } = request.query as { hashes: string, deleteFiles?: string };
  return handleTorrentAction(reply, () => qb.deleteTorrents(hashes.split('|'), deleteFiles === 'true'));
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
