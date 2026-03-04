import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentDetailModal from './TorrentDetailModal';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('TorrentDetailModal', () => {
  const baseMockTorrent: TorrentWithMetadata = {
    hash: 'h1',
    name: 'Movie.2024.1080p',
    progress: 0.5,
    state: 'downloading',
    downloadSpeed: 1000,
    uploadSpeed: 500,
    contentPath: '/downloads/Movie.2024.1080p',
    isComplete: false,
    isActive: true,
    getMediaInfo: () => ({ title: 'Movie', year: 2024 }),
    mediaMetadata: null,
    isNonMedia: false,
    files: []
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables "Find Media Match" button when metadata is missing and is NOT non-media', () => {
    render(<TorrentDetailModal {...defaultProps} torrent={baseMockTorrent} />);
    
    const findButton = screen.getByRole('button', { name: /find media match/i });
    expect(findButton).toBeInTheDocument();
    expect(findButton).not.toBeDisabled();
  });

  it('disables "Find Media Match" button when item is marked as "Non-Media"', () => {
    const nonMediaTorrent = { ...baseMockTorrent, isNonMedia: true };
    render(<TorrentDetailModal {...defaultProps} torrent={nonMediaTorrent} />);
    
    const findButton = screen.getByRole('button', { name: /find media match/i });
    expect(findButton).toBeInTheDocument();
    expect(findButton).toBeDisabled();
  });

  it('shows "Unmatch" button instead of "Find Media Match" when metadata exists', () => {
    const withMetaTorrent = { 
      ...baseMockTorrent, 
      mediaMetadata: {
        id: 'm1',
        title: 'Matched Movie',
        year: 2024,
        plot: 'Plot',
        cast: [],
        posterPath: null
      } 
    };
    render(<TorrentDetailModal {...defaultProps} torrent={withMetaTorrent} />);
    
    expect(screen.queryByRole('button', { name: /find media match/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unmatch/i })).toBeInTheDocument();
  });
});
