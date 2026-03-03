import { Torrent } from './Torrent.js';

/**
 * Interface representing a file within a torrent.
 */
export interface TorrentFile {
  /** Filename (including relative path). */
  name: string;
  /** File size in bytes. */
  size: number;
  /** Download progress (0-1). */
  progress: number;
  /** File priority (0: skip, 1: normal, 6: high, 7: maximal). */
  priority: number;
  /** Index of the file in the torrent. */
  index: number;
}

/**
 * Interface representing qBittorrent application preferences.
 * This is a partial map of the many settings available.
 */
export interface QBPreferences extends Record<string, unknown> {
  /** Default save path for torrents. */
  save_path?: string;
  /** True if DHT is enabled. */
  dht?: boolean;
  /** Global download speed limit in bytes per second. */
  dl_limit?: number;
  /** Global upload speed limit in bytes per second. */
  up_limit?: number;
}

/**
 * Interface representing raw torrent data from the qBittorrent API.
 */
export interface RawTorrentData {
  hash: string;
  name: string;
  progress: number;
  state: string;
  dlspeed: number;
  upspeed: number;
  content_path: string;
  [key: string]: unknown;
}

/**
 * Interface representing the structure of the qBittorrent sync/maindata response.
 */
export interface SyncResponse {
  /** Response ID for subsequent incremental updates. */
  rid: number;
  /** If true, the client should discard previous state and perform a full update. */
  full_update?: boolean;
  /** Map of torrent hashes to their updated properties. */
  torrents?: Record<string, Partial<RawTorrentData>>;
  /** List of torrent hashes that were removed since the last update. */
  torrents_removed?: string[];
  /** Map of category names to their properties. */
  categories?: Record<string, unknown>;
  /** List of category names that were removed. */
  categories_removed?: string[];
  /** List of active tags. */
  tags?: string[];
  /** List of tags that were removed. */
  tags_removed?: string[];
  /** Global server-wide state (speeds, free space, etc.). */
  server_state?: Record<string, unknown>;
}

/**
 * Client for interacting with the qBittorrent Web API (v2).
 * 
 * Centralizes authentication, data synchronization, and torrent management actions.
 */
export class QBClient {
  /** Internal store for the SID authentication cookie. */
  private cookies: string[] = [];

  /**
   * Creates an instance of QBClient.
   * 
   * @param baseUrl - The base URL of the qBittorrent API (e.g. 'http://localhost:8080/api/v2').
   */
  constructor(private readonly baseUrl: string) {}

  /**
   * Authenticates with the qBittorrent server.
   * 
   * Extracts and stores the SID cookie for use in subsequent requests.
   * 
   * @param username - Optional username.
   * @param password - Optional password.
   * @returns A promise that resolves on successful login.
   */
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

  /**
   * Fetches incremental update data from the server.
   * 
   * @param rid - The ID of the last received response (0 for first request).
   * @returns The sync data containing changes since rid.
   */
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

  /**
   * Retrieves specified torrents from the server.
   * 
   * @returns Array of Torrent objects.
   */
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

    const data = await response.json() as RawTorrentData[];
    
