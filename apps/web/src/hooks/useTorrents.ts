import { useState, useEffect, useCallback } from 'react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import type { QBServerState } from '@soup/core/QBClient.js';
import type { DiskStats } from '@soup/core/StorageService.js';
import { useNotification } from '../context/NotificationContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ACTIVE_STATES = [
  'allocating', 'downloading', 'metaDL', 'stalledDL', 'checkingDL', 
  'forcedDL', 'queuedDL', 'uploading', 'stalledUP', 'forcedUP', 
  'queuedUP', 'checkingUP', 'moving'
];

interface ClientConfig {
  syncInterval: number;
  tmdbImageBase: string;
  env: string;
}

export function useTorrents(selectedTorrentHash: string | null) {
  const [torrents, setTorrents] = useState<TorrentWithMetadata[]>([]);
  const [serverState, setServerState] = useState<QBServerState | null>(null);
  const [storageStats, setStorageStats] = useState<DiskStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAltSpeedTarget, setPendingAltSpeedTarget] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const { showNotification } = useNotification();
  
  // Map of hash -> target state ('active' | 'inactive')
  const [pendingTransitions, setPendingTransitions] = useState<Map<string, 'active' | 'inactive'>>(new Map());

  // Connectivity State
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const isConnectionLost = consecutiveFailures >= 3;

  const fetchData = useCallback(async () => {
    try {
      const torrentsUrl = selectedTorrentHash 
        ? `${API_URL}/torrents/focus/${selectedTorrentHash}`
        : `${API_URL}/torrents`;
        
      const [torrentsRes, stateRes, storageRes] = await Promise.all([
        fetch(torrentsUrl),
        fetch(`${API_URL}/state`),
        fetch(`${API_URL}/system/storage`)
      ]);

      if (!torrentsRes.ok || !stateRes.ok || !storageRes.ok) throw new Error('Failed to fetch data');
      
      const [torrentsData, stateData, storageData] = await Promise.all([
        torrentsRes.json() as Promise<TorrentWithMetadata[]>,
        stateRes.json() as Promise<QBServerState>,
        storageRes.json() as Promise<DiskStats[]>
      ]);
      
      setTorrents(torrentsData);
      setServerState(stateData);
      setStorageStats(storageData);
      setError(null);
      setConsecutiveFailures(0);

      // Resolve pending alt speed transition
      setPendingAltSpeedTarget(prev => {
        if (prev !== null && stateData.use_alt_speed_limits === prev) {
          return null;
        }
        return prev;
      });

      // Clean up pending transitions that have completed
      setPendingTransitions(prev => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        torrentsData.forEach((t) => {
          const target = next.get(t.hash);
          if (target) {
            const isCurrentlyActive = ACTIVE_STATES.includes(t.state);
            if ((target === 'active' && isCurrentlyActive) || (target === 'inactive' && !isCurrentlyActive)) {
              next.delete(t.hash);
            }
          }
        });
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setConsecutiveFailures(prev => prev + 1);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTorrentHash]);

  const handleAddTorrent = async (data: { url?: string; file?: File }) => {
    try {
      const formData = new FormData();
      if (data.file) {
        formData.append('torrent', data.file);
      }
      
      const response = await fetch(`${API_URL}/torrents`, {
        method: 'POST',
        headers: data.url ? { 'Content-Type': 'application/json' } : {},
        body: data.url ? JSON.stringify({ url: data.url }) : formData
      });

      if (!response.ok) throw new Error('Failed to add torrent');
      showNotification('Torrent added successfully', 'success');
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
    }
  };

  const handleDelete = async (hash: string) => {
    setPendingTransitions(prev => new Map(prev).set(hash, 'inactive'));
    try {
      const res = await fetch(`${API_URL}/torrents?hashes=${hash}&deleteFiles=true`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete torrent');
      showNotification('Torrent deleted', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
      setPendingTransitions(prev => {
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    }
  };

  const handleToggleAltSpeeds = async () => {
    if (!serverState) return;
    const target = !serverState.use_alt_speed_limits;
    setPendingAltSpeedTarget(target);
    
    try {
      const res = await fetch(`${API_URL}/toggle-alt-speeds`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to toggle speed limits');
      }
      showNotification('Speed limits toggled', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
      setPendingAltSpeedTarget(null);
    }
  };

  // Initial Config Load
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/config`);
        const data = await res.json() as ClientConfig;
        setConfig(data);
      } catch (err) {
        console.error('Failed to fetch config', err);
      }
    };
    fetchConfig();
  }, []);

  // Main Polling Loop
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, config?.syncInterval || 2000);
    return () => clearInterval(interval);
  }, [fetchData, config?.syncInterval, pendingAltSpeedTarget]);

  return {
    torrents,
    serverState,
    storageStats,
    isLoading,
    error,
    isConnectionLost,
    pendingTransitions,
    pendingAltSpeedTarget,
    config,
    fetchData,
    handleAddTorrent,
    handleDelete,
    handleToggleAltSpeeds,
    reconnect: () => {
      setIsLoading(true);
      fetchData();
    }
  };
}
