import { useEffect, useState } from 'react';
import { Pause, Play, Search, Trash2, Package, Download, Lock, FileText, BarChart3 } from 'lucide-react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { Torrent } from '@soup/core/Torrent.js';
import type { MediaMetadata } from '@soup/core/MediaMetadata.js';
import ConfirmDialog from './ConfirmDialog';
import IngestTab from './IngestTab';
import { formatBytes } from '../utils/format';

interface TorrentDetailModalProps {
  torrent: TorrentWithMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  onPause: (hash: string) => void;
  onResume: (hash: string) => void;
  onDelete: (hash: string) => void;
}

interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number;
  is_seed?: boolean;
  piece_range?: [number, number];
  availability?: number;
}

/**
 * Renders a single file row for the desktop table view.
 */
const FileRow: React.FC<{ 
  file: TorrentFile; 
  torrentHash: string; 
  isPending: boolean; 
  onSetPriority: (indices: number[], priority: number) => void 
}> = ({ file, torrentHash, isPending, onSetPriority }) => (
  <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
    <td className="px-4 py-3 font-bold truncate max-w-xs">{file.name}</td>
    <td className="px-4 py-3 text-right font-medium text-zinc-500">{formatBytes(file.size)}</td>
    <td className="px-4 py-3 text-center">
      <select 
        disabled={isPending}
        value={file.priority}
        onChange={(e) => onSetPriority([file.index], parseInt(e.target.value, 10))}
        className={`bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-[10px] font-black uppercase px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/50 transition-opacity ${isPending ? 'opacity-50 animate-pulse' : ''}`}
      >
        <option value={0}>Skip</option>
        <option value={1}>Normal</option>
        <option value={6}>High</option>
        <option value={7}>Maximal</option>
      </select>
    </td>
    <td className="px-4 py-3 text-right">
      <span className={`font-black ${file.progress === 1 ? 'text-green-500' : 'text-blue-500'}`}>
        {Math.round(file.progress * 100)}%
      </span>
    </td>
    <td className="px-4 py-3 text-center">
      {file.progress === 1 ? (
        <button 
          onClick={() => window.location.assign(`/api/torrents/${torrentHash}/files/${file.index}/download`)}
          className="px-3 py-1 bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1 mx-auto"
        >
          <Download size={12} strokeWidth={3} /> Download
        </button>
      ) : (
        <div className="text-[10px] font-black uppercase text-zinc-300 dark:text-zinc-700 cursor-not-allowed flex items-center gap-1 justify-center">
          <Lock size={12} strokeWidth={3} /> Locked
        </div>
      )}
    </td>
  </tr>
);

/**
 * Renders a file card for the mobile list view.
 */