    return data.map((t) => new Torrent({
      hash: t.hash,
      name: t.name,
      progress: t.progress,
      state: t.state,
      downloadSpeed: t.dlspeed,
      uploadSpeed: t.upspeed,
      contentPath: t.content_path,
    }));
  }

  /**
   * Retrieves all application preferences.
   * 
   * @returns A promise that resolves to the preferences object.
   */
  public async getPreferences(): Promise<QBPreferences> {
    const prefsUrl = new URL(`${this.baseUrl}/app/preferences`);

    const response = await fetch(prefsUrl.toString(), {
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
      },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent getPreferences error: ${response.statusText}`);
    }

    return await response.json() as QBPreferences;
  }

  /**
   * Updates one or more application preferences.
   * 
   * @param prefs - Partial preferences object containing keys to update.
   * @returns A promise that resolves when update is complete.
   */
  public async setPreferences(prefs: Partial<QBPreferences>): Promise<void> {
    await this.post('/app/setPreferences', {
      json: JSON.stringify(prefs)
    });
  }

  /**
   * Retrieves the list of files for a specific torrent.
   * 
   * @param hash - The torrent hash.
   * @returns List of TorrentFile objects.
   */
  public async getTorrentFiles(hash: string): Promise<TorrentFile[]> {
    const filesUrl = new URL(`${this.baseUrl}/torrents/files`);
    filesUrl.searchParams.set('hash', hash);

    const response = await fetch(filesUrl.toString(), {
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
      },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent getTorrentFiles error: ${response.statusText}`);
    }

    const data = await response.json() as any[];
    return data.map((f, index) => ({
      name: f.name,
      size: f.size,
      progress: f.progress,
      priority: f.priority,
      index
    }));
  }

  /**
   * Sets the priority for one or more files in a torrent.
   * 
   * @param hash - The torrent hash.
   * @param indices - Array of file indices.
   * @param priority - Priority level (0: skip, 1: normal, 6: high, 7: maximal).
   * @returns A promise that resolves when priority is set.
   */
  public async setFilePriority(hash: string, indices: number[], priority: number): Promise<void> {
    await this.post('/torrents/filePrio', {
      hash,
      id: indices.join('|'),
      priority: priority.toString()
    });
  }

  /**
   * Adds new torrents to the server.
   * 
   * @param urls - List of magnet links or URLs.
   * @param files - List of local .torrent files.
   * @returns A promise that resolves when addition is complete.
   */
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

  /**
   * Pauses the specified torrents (using v5.0+ /stop endpoint).
   * 
   * @param hashes - List of torrent hashes to pause.
   * @returns A promise that resolves when action is complete.
   */
  public async pauseTorrents(hashes: string[]): Promise<void> {
    await this.post('/torrents/stop', { hashes: hashes.join('|') });
  }

  /**
   * Resumes the specified torrents (using v5.0+ /start endpoint).
   * 
   * @param hashes - List of torrent hashes to resume.
   * @returns A promise that resolves when action is complete.
   */
  public async resumeTorrents(hashes: string[]): Promise<void> {
    await this.post('/torrents/start', { hashes: hashes.join('|') });
  }

  /**
   * Force-starts the specified torrents.
   * 
   * @param hashes - List of torrent hashes.
   * @returns A promise that resolves when action is complete.
   */
  public async forceStartTorrents(hashes: string[]): Promise<void> {
    await this.post('/torrents/setForceStart', { 
      hashes: hashes.join('|'),
      value: 'true'
    });
  }

  /**
   * Deletes specified torrents from the server.
   * 
   * @param hashes - List of torrent hashes.
   * @param deleteFiles - If true, downloaded data will be deleted from disk.
   * @returns A promise that resolves when deletion is complete.
   */
  public async deleteTorrents(hashes: string[], deleteFiles: boolean = false): Promise<void> {
    await this.post('/torrents/delete', {
      hashes: hashes.join('|'),
      deleteFiles: deleteFiles.toString()
    });
  }

  /**
   * Centralized helper for all qBittorrent POST requests.
   * 
   * Handles:
   * 1. URL construction with base URL and endpoint.
   * 2. URL-encoded parameter serialization.
   * 3. Standard headers (Cookies for Auth, Referer/Origin for CSRF bypass).
   * 4. Error reporting with endpoint context.
   * 
   * @param endpoint - The API endpoint path (e.g., '/torrents/stop').
   * @param params - Key-value pairs to be sent as URLSearchParams in the body.
   * @throws {Error} If the response is not OK.
   * @returns A promise that resolves when the request is complete.
   */
  private async post(endpoint: string, params: Record<string, string>): Promise<void> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      body.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Cookie': this.cookies.join('; '),
        'Referer': this.baseUrl + '/',
        'Origin': new URL(this.baseUrl).origin,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent ${endpoint} error: ${response.statusText}`);
    }
  }
}
