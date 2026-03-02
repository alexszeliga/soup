import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QBClient } from '../QBClient.js';

describe('QBClient Security Integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should include Referer header in state-changing requests', async () => {
    (fetch as any).mockResolvedValue({ ok: true, headers: new Headers() });
    
    const baseUrl = 'https://qb.osage.lol/api/v2';
    const client = new QBClient(baseUrl);
    
    // Perform a state-changing action
    await client.pauseTorrents(['h1']);

    const fetchArgs = vi.mocked(fetch).mock.calls[0];
    const headers = fetchArgs[1]?.headers as Record<string, string>;

    // This is the expected failure: Referer must match the base URL
    expect(headers).toHaveProperty('Referer');
    expect(headers['Referer']).toBe(baseUrl + '/');
  });
});
