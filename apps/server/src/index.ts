import Fastify, { FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { QBClient, QBPreferences } from '@soup/core/QBClient.js';
import { TMDBMetadataProvider } from '@soup/core/TMDBMetadataProvider.js';
import { MetadataMatcher } from '@soup/core/MetadataMatcher.js';
import { MetadataCache } from '@soup/core/MetadataCache.js';
import { SyncEngine } from '@soup/core/SyncEngine.js';
import { LiveSyncService } from '@soup/core/LiveSyncService.js';
import { IngestionService } from '@soup/core/IngestionService.js';
import { TaskQueue } from '@soup/core/TaskQueue.js';
import { ConfigLoader } from '@soup/core/Config.js';
import { createDatabase } from '@soup/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = ConfigLoader.load();
const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: '*', // For development
});

await fastify.register(multipart);

// 1. Serve Coverage Reports (Dev Only)
if (config.NODE_ENV === 'development') {
  const coveragePath = path.resolve(__dirname, '../../../coverage');
  fastify.register(fastifyStatic, {
    root: coveragePath,
    prefix: '/coverage/',
    decorateReply: false
  });
  fastify.log.info(`[Dev] Serving coverage reports from: ${coveragePath}`);
}

// 2. Serve Web Assets
const webDistPath = path.resolve(__dirname, config.WEB_DIST_PATH);
fastify.register(fastifyStatic, {
  root: webDistPath,
  prefix: '/',
  wildcard: false // Don't match everything here, we use setNotFoundHandler for SPA
});

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
const liveSync = new LiveSyncService(engine, matcher, cache, tmdb);
const ingestion = new IngestionService(config.MEDIA_ROOT);
const queue = new TaskQueue(db);

await cache.ensureTables();

// Track the hash currently being "viewed" by a user to prioritize file syncing.
let currentFocus: string | null = null;

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
      // Pass the current globally tracked focus to the sync method
      await liveSync.sync(currentFocus);
    } catch (error) {
      fastify.log.error(error, 'Sync error');
    }
    await new Promise(resolve => setTimeout(resolve, config.SYNC_INTERVAL_MS));
  }
};

startSync();

fastify.get('/api/torrents', async (request) => {
  fastify.log.info({ url: request.url, query: request.query }, 'Received torrents request');
  currentFocus = null; // Clear focus if we hit the standard list
  return liveSync.getTorrentsWithMetadata();
});

fastify.get('/api/torrents/focus/:hash', async (request) => {
  const { hash } = request.params as { hash: string };
  fastify.log.info(`[API] Focus requested via PATH for: ${hash}`);
  
  currentFocus = hash;
  
  // Force an immediate sync to get file data right now
  await liveSync.sync(currentFocus);
  
  const torrents = liveSync.getTorrentsWithMetadata();
  const focused = torrents.find(t => t.hash === hash);
  fastify.log.info(`[API] Returning focused list. Files found: ${focused?.files?.length ?? 0}`);
  return torrents;
});

fastify.get('/api/torrents/:hash/files', async (request) => {
  const { hash } = request.params as { hash: string };
  return qb.getTorrentFiles(hash);
});

fastify.get('/api/state', async () => {
  return liveSync.getServerState();
});

fastify.post('/api/toggle-alt-speeds', async (request, reply) => {
  return handleAPIAction(reply, () => qb.toggleAltSpeedLimits());
});

fastify.get('/api/preferences', async () => {
  return qb.getPreferences();
});

fastify.get('/api/config', async () => {
  return ConfigLoader.getClientConfig(config);
});

fastify.get('/api/tasks', async () => {
  return queue.getTasks();
});

fastify.post('/api/tasks/clear', async () => {
  return queue.clearFinished();
});

fastify.get('/api/libraries', async () => {
  return ingestion.getLibraryOptions();
});

