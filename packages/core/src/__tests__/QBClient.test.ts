import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QBClient } from '../QBClient.js';

describe('QBClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should authenticate and store SID cookie', async () => {
    const mockHeaders = new Headers();
    mockHeaders.append('set-cookie', 'SID=12345; HttpOnly; Path=/');

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: mockHeaders,
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.login('admin', 'password');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    // Verify subsequent request includes the SID cookie
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    await client.getTorrents();
    
    const secondCallHeaders = (fetch as any).mock.calls[1][1].headers;
    expect(secondCallHeaders.Cookie).toBe('SID=12345');
  });

  it('should throw an error on login failure', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden'
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await expect(client.login('admin', 'wrong')).rejects.toThrow('qBittorrent login failed: Forbidden');
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
        content_path: '/downloads/t1',
        added_on: 1700000000
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
    expect(torrents[0].addedOn).toBe(1700000000);
  });

  it('should get application preferences', async () => {
    const mockPrefs = { save_path: '/downloads', dht: true };
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPrefs
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    const prefs = await client.getPreferences();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/app/preferences'),
      expect.any(Object)
    );
    expect(prefs.save_path).toBe('/downloads');
  });

  it('should set application preferences', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.setPreferences({ save_path: '/new/path' });

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

  it('should fetch torrent files', async () => {
    const mockFilesResponse = [
      { name: 'file1.mp4', size: 1024, progress: 1, priority: 1 },
      { name: 'file2.txt', size: 512, progress: 0, priority: 0 }
    ];

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFilesResponse
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    const files = await client.getTorrentFiles('h1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/files?hash=h1'),
      expect.any(Object)
    );
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('file1.mp4');
  });

  it('should set file priorities', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.setFilePriority('h1', [0, 2], 1);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/filePrio'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const body = (fetch as any).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('hash')).toBe('h1');
    expect(body.get('id')).toBe('0|2');
    expect(body.get('priority')).toBe('1');
  });

  it('should pause torrents using the stop endpoint', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.pauseTorrents(['h1', 'h2']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/stop'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const body = (fetch as any).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('hashes')).toBe('h1|h2');
  });

  it('should delete torrents and optionally delete files', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.deleteTorrents(['h1'], true);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/delete'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const body = (fetch as any).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('hashes')).toBe('h1');
    expect(body.get('deleteFiles')).toBe('true');
  });

  it('should toggle alternative speed limits', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    await client.toggleAltSpeedLimits();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/transfer/toggleSpeedLimitsMode'),
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
});
