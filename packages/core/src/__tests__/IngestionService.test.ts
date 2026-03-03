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
