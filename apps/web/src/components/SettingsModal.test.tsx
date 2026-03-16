import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';
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

describe('SettingsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    apiUrl: '/api',
  };

  const mockPrefs = {
    save_path: '/downloads',
    max_active_downloads: 3,
    dht: true,
    alt_dl_limit: 1024,
    alt_up_limit: 1024,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays qBittorrent specific text when backend is qbittorrent', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/preferences')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrefs) });
      }
      if (url.includes('/state')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ use_alt_speed_limits: false, backend: 'qbittorrent' }) 
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderWithProvider(<SettingsModal {...defaultProps} backendType="qbittorrent" />);

    await waitFor(() => {
      expect(screen.getByText(/qBittorrent Configuration/i)).toBeInTheDocument();
    });
  });

  it('displays Soup-Go specific text when backend is soup-go', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/preferences')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPrefs) });
      }
      if (url.includes('/state')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ use_alt_speed_limits: false, backend: 'soup-go' }) 
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderWithProvider(<SettingsModal {...defaultProps} backendType="soup-go" />);

    await waitFor(() => {
      expect(screen.getByText(/Soup-Go Configuration/i)).toBeInTheDocument();
    });
    
    // Ensure qBittorrent text is NOT present
    expect(screen.queryByText(/qBittorrent Configuration/i)).not.toBeInTheDocument();
  });
});
