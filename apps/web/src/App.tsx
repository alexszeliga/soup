import { useEffect, useState, useMemo } from 'react';
import TorrentList from './components/TorrentList';
import AddTorrentModal from './components/AddTorrentModal';
import SettingsModal from './components/SettingsModal';
import TorrentDetailModal from './components/TorrentDetailModal';
import TaskMonitor from './components/TaskMonitor';
import GlobalStats from './components/GlobalStats';
import ErrorBoundary from './components/ErrorBoundary';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import type { QBServerState } from '@soup/core/QBClient.js';
import { sortTorrents } from './utils/sorting';
import type { SortOption } from './utils/sorting';
import { useNotification } from './context/NotificationContext';
import { Plus, Settings, AlertTriangle, FileText, Activity, PawPrint } from 'lucide-react';

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

function App() {
  const [torrents, setTorrents] = useState<TorrentWithMetadata[]>([]);
  const [serverState, setServerState] = useState<QBServerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAltSpeedTarget, setPendingAltSpeedTarget] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
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
    <div className="flex min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-500 font-sans selection:bg-blue-500/30 relative">
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
        onDelete={handleDelete}
      />

      {/* Mobile Stats Modal */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-xl tracking-tight">Server Data</h2>
              <button onClick={() => setIsStatsModalOpen(false)} className="text-zinc-400 text-2xl">&times;</button>
            </div>
            <GlobalStats 
              serverState={serverState}
              pendingAltSpeedTarget={pendingAltSpeedTarget}
              onToggleAltSpeeds={handleToggleAltSpeeds}
              isMobile={true}
            />
          </div>
        </div>
      )}

      {/* Material 3 Sidebar */}
      <aside className="w-20 lg:w-64 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sticky top-0 h-screen overflow-hidden">
        <div className="p-5 lg:p-6 flex items-center lg:space-x-3 justify-center lg:justify-start">
          <div className="w-10 h-10 flex-shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
            <PawPrint size={24} strokeWidth={2.5} />
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="font-black text-xl tracking-tight uppercase leading-none">MML</span>
            <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mt-0.5">Mamal Soup</span>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 hidden lg:block">Library</div>
          
          <button 
            onClick={() => { setIsAddModalOpen(true); setIsSettingsModalOpen(false); }}
            className={`w-full flex items-center justify-center lg:justify-start lg:space-x-3 px-2 lg:px-4 py-3 rounded-2xl transition-all ${isAddModalOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
          >
            <Plus size={24} className="flex-shrink-0" />
            <span className="hidden lg:block font-bold text-sm">Add Torrent</span>
          </button>

          <div className="px-3 py-2 mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 hidden lg:block">System</div>

          <button 
            onClick={() => { setIsSettingsModalOpen(true); setIsAddModalOpen(false); }}
            className={`w-full flex items-center justify-center lg:justify-start lg:space-x-3 px-2 lg:px-4 py-3 rounded-2xl transition-all ${isSettingsModalOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
          >
            <Settings size={24} className="flex-shrink-0" />
            <span className="hidden lg:block font-bold text-sm">Settings</span>
          </button>

          {config?.env === 'development' && (
            <a 
              href="/coverage/index.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center lg:justify-start lg:space-x-3 px-2 lg:px-4 py-3 rounded-2xl transition-all text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
            >
              <FileText size={24} className="flex-shrink-0" />
              <span className="hidden lg:block font-bold text-sm">Coverage Report</span>
            </a>
          )}
        </nav>

        <div className="hidden lg:block p-4 mt-auto border-t border-zinc-200/50 dark:border-zinc-800/50">
          <GlobalStats 
            serverState={serverState}
            pendingAltSpeedTarget={pendingAltSpeedTarget}
            onToggleAltSpeeds={handleToggleAltSpeeds}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-h-screen overflow-hidden bg-white dark:bg-zinc-950">
        {/* Modern Header */}
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200/50 dark:border-zinc-800/50 sticky top-0 z-20">
          <div className="min-w-0">
            <h2 className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] truncate">The Multimedia Layer</h2>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mt-1 truncate">Active Transfers</h1>
          </div>

          <div className="flex items-center space-x-4 sm:space-x-6">
            <div className="flex items-center space-x-2">
              <p className="hidden md:block text-[10px] font-black text-zinc-400 uppercase tracking-widest mr-2">Sort by</p>
              <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-1 border border-zinc-200/50 dark:border-zinc-800/50">
                <button 
                  onClick={() => setSortBy('dateAdded')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${sortBy === 'dateAdded' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Date
                </button>
                <button 
                  onClick={() => setSortBy('alphabetical')}
                  className={`px-4 py-1.5 sm:py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${sortBy === 'alphabetical' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Name
                </button>
              </div>
            </div>

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
                  <p className="font-black text-red-600 dark:text-red-400">MML Connection Error</p>
                  <p className="text-sm font-bold text-red-500/60 truncate">{error}</p>
                </div>
              </div>
            )}

            <ErrorBoundary>
              <TorrentList 
                torrents={sortedTorrents} 
                isLoading={isLoading} 
                pendingHashes={new Set(pendingTransitions.keys())}
                onSelect={setSelectedTorrentHash}
              />
            </ErrorBoundary>
          </div>
        </div>
      </main>

      {/* Mobile Stats FAB */}
      <button 
        onClick={() => setIsStatsModalOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/40 active:scale-90 transition-all z-40"
      >
        <Activity size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default App;
