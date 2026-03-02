import { QBClient } from './QBClient.js';
import { Torrent } from './Torrent.js';

export class SyncEngine {
  private rid: number = 0;
  private torrents: Map<string, any> = new Map();
  private serverState: any = {};

  constructor(private readonly qb: QBClient) {}

  public async tick(): Promise<void> {
    const data = await this.qb.getMainData(this.rid);
    this.rid = data.rid;

    if (data.full_update) {
      this.torrents.clear();
    }

    // Update or add torrents
    if (data.torrents) {
      for (const [hash, torrentData] of Object.entries(data.torrents)) {
        const existing = this.torrents.get(hash) || {};
        this.torrents.set(hash, { ...existing, ...torrentData, hash });
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
  }

  public getTorrents(): Torrent[] {
    return Array.from(this.torrents.values()).map(t => new Torrent({
      hash: t.hash,
      name: t.name,
      progress: t.progress,
      state: t.state,
      downloadSpeed: t.dlspeed || 0,
      uploadSpeed: t.upspeed || 0,
      contentPath: t.content_path || '',
    }));
  }

  public getServerState(): any {
    return this.serverState;
  }
}
