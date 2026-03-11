import { useState, useMemo, lazy, Suspense } from 'react';
import TorrentList from './components/TorrentList';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ConnectionOverlay from './components/ConnectionOverlay';
import GlobalStats from './components/GlobalStats';
import ErrorBoundary from './components/ErrorBoundary';
import { sortTorrents } from './utils/sorting';
import type { SortOption } from './utils/sorting';
import { AlertTriangle } from 'lucide-react';
import { useTorrents } from './hooks/useTorrents';

// Lazy load heavy modals to improve initial load performance
const AddTorrentModal = lazy(() => import('./components/AddTorrentModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const TorrentDetailModal = lazy(() => import('./components/TorrentDetailModal'));

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  const {
    torrents,
    serverState,
    storageStats,
    isLoading,
    error,
    isConnectionLost,
    pendingTransitions,
    pendingAltSpeedTarget,
    config,
    handleAddTorrent,
    handleDelete,
    handleToggleAltSpeeds,
    reconnect
  } = useTorrents(selectedTorrentHash);

  const selectedTorrent = useMemo(() => 
    torrents.find(t => t.hash === selectedTorrentHash) || null,
  [torrents, selectedTorrentHash]);

  const sortedTorrents = useMemo(() => {
    return sortTorrents(torrents, sortBy);
  }, [torrents, sortBy]);

  return (
    <div className="flex min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-500 font-sans selection:bg-blue-500/30 relative">
      
      <ConnectionOverlay isConnectionLost={isConnectionLost} onReconnect={reconnect} />

      {/* Add Torrent Modal */}
      <Suspense fallback={null}>
        <AddTorrentModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAdd={handleAddTorrent} 
        />
      </Suspense>

      {/* Settings Modal */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          apiUrl={API_URL}
        />
      </Suspense>

      {/* Detail Modal */}
      <Suspense fallback={null}>
        <TorrentDetailModal
          torrent={selectedTorrent}
          isOpen={!!selectedTorrentHash}
          onClose={() => setSelectedTorrentHash(null)}
          onDelete={handleDelete}
        />
      </Suspense>

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
              storageStats={storageStats}
              pendingAltSpeedTarget={pendingAltSpeedTarget}
              onToggleAltSpeeds={handleToggleAltSpeeds}
              isMobile={true}
            />
          </div>
        </div>
      )}

      <Sidebar 
        error={error}
        isAddModalOpen={isAddModalOpen}
        setIsAddModalOpen={setIsAddModalOpen}
        isSettingsModalOpen={isSettingsModalOpen}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        setIsStatsModalOpen={setIsStatsModalOpen}
        serverState={serverState}
        storageStats={storageStats}
        pendingAltSpeedTarget={pendingAltSpeedTarget}
        onToggleAltSpeeds={handleToggleAltSpeeds}
        config={config}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-h-screen overflow-hidden bg-white dark:bg-zinc-950">
        <Header sortBy={sortBy} setSortBy={setSortBy} />

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1400px] mx-auto w-full p-4 lg:p-8">
            {error && !isConnectionLost && (
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
    </div>
  );
}

export default App;
