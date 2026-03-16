import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IngestTab from './IngestTab';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { NotificationProvider } from '../context/NotificationContext';

// Mock fetch globally
global.fetch = vi.fn();

const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <NotificationProvider>
      {ui}
    </NotificationProvider>
  );
};

describe('IngestTab', () => {
  const mockTorrent = {
    hash: 'h1',
    name: 'Movie.2024.1080p',
    contentPath: '/downloads/Movie.2024.1080p',
    files: [
      { index: 0, name: 'movie.mkv', size: 200 * 1024 * 1024, progress: 1, priority: 1 },
      { index: 1, name: 'sample.mkv', size: 10 * 1024 * 1024, progress: 1, priority: 1 }
    ]
  } as unknown as TorrentWithMetadata;

  const mockLibraries = ['Movies', 'TV Shows'];
  const mockSuggestions = [
    { index: 0, originalName: 'movie.mkv', sourcePath: 'movie.mkv', suggestedPath: 'Movies/Movie (2024)/Movie (2024).mkv' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === '/api/ingest/libraries') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockLibraries)
        });
      }
      if (url.includes('/suggest-paths')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSuggestions)
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  it('renders correctly and fetches libraries', async () => {
    renderWithProvider(<IngestTab torrent={mockTorrent} onIngestStarted={() => {}} />);
    
    expect(screen.getByText('Prepare Ingestion')).toBeInTheDocument();
    
    await waitFor(() => {
      // Check for library in select option
      expect(screen.getByRole('option', { name: 'Movies' })).toBeInTheDocument();
      // Check for library in destination root preview
      expect(screen.getByText('Movies', { selector: 'p' })).toBeInTheDocument();
    });
  });

  it('displays suggestions and enables start button when files are selected', async () => {
    renderWithProvider(<IngestTab torrent={mockTorrent} onIngestStarted={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getAllByText('movie.mkv')[0]).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: /Start Ingestion/i });
    
    // Initially should be enabled if defaults are selected
    expect(startButton).not.toBeDisabled();

    // Toggle off the only selected item (in desktop table)
    const checkbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    
    expect(startButton).toBeDisabled();
  });

  it('calls start ingestion with correct payload', async () => {
    const onIngestStarted = vi.fn();
    renderWithProvider(<IngestTab torrent={mockTorrent} onIngestStarted={onIngestStarted} />);
    
    await waitFor(() => {
      expect(screen.getAllByText('movie.mkv')[0]).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: /Start Ingestion/i });
    fireEvent.click(startButton);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ingest',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"mapping"')
      })
    );
  });
});
