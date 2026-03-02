import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TorrentList from './TorrentList';

// Mock TorrentCard to focus on List logic
vi.mock('./TorrentCard', () => ({
  default: ({ torrent }: any) => <div data-testid="torrent-card">{torrent.name}</div>
}));

describe('TorrentList', () => {
  const mockTorrents = [
    { hash: 'h1', name: 'Torrent 1', progress: 0.1, state: 'downloading' },
    { hash: 'h2', name: 'Torrent 2', progress: 0.9, state: 'seeding' },
  ];

  it('renders a list of torrent cards', () => {
    render(<TorrentList torrents={mockTorrents} isLoading={false} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByTestId('torrent-card')).toHaveLength(2);
  });

  it('renders empty state when no torrents', () => {
    render(<TorrentList torrents={[]} isLoading={false} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/No torrents found/i)).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<TorrentList torrents={[]} isLoading={true} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
