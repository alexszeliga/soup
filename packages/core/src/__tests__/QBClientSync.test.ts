import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QBClient } from '../QBClient.js';

describe('QBClient Sync API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should fetch main data delta from sync API', async () => {
    const mockSyncResponse = {
      rid: 1,
      full_update: true,
      torrents: {
        'h1': { name: 'Torrent 1', progress: 0.5, state: 'downloading' }
      }
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSyncResponse
    });

    const client = new QBClient('https://qb.osage.lol/api/v2');
    const data = await client.getMainData(0);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sync/maindata?rid=0'),
      expect.any(Object)
    );
    expect(data.rid).toBe(1);
    expect(data.torrents?.['h1'].name).toBe('Torrent 1');
  });

  it('should add torrents via magnet links', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });
    const client = new QBClient('https://qb.osage.lol/api/v2');
    
    await client.addTorrents(['magnet:?xt=urn:btih:123']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/add'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );
  });

  it('should pause torrents', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });
    const client = new QBClient('https://qb.osage.lol/api/v2');
    
    await client.pauseTorrents(['h1']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/stop'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );
    
    const body = (vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams);
    expect(body.get('hashes')).toBe('h1');
  });

  it('should force start torrents', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });
    const client = new QBClient('https://qb.osage.lol/api/v2');
    
    await client.forceStartTorrents(['h1']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/setForceStart'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const body = (vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams);
    expect(body.get('hashes')).toBe('h1');
    expect(body.get('value')).toBe('true');
  });

  it('should resume torrents', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });
    const client = new QBClient('https://qb.osage.lol/api/v2');
    
    await client.resumeTorrents(['h1']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/start'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams)
      })
    );

    const body = (vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams);
    expect(body.get('hashes')).toBe('h1');
  });

  it('should delete torrents', async () => {
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

    const body = (vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams);
    expect(body.get('hashes')).toBe('h1');
    expect(body.get('deleteFiles')).toBe('true');
  });
});
