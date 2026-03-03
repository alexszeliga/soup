import React, { useEffect, useState } from 'react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { useNotification } from '../context/NotificationContext';

interface IngestTabProps {
  torrent: TorrentWithMetadata;
  onIngestStarted: () => void;
}

interface SuggestedPath {
  index: number;
  originalName: string;
  suggestedPath: string;
}

const IngestTab: React.FC<IngestTabProps> = ({ torrent, onIngestStarted }) => {
  const [suggestions, setSuggestedPaths] = useState<SuggestedPath[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { showNotification } = useNotification();

  useEffect(() => {
    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/torrents/${torrent.hash}/suggest-paths`);
        const data = await res.json();
        setSuggestedPaths(data);
        
        // Default to selecting large media files (> 100MB)
        const defaults = new Set<number>();
        const files = torrent.files || [];
        files.forEach(f => {
          if (f.size > 100 * 1024 * 1024) defaults.add(f.index);
        });
        setSelectedIndices(defaults);
      } catch (err) {
        console.error('Failed to fetch suggestions', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuggestions();
  }, [torrent.hash, torrent.files]);

  const handleToggleFile = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleStartIngestion = async () => {
    if (selectedIndices.size === 0) return;
    
    setIsIngesting(true);
    const fileMap: Record<string, string> = {};
    
    // Construct mapping of absolute source -> relative destination
    selectedIndices.forEach(idx => {
      const suggestion = suggestions.find(s => s.index === idx);
      const file = torrent.files?.find(f => f.index === idx);
      if (suggestion && file) {
        // Source is the torrent content path + filename
        const source = torrent.contentPath.endsWith(file.name) 
          ? torrent.contentPath 
          : `${torrent.contentPath}/${file.name}`;
        fileMap[source] = suggestion.suggestedPath;
      }
    });

    try {
      const res = await fetch(`/api/torrents/${torrent.hash}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileMap })
      });

      if (res.ok) {
        showNotification('Copy task queued successfully', 'success');
        onIngestStarted();
      } else {
        throw new Error('Failed to queue ingest task');
      }
    } catch {
      showNotification('Ingestion failed to start', 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  if (isLoading) return <div className="py-20 text-center animate-pulse font-bold text-zinc-400">Analyzing files...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h3 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Prepare Ingestion</h3>
        <p className="text-sm font-medium text-zinc-500">Select files to copy to your media library. We've suggested Jellyfin-compatible paths.</p>
      </header>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="px-6 py-4 w-10"></th>
              <th className="px-4 py-4 font-black text-[10px] uppercase text-zinc-500">Original File</th>
              <th className="px-4 py-4 font-black text-[10px] uppercase text-zinc-500">Suggested Library Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {suggestions.map(s => (
              <tr key={s.index} className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${selectedIndices.has(s.index) ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                <td className="px-6 py-4">
                  <input 
                    type="checkbox" 
                    checked={selectedIndices.has(s.index)} 
                    onChange={() => handleToggleFile(s.index)}
                    className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50"
                  />
                </td>
                <td className="px-4 py-4">
                  <p className="font-bold truncate max-w-[200px]" title={s.originalName}>{s.originalName}</p>
                </td>
                <td className="px-4 py-4">
                  <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">{s.suggestedPath}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[24px] flex items-center justify-between border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center text-xl">📦</div>
          <div>
            <p className="text-xs font-black uppercase text-zinc-400 tracking-widest">Ready to Process</p>
            <p className="text-lg font-black">{selectedIndices.size} files selected</p>
          </div>
        </div>
        <button 
          disabled={selectedIndices.size === 0 || isIngesting}
          onClick={handleStartIngestion}
          className="h-14 px-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          {isIngesting ? 'Queuing...' : 'Start Ingestion'}
        </button>
      </div>
    </div>
  );
};

export default IngestTab;
