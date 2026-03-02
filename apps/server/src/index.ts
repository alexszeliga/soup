import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import { QBClient } from '@soup/core/QBClient.js';
import { TMDBMetadataProvider } from '@soup/core/TMDBMetadataProvider.js';
import { MetadataMatcher } from '@soup/core/MetadataMatcher.js';
import { MetadataCache } from '@soup/core/MetadataCache.js';
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

await cache.ensureTables();

fastify.get('/api/torrents', async (request, reply) => {
  try {
    const torrents = await qb.getTorrents();
    const result = [];

    for (const torrent of torrents) {
      let metadata = await cache.getMetadataForTorrent(torrent.hash);
      
      if (!metadata) {
        metadata = await matcher.match(torrent);
        if (metadata) {
          await cache.saveMetadataForTorrent(torrent, metadata);
        }
      }

      result.push({
        ...torrent,
        mediaMetadata: metadata,
      });
    }

    return result;
  } catch (error: any) {
    fastify.log.error(error);
    reply.status(500).send({ error: error.message });
  }
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
