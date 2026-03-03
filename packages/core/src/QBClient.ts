import { Torrent } from './Torrent.js';

export interface SyncResponse {
  rid: number;
  full_update?: boolean;
  torrents?: Record<string, any>;
  torrents_removed?: string[];
  categories?: Record<string, any>;
  categories_removed?: string[];
  tags?: string[];
  tags_removed?: string[];
  server_state?: Record<string, any>;
}

export class QBClient {
  private cookies: string[] = [];

  constructor(private readonly baseUrl: string) {}

  public async login(username?: string, password?: string): Promise<void> {
    const loginUrl = new URL(`${this.baseUrl}/auth/login`);
    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (password) params.set('password', password);

    const response = await fetch(loginUrl.toString(), {
      method: 'POST',
      headers: {
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed: ${response.statusText}`);
    }

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const sidMatch = setCookie.match(/SID=[^;]+/);
      if (sidMatch) {
        this.cookies = [sidMatch[0]];
      } else {
        this.cookies = [setCookie];
      }
    }
  }

  public async getMainData(rid: number = 0): Promise<SyncResponse> {
    const syncUrl = new URL(`${this.baseUrl}/sync/maindata`);
    syncUrl.searchParams.set('rid', rid.toString());

    const response = await fetch(syncUrl.toString(), {
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
      },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent Sync API error: ${response.statusText}`);
    }

    return await response.json() as SyncResponse;
  }

  public async getTorrents(): Promise<Torrent[]> {
    const torrentsUrl = new URL(`${this.baseUrl}/torrents/info`);
    
    const response = await fetch(torrentsUrl.toString(), {
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
      },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent API error: ${response.statusText}`);
    }

    const data = await response.json() as any[];
    
    return data.map((t: any) => new Torrent({
      hash: t.hash,
      name: t.name,
      progress: t.progress,
      state: t.state,
      downloadSpeed: t.dlspeed,
      uploadSpeed: t.upspeed,
      contentPath: t.content_path,
    }));
  }

  public async addTorrents(urls: string[], files?: File[]): Promise<void> {
    const addUrl = new URL(`${this.baseUrl}/torrents/add`);
    const formData = new FormData();

    if (urls.length > 0) {
      formData.append('urls', urls.join('\n'));
    }

    if (files) {
      for (const file of files) {
        formData.append('torrents', file);
      }
    }

    const response = await fetch(addUrl.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent add error: ${response.statusText}`);
    }
  }

  public async pauseTorrents(hashes: string[]): Promise<void> {
    await this.postWithHashes('/torrents/stop', hashes);
  }

  public async resumeTorrents(hashes: string[]): Promise<void> {
    await this.postWithHashes('/torrents/start', hashes);
  }

  public async forceStartTorrents(hashes: string[]): Promise<void> {
    const url = new URL(`${this.baseUrl}/torrents/setForceStart`);
    const params = new URLSearchParams();
    params.set('hashes', hashes.join('|'));
    params.set('value', 'true');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent force start error: ${response.statusText}`);
    }
  }

  public async deleteTorrents(hashes: string[], deleteFiles: boolean = false): Promise<void> {
    const deleteUrl = new URL(`${this.baseUrl}/torrents/delete`);
    const params = new URLSearchParams();
    params.set('hashes', hashes.join('|'));
    params.set('deleteFiles', deleteFiles.toString());

    const response = await fetch(deleteUrl.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent delete error: ${response.statusText}`);
    }
  }

  private async postWithHashes(endpoint: string, hashes: string[]): Promise<void> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const params = new URLSearchParams();
    params.set('hashes', hashes.join('|'));

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent ${endpoint} error: ${response.statusText}`);
    }
  }
}
