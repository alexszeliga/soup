import { LiveSyncService } from '@soup/core';
import { FastifyBaseLogger } from 'fastify';

/**
 * Worker responsible for the background synchronization loop with qBittorrent.
 */
export class SyncWorker {
  private currentFocus: string | null = null;
  private isRunning = false;

  /**
   * Creates an instance of SyncWorker.
   * 
   * @param liveSync - The live sync service.
   * @param syncIntervalMs - Polling interval in milliseconds.
   * @param logger - Fastify logger instance.
   */
  constructor(
    private readonly liveSync: LiveSyncService,
    private readonly syncIntervalMs: number,
    private readonly logger: FastifyBaseLogger
  ) {}

  /**
   * Starts the background synchronization loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.run();
  }

  /**
   * Stops the background synchronization loop.
   */
  public stop(): void {
    this.isRunning = false;
  }

  /**
   * Sets the current focus hash to prioritize for synchronization.
   * 
   * @param hash - The torrent hash to focus on.
   */
  public setFocus(hash: string | null): void {
    this.currentFocus = hash;
  }

  /**
   * Triggers an immediate synchronization cycle.
   */
  public async syncNow(): Promise<void> {
    try {
      await this.liveSync.sync(this.currentFocus);
    } catch (error) {
      this.logger.error(error, 'Sync error during manual trigger');
    }
  }

  /**
   * Internal loop execution logic.
   */
  private async run(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.liveSync.sync(this.currentFocus);
      } catch (error) {
        this.logger.error(error, 'Sync error');
      }
      await new Promise(resolve => setTimeout(resolve, this.syncIntervalMs));
    }
  }
}
