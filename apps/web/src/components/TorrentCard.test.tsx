import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentCard from './TorrentCard';
import type { TorrentWithMetadata } from '../types/api.js';

describe('TorrentCard', () => {
  const mockTorrent: TorrentWithMetadata = {
    hash: 'h1',
    name: 'The.Great.Movie.2024.1080p.WEB-DL',
    progress: 0.5,
    state: 'downloading',
    stateName: 'Downloading',
    downloadSpeed: 1024,
    uploadSpeed: 512,
    size: 2147483648, // 2GB
    contentPath: '/downloads/t1',
    mediaInfo: {
      title: 'The Great Movie',
      year: 2024,
      type: 'movie'
    },
    mediaMetadata: {
      id: 'm1',
      title: 'The Great Movie',
      year: 2024,
      posterPath: 'https://image.tmdb.org/t/p/w500/path.jpg',
      plot: 'A great movie.',
      cast: ['Actor One']
    },
    isNonMedia: false,
    isSequential: false,
    isForceStart: false,
    totalRead: 0,
    totalWritten: 0,
    eta: -1,
    activePeers: 0,
    totalPeers: 0,
    availability: 0,
    addedOn: Date.now() / 1000 - 3600,
    seedingTime: 0,
    ratio: 1.5
  };

  it('renders the media title', () => {
    render(<TorrentCard torrent={mockTorrent} onClick={vi.fn()} />);
    expect(screen.getByText(/The Great Movie/i)).toBeInTheDocument();
  });

  it('renders the nice state name', () => {
    render(<TorrentCard torrent={mockTorrent} onClick={vi.fn()} />);
    expect(screen.getByText(/Downloading/i)).toBeInTheDocument();
  });

  it('renders the seeding stats', () => {
    render(<TorrentCard torrent={mockTorrent} onClick={vi.fn()} />);
    expect(screen.getByText(/2 GiB/)).toBeInTheDocument();
    expect(screen.getByText(/Ratio:/i)).toBeInTheDocument();
    expect(screen.getByText(/1.50/)).toBeInTheDocument();
    expect(screen.queryByText(/Seeded:/i)).not.toBeInTheDocument(); // seedingTime is 0
  });

  it('renders the raw name if no metadata', () => {
    const noMetaTorrent: TorrentWithMetadata = { 
      ...mockTorrent, 
      mediaMetadata: null,
      mediaInfo: {
        title: 'The.Great.Movie.2024.1080p.WEB-DL',
        year: null,
        type: 'movie'
      }
    };
    render(<TorrentCard torrent={noMetaTorrent} onClick={vi.fn()} />);
    expect(screen.getAllByText(/The.Great.Movie.2024.1080p.WEB-DL/i)[0]).toBeInTheDocument();
  });
});
