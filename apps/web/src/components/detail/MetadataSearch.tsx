import React from 'react';
import type { MediaMetadata } from '@soup/core/MediaMetadata.js';

interface MetadataSearchProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchCandidates: MediaMetadata[];
  isSearching: boolean;
  onSearch: (e?: React.FormEvent) => void;
  onLink: (metadataId: string) => void;
  onCancel: () => void;
}

export const MetadataSearch: React.FC<MetadataSearchProps> = ({
  searchQuery,
  setSearchQuery,
  searchCandidates,
  isSearching,
  onSearch,
  onLink,
  onCancel
}) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
    <header className="flex items-center justify-between">
      <div>
        <h3 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Find Media Match</h3>
        <p className="text-xs sm:text-sm font-bold text-zinc-500">Search TMDB for the correct title.</p>
      </div>
      <button onClick={onCancel} className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-800 transition-colors">Cancel</button>
    </header>

    <form onSubmit={onSearch} className="flex gap-2">
      <div className="flex-1 h-12 sm:h-14 px-4 sm:px-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl sm:rounded-2xl flex items-center border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
        <input autoFocus type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm font-bold w-full" placeholder="Enter title..." />
      </div>
      <button type="submit" disabled={isSearching} className="h-12 sm:h-14 px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50">
        {isSearching ? '...' : 'Search'}
      </button>
    </form>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {searchCandidates.map(candidate => (
        <button key={candidate.id} onClick={() => onLink(candidate.id)} className="group text-left space-y-3 p-2 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all active:scale-95">
          <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md border border-black/5 bg-zinc-200 dark:bg-zinc-800 relative">
            {candidate.posterPath ? <img src={candidate.posterPath} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={candidate.title} /> : <div className="w-full h-full flex items-center justify-center text-zinc-400 font-serif italic">MML</div>}
            <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors" />
          </div>
          <div>
            <p className="font-black text-[10px] sm:text-xs line-clamp-1 group-hover:text-blue-600 transition-colors">{candidate.title}</p>
            <p className="text-[9px] sm:text-[10px] font-black uppercase text-zinc-500">{candidate.year || 'Unknown'}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);
