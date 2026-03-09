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
      contentPath: '/downloads/The.Great.Movie.2024.1080p.WEB-DL',
      addedOn: 1700000000,
      seedingTime: 3600,
      ratio: 1.5
    };

    const torrent = new Torrent(torrentData);

    expect(torrent.hash).toBe(torrentData.hash);
    expect(torrent.name).toBe(torrentData.name);
    expect(torrent.progress).toBe(torrentData.progress);
    expect(torrent.state).toBe(torrentData.state);
    expect(torrent.stateName).toBe('Downloading');
    expect(torrent.addedOn).toBe(torrentData.addedOn);
    expect(torrent.seedingTime).toBe(torrentData.seedingTime);
    expect(torrent.ratio).toBe(torrentData.ratio);
  });

  it('should return isSeeding correctly', () => {
    const seedingTorrent = new Torrent({
      hash: 'h1',
      name: 'n1',
      progress: 1,
      state: 'uploading',
      downloadSpeed: 0,
      uploadSpeed: 100,
      contentPath: 'p1'
    });
    const downloadingTorrent = new Torrent({
      hash: 'h2',
      name: 'n2',
      progress: 0.5,
      state: 'downloading',
      downloadSpeed: 100,
      uploadSpeed: 0,
      contentPath: 'p2'
    });

    expect(seedingTorrent.isSeeding).toBe(true);
    expect(downloadingTorrent.isSeeding).toBe(false);
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

  it('should handle years in the title', () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: '2012.2009.1080p.BluRay',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const info = torrent.getMediaInfo();
    expect(info.title).toBe('2012');
    expect(info.year).toBe(2009);
  });

  it('should handle dual language and complex tags', () => {
    const torrent = new Torrent({
      hash: 'h1',
      name: 'Spider-Man.No.Way.Home.2021.GERMAN.DL.1080p.BluRay.x264',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p1'
    });

    const info = torrent.getMediaInfo();
    expect(info.title).toBe('Spider-Man No Way Home');
    expect(info.year).toBe(2021);
  });

  it('should handle TV show patterns', () => {
    const examples = [
      { name: 'The.Boys.2019.S01E01.1080p', title: 'The Boys', year: 2019 },
      { name: 'Stranger.Things.S04E01.720p', title: 'Stranger Things', year: null },
      { name: 'The.Mandalorian.Season.2.1080p', title: 'The Mandalorian', year: null },
      { name: 'Breaking.Bad.1x01.BluRay', title: 'Breaking Bad', year: null }
    ];

    for (const ex of examples) {
      const torrent = new Torrent({
        hash: 'h',
        name: ex.name,
        progress: 1,
        state: 'seeding',
        downloadSpeed: 0,
        uploadSpeed: 0,
        contentPath: 'p'
      });
      const info = torrent.getMediaInfo();
      expect(info.title).toBe(ex.title);
      expect(info.year).toBe(ex.year);
    }
  });

  it('should strip technical noise tags', () => {
    const torrent = new Torrent({
      hash: 'h',
      name: 'Movie.Title.Multi.1080p.WEB-DL.H264-GROUP',
      progress: 1,
      state: 'seeding',
      downloadSpeed: 0,
      uploadSpeed: 0,
      contentPath: 'p'
    });
    const info = torrent.getMediaInfo();
    expect(info.title).toBe('Movie Title');
  });
});
