import { describe, it, expect, vi } from 'vitest';
import { SyncEngine } from '../SyncEngine.js';
import { QBClient } from '../QBClient.js';

describe('SyncEngine', () => {
  it('should maintain state and apply full updates', async () => {
    const mockQB = {
      getMainData: vi.fn().mockResolvedValue({
        rid: 1,
        full_update: true,
        torrents: {
          'h1': { name: 'Torrent 1', progress: 0.5, state: 'downloading' }
        }
      })
    } as any as QBClient;

    const engine = new SyncEngine(mockQB);
    await engine.tick();

    const torrents = engine.getTorrents();
    expect(torrents).toHaveLength(1);
    expect(torrents[0].hash).toBe('h1');
    expect(torrents[0].progress).toBe(0.5);
  });

  it('should apply partial updates (deltas)', async () => {
    const mockQB = {
      getMainData: vi.fn()
        .mockResolvedValueOnce({
          rid: 1,
          full_update: true,
          torrents: {
            'h1': { name: 'Torrent 1', progress: 0.5, state: 'downloading' }
          }
        })
        .mockResolvedValueOnce({
          rid: 2,
          torrents: {
            'h1': { progress: 0.6 }
          }
        })
    } as any as QBClient;

    const engine = new SyncEngine(mockQB);
    await engine.tick(); // RID 1
    await engine.tick(); // RID 2

    const torrents = engine.getTorrents();
    expect(torrents[0].progress).toBe(0.6);
    expect(torrents[0].name).toBe('Torrent 1'); // Preserved from previous state
  });

  it('should remove torrents', async () => {
    const mockQB = {
      getMainData: vi.fn()
        .mockResolvedValueOnce({
          rid: 1,
          full_update: true,
          torrents: {
            'h1': { name: 'Torrent 1' }
          }
        })
        .mockResolvedValueOnce({
          rid: 2,
          torrents_removed: ['h1']
        })
    } as any as QBClient;

    const engine = new SyncEngine(mockQB);
    await engine.tick();
    expect(engine.getTorrents()).toHaveLength(1);

    await engine.tick();
    expect(engine.getTorrents()).toHaveLength(0);
  });
});
