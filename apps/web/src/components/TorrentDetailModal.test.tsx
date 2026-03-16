import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentDetailModal from './TorrentDetailModal';
import { Torrent } from '@soup/core/Torrent.js';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('TorrentDetailModal', () => {
  const baseTorrentProps = {
    hash: 'h1',
    name: 'Movie.2024.1080p',
    progress: 0.5,
    state: 'downloading',
    downloadSpeed: 1000,
    uploadSpeed: 500,
    contentPath: '/downloads/Movie.2024.1080p',
    files: [],
    isSeeding: false,
    ratio: 0,
    seedingTime: 0
  };

  const createMockTorrent = (overrides: Partial<TorrentWithMetadata> = {}): TorrentWithMetadata => {
    const torrent = new Torrent(baseTorrentProps);
    return Object.assign(torrent, {
      mediaMetadata: null,
      isNonMedia: false,
      ...overrides
    }) as TorrentWithMetadata;
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onDelete: vi.fn(),
    focusedFiles: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables "Match" button when metadata is missing and is NOT non-media', () => {
    const torrent = createMockTorrent();
    render(<TorrentDetailModal {...defaultProps} torrent={torrent} />);
    
    // Use exact match to avoid collision with "Unmatch"
    const findButton = screen.getByRole('button', { name: /^Match$/i });
    expect(findButton).toBeInTheDocument();
    expect(findButton).not.toBeDisabled();
  });

  it('disables "Match" button when item is marked as "Non-Media"', () => {
    const torrent = createMockTorrent({ isNonMedia: true });
    render(<TorrentDetailModal {...defaultProps} torrent={torrent} />);
    
    const findButton = screen.getByRole('button', { name: /^Match$/i });
    expect(findButton).toBeInTheDocument();
    expect(findButton).toBeDisabled();
  });

  it('shows "Unmatch" button instead of "Match" when metadata exists', () => {
    const torrent = createMockTorrent({ 
      mediaMetadata: {
        id: 'm1',
        title: 'Matched Movie',
        year: 2024,
        plot: 'Plot',
        cast: [],
        posterPath: ''
      } 
    });
    render(<TorrentDetailModal {...defaultProps} torrent={torrent} />);
    
    expect(screen.queryByRole('button', { name: /^Match$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Unmatch$/i })).toBeInTheDocument();
  });
});
