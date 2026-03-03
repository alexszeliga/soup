import { useEffect, useState } from 'react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { Torrent } from '@soup/core/Torrent.js';
import type { MediaMetadata } from '@soup/core/MediaMetadata.js';
import ConfirmDialog from './ConfirmDialog';

interface TorrentDetailModalProps {
  torrent: TorrentWithMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  onPause: (hash: string) => void;
  onResume: (hash: string) => void;
  onDelete: (hash: string) => void;
}

/**
 * Formats bytes into a human-readable string (KiB, MiB, GiB).
 */
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const TorrentDetailModal: React.FC<TorrentDetailModalProps> = ({ 
  torrent, isOpen, onClose, onPause, onResume, onDelete 
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'files'>('details');
  const [isActionPending, setIsActionPending] = useState(false);
  // Map of file index -> target priority
  const [pendingFiles, setPendingFiles] = useState<Map<number, number>>(new Map());

  // Search State
  const [isSearchView, setIsSearchView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<MediaMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
    type: 'unmatch' | 'non-media' | 'delete';
    title: string;
    message: string;
  } | null>(null);

  // Reset states when modal opens or torrent changes
  useEffect(() => {
    if (isOpen) {
      setIsSearchView(false);
      setSearchCandidates([]);
      setSearchQuery(torrent?.mediaMetadata?.title || '');
      setConfirmState(null);
    }
  }, [isOpen, torrent?.hash]);

  // Debug: Log the incoming torrent object to see if files exist
  useEffect(() => {
    if (isOpen && torrent) {
      console.log(`[DetailModal] Incoming torrent: ${torrent.name}`, { 
        hash: torrent.hash, 
        fileCount: torrent.files?.length ?? 0,
        hasFiles: !!torrent.files 
      });
    }
  }, [isOpen, torrent?.hash, torrent?.files?.length]);

  // Resolve pending states if priorities match the incoming live data
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

  const handleToggleNonMedia = async () => {
    if (!torrent) return;
    const targetState = !torrent.isNonMedia;
    
    // Only confirm if marking AS non-media
    if (targetState && !confirm('Mark this torrent as non-media? It will no longer attempt to match with TMDB.')) return;
    
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
      case 'unmatch':
        handleUnmatch();
        break;
      case 'non-media':
        handleToggleNonMedia(); // Actually uses confirm directly for now
        break;
      case 'delete':
        onDelete(torrent.hash);
        onClose();
        break;
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
      if (response.ok) {
        setIsSearchView(false);
      }
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
              <div className="w-32 sm:w-44 aspect-[2/3] rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex-shrink-0 self-center sm:self-auto">
                {mediaMetadata?.posterPath ? (
                  <img src={mediaMetadata.posterPath} className="w-full h-full object-cover" alt="Poster" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-600 font-serif italic text-2xl">Soup</div>
                )}
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    {state}
                  </span>
                  {isNonMedia && (
                    <span className="px-2 py-0.5 bg-zinc-500/20 text-zinc-400 border border-zinc-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                      Non-Media Item
                    </span>
                  )}
                  {mediaMetadata && (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                      Matched by Soup
                    </span>
                  )}
                </div>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tighter leading-none mb-2 line-clamp-2">
                  {mediaMetadata?.title || torrent.name}
                </h1>
                <p className="text-zinc-400 font-bold text-sm sm:text-base">
                  {mediaMetadata?.year || 'Unknown Year'} • {torrent.name}
                </p>
              </div>
            </div>

            <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 z-10">
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-6 sm:px-10 py-4 bg-zinc-100 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => Torrent.ACTIVE_STATES.includes(state) ? onPause(torrent.hash) : onResume(torrent.hash)}
                className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                {Torrent.ACTIVE_STATES.includes(state) ? '⏸️ Pause' : '▶️ Resume'}
              </button>
              
              {mediaMetadata ? (
                <button 
                  disabled={isActionPending}
                  onClick={() => setConfirmState({
                    type: 'unmatch',
                    title: 'Unmatch Torrent',
                    message: 'Are you sure you want to clear the media metadata for this torrent? Soup will attempt to re-match it automatically if the name changes.'
                  })}
                  className="h-12 px-6 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black text-xs uppercase tracking-widest rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                >
                  Unmatch
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button 
                    disabled={isActionPending || isNonMedia}
                    onClick={() => { setIsSearchView(true); setActiveTab('details'); }}
                    className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-green-500/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    🔍 Find Media Match
                  </button>
                  <button 
                    disabled={isActionPending}
                    onClick={handleToggleNonMedia}
                    className="h-12 px-6 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black text-xs uppercase tracking-widest rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isNonMedia ? 'Mark as Media' : 'Non-Media'}
                  </button>
                </div>
              )}

              <button 
                onClick={() => setConfirmState({
                  type: 'delete',
                  title: 'Delete Torrent',
                  message: 'Are you sure you want to delete this torrent and all of its downloaded files from disk? This action cannot be undone.'
                })}
                className="h-12 px-6 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all active:scale-95"
              >
                🗑️ Delete
              </button>
            </div>
            
            <div className="flex items-center space-x-6 ml-auto">
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Download</p>
                <p className="text-sm font-black text-blue-500">{formatBytes(downloadSpeed)}/s</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Upload</p>
                <p className="text-sm font-black text-green-500">{formatBytes(uploadSpeed)}/s</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          {!isSearchView && (
            <div className="flex px-6 sm:px-10 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
              <button 
                onClick={() => setActiveTab('details')}
                className={`py-4 px-6 text-xs font-black uppercase tracking-[0.2em] border-b-2 transition-all ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Details
              </button>
              <button 
                onClick={() => setActiveTab('files')}
                className={`py-4 px-6 text-xs font-black uppercase tracking-[0.2em] border-b-2 transition-all ${activeTab === 'files' ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Files ({files?.length || 0})
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar bg-white dark:bg-zinc-950">
            {isSearchView ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <header className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Find Media Match</h3>
                    <p className="text-sm font-bold text-zinc-500">Search TMDB for the correct movie or show.</p>
                  </div>
                  <button 
                    onClick={() => setIsSearchView(false)}
                    className="px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                </header>

                <form onSubmit={handleSearchMetadata} className="flex gap-2">
                  <div className="flex-1 h-14 px-6 bg-zinc-100 dark:bg-zinc-900 rounded-2xl flex items-center border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                    <input 
                      autoFocus
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-sm font-bold w-full" 
                      placeholder="Enter movie or show title..." 
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isSearching}
                    className="h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </form>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {searchCandidates.map(candidate => (
                    <button 
                      key={candidate.id}
                      onClick={() => handleLinkMetadata(candidate.id)}
                      className="group text-left space-y-3 p-2 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all active:scale-95"
                    >
                      <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md border border-black/5 bg-zinc-200 dark:bg-zinc-800 relative">
                        {candidate.posterPath ? (
                          <img src={candidate.posterPath} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={candidate.title} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-serif italic">Soup</div>
                        )}
                        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors" />
                      </div>
                      <div>
                        <p className="font-black text-xs line-clamp-1 group-hover:text-blue-600 transition-colors">{candidate.title}</p>
                        <p className="text-[10px] font-black uppercase text-zinc-500">{candidate.year || 'Unknown'}</p>
                      </div>
                    </button>
                  ))}
                  
                  {!isSearching && searchCandidates.length === 0 && searchQuery && (
                    <div className="col-span-full py-20 text-center space-y-4">
                      <p className="text-4xl">🔎</p>
                      <p className="text-zinc-500 font-bold">No results found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'details' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                  <section>
                    <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest mb-4">Storyline</h3>
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                      {mediaMetadata?.plot || 'No description available for this title.'}
                    </p>
                  </section>
                  
                  <section>
                    <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest mb-4">Cast</h3>
                    <div className="flex flex-wrap gap-2">
                      {mediaMetadata?.cast.map(name => (
                        <span key={name} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 rounded-full text-xs font-bold">
                          {name}
                        </span>
                      )) || <span className="text-zinc-500 italic text-xs">No cast information</span>}
                    </div>
                  </section>
                </div>

                <div className="space-y-8">
                  <section className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest mb-4">Transfer Stats</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase">Progress</p>
                        <p className="text-xl font-black text-blue-600">{progressPercent}%</p>
                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full mt-2 overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase">Save Path</p>
                        <p className="text-xs font-bold truncate text-zinc-700 dark:text-zinc-300">{torrent.contentPath}</p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500">File Name</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-right">Size</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-center">Priority</th>
                        <th className="px-4 py-3 font-black text-[10px] uppercase text-zinc-500 text-right">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                      {files?.map(file => (
                        <tr key={file.index} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                          <td className="px-4 py-3 font-bold truncate max-w-xs">{file.name}</td>
                          <td className="px-4 py-3 text-right font-medium text-zinc-500">{formatBytes(file.size)}</td>
                          <td className="px-4 py-3 text-center">
                            <select 
                              disabled={pendingFiles.has(file.index)}
                              value={pendingFiles.get(file.index) ?? file.priority}
                              onChange={(e) => handleSetPriority([file.index], parseInt(e.target.value, 10))}
                              className={`bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-[10px] font-black uppercase px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/50 transition-opacity ${pendingFiles.has(file.index) ? 'opacity-50 animate-pulse' : ''}`}
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
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-zinc-500 font-bold">No files discovered.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TorrentDetailModal;
