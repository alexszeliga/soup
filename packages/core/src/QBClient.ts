import { Torrent } from './Torrent.js';

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
      body: params,
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed: ${response.statusText}`);
    }

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = [setCookie];
    }
  }

  public async getTorrents(): Promise<Torrent[]> {
    const torrentsUrl = new URL(`${this.baseUrl}/torrents/info`);
    
    const response = await fetch(torrentsUrl.toString(), {
      headers: {
        'Cookie': this.cookies.join('; '),
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
}
