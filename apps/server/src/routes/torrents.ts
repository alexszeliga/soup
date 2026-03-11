import { FastifyInstance, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { 
  LiveSyncService, 
  QBClient, 
  IngestionService, 
  TaskQueue, 
  TMDBMetadataProvider,
  NotFoundError,
  StorageError
} from '@soup/core';
import { SyncWorker } from '../SyncWorker.js';

interface TorrentParams { hash: string }
interface SuggestPathsQuery { library?: string }
interface LinkMetadataBody { metadataId: string }
interface NonMediaBody { isNonMedia: boolean }
interface IngestBody { fileMap: Record<string, string> }
interface PriorityBody { indices: number[], priority: number }
interface ActionBody { action: string, value?: unknown }
interface HashesBody { hashes: string[] }
interface DeleteQuery { hashes: string, deleteFiles?: string }
interface DownloadParams { hash: string, index: string }

/**
 * Registers torrent-related API routes.
 * 
 * @param fastify - Fastify instance.
 * @param liveSync - Live sync service.
 * @param qb - qBittorrent client.
 * @param ingestion - Ingestion orchestration service.
 * @param queue - Background task queue.
 * @param tmdb - TMDB metadata provider.
 * @param worker - Background sync worker.
 * @param mediaRoot - Media storage root.
 * @param localDownloadRoot - Local download storage root.
 * @param qbDownloadRoot - qBittorrent download root.
 */
export function registerTorrentRoutes(
  fastify: FastifyInstance,
  liveSync: LiveSyncService,
  qb: QBClient,
  ingestion: IngestionService,
  queue: TaskQueue,
  tmdb: TMDBMetadataProvider,
  worker: SyncWorker,
  mediaRoot: string,
  localDownloadRoot: string,
  qbDownloadRoot: string
) {
  
  /**
   * Resolves a partial or full hash to a single unique full hash from the live cache.
   * 
   * @param partialHash - The partial hash to resolve.
   * @returns The full resolved hash.
   */
  function resolveHash(partialHash: string): string {
    const torrents = liveSync.getTorrentsWithMetadata();
    
    if (partialHash.length === 40) {
      const exact = torrents.find(t => t.hash.toLowerCase() === partialHash.toLowerCase());
      if (exact) return exact.hash;
    }

    const matches = torrents.filter(t => t.hash.toLowerCase().startsWith(partialHash.toLowerCase()));

    if (matches.length === 0) {
      throw new NotFoundError(`No torrent found starting with: ${partialHash}`);
    }
    if (matches.length > 1) {
      const list = matches.map(m => `${m.hash.slice(0, 10)} (${m.name})`).join(', ');
      throw new Error(`Multiple torrents match prefix ${partialHash}: ${list}`);
    }

    return matches[0].hash;
  }

  async function handleAPIAction(reply: FastifyReply, action: () => Promise<void>) {
    await action();
    return { success: true };
  }

  fastify.get('/api/torrents', async () => {
    worker.setFocus(null);
    return liveSync.getTorrentsWithMetadata();
  });

  fastify.get<{ Params: TorrentParams }>('/api/torrents/focus/:hash', async (request) => {
    const fullHash = resolveHash(request.params.hash);
    fastify.log.debug(`[API] Focus requested for: ${fullHash}`);
    worker.setFocus(fullHash);
    await worker.syncNow();
    return liveSync.getTorrentsWithMetadata();
  });

  fastify.get<{ Params: TorrentParams }>('/api/torrents/:hash/files', async (request) => {
    const fullHash = resolveHash(request.params.hash);
    return qb.getTorrentFiles(fullHash);
  });

  fastify.get<{ Params: TorrentParams, Querystring: SuggestPathsQuery }>('/api/torrents/:hash/suggest-paths', async (request) => {
    const { hash } = request.params;
    const { library } = request.query;
    
    const fullHash = resolveHash(hash);
    const torrents = liveSync.getTorrentsWithMetadata();
    const torrent = torrents.find(t => t.hash === fullHash);
    
    if (!torrent) throw new NotFoundError('Torrent disappeared during resolution');

    const title = torrent.mediaMetadata?.title || torrent.getMediaInfo().title;
    const year = torrent.mediaMetadata?.year || torrent.getMediaInfo().year;

    const files = torrent.files || await qb.getTorrentFiles(fullHash);
    
    return files.map(f => {
      const suggestion = ingestion.suggestPath(title, f.name, year ?? undefined);
      const absolutePath = ingestion.resolveSourcePath(torrent, f, qbDownloadRoot, localDownloadRoot);

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
    } else {
      const body = request.body as { url?: string };
      if (body?.url) {
        await qb.addTorrents([body.url]);
        return { success: true };
      }
    }

    reply.status(400).send({ error: 'No torrent file or magnet link provided' });
  });

  fastify.post<{ Body: LinkMetadataBody, Params: TorrentParams }>('/api/torrents/:hash/metadata', async (request, reply) => {
    const fullHash = resolveHash(request.params.hash);
    const { metadataId } = request.body;
    return handleAPIAction(reply, () => liveSync.linkMetadata(fullHash, metadataId));
  });

  fastify.post<{ Params: TorrentParams }>('/api/torrents/:hash/unmatch', async (request, reply) => {
    const fullHash = resolveHash(request.params.hash);
    return handleAPIAction(reply, () => liveSync.unmatchTorrent(fullHash));
  });

  fastify.post<{ Params: TorrentParams, Body: NonMediaBody }>('/api/torrents/:hash/non-media', async (request, reply) => {
    const fullHash = resolveHash(request.params.hash);
    const { isNonMedia } = request.body;
    return handleAPIAction(reply, () => liveSync.markAsNonMedia(fullHash, isNonMedia));
  });

  fastify.post<{ Params: TorrentParams, Body: IngestBody }>('/api/torrents/:hash/ingest', async (request) => {
    const fullHash = resolveHash(request.params.hash);
    const { fileMap } = request.body;
    
    const destinations = Object.values(fileMap);
    for (const dest of destinations) {
      const absoluteDest = path.isAbsolute(dest) ? dest : path.join(mediaRoot, dest);
      const isWritable = await ingestion.checkWritability(path.dirname(absoluteDest));
      if (!isWritable) {
        throw new StorageError(`Destination directory is not writable: ${path.dirname(absoluteDest)}`);
      }
    }

    const task = ingestion.createCopyTask(fullHash, fileMap);
    queue.enqueue(task);
    
    return { success: true, taskId: task.id };
  });

  fastify.post<{ Params: TorrentParams, Body: PriorityBody }>('/api/torrents/:hash/files/priority', async (request, reply) => {
    const fullHash = resolveHash(request.params.hash);
    const { indices, priority } = request.body;
    return handleAPIAction(reply, () => qb.setFilePriority(fullHash, indices, priority));
  });

  fastify.post<{ Body: HashesBody }>('/api/torrents/pause', async (request, reply) => {
    const { hashes } = request.body;
    const resolvedHashes = hashes.map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.pauseTorrents(resolvedHashes));
  });

  fastify.post<{ Body: HashesBody }>('/api/torrents/resume', async (request, reply) => {
    const { hashes } = request.body;
    const resolvedHashes = hashes.map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.resumeTorrents(resolvedHashes));
  });

  fastify.post<{ Params: TorrentParams, Body: ActionBody }>('/api/torrents/:hash/action', async (request, reply) => {
    const fullHash = resolveHash(request.params.hash);
    const { action, value } = request.body;

    return handleAPIAction(reply, async () => {
      switch (action) {
        case 'resume': await qb.resumeTorrents([fullHash]); break;
        case 'pause': await qb.pauseTorrents([fullHash]); break;
        case 'forceStart': await qb.setForceStart([fullHash], value === true || value === 'true'); break;
        case 'recheck': await qb.recheckTorrents([fullHash]); break;
        case 'reannounce': await qb.reannounceTorrents([fullHash]); break;
        case 'toggleSequential': await qb.toggleSequentialDownload([fullHash]); break;
        case 'toggleFirstLastPrio': await qb.toggleFirstLastPiecePrio([fullHash]); break;
        default: throw new Error(`Unknown action: ${action}`);
      }
    });
  });

  fastify.delete<{ Querystring: DeleteQuery }>('/api/torrents', async (request, reply) => {
    const { hashes, deleteFiles } = request.query;
    const resolvedHashes = hashes.split('|').map(h => resolveHash(h));
    return handleAPIAction(reply, () => qb.deleteTorrents(resolvedHashes, deleteFiles === 'true'));
  });

  fastify.get<{ Params: DownloadParams }>('/api/torrents/:hash/files/:index/download', async (request, reply) => {
    const { hash, index: indexStr } = request.params;
    const index = parseInt(indexStr, 10);
    
    const fullHash = resolveHash(hash);
    const torrents = liveSync.getTorrentsWithMetadata();
    const torrent = torrents.find(t => t.hash === fullHash);
    if (!torrent) throw new NotFoundError('Torrent not found');

    const files = torrent.files || await qb.getTorrentFiles(fullHash);
    const file = files.find(f => f.index === index);
    if (!file) throw new NotFoundError('File not found');

    const absolutePath = ingestion.resolveSourcePath(torrent, file, qbDownloadRoot, localDownloadRoot);

    if (!fs.existsSync(absolutePath)) {
      throw new StorageError('File not found on disk');
    }

    const stream = fs.createReadStream(absolutePath);
    reply.header('Content-Disposition', `attachment; filename="${path.basename(file.name)}"`);
    return reply.send(stream);
  });

  fastify.get('/api/metadata/search', async (request) => {
    const { query } = request.query as { query: string };
    if (!query) return [];
    return tmdb.searchCandidates(query);
  });
}
