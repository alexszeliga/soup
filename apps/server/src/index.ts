import Fastify, { FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  ConfigLoader, 
  IngestionService, 
  LiveSyncService, 
  MetadataCache, 
  MetadataMatcher, 
  QBClient, 
  SyncEngine, 
  TaskQueue, 
  TMDBMetadataProvider,
  FuseLocalMatcher,
  type QBPreferences
} from '@soup/core';
import { createDatabase } from '@soup/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = ConfigLoader.load();
const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

await fastify.register(cors, {
  origin: '*', // For development
});

await fastify.register(multipart);

// Serve the React app from apps/web/dist
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../../web/dist'),
  prefix: '/',
});

const db = createDatabase(config.DB_PATH);
const qb = new QBClient(config.QB_URL);
const tmdb = new TMDBMetadataProvider(
  config.TMDB_API_KEY, 
  config.TMDB_BASE_URL, 
  config.TMDB_IMAGE_BASE_URL
);

const cache = new MetadataCache(db);
await cache.ensureTables();

// Initialize Local Fuzzy Matcher from cache
const uniqueMeta = await cache.getAllUniqueMetadata();
const localMatcher = new FuseLocalMatcher(uniqueMeta);
const matcher = new MetadataMatcher(tmdb, localMatcher);

const engine = new SyncEngine(qb);
const liveSync = new LiveSyncService(engine, matcher, cache, tmdb);
const ingestion = new IngestionService(config.MEDIA_ROOT);
const queue = new TaskQueue(db);

// Track the hash currently being "viewed" by a user to prioritize file syncing.
let currentFocus: string | null = null;

