import { useState, useEffect, useCallback, useRef } from 'react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import type { QBServerState } from '@soup/core/QBClient.js';
import type { DiskStats } from '@soup/core/StorageService.js';
import { useNotification } from '../context/NotificationContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
// Use the current host but with ws:// protocol
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

interface ClientConfig {
  backend: 'qbittorrent' | 'soup-go';
  syncInterval: number;
  tmdbImageBase: string;
  env: string;
}

export interface IngestionTask {
  id: string;
  torrentHash: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentFile: string | null;
  fileMap: string;
  errorMessage: string | null;
}

export function useTorrents(selectedTorrentHash: string | null) {
  const [torrents, setTorrents] = useState<TorrentWithMetadata[]>([]);
  const [serverState, setServerState] = useState<QBServerState | null>(null);
  const [storageStats, setStorageStats] = useState<DiskStats[]>([]);
  const [tasks, setTasks] = useState<IngestionTask[]>([]);
  const [focusedFiles, setFocusedFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAltSpeedTarget, setPendingAltSpeedTarget] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const { showNotification } = useNotification();
  
  // Real-time connectivity state
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  
  // Track the current focus to prevent stale data updates
  const currentFocusRef = useRef<string | null>(null);
  currentFocusRef.current = selectedTorrentHash;

  // Map of hash -> target state ('active' | 'inactive')
  const [pendingTransitions, setPendingTransitions] = useState<Map<string, 'active' | 'inactive'>>(new Map());

  // Connectivity State
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const isConnectionLost = consecutiveFailures >= 3;

  const fetchData = useCallback(async () => {
    if (isWebSocketActive) return;
    try {
      const [torrentsRes, stateRes, storageRes, tasksRes] = await Promise.all([
        fetch(`${API_URL}/torrents`),
        fetch(`${API_URL}/state`),
        fetch(`${API_URL}/system/storage`),
        fetch(`${API_URL}/tasks`)
      ]);
      if (!torrentsRes.ok || !stateRes.ok || !storageRes.ok || !tasksRes.ok) throw new Error('Failed to fetch data');
      const [torrentsData, stateData, storageData, tasksData] = await Promise.all([
        torrentsRes.json() as Promise<TorrentWithMetadata[]>,
        stateRes.json() as Promise<QBServerState>,
        storageRes.json() as Promise<DiskStats[]>,
        tasksRes.json() as Promise<IngestionTask[]>
      ]);
      setTorrents(torrentsData);
      setServerState(stateData);
      setStorageStats(storageData);
      setTasks(tasksData);
      setError(null);
      setConsecutiveFailures(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConsecutiveFailures(prev => prev + 1);
    } finally {
      setIsLoading(false);
    }
  }, [isWebSocketActive]);

  // --- Persistent WebSocket Connection ---
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('🚀 Soup-Go WebSocket Connected');
        setIsWebSocketActive(true);
        setConsecutiveFailures(0);
        // Send initial focus if any
        if (currentFocusRef.current) {
          socket?.send(JSON.stringify({ type: 'focus', hash: currentFocusRef.current }));
        }
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'sync') {
          const { torrents, state, storage, tasks, focusedFiles, focusHash } = data.payload;
          
          if (torrents) setTorrents(torrents);
          if (state) setServerState(state);
          if (storage) setStorageStats(storage);
          if (tasks) setTasks(tasks);

          // SAFE FILE UPDATE: Only update if the incoming data matches our current selection
          if (focusHash === currentFocusRef.current) {
            setFocusedFiles(focusedFiles || []);
          } else if (!currentFocusRef.current) {
            setFocusedFiles([]);
          }
        }
      };

      socket.onclose = () => {
        console.warn('⚠️ Soup-Go WebSocket Closed. Reconnecting...');
        setIsWebSocketActive(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, []); // Run once on mount

  // --- Dynamic Focus Handling (No reconnection needed) ---
  useEffect(() => {
    if (isWebSocketActive && wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear local state immediately to avoid "ghost" files
      setFocusedFiles([]);
      wsRef.current.send(JSON.stringify({ 
        type: 'focus', 
        hash: selectedTorrentHash 
      }));
    }
  }, [selectedTorrentHash, isWebSocketActive]);

  const handleAddTorrent = async (data: { url?: string; file?: File }) => {
    try {
      const formData = new FormData();
      if (data.file) {
        formData.append('torrents', data.file);
      }
      
      const response = await fetch(`${API_URL}/torrents`, {
        method: 'POST',
        headers: data.url ? { 'Content-Type': 'application/json' } : {},
        body: data.url ? JSON.stringify({ url: data.url }) : formData
      });

      if (!response.ok) throw new Error('Failed to add torrent');
      showNotification('Torrent added successfully', 'success');
      if (!isWebSocketActive) fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
    }
  };

  const handleDelete = async (hash: string, deleteFiles: boolean = true) => {
    setPendingTransitions(prev => new Map(prev).set(hash, 'inactive'));
    try {
      const res = await fetch(`${API_URL}/torrents/${hash}?deleteFiles=${deleteFiles}`, {
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

  // Main Polling Loop (Only active when WebSocket is down)
  useEffect(() => {
    if (isWebSocketActive) return;

    fetchData();
    const interval = setInterval(fetchData, config?.syncInterval || 2000);
    return () => clearInterval(interval);
  }, [fetchData, config?.syncInterval, isWebSocketActive]);

  return {
    torrents,
    serverState,
    storageStats,
    tasks,
    focusedFiles,
    isLoading,
    error,
    isConnectionLost,
    pendingTransitions,
    pendingAltSpeedTarget,
    config,
    isWebSocketActive,
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
