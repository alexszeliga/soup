import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentDetailModal from './TorrentDetailModal';
import type { TorrentWithMetadata } from '../types/api.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('TorrentDetailModal', () => {
  const createMockTorrent = (overrides: Partial<TorrentWithMetadata> = {}): TorrentWithMetadata => {
    const torrent: TorrentWithMetadata = {
      hash: 'h1',
      name: 'Movie.2024.1080p',
      size: 2147483648,
      progress: 0.5,
      state: 'downloading',
      stateName: 'Downloading',
      downloadSpeed: 1000,
      uploadSpeed: 500,
      totalRead: 0,
      totalWritten: 0,
      contentPath: '/downloads/Movie.2024.1080p',
      addedOn: Date.now() / 1000,
      seedingTime: 0,
      ratio: 0,
      eta: -1,
      activePeers: 0,
      totalPeers: 0,
      availability: 0,
      isSequential: false,
      isForceStart: false,
      isNonMedia: false,
      mediaInfo: {
        title: 'Movie',
        year: 2024,
        type: 'movie'
      },
      mediaMetadata: null,
      files: []
    };
    return { ...torrent, ...overrides };
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
