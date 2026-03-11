import { FastifyInstance, FastifyReply } from 'fastify';
import { 
  QBClient, 
  StorageService, 
  TaskQueue, 
  LiveSyncService, 
  ConfigLoader,
  IngestionService,
  type QBPreferences,
  type Config
} from '@soup/core';

interface StorageConfig {
  mediaRoot: string;
  localDownloadRoot: string;
}

/**
 * Registers system-related API routes (storage, configuration, tasks).
 * 
 * @param fastify - Fastify instance.
 * @param qb - qBittorrent client.
 * @param storage - Storage utility service.
 * @param queue - Background task queue.
 * @param liveSync - Live sync service.
 * @param ingestion - Ingestion orchestration service.
 * @param storageConfig - Storage-specific configuration.
 * @param fullConfig - Full application configuration.
 */
export function registerSystemRoutes(
  fastify: FastifyInstance,
  qb: QBClient,
  storage: StorageService,
  queue: TaskQueue,
  liveSync: LiveSyncService,
  ingestion: IngestionService,
  storageConfig: StorageConfig,
  fullConfig: Config
) {

  async function handleAPIAction(reply: FastifyReply, action: () => Promise<void>) {
    await action();
    return { success: true };
  }

  fastify.get('/api/system/storage', async () => {
    return storage.getStorageOverview({
      'Library': storageConfig.mediaRoot,
      'Downloads': storageConfig.localDownloadRoot
    });
  });

  fastify.get('/api/state', async () => {
    return liveSync.getServerState() || {};
  });

  fastify.post('/api/toggle-alt-speeds', async (request, reply) => {
    return handleAPIAction(reply, () => qb.toggleAltSpeedLimits());
  });

  fastify.get('/api/preferences', async () => {
    return qb.getPreferences();
  });

  fastify.post<{ Body: Partial<QBPreferences> }>('/api/preferences', async (request, reply) => {
    return handleAPIAction(reply, () => qb.setPreferences(request.body));
  });

  fastify.get('/api/config', async () => {
    return ConfigLoader.getClientConfig(fullConfig);
  });

  fastify.get('/api/tasks', async () => {
    return queue.getTasks();
  });

  fastify.post('/api/tasks/clear', async (request, reply) => {
    return handleAPIAction(reply, () => queue.clearFinished());
  });

  fastify.get('/api/libraries', async () => {
    return ingestion.getLibraryOptions();
  });
}
