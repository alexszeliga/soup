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
});