fastify.get('/api/torrents/:hash/suggest-paths', async (request) => {
  const { hash } = request.params as { hash: string };
  const { library } = request.query as { library?: string };
  const torrents = liveSync.getTorrentsWithMetadata();
  const torrent = torrents.find(t => t.hash === hash);
  
  if (!torrent) return [];

  const title = torrent.mediaMetadata?.title || torrent.getMediaInfo().title;
  const year = torrent.mediaMetadata?.year || torrent.getMediaInfo().year;

  // We need to fetch files if they aren't in memory
  const files = torrent.files || await qb.getTorrentFiles(hash);
  
  return files.map(f => {
    const suggestion = ingestion.suggestPath(title, f.name, year ?? undefined);
    
    // Resolve absolute source path (handling path mapping and potential duplication)
    const absolutePath = ingestion.resolveSourcePath(
      torrent,
      f,
      config.QB_DOWNLOAD_ROOT,
      config.LOCAL_DOWNLOAD_ROOT
    );

    return {
      index: f.index,
      originalName: f.name,
      sourcePath: absolutePath,
      suggestedPath: library ? path.join(library, suggestion) : suggestion
    };
  });
});

fastify.post('/api/torrents', async (request, reply) => {
  const data = await request.file();
  
  if (data) {
    const buffer = await data.toBuffer();
    const file = new File([new Uint8Array(buffer)], data.filename, { type: data.mimetype });
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
async function handleAPIAction(reply: FastifyReply, action: () => Promise<void>) {
  try {
    await action();
    return { success: true };
  } catch (error: unknown) {
    fastify.log.error(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(500).send({ error: message });
  }
}

fastify.post('/api/preferences', async (request, reply) => {
  const prefs = request.body as Partial<QBPreferences>;
  return handleAPIAction(reply, () => qb.setPreferences(prefs));
});

fastify.get('/api/metadata/search', async (request) => {
  const { query } = request.query as { query: string };
  if (!query) return [];
  return tmdb.searchCandidates(query);
});

fastify.post('/api/torrents/:hash/metadata', async (request, reply) => {
  const { hash } = request.params as { hash: string };
  const { metadataId } = request.body as { metadataId: string };
  return handleAPIAction(reply, () => liveSync.linkMetadata(hash, metadataId));
});

fastify.post('/api/torrents/:hash/unmatch', async (request, reply) => {
  const { hash } = request.params as { hash: string };
  return handleAPIAction(reply, () => liveSync.unmatchTorrent(hash));
});

fastify.post('/api/torrents/:hash/non-media', async (request, reply) => {
  const { hash } = request.params as { hash: string };
  const { isNonMedia } = request.body as { isNonMedia: boolean };
  return handleAPIAction(reply, () => liveSync.markAsNonMedia(hash, isNonMedia));
});

fastify.post('/api/torrents/:hash/ingest', async (request) => {
  const { hash } = request.params as { hash: string };
  const { fileMap } = request.body as { fileMap: Record<string, string> };
  
  const task = ingestion.createCopyTask(hash, fileMap);
  queue.enqueue(task);
  
  return { success: true, taskId: task.id };
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

fastify.get('/api/torrents/:hash/files/:index/download', async (request, reply) => {
  const { hash, index: indexStr } = request.params as { hash: string, index: string };
  const index = parseInt(indexStr, 10);
  
  const torrents = liveSync.getTorrentsWithMetadata();
  const torrent = torrents.find(t => t.hash === hash);
  if (!torrent) {
    return reply.status(404).send({ error: 'Torrent not found' });
  }

  const files = torrent.files || await qb.getTorrentFiles(hash);
  const file = files.find(f => f.index === index);
  if (!file) {
    return reply.status(404).send({ error: 'File not found' });
  }

  // Resolve absolute source path (handling path mapping and potential duplication)
  const absolutePath = ingestion.resolveSourcePath(
    torrent,
    file,
    config.QB_DOWNLOAD_ROOT,
    config.LOCAL_DOWNLOAD_ROOT
  );

  fastify.log.info(`[Download] Serving file: ${absolutePath}`);
  
  const fs = await import('fs');
  if (!fs.existsSync(absolutePath)) {
    return reply.status(404).send({ error: 'File not found on disk' });
  }

  const stream = fs.createReadStream(absolutePath);
  reply.header('Content-Disposition', `attachment; filename="${path.basename(file.name)}"`);
  return reply.send(stream);
});

// 3. SPA Fallback: Catch-all for React routing
fastify.setNotFoundHandler((request, reply) => {
  // If it's an API request that 404'd, return JSON
  if (request.url.startsWith('/api')) {
    return reply.status(404).send({ error: 'API route not found' });
  }
  // Otherwise, serve the SPA index.html
  return reply.sendFile('index.html');
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