// Login to qBittorrent before starting
try {
  fastify.log.debug('Logging in to qBittorrent...');
  await qb.login(config.QB_USERNAME, config.QB_PASSWORD);
  fastify.log.debug('Login successful');
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

/**
 * Resolves a partial or full hash to a single unique full hash from the live cache.
 * 
 * @param partialHash - The partial hash provided by the client.
 * @returns The full hash if found and unique.
 * @throws Error if no match or multiple matches found.
 */
function resolveHash(partialHash: string): string {
  const torrents = liveSync.getTorrentsWithMetadata();
  
  // 1. Try exact match first
  if (partialHash.length === 40) {
    const exact = torrents.find(t => t.hash.toLowerCase() === partialHash.toLowerCase());
    if (exact) return exact.hash;
  }

  // 2. Prefix match
  const matches = torrents.filter(t => t.hash.toLowerCase().startsWith(partialHash.toLowerCase()));

  if (matches.length === 0) {
    throw new Error(`No torrent found starting with: ${partialHash}`);
  }
  if (matches.length > 1) {
    const list = matches.map(m => `${m.hash.slice(0, 10)} (${m.name})`).join(', ');
    throw new Error(`Multiple torrents match prefix ${partialHash}: ${list}`);
  }

  return matches[0].hash;
}

// 1. Core Endpoints

fastify.get('/api/torrents', async (request) => {
  fastify.log.debug({ url: request.url, query: request.query }, 'Received torrents request');
  currentFocus = null; // Clear focus if we hit the standard list
  return liveSync.getTorrentsWithMetadata();
});

fastify.get('/api/torrents/focus/:hash', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    fastify.log.debug(`[API] Focus requested for: ${fullHash}`);
    currentFocus = fullHash;
    
    // Force an immediate sync to get file data right now
    await liveSync.sync(currentFocus);
    
    return liveSync.getTorrentsWithMetadata();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.get('/api/torrents/:hash/files', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    return qb.getTorrentFiles(fullHash);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.get('/api/torrents/:hash/suggest-paths', async (request, reply) => {
  try {
    const { hash } = request.params as { hash: string };
    const { library } = request.query as { library?: string };
    
    const fullHash = resolveHash(hash);
    const torrents = liveSync.getTorrentsWithMetadata();
    const torrent = torrents.find(t => t.hash === fullHash);
    
    if (!torrent) throw new Error('Torrent disappeared during resolution');

    const title = torrent.mediaMetadata?.title || torrent.getMediaInfo().title;
    const year = torrent.mediaMetadata?.year || torrent.getMediaInfo().year;

    // We need to fetch files if they aren't in memory
    const files = torrent.files || await qb.getTorrentFiles(fullHash);
    
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents', async (request, reply) => {
  const data = await request.file();
  
  if (data) {
    const buffer = await data.toBuffer();
    const file = new File([new Uint8Array(buffer)], data.filename, { type: data.mimetype });
    await qb.addTorrents([], [file]);
    return { success: true };
  } else {
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
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    const { metadataId } = request.body as { metadataId: string };
    return handleAPIAction(reply, () => liveSync.linkMetadata(fullHash, metadataId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/:hash/unmatch', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    return handleAPIAction(reply, () => liveSync.unmatchTorrent(fullHash));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/:hash/non-media', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    const { isNonMedia } = request.body as { isNonMedia: boolean };
    return handleAPIAction(reply, () => liveSync.markAsNonMedia(fullHash, isNonMedia));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/:hash/ingest', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    const { fileMap } = request.body as { fileMap: Record<string, string> };
    
    const task = ingestion.createCopyTask(fullHash, fileMap);
    queue.enqueue(task);
    
    return { success: true, taskId: task.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/:hash/files/priority', async (request, reply) => {
  try {
    const fullHash = resolveHash((request.params as { hash: string }).hash);
    const { indices, priority } = request.body as { indices: number[], priority: number };
    return handleAPIAction(reply, () => qb.setFilePriority(fullHash, indices, priority));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/pause', async (request, reply) => {
  try {
    const { hashes } = request.body as { hashes: string[] };
    const resolvedHashes = hashes.map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.pauseTorrents(resolvedHashes));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post('/api/torrents/resume', async (request, reply) => {
  try {
    const { hashes } = request.body as { hashes: string[] };
    const resolvedHashes = hashes.map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.resumeTorrents(resolvedHashes));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.post<{ Params: { hash: string }; Body: { action: string, value?: any } }>('/api/torrents/:hash/action', async (request, reply) => {
  try {
    const fullHash = resolveHash(request.params.hash);
    const { action, value } = request.body;

    await handleAPIAction(reply, async () => {
      switch (action) {
        case 'resume': await qb.resumeTorrents([fullHash]); break;
        case 'pause': await qb.pauseTorrents([fullHash]); break;
        case 'forceStart': await qb.setForceStart([fullHash], value ?? true); break;
        case 'recheck': await qb.recheckTorrents([fullHash]); break;
        case 'reannounce': await qb.reannounceTorrents([fullHash]); break;
        case 'toggleSequential': await qb.toggleSequentialDownload([fullHash]); break;
        case 'toggleFirstLastPrio': await qb.toggleFirstLastPiecePrio([fullHash]); break;
        default: throw new Error(`Unknown action: ${action}`);
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.delete('/api/torrents', async (request, reply) => {
  try {
    const { hashes, deleteFiles } = request.query as { hashes: string, deleteFiles?: string };
    const resolvedHashes = hashes.split('|').map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.deleteTorrents(resolvedHashes, deleteFiles === 'true'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

fastify.get('/api/torrents/:hash/files/:index/download', async (request, reply) => {
  try {
    const { hash, index: indexStr } = request.params as { hash: string, index: string };
    const index = parseInt(indexStr, 10);
    
    const fullHash = resolveHash(hash);
    const torrents = liveSync.getTorrentsWithMetadata();
    const torrent = torrents.find(t => t.hash === fullHash);
    if (!torrent) {
      return reply.status(404).send({ error: 'Torrent not found' });
    }

    const files = torrent.files || await qb.getTorrentFiles(fullHash);
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

    fastify.log.debug(`[Download] Serving file: ${absolutePath}`);
    
    const fs = await import('fs');
    if (!fs.existsSync(absolutePath)) {
      return reply.status(404).send({ error: 'File not found on disk' });
    }

    const stream = fs.createReadStream(absolutePath);
    reply.header('Content-Disposition', `attachment; filename="${path.basename(file.name)}"`);
    return reply.send(stream);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(400).send({ error: message });
  }
});

// 2. Global State & Preferences

fastify.get('/api/state', async () => {
  return liveSync.getServerState() || {};
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

// 3. Task Management

fastify.get('/api/tasks', async () => {
  return queue.getTasks();
});

fastify.post('/api/tasks/clear', async (request, reply) => {
  return handleAPIAction(reply, () => {
    return queue.clearFinished();
  });
});

fastify.get('/api/libraries', async () => {
  return ingestion.getLibraryOptions();
});

// 4. SPA Fallback: Catch-all for React routing
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
