import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { QBClient, QBPreferences } from '@soup/core/QBClient.js';
import { TMDBMetadataProvider } from '@soup/core/TMDBMetadataProvider.js';
import { MetadataMatcher } from '@soup/core/MetadataMatcher.js';
import { MetadataCache } from '@soup/core/MetadataCache.js';
import { SyncEngine } from '@soup/core/SyncEngine.js';
import { LiveSyncService } from '@soup/core/LiveSyncService.js';
import { ConfigLoader } from '@soup/core/Config.js';
import { createDatabase } from '@soup/database';

const config = ConfigLoader.load();
const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: '*', // For development
});

await fastify.register(multipart);

const db = createDatabase(config.DB_PATH);
const qb = new QBClient(config.QB_URL);
const tmdb = new TMDBMetadataProvider(
  config.TMDB_API_KEY, 
  config.TMDB_BASE_URL, 
  config.TMDB_IMAGE_BASE_URL
);
const matcher = new MetadataMatcher(tmdb);
const cache = new MetadataCache(db);
const engine = new SyncEngine(qb);
const liveSync = new LiveSyncService(engine, matcher, cache);

await cache.ensureTables();

// Login to qBittorrent before starting
try {
  fastify.log.info('Logging in to qBittorrent...');
  await qb.login(config.QB_USERNAME, config.QB_PASSWORD);
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
    await new Promise(resolve => setTimeout(resolve, config.SYNC_INTERVAL_MS));
  }
};

startSync();

fastify.get('/api/torrents', async () => {
  return liveSync.getTorrentsWithMetadata();
});

fastify.get('/api/torrents/:hash/files', async (request) => {
  const { hash } = request.params as { hash: string };
  return qb.getTorrentFiles(hash);
});

fastify.get('/api/state', async () => {
  return liveSync.getServerState();
});

fastify.get('/api/preferences', async () => {
  return qb.getPreferences();
});

fastify.get('/api/config', async () => {
  return ConfigLoader.getClientConfig(config);
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
 * Common wrapper for async API actions.
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
async function handleAPIAction(reply: any, action: () => Promise<void>) {
  try {
    await action();
    return { success: true };
  } catch (error: any) {
    fastify.log.error(error);
    reply.status(500).send({ error: error.message });
  }
}

fastify.post('/api/preferences', async (request, reply) => {
  const prefs = request.body as Partial<QBPreferences>;
  return handleAPIAction(reply, () => qb.setPreferences(prefs));
});

fastify.post('/api/torrents/:hash/unmatch', async (request, reply) => {
  const { hash } = request.params as { hash: string };
  return handleAPIAction(reply, () => cache.unmatchTorrent(hash));
});

fastify.post('/api/torrents/:hash/files/priority', async (request, reply) => {
  const { hash } = request.params as { hash: string };
  const { indices, priority } = request.body as { indices: number[], priority: number };
  return handleAPIAction(reply, () => qb.setFilePriority(hash, indices, priority));
});

fastify.post('/api/torrents/pause', async (request, reply) => {
  const { hashes } = request.body as { hashes: string[] };
  return handleAPIAction(reply, () => qb.pauseTorrents(hashes));
});

fastify.post('/api/torrents/resume', async (request, reply) => {
  const { hashes } = request.body as { hashes: string[] };
  return handleAPIAction(reply, () => qb.forceStartTorrents(hashes));
});

fastify.delete('/api/torrents', async (request, reply) => {
  const { hashes, deleteFiles } = request.query as { hashes: string, deleteFiles?: string };
  return handleAPIAction(reply, () => qb.deleteTorrents(hashes.split('|'), deleteFiles === 'true'));
});

const start = async () => {
  try {
    const port = config.PORT;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
