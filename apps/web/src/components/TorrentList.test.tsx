import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TorrentList from './TorrentList';

describe('TorrentList', () => {
  it('renders "No torrents found" when empty', () => {
    render(<TorrentList torrents={[]} isLoading={false} pendingHashes={new Set()} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText(/No torrents found/i)).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<TorrentList torrents={[]} isLoading={true} pendingHashes={new Set()} onPause={vi.fn()} onResume={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
