import { useEffect, useState, useMemo } from 'react';
import TorrentList from './components/TorrentList';
import AddTorrentModal from './components/AddTorrentModal';
import SettingsModal from './components/SettingsModal';
import TorrentDetailModal from './components/TorrentDetailModal';
import TaskMonitor from './components/TaskMonitor';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import type { QBServerState } from '@soup/core/QBClient.js';
import { sortTorrents } from './utils/sorting';
import type { SortOption } from './utils/sorting';
import { useNotification } from './context/NotificationContext';
import { Soup, Download, Plus, Settings, AlertTriangle, FileText, ArrowDown, ArrowUp, HardDrive, Zap, ZapOff } from 'lucide-react';

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

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function App() {
  const [torrents, setTorrents] = useState<TorrentWithMetadata[]>([]);
  const [serverState, setServerState] = useState<QBServerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAltSpeedTarget, setPendingAltSpeedTarget] = useState<boolean | null>(null);
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

  const fetchData = async () => {
    try {
      const torrentsUrl = selectedTorrentHash 
        ? `${API_URL}/torrents/focus/${selectedTorrentHash}`
        : `${API_URL}/torrents`;
        
      const [torrentsRes, stateRes] = await Promise.all([
        fetch(torrentsUrl),
        fetch(`${API_URL}/state`)
      ]);

      if (!torrentsRes.ok || !stateRes.ok) throw new Error('Failed to fetch data');
      
      const [torrentsData, stateData] = await Promise.all([
        torrentsRes.json() as Promise<TorrentWithMetadata[]>,
        stateRes.json() as Promise<QBServerState>
      ]);
      
      setTorrents(torrentsData);
      setServerState(stateData);
      setError(null);

      // Resolve pending alt speed transition if server state matches our target
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
      fetchData();
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
      // We don't clear the pending state here; fetchData will clear it when qB reports the change
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
      setPendingAltSpeedTarget(null);
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
    fetchData();
    const interval = setInterval(fetchData, config?.syncInterval || 2000);
    return () => clearInterval(interval);
  }, [config?.syncInterval, selectedTorrentHash, pendingAltSpeedTarget]);

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
      <aside className="w-20 lg:w-64 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sticky top-0 h-screen overflow-hidden">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
            <Soup size={24} strokeWidth={2.5} />
          </div>
          <span className="hidden lg:block font-black text-xl tracking-tight">SOUP</span>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
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

          {config?.env === 'development' && (
            <a 
              href="/coverage/index.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
            >
              <FileText size={20} />
              <span className="hidden lg:block font-bold text-sm">Coverage Report</span>
            </a>
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
          {/* Real-time Global Stats */}
          <div className="hidden lg:block bg-zinc-100 dark:bg-zinc-900 rounded-3xl p-4 border border-zinc-200/50 dark:border-zinc-800/50 space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ArrowDown size={14} className="text-blue-500" />
                <span className="text-[11px] font-black">{serverState ? formatBytes(serverState.dl_info_speed) : '0 B'}/s</span>
              </div>
              <div className="flex items-center space-x-2">
                <ArrowUp size={14} className="text-emerald-500" />
                <span className="text-[11px] font-black">{serverState ? formatBytes(serverState.up_info_speed) : '0 B'}/s</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-400">
                <div className="flex items-center space-x-1">
                  <HardDrive size={10} />
                  <span>Free Space</span>
                </div>
                <span className="text-zinc-600 dark:text-zinc-300">{serverState ? formatBytes(serverState.free_space_on_disk, 1) : '0 GB'}</span>
              </div>
              <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500/50 w-[70%]" /> {/* Mock fill until we have total capacity */}
              </div>
            </div>

            {/* Alt Speed Limits Toggle */}
            <button 
              onClick={handleToggleAltSpeeds}
              disabled={pendingAltSpeedTarget !== null}
              className={`w-full flex items-center justify-between p-2 rounded-xl transition-all ${pendingAltSpeedTarget !== null ? 'opacity-50 cursor-default' : 'cursor-pointer'} ${serverState?.use_alt_speed_limits ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-400'}`}
            >
              <div className="flex items-center space-x-2">
                {serverState?.use_alt_speed_limits ? <Zap size={14} /> : <ZapOff size={14} />}
                <span className="text-[10px] font-black uppercase tracking-tight">Alt Speeds</span>
              </div>
              <div className={`w-6 h-3 rounded-full relative transition-colors ${serverState?.use_alt_speed_limits ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${serverState?.use_alt_speed_limits ? 'left-3.5' : 'left-0.5'}`} />
              </div>
            </button>
          </div>

          <div className={`p-3 rounded-2xl flex flex-col items-center lg:items-start ${error ? 'bg-red-50 dark:bg-red-900/10' : 'bg-green-50 dark:bg-green-900/10'}`}>
            <div className="flex items-center space-x-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${error ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="hidden lg:block text-[10px] font-black uppercase tracking-tighter opacity-50 italic">
                {error ? 'Basement Offline' : 'Basement Online'}
              </span>
            </div>
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
