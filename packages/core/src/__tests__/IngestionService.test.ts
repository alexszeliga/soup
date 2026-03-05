import { describe, it, expect, vi } from 'vitest';
import { IngestionService } from '../IngestionService.js';

describe('IngestionService', () => {
  const service = new IngestionService('/media');

  it('should extract season and episode from TV show filenames', () => {
    const filenames = [
      'The.Office.US.S03E01.1080p.mkv',
      'The Office S3E1.mp4',
      'The.Office.US.3x01.avi'
    ];

    const results = filenames.map(f => service.suggestPath('The Office', f));

    expect(results[0]).toBe('The Office/Season 03/The Office - S03E01.mkv');
    expect(results[1]).toBe('The Office/Season 03/The Office - S03E01.mp4');
    expect(results[2]).toBe('The Office/Season 03/The Office - S03E01.avi');
  });

  it('should sanitize illegal characters in suggested paths', () => {
    const filename = 'Star.Wars.Episode.IV.1977.mkv';
    const result = service.suggestPath('Star Wars: Episode IV', filename, 1977);
    
    // ":" should be replaced with " -"
    expect(result).toBe('Star Wars - Episode IV (1977)/Star Wars - Episode IV (1977).mkv');
  });

  it('should map remote qBittorrent paths to local filesystem paths', () => {
    const remotePath = '/downloads/Movie/file.mkv';
    const remoteRoot = '/downloads';
    const localRoot = './downloads';

    const result = service.mapRemoteToLocalPath(remotePath, remoteRoot, localRoot);
    expect(result).toBe('downloads/Movie/file.mkv');
  });

  it('should handle movie naming with year', () => {
    const filename = 'Fight.Club.1999.1080p.BluRay.mkv';
    const result = service.suggestPath('Fight Club', filename, 1999);
    expect(result).toBe('Fight Club (1999)/Fight Club (1999).mkv');
  });

  it('should include the year in TV show paths if provided', () => {
    const filename = 'The.Office.US.S09E01.mkv';
    const result = service.suggestPath('The Office', filename, 2005);
    
    // Jellyfin prefers Title (Year) for the show folder to avoid ambiguity
    expect(result).toBe('The Office (2005)/Season 09/The Office (2005) - S09E01.mkv');
  });

  describe('resolveSourcePath (TDD Reproduction)', () => {
    const remoteRoot = '/media/fast_media/torrent_download';
    const localRoot = '/mnt/downloads';

    it('should correctly resolve paths for folder-based torrents (Standard)', () => {
      const torrent = {
        hash: 'h1',
        name: 'The.Office.S01.1080p',
        contentPath: `${remoteRoot}/The.Office.S01.1080p`
      };
      const file = { name: 'The.Office.S01.1080p/S01E01.mkv', index: 0 };

      const result = service.resolveSourcePath(torrent, file, remoteRoot, localRoot);
      expect(result).toBe(`${localRoot}/The.Office.S01.1080p/S01E01.mkv`);
    });

    it('should NOT produce ENOTDIR by appending to a file path (REPRODUCTION)', () => {
      // The Blues Brothers Case from logs:
      // remoteRoot = /media/fast_media/torrent_download
      // contentPath points to the MKV file directly
      // file.name includes the root folder
      const folderName = 'The.Blues.Brothers.1980.Extended.Cut.1080p.BluRay.DTS.x264-DON';
      const fileName = `${folderName}.mkv`;
      
      const torrent = {
        hash: 'h1',
        name: folderName,
        contentPath: `${remoteRoot}/${folderName}/${fileName}`
      };
      const file = { name: `${folderName}/${fileName}`, index: 0 };

      const result = service.resolveSourcePath(torrent, file, remoteRoot, localRoot);
      
      // Expected (actual disk) = /mnt/downloads/The.Blues.Brothers...DON/The.Blues.Brothers...DON.mkv
      expect(result).toBe(`${localRoot}/${folderName}/${fileName}`);
    });
  });

  it('should use high-performance copy logic with progress polling', async () => {
    vi.mock('fs', async () => {
      const actual = await vi.importActual('fs') as any;
      return {
        ...actual,
        promises: {
          ...actual.promises,
          mkdir: vi.fn().mockResolvedValue(undefined),
          stat: vi.fn()
            .mockResolvedValueOnce({ size: 100 }) // Total size check
            .mockResolvedValue({ size: 50 }),     // Polling progress check
          copyFile: vi.fn().mockResolvedValue(undefined),
        }
      };
    });

    const task = service.createCopyTask('h1', { 'src/file1.mp4': 'dest/file1.mp4' });
    
    // We expect it to finish and report progress
    await task.run(() => {
      // Progress should be reported
    });

    const fs = await import('fs');
    expect(fs.promises.copyFile).toHaveBeenCalledWith('src/file1.mp4', '/media/dest/file1.mp4');
    expect(task.status).toBe('completed');
  });
});
