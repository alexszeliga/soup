import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentCard from './TorrentCard';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';

describe('TorrentCard', () => {
  const mockTorrent: TorrentWithMetadata = {
    hash: 'h1',
    name: 'The.Great.Movie.2024.1080p.WEB-DL',
    progress: 0.5,
    state: 'downloading',
    downloadSpeed: 1024,
    uploadSpeed: 512,
    contentPath: '/downloads/t1',
    isComplete: false,
    isActive: true,
    getMediaInfo: () => ({ title: 'The Great Movie', year: 2024 }),
    mediaMetadata: {
      id: 'm1',
      title: 'The Great Movie',
      year: 2024,
      posterPath: 'https://image.tmdb.org/t/p/w500/path.jpg',
      plot: 'A great movie.',
      cast: ['Actor One']
    }
  };

  it('renders the media title', () => {
    render(<TorrentCard torrent={mockTorrent} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText(/The Great Movie/i)).toBeInTheDocument();
  });

  it('renders the raw name if no metadata', () => {
    const noMetaTorrent: TorrentWithMetadata = { 
      ...mockTorrent, 
      mediaMetadata: null,
      isComplete: false,
      isActive: true,
      getMediaInfo: () => ({ title: 'The.Great.Movie.2024.1080p.WEB-DL', year: null })
    };
    render(<TorrentCard torrent={noMetaTorrent} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getAllByText(/The.Great.Movie.2024.1080p.WEB-DL/i)[0]).toBeInTheDocument();
  });
});