const FileCard: React.FC<{ 
  file: TorrentFile; 
  torrentHash: string; 
  isPending: boolean; 
  onSetPriority: (indices: number[], priority: number) => void 
}> = ({ file, torrentHash, isPending, onSetPriority }) => (
  <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
    <div className="flex justify-between items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm truncate leading-tight mb-1">{file.name}</p>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{formatBytes(file.size)}</p>
      </div>
      {file.progress === 1 ? (
        <button 
          onClick={() => window.location.assign(`/api/torrents/${torrentHash}/files/${file.index}/download`)}
          className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-90 transition-transform"
        >
          <Download size={18} strokeWidth={2.5} />
        </button>
      ) : (
        <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 rounded-xl flex items-center justify-center">
          <Lock size={18} strokeWidth={2.5} />
        </div>
      )}
    </div>

    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-tighter">Progress</span>
          <span className={`text-xs font-black ${file.progress === 1 ? 'text-green-500' : 'text-blue-500'}`}>
            {Math.round(file.progress * 100)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${file.progress === 1 ? 'bg-green-500' : 'bg-blue-500'}`} 
            style={{ width: `${file.progress * 100}%` }} 
          />
        </div>
      </div>

      <div className="flex flex-col items-end">
        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-tighter mb-1">Priority</span>
        <select 
          disabled={isPending}
          value={file.priority}
          onChange={(e) => onSetPriority([file.index], parseInt(e.target.value, 10))}
          className={`bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-black uppercase px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/50 ${isPending ? 'opacity-50 animate-pulse' : ''}`}
        >
          <option value={0}>Skip</option>
          <option value={1}>Normal</option>
          <option value={6}>High</option>
          <option value={7}>Maximal</option>
        </select>
      </div>
    </div>
  </div>
);

const TorrentDetailModal: React.FC<TorrentDetailModalProps> = ({ 
  torrent, isOpen, onClose, onPause, onResume, onDelete 
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'ingest'>('details');
  const [isActionPending, setIsActionPending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Map<number, number>>(new Map());

  // Search State
  const [isSearchView, setIsSearchView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<MediaMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
    type: 'unmatch' | 'non-media' | 'mark-media' | 'delete';
    title: string;
    message: string;
  } | null>(null);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSearchView(false);
      setSearchCandidates([]);
      setSearchQuery(torrent?.mediaMetadata?.title || '');
      setConfirmState(null);
      setActiveTab('details');
    }
  }, [isOpen, torrent?.hash]);

  // Resolve pending states
  useEffect(() => {
    if (torrent?.files) {
      setPendingFiles(prev => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        torrent.files!.forEach(file => {
          if (next.get(file.index) === file.priority) {
            next.delete(file.index);
          }
        });
        return next;
      });
    }
  }, [torrent?.files]);

  const handleUnmatch = async () => {
    if (!torrent) return;
    setIsActionPending(true);
    try {
      await fetch(`/api/torrents/${torrent.hash}/unmatch`, { method: 'POST' });
    } catch (err) {
      console.error('Unmatch failed', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleToggleNonMedia = async (forceState?: boolean) => {
    if (!torrent) return;
    const targetState = forceState !== undefined ? forceState : !torrent.isNonMedia;
    
    setIsActionPending(true);
    try {
      await fetch(`/api/torrents/${torrent.hash}/non-media`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isNonMedia: targetState })
      });
    } catch (err) {
      console.error('Toggle non-media failed', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleConfirmedAction = () => {
    if (!torrent || !confirmState) return;
    
    switch (confirmState.type) {
      case 'unmatch': handleUnmatch(); break;
      case 'non-media': handleToggleNonMedia(true); break;
      case 'mark-media': handleToggleNonMedia(false); break;
      case 'delete': onDelete(torrent.hash); onClose(); break;
    }
  };

  const handleSearchMetadata = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/metadata/search?query=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchCandidates(data);
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLinkMetadata = async (metadataId: string) => {
    if (!torrent) return;
    setIsActionPending(true);
    try {
      const response = await fetch(`/api/torrents/${torrent.hash}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadataId })
      });
      if (response.ok) setIsSearchView(false);
    } catch (err) {
      console.error('Linking failed', err);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSetPriority = async (indices: number[], priority: number) => {
    if (!torrent) return;
    setPendingFiles(prev => {
      const next = new Map(prev);
      indices.forEach(idx => next.set(idx, priority));
      return next;
    });
    try {
      await fetch(`/api/torrents/${torrent.hash}/files/priority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices, priority })
      });
    } catch (err) {
      console.error('Failed to set priority', err);
      setPendingFiles(prev => {
        const next = new Map(prev);
        indices.forEach(idx => next.delete(idx));
        return next;
      });
    }
  };

  if (!isOpen || !torrent) return null;

  const { mediaMetadata, progress, state, downloadSpeed, uploadSpeed, files, isNonMedia } = torrent;
  const progressPercent = Math.round(progress * 100);

  return (
    <>
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirmedAction}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white dark:bg-zinc-950 w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500">
          
          {/* Hero Header */}
          <div className="relative h-64 sm:h-80 flex-shrink-0 bg-zinc-900 overflow-hidden">
            {mediaMetadata?.posterPath && (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
                style={{ backgroundImage: `url(${mediaMetadata.posterPath})` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
            
            <div className="absolute inset-0 p-6 sm:p-10 flex flex-col sm:flex-row items-end sm:items-center space-y-4 sm:space-y-0 sm:space-x-8">
              <div className="w-28 sm:w-44 aspect-[2/3] rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex-shrink-0 self-center sm:self-auto">
                {mediaMetadata?.posterPath ? (
                  <img src={mediaMetadata.posterPath} className="w-full h-full object-cover" alt="Poster" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-600 font-serif italic text-2xl">Soup</div>
                )}
              </div>
              
              <div className="flex-1 text-center sm:text-left overflow-hidden">
                <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    {state}
                  </span>
                  {isNonMedia && (
                    <span className="px-2 py-0.5 bg-zinc-500/20 text-zinc-400 border border-zinc-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                      Non-Media Item
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-5xl font-black text-white tracking-tighter leading-tight mb-2 line-clamp-2">
                  {mediaMetadata?.title || torrent.name}
                </h1>
                <p className="text-zinc-400 font-bold text-xs sm:text-base truncate">
                  {mediaMetadata?.year || 'Unknown Year'} • {torrent.name}
                </p>
              </div>
            </div>

            <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 z-10">
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-6 sm:px-10 py-4 bg-zinc-100 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button 
                onClick={() => Torrent.ACTIVE_STATES.includes(state) ? onPause(torrent.hash) : onResume(torrent.hash)}
                className="h-10 sm:h-12 px-4 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
              >
                {Torrent.ACTIVE_STATES.includes(state) ? (
                  <><Pause size={14} strokeWidth={3} /> Pause</>
                ) : (
                  <><Play size={14} strokeWidth={3} /> Resume</>
                )}
              </button>
              
              {mediaMetadata ? (
                <button 
                  disabled={isActionPending}
                  onClick={() => setConfirmState({
                    type: 'unmatch',
                    title: 'Unmatch Torrent',
                    message: 'Are you sure you want to clear the media metadata for this torrent?'
                  })}
                  className="h-10 sm:h-12 px-4 sm:px-6 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                >
                  Unmatch
                </button>
              ) : (
                <button 
                  disabled={isActionPending || isNonMedia}
                  onClick={() => { setIsSearchView(true); setActiveTab('details'); }}
                  className="h-10 sm:h-12 px-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Search size={14} strokeWidth={3} /> Match
                </button>
              )}

              <button 
                onClick={() => setConfirmState({
                  type: 'delete',
                  title: 'Delete Torrent',
                  message: 'Are you sure you want to delete this torrent and its files?'
                })}
                className="h-10 sm:h-12 px-4 sm:px-6 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl transition-all active:scale-95 flex items-center gap-2"
              >
                <Trash2 size={14} strokeWidth={3} /> Delete
              </button>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-none pt-4 sm:pt-0 border-zinc-200 dark:border-zinc-800">
              <div className="text-left sm:text-right">
                <p className="text-[9px] sm:text-[10px] font-black text-zinc-500 uppercase tracking-widest">Download</p>
                <p className="text-xs sm:text-sm font-black text-blue-500">{formatBytes(downloadSpeed)}/s</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] sm:text-[10px] font-black text-zinc-500 uppercase tracking-widest">Upload</p>
                <p className="text-xs sm:text-sm font-black text-green-500">{formatBytes(uploadSpeed)}/s</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          {!isSearchView && (
            <div className="flex overflow-x-auto custom-scrollbar px-6 sm:px-10 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
              <button 
                onClick={() => setActiveTab('details')}
                className={`py-4 px-4 sm:px-6 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] border-b-2 transition-all whitespace-nowrap ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Details
              </button>
              <button 
                onClick={() => setActiveTab('files')}
                className={`py-4 px-4 sm:px-6 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] border-b-2 transition-all whitespace-nowrap ${activeTab === 'files' ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Files ({files?.length || 0})
              </button>
              <button 
                onClick={() => setActiveTab('ingest')}
                className={`py-4 px-4 sm:px-6 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'ingest' ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                <Package size={14} strokeWidth={3} /> Ingest
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar bg-white dark:bg-zinc-950">
            {isSearchView ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <header className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Find Media Match</h3>
                    <p className="text-xs sm:text-sm font-bold text-zinc-500">Search TMDB for the correct title.</p>
                  </div>
                  <button onClick={() => setIsSearchView(false)} className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-800 transition-colors">Cancel</button>
                </header>

                <form onSubmit={handleSearchMetadata} className="flex gap-2">
                  <div className="flex-1 h-12 sm:h-14 px-4 sm:px-6 bg-zinc-100 dark:bg-zinc-900 rounded-xl sm:rounded-2xl flex items-center border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                    <input autoFocus type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm font-bold w-full" placeholder="Enter title..." />
                  </div>
                  <button type="submit" disabled={isSearching} className="h-12 sm:h-14 px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50">
                    {isSearching ? '...' : 'Search'}
                  </button>
                </form>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {searchCandidates.map(candidate => (
                    <button key={candidate.id} onClick={() => handleLinkMetadata(candidate.id)} className="group text-left space-y-3 p-2 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all active:scale-95">
                      <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md border border-black/5 bg-zinc-200 dark:bg-zinc-800 relative">
                        {candidate.posterPath ? <img src={candidate.posterPath} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={candidate.title} /> : <div className="w-full h-full flex items-center justify-center text-zinc-400 font-serif italic">Soup</div>}
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
            ) : activeTab === 'details' ? (
              <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 sm:gap-10">
                <div className="lg:col-span-2 space-y-8">
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <FileText size={14} className="text-blue-600" />
                      <h3 className="text-[10px] sm:text-xs font-black uppercase text-zinc-400 tracking-widest">Storyline</h3>
                    </div>
                    <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                      {mediaMetadata?.plot || 'No description available for this title.'}
                    </p>
                  </section>
                  
                  <section>
                    <h3 className="text-[10px] sm:text-xs font-black uppercase text-zinc-400 tracking-widest mb-4">Cast</h3>
                    <div className="flex flex-wrap gap-2">
                      {mediaMetadata?.cast.map(name => (
                        <span key={name} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 rounded-full text-[10px] sm:text-xs font-bold">
                          {name}
                        </span>
                      )) || <span className="text-zinc-500 italic text-xs">No cast information</span>}
                    </div>
                  </section>
                </div>

                <div className="space-y-8">
                  <section className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <BarChart3 size={14} className="text-blue-600" />
                      <h3 className="text-[10px] sm:text-xs font-black uppercase text-zinc-400 tracking-widest">Transfer Stats</h3>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-[9px] sm:text-[10px] font-black text-zinc-500 uppercase tracking-widest">Overall Progress</p>
                          <p className="text-sm sm:text-lg font-black text-blue-600">{progressPercent}%</p>
                        </div>
                        <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                          <div className="h-full bg-blue-600 transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                        <p className="text-[9px] sm:text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Save Path</p>
                        <p className="text-[10px] sm:text-xs font-bold break-all text-zinc-700 dark:text-zinc-300 leading-tight opacity-80">{torrent.contentPath}</p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            ) : activeTab === 'files' ? (
              <div className="space-y-4">
                {/* Desktop View: Table */}
                <div className="hidden sm:block border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500">File Name</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-right">Size</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-center">Priority</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-right">Progress</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                      {files?.map(file => (
                        <FileRow 
                          key={file.index} 
                          file={file} 
                          torrentHash={torrent.hash} 
                          isPending={pendingFiles.has(file.index)} 
                          onSetPriority={handleSetPriority} 
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Cards */}
                <div className="sm:hidden space-y-3">
                  {files?.map(file => (
                    <FileCard 
                      key={file.index} 
                      file={file} 
                      torrentHash={torrent.hash} 
                      isPending={pendingFiles.has(file.index)} 
                      onSetPriority={handleSetPriority} 
                    />
                  ))}
                </div>

                {(!files || files.length === 0) && (
                  <div className="py-20 text-center text-zinc-500 font-bold bg-zinc-50 dark:bg-zinc-900/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    No files discovered.
                  </div>
                )}
              </div>
            ) : (
              <IngestTab 
                torrent={torrent} 
                onIngestStarted={() => {
                  setActiveTab('details');
                  onClose();
                }} 
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TorrentDetailModal;
