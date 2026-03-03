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
    const delta = await engine.tick();

    expect(delta.added).toHaveLength(1);
    expect(delta.added[0].hash).toBe('h1');
    expect(delta.fullUpdate).toBe(true);

    const torrents = engine.getTorrents();
    expect(torrents).toHaveLength(1);
    expect(torrents[0].hash).toBe('h1');
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
    const delta = await engine.tick(); // RID 2

    expect(delta.updated).toHaveLength(1);
    expect(delta.updated[0].hash).toBe('h1');
    expect(delta.updated[0].progress).toBe(0.6);
    expect(delta.added).toHaveLength(0);

    const torrents = engine.getTorrents();
    expect(torrents[0].progress).toBe(0.6);
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
    
    const delta = await engine.tick();
    expect(delta.removed).toContain('h1');
    expect(engine.getTorrents()).toHaveLength(0);
  });

  it('should fetch files only for the focused torrent', async () => {
    const mockFiles = [{ name: 'file1.mp4', size: 100, progress: 1, priority: 1, index: 0 }];
    const mockQB = {
      getMainData: vi.fn().mockResolvedValue({
        rid: 1,
        full_update: true,
        torrents: { 'h1': { name: 'Torrent 1' } }
      }),
      getTorrentFiles: vi.fn().mockResolvedValue(mockFiles)
    } as any as QBClient;

    const engine = new SyncEngine(mockQB);

    // 1. Tick without focus -> No files fetched
    await engine.tick();
    expect(mockQB.getTorrentFiles).not.toHaveBeenCalled();

    // 2. Set focus and tick -> Files fetched
    engine.setFocus('h1');
    const delta = await engine.tick();
    expect(mockQB.getTorrentFiles).toHaveBeenCalledWith('h1');
    expect(delta.added[0].files).toEqual(mockFiles);

    // 3. Clear focus and tick -> No more file fetching
    engine.setFocus(null);
    await engine.tick();
    expect(mockQB.getTorrentFiles).toHaveBeenCalledTimes(1);
  });
});
