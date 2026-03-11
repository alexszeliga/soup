import Fastify from 'fastify';
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
  StorageService,
  NotFoundError,
  ProviderError,
  ClientError,
  StorageError,
  NoiseMiner
} from '@soup/core';
import { createDatabase } from '@soup/database';
import { SyncWorker } from './SyncWorker.js';
import { registerTorrentRoutes } from './routes/torrents.js';
import { registerSystemRoutes } from './routes/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = ConfigLoader.load();
const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

// Plugins
await fastify.register(cors, { origin: '*' });
await fastify.register(multipart);

// Static Assets (React App)
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../../web/dist'),
  prefix: '/',
});

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof NotFoundError) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof ProviderError) {
    return reply.status(503).send({ error: `Metadata Provider Error: ${error.message}` });
  }
  if (error instanceof ClientError) {
    return reply.status(502).send({ error: `BitTorrent Client Error: ${error.message}` });
  }
  if (error instanceof StorageError) {
    return reply.status(507).send({ error: `Filesystem Error: ${error.message}` });
  }
  
  fastify.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

// Service Initialization
const db = createDatabase(config.DB_PATH);
const qb = new QBClient(config.QB_URL);
const tmdb = new TMDBMetadataProvider(
  config.TMDB_API_KEY, 
  config.TMDB_BASE_URL, 
  config.TMDB_IMAGE_BASE_URL
);

const cache = new MetadataCache(db);
await cache.ensureTables();

const uniqueMeta = await cache.getAllUniqueMetadata();
const localMatcher = new FuseLocalMatcher(uniqueMeta);
const matcher = new MetadataMatcher(tmdb, localMatcher);

const engine = new SyncEngine(qb);
const miner = new NoiseMiner(cache);
const liveSync = new LiveSyncService(engine, matcher, cache, tmdb, miner);
const ingestion = new IngestionService(config.MEDIA_ROOT);
const storage = new StorageService();
const queue = new TaskQueue(db);

// Sync Worker
const worker = new SyncWorker(liveSync, config.SYNC_INTERVAL_MS, fastify.log);

// Register Routes
registerTorrentRoutes(
  fastify, 
  liveSync, 
  qb, 
  ingestion, 
  queue, 
  tmdb, 
  worker, 
  config.MEDIA_ROOT, 
  config.LOCAL_DOWNLOAD_ROOT, 
  config.QB_DOWNLOAD_ROOT
);

registerSystemRoutes(
  fastify, 
  qb, 
  storage, 
  queue, 
  liveSync, 
  ingestion, 
  { mediaRoot: config.MEDIA_ROOT, localDownloadRoot: config.LOCAL_DOWNLOAD_ROOT },
  config
);

// SPA Fallback
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api')) {
    return reply.status(404).send({ error: 'API route not found' });
  }
  return reply.sendFile('index.html');
});

// Startup
const start = async () => {
  try {
    // 1. Login to qBittorrent
    try {
      fastify.log.debug('Logging in to qBittorrent...');
      await qb.login(config.QB_USERNAME, config.QB_PASSWORD);
      fastify.log.debug('Login successful');
    } catch (error) {
      fastify.log.error(error, 'Login failed');
    }

    // 2. Start Sync Worker
    worker.start();

    // 3. Start Server
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
