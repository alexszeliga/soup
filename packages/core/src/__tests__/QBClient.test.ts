import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QBClient } from '../QBClient.js';

describe('QBClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should fetch torrents and return Torrent objects', async () => {
    const mockTorrentsResponse = [
      {
        hash: 'h1',
        name: 'The.Great.Movie.2024.1080p.WEB-DL',
        progress: 0.5,
        state: 'downloading',
        dlspeed: 1024,
        upspeed: 512,
        content_path: '/downloads/t1'
      }
    ];

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTorrentsResponse
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    const torrents = await client.getTorrents();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/info'),
      expect.any(Object)
    );
    expect(torrents.length).toBe(1);
    expect(torrents[0].hash).toBe('h1');
    expect(torrents[0].name).toBe('The.Great.Movie.2024.1080p.WEB-DL');
  });

  it('should get application preferences', async () => {
    const mockPrefs = { save_path: '/downloads', dht: true };
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPrefs
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    const prefs = await (client as any).getPreferences();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/app/preferences'),
      expect.any(Object)
    );
    expect(prefs.save_path).toBe('/downloads');
  });

  it('should set application preferences', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await (client as any).setPreferences({ save_path: '/new/path' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/app/setPreferences'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const call = (fetch as any).mock.calls[0];
    const body = call[1].body as URLSearchParams;
    expect(body.get('json')).toBe(JSON.stringify({ save_path: '/new/path' }));
  });
});
