import React from 'react';
import { Plus, Settings, Activity, FileText, PawPrint } from 'lucide-react';
import GlobalStats from './GlobalStats';
import type { QBServerState } from '@soup/core/QBClient.js';
import type { DiskStats } from '@soup/core/StorageService.js';

interface SidebarProps {
  error: string | null;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  setIsStatsModalOpen: (open: boolean) => void;
  serverState: QBServerState | null;
  storageStats: DiskStats[];
  pendingAltSpeedTarget: boolean | null;
  onToggleAltSpeeds: () => void;
  config: { env: string } | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  error,
  isAddModalOpen,
  setIsAddModalOpen,
  isSettingsModalOpen,
  setIsSettingsModalOpen,
  setIsStatsModalOpen,
  serverState,
  storageStats,
  pendingAltSpeedTarget,
  onToggleAltSpeeds,
  config
}) => {
  return (
    <aside className="w-20 lg:w-64 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col sticky top-0 h-screen overflow-hidden">
      <div className="p-5 lg:p-6 flex items-center lg:space-x-3 justify-center lg:justify-start">
        <div className="w-10 h-10 flex-shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
          <PawPrint size={24} strokeWidth={2.5} />
        </div>
        <div className="hidden lg:flex flex-col">
          <span className="font-black text-xl tracking-tight uppercase leading-none">MML</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${!error ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Live Sync</span>
          </div>
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

        <button 
          onClick={() => { setIsStatsModalOpen(true); }}
          className="lg:hidden w-full flex items-center justify-center lg:justify-start lg:space-x-3 px-2 lg:px-4 py-3 rounded-2xl transition-all text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
        >
          <Activity size={24} className="flex-shrink-0" />
          <span className="hidden lg:block font-bold text-sm">Server Data</span>
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
          storageStats={storageStats}
          pendingAltSpeedTarget={pendingAltSpeedTarget}
          onToggleAltSpeeds={onToggleAltSpeeds}
        />
      </div>
    </aside>
  );
};

export default Sidebar;
