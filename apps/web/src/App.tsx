import { useEffect, useState, useMemo } from 'react';
import TorrentList from './components/TorrentList';
import AddTorrentModal from './components/AddTorrentModal';
import SettingsModal from './components/SettingsModal';
import TorrentDetailModal from './components/TorrentDetailModal';
import TaskMonitor from './components/TaskMonitor';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { sortTorrents } from './utils/sorting';
import type { SortOption } from './utils/sorting';
import { useNotification } from './context/NotificationContext';
import { Soup, Download, Plus, Settings, AlertTriangle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ACTIVE_STATES = [
  'allocating', 'downloading', 'metaDL', 'stalledDL', 'checkingDL', 
  'forcedDL', 'queuedDL', 'uploading', 'stalledUP', 'forcedUP', 
  'queuedUP', 'checkingUP', 'moving'
];

interface ClientConfig {
  syncInterval: number;
}

function App() {
  const [torrents, setTorrents] = useState<TorrentWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded');
  const { showNotification } = useNotification();
  // Map of hash -> target state ('active' | 'inactive')
  const [pendingTransitions, setPendingTransitions] = useState<Map<string, 'active' | 'inactive'>>(new Map());

  const selectedTorrent = torrents.find(t => t.hash === selectedTorrentHash) || null;

  const sortedTorrents = useMemo(() => {
    return sortTorrents(torrents, sortBy);
  }, [torrents, sortBy]);

  const fetchTorrents = async () => {
    try {
      const url = selectedTorrentHash 
        ? `${API_URL}/torrents/focus/${selectedTorrentHash}`
        : `${API_URL}/torrents`;
        
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch torrents');
      const data = await response.json() as TorrentWithMetadata[];
      
      setTorrents(data);
      setError(null);

      // Clean up pending transitions that have completed
      setPendingTransitions(prev => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        data.forEach((t) => {
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
    } finally {
      setIsLoading(false);
    }
  };

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
      fetchTorrents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
    }
  };

  /**
   * Helper to perform a torrent action (pause/resume) and manage its pending UI state.
   * 
   * @param hash - The torrent hash.
   * @param endpoint - The API endpoint to call (e.g., 'pause', 'resume').
   * @param targetState - The expected state after transition ('active' | 'inactive').
   */
  const performAction = async (hash: string, endpoint: string, targetState: 'active' | 'inactive') => {
    setPendingTransitions(prev => new Map(prev).set(hash, targetState));
    try {
      await fetch(`${API_URL}/torrents/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: [hash] })
      });
    } catch (err: unknown) {
      console.error(err);
      setPendingTransitions(prev => {
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    }
  };

  const handlePause = (hash: string) => performAction(hash, 'pause', 'inactive');
  const handleResume = (hash: string) => performAction(hash, 'resume', 'active');

  const handleDelete = async (hash: string) => {
    setPendingTransitions(prev => new Map(prev).set(hash, 'inactive'));
    try {
      await fetch(`${API_URL}/torrents?hashes=${hash}&deleteFiles=true`, {
        method: 'DELETE'
      });
    } catch (err: unknown) {
      console.error(err);
      setPendingTransitions(prev => {
        const next = new Map(prev);
        next.delete(hash);
        return next;
      });
    }
  };

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

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, config?.syncInterval || 2000);
    return () => clearInterval(interval);
  }, [config?.syncInterval, selectedTorrentHash]);

  return (
    <div className="flex min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-500 font-sans selection:bg-blue-500/30">
      {/* Add Torrent Modal */}
      <AddTorrentModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={handleAddTorrent} 
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        apiUrl={API_URL}
      />

      {/* Detail Modal */}
      <TorrentDetailModal
        torrent={selectedTorrent}
        isOpen={!!selectedTorrentHash}
        onClose={() => setSelectedTorrentHash(null)}
        onPause={handlePause}
        onResume={handleResume}
        onDelete={handleDelete}
      />

      {/* Material 3 Sidebar */}
      <aside className="w-20 lg:w-64 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
            <Soup size={24} strokeWidth={2.5} />
          </div>
          <span className="hidden lg:block font-black text-xl tracking-tight">SOUP</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 hidden lg:block">Library</div>
          
          <button 
            onClick={() => { setSelectedTorrentHash(null); setIsAddModalOpen(false); setIsSettingsModalOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${(!isAddModalOpen && !isSettingsModalOpen && !selectedTorrentHash) ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
          >
            <Download size={20} />
            <span className="hidden lg:block font-bold text-sm">Downloads</span>
          </button>

          <button 
            onClick={() => { setIsAddModalOpen(true); setIsSettingsModalOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${isAddModalOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
          >
            <Plus size={20} />
            <span className="hidden lg:block font-bold text-sm">Add Torrent</span>
          </button>

          <div className="px-3 py-2 mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 hidden lg:block">System</div>

          <button 
            onClick={() => { setIsSettingsModalOpen(true); setIsAddModalOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${isSettingsModalOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
          >
            <Settings size={20} />
            <span className="hidden lg:block font-bold text-sm">Settings</span>
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-zinc-200/50 dark:border-zinc-800/50">
          <div className={`p-3 rounded-2xl flex flex-col items-center lg:items-start ${error ? 'bg-red-50 dark:bg-red-900/10' : 'bg-green-50 dark:bg-green-900/10'}`}>
            <span className={`w-2 h-2 rounded-full mb-2 ${error ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="hidden lg:block text-[10px] font-black uppercase tracking-tighter opacity-50">Basement Link</span>
            <span className="hidden lg:block text-[11px] font-bold truncate w-full italic">
              {error ? 'Disconnected' : 'Online'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-h-screen overflow-hidden bg-white dark:bg-zinc-950">
        {/* Modern Header */}
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200/50 dark:border-zinc-800/50 sticky top-0 z-20">
          <div>
            <h2 className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Dashboard</h2>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mt-1">Active Transfers</h1>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mr-2">Sort by</p>
              <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-1 border border-zinc-200/50 dark:border-zinc-800/50">
                <button 
                  onClick={() => setSortBy('dateAdded')}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${sortBy === 'dateAdded' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Date
                </button>
                <button 
                  onClick={() => setSortBy('alphabetical')}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${sortBy === 'alphabetical' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Name
                </button>
              </div>
            </div>

            <div className="h-10 w-px bg-zinc-200 dark:bg-zinc-800" />

            <TaskMonitor />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Centered, constrained content area */}
          <div className="max-w-[1400px] mx-auto w-full p-4 lg:p-8">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl mb-8 flex items-center space-x-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-500/20">
                  <AlertTriangle size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="font-black text-red-600 dark:text-red-400">Basement Connection Error</p>
                  <p className="text-sm font-bold text-red-500/60 truncate">{error}</p>
                </div>
              </div>
            )}

            <TorrentList 
              torrents={sortedTorrents} 
              isLoading={isLoading} 
              pendingHashes={new Set(pendingTransitions.keys())}
              onSelect={setSelectedTorrentHash}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
