import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TorrentCard from './TorrentCard';

describe('TorrentCard', () => {
  const mockTorrent = {
    hash: 'h1',
    name: 'The.Great.Movie.2024.1080p',
    progress: 0.5,
    state: 'downloading',
    mediaMetadata: {
      title: 'The Great Movie',
      year: 2024,
      posterPath: 'https://image.tmdb.org/t/p/w500/path.jpg',
    }
  };

  it('renders the media title and year', () => {
    render(<TorrentCard torrent={mockTorrent} />);
    expect(screen.getByText('The Great Movie')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('renders the progress percentage', () => {
    render(<TorrentCard torrent={mockTorrent} />);
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });
});
