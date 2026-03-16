import React from 'react';
import TaskMonitor from './TaskMonitor';
import type { SortOption } from '../utils/sorting';
import type { IngestionTask } from '../hooks/useTorrents';

interface HeaderProps {
  sortBy: SortOption;
  setSortBy: (option: SortOption) => void;
  tasks: IngestionTask[];
  isWebSocketActive: boolean;
}

const Header: React.FC<HeaderProps> = ({ sortBy, setSortBy, tasks, isWebSocketActive }) => {
  return (
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

        <TaskMonitor externalTasks={tasks} isWebSocketActive={isWebSocketActive} />
      </div>
    </header>
  );
};

export default Header;
