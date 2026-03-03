import { QBClient } from './QBClient.js';
import { Torrent } from './Torrent.js';
import type { TorrentFile } from './QBClient.js';

/**
 * Represents the changes detected during a single sync tick.
 */
export interface SyncDelta {
  /** Torrents newly discovered since the last tick. */
  added: Torrent[];
  /** Torrents whose properties (progress, speed, state) changed since the last tick. */
  updated: Torrent[];
  /** Hashes of torrents that were deleted from the server. */
  removed: string[];
  /** If true, the previous state was discarded and replaced with a full server snapshot. */
  fullUpdate: boolean;
}

/**
 * Stateful engine that maintains a synchronized view of the qBittorrent library.
 * 
 * Uses qBittorrent's `/sync/maindata` endpoint to perform efficient incremental updates (deltas)
 * rather than fetching the entire library on every request.
 */
export class SyncEngine {
  /** Response ID tracker for incremental syncing. */
  private rid: number = 0;
  /** Internal store of raw torrent data indexed by hash. */
  private torrents: Map<string, Record<string, unknown>> = new Map();
  /** Aggregated server-wide state (global speeds, etc.). */
  private serverState: Record<string, unknown> = {};
  /** The hash of the torrent currently in focus (e.g., opened in detailed view). */
  private focusHash: string | null = null;

  /**
   * Creates an instance of SyncEngine.
   * 
   * @param qb - The qBittorrent client.
   */
  constructor(private readonly qb: QBClient) {}

  /**
   * Sets or clears the active focus on a specific torrent.
   * 
   * When a focus is set, subsequent sync ticks will also fetch the individual
   * file list for that torrent.
   * 
   * @param hash - The torrent hash to focus on, or null to clear.
   */
  public setFocus(hash: string | null): void {
    this.focusHash = hash;
  }

  /**
   * Performs a single synchronization step with the qBittorrent server.
   * 
   * Compares the previous state with the new delta from the server to calculate
   * what was added, updated, or removed.
   * 
   * @returns A SyncDelta object describing the changes in this tick.
   */
  public async tick(): Promise<SyncDelta> {
    // 1. Fetch main data and files (if focused) in parallel
    const [data, focusedFiles] = await Promise.all([
      this.qb.getMainData(this.rid),
      this.focusHash ? this.qb.getTorrentFiles(this.focusHash) : Promise.resolve(null)
    ]);

    this.rid = data.rid;

    const addedHashes: string[] = [];
    const updatedHashes: string[] = [];
    const removedHashes: string[] = data.torrents_removed || [];

    if (data.full_update) {
      this.torrents.clear();
    }

    // Update or add torrents
    if (data.torrents) {
      for (const [hash, torrentData] of Object.entries(data.torrents)) {
        if (!this.torrents.has(hash)) {
          addedHashes.push(hash);
        } else {
          updatedHashes.push(hash);
        }
        const existing = this.torrents.get(hash) || {};
        this.torrents.set(hash, { ...existing, ...torrentData, hash });
      }
    }

    // Inject focused files into the specific torrent data
    if (this.focusHash && focusedFiles && this.torrents.has(this.focusHash)) {
      const existing = this.torrents.get(this.focusHash)!;
      this.torrents.set(this.focusHash, { ...existing, files: focusedFiles });
      if (!updatedHashes.includes(this.focusHash) && !addedHashes.includes(this.focusHash)) {
        updatedHashes.push(this.focusHash);
      }
    }

    // Remove torrents
    if (data.torrents_removed) {
      for (const hash of data.torrents_removed) {
        this.torrents.delete(hash);
      }
    }

    // Update server state
    if (data.server_state) {
      this.serverState = { ...this.serverState, ...data.server_state };
    }

    return {
      added: addedHashes.map(h => this.toTorrent(this.torrents.get(h)!)),
      updated: updatedHashes.map(h => this.toTorrent(this.torrents.get(h)!)),
      removed: removedHashes,
      fullUpdate: !!data.full_update
    };
  }

  /**
   * Returns an array of all torrents currently tracked by the engine.
   * 
   * @returns Array of Torrent objects.
   */
  public getTorrents(): Torrent[] {
    return Array.from(this.torrents.values()).map(t => this.toTorrent(t));
  }

  /**
   * Returns the most recent aggregate server state (global speeds, free space, etc.).
   * 
   * @returns Server state object.
   */
  public getServerState(): Record<string, unknown> {
    return this.serverState;
  }

  /**
   * Internal mapper to convert raw API JSON objects into domain Torrent instances.
   * 
   * @param t - Raw torrent data from the API.
   * @returns A new Torrent instance.
   */
  private toTorrent(t: Record<string, unknown>): Torrent {
    return new Torrent({
      hash: t.hash as string,
      name: t.name as string,
      progress: t.progress as number,
      state: t.state as string,
      downloadSpeed: (t.dlspeed as number) || 0,
      uploadSpeed: (t.upspeed as number) || 0,
      contentPath: (t.content_path as string) || '',
      files: t.files as TorrentFile[] | undefined,
    });
  }
}
