import { describe, it, expect } from 'vitest';
import { Torrent } from '../Torrent.js';

describe('Torrent Model', () => {
  it('should create a Torrent instance with required properties', () => {
    const torrentData = {
      hash: 'abc123hash',
      name: 'The.Great.Movie.2024.1080p.WEB-DL',
      progress: 0.5,
      state: 'downloading',
      downloadSpeed: 1024,
      uploadSpeed: 512,
      contentPath: '/downloads/The.Great.Movie.2024.1080p.WEB-DL'
    };

    const torrent = new Torrent(torrentData);

    expect(torrent.hash).toBe(torrentData.hash);
    expect(torrent.name).toBe(torrentData.name);
    expect(torrent.progress).toBe(torrentData.progress);
    expect(torrent.state).toBe(torrentData.state);
  });

  it('should return isComplete correctly', () => {
    const completeTorrent = new Torrent({
      hash: 'h1',
      name: 'n1',
      progress: 1,
      state: 'uploading',
      downloadSpeed: 0,
      uploadSpeed: 100,
      contentPath: 'p1'
    });
    const incompleteTorrent = new Torrent({
      hash: 'h2',
      name: 'n2',
      progress: 0.5,
      state: 'downloading',
      downloadSpeed: 100,
      uploadSpeed: 0,
      contentPath: 'p2'
    });

    expect(completeTorrent.isComplete).toBe(true);
    expect(incompleteTorrent.isComplete).toBe(false);
  });

  it('should parse media info from name', () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'The.Great.Movie.2024.1080p.WEB-DL',
      progress: 1,
      state: 'stalledUP',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const info = torrent.getMediaInfo();
    expect(info.title).toBe('The Great Movie');
    expect(info.year).toBe(2024);
  });
});
