import { useEffect, useState } from 'react';
import { Package, CheckCircle2, Circle } from 'lucide-react';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { useNotification } from '../context/NotificationContext';

interface IngestTabProps {
  torrent: TorrentWithMetadata;
  onIngestStarted: () => void;
}

interface SuggestedPath {
  index: number;
  originalName: string;
  sourcePath: string;
  suggestedPath: string;
}

/**
 * Renders a single row for the ingestion table (Desktop).
 */
const IngestRow: React.FC<{
  suggestion: SuggestedPath;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ suggestion, isSelected, onToggle }) => (
  <tr className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${isSelected ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
    <td className="px-6 py-4">
      <input 
        type="checkbox" 
        checked={isSelected} 
        onChange={onToggle}
        className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50 cursor-pointer"
      />
    </td>
    <td className="px-4 py-4">
      <p className="font-bold truncate max-w-[200px]" title={suggestion.originalName}>{suggestion.originalName}</p>
    </td>
    <td className="px-4 py-4">
      <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">{suggestion.suggestedPath}</p>
    </td>
  </tr>
);

/**
 * Renders a selectable card for ingestion (Mobile).
 */
const IngestCard: React.FC<{
  suggestion: SuggestedPath;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ suggestion, isSelected, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98] flex items-start gap-4 ${
      isSelected 
        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 shadow-sm' 
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
    }`}
  >
    <div className={`mt-1 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-zinc-300 dark:text-zinc-700'}`}>
      {isSelected ? <CheckCircle2 size={20} strokeWidth={3} /> : <Circle size={20} strokeWidth={3} />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-black text-sm truncate mb-1 leading-tight">{suggestion.originalName}</p>
      <div className="space-y-1">
        <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">Target Path</p>
        <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 break-all leading-relaxed">
          {suggestion.suggestedPath}
        </p>
      </div>
    </div>
  </button>
);

const IngestTab: React.FC<IngestTabProps> = ({ torrent, onIngestStarted }) => {
  const [suggestions, setSuggestedPaths] = useState<SuggestedPath[]>([]);
  const [libraries, setLibraries] = useState<string[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const { showNotification } = useNotification();

  // Load Libraries
  useEffect(() => {
    const fetchLibraries = async () => {
      try {
        const res = await fetch('/api/ingest/libraries');
        const data = await res.json();
        setLibraries(data);
        if (data.length > 0) {
          const name = torrent.name.toLowerCase();
          const tvKeywords = ['s0', 's1', 's2', 's3', 'season', 'x0', 'x1'];
          const isTV = tvKeywords.some(k => name.includes(k));
          
          const defaultLib = data.find((l: string) => 
            isTV ? (l.toLowerCase().includes('tv') || l.toLowerCase().includes('show')) 
                 : (l.toLowerCase().includes('movie'))
          ) || data[0];
          
          setSelectedLibrary(defaultLib);
        }
      } catch (err) {
        console.error('Failed to fetch libraries', err);
      }
    };
    fetchLibraries();
  }, [torrent.hash, torrent.name]);

  // Load Suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const url = `/api/ingest/suggest-paths?hash=${torrent.hash}${selectedLibrary ? `&library=${encodeURIComponent(selectedLibrary)}` : ''}${showAll ? '&showAll=true' : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        setSuggestedPaths(data);
        
        // Auto-select files > 100MB by default if none selected yet
        setSelectedIndices(prev => {
          if (prev.size > 0) return prev;
          const defaults = new Set<number>();
          // Try to match suggestions with files to find large ones
          data.forEach((s: SuggestedPath) => {
            const file = torrent.files?.find(f => f.index === s.index);
            if (file && file.size > 100 * 1024 * 1024) {
              defaults.add(s.index);
            }
          });
          // If still none, select first
          if (defaults.size === 0 && data.length > 0) {
            defaults.add(data[0].index);
          }
          return defaults;
        });
      } catch (err) {
        console.error('Failed to fetch suggestions', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuggestions();
  }, [torrent.hash, selectedLibrary, torrent.files, showAll]);

  const handleToggleFile = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIndices.size === suggestions.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(suggestions.map(s => s.index)));
    }
  };

  const handleStartIngestion = async () => {
    if (selectedIndices.size === 0 || !selectedLibrary) return;
    
    setIsIngesting(true);
    const mapping: Record<string, string> = {};
    
    selectedIndices.forEach(idx => {
      const suggestion = suggestions.find(s => idx === s.index);
      if (suggestion) {
        mapping[suggestion.sourcePath] = suggestion.suggestedPath;
      }
    });

    try {
      const res = await fetch(`/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hash: torrent.hash,
          library: selectedLibrary,
          mapping,
          savePath: torrent.contentPath
        })
      });

      if (res.ok) {
        showNotification('Copy task queued successfully', 'success');
        onIngestStarted();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to queue ingest task');
      }
    } catch (err: any) {
      showNotification(err.message || 'Ingestion failed to start', 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Prepare Ingestion</h3>
          <p className="text-xs sm:text-sm font-medium text-zinc-500">Select files and the target library for your media.</p>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex flex-col space-y-2">
            <label className="text-[9px] sm:text-[10px] font-black uppercase text-zinc-400 tracking-widest">Filters</label>
            <button 
              onClick={() => setShowAll(!showAll)}
              className={`h-10 sm:h-12 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${showAll ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`}
            >
              {showAll ? 'Showing All' : 'Showing Media Only'}
            </button>
          </div>

          <div className="flex flex-col space-y-2">
            <label className="text-[9px] sm:text-[10px] font-black uppercase text-zinc-400 tracking-widest">Target Library</label>
            <select 
              value={selectedLibrary}
              onChange={(e) => setSelectedLibrary(e.target.value)}
              className="h-10 sm:h-12 px-4 bg-zinc-100 dark:bg-zinc-900 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 font-bold text-xs sm:text-sm min-w-[160px]"
            >
              {libraries.length === 0 && <option value="">(No libraries found)</option>}
              {libraries.map(lib => (
                <option key={lib} value={lib}>{lib}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <button 
            onClick={handleSelectAll}
            className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-colors"
          >
            {selectedIndices.size === suggestions.length ? 'Deselect All' : 'Select All'}
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
            {selectedIndices.size} of {suggestions.length} selected
          </p>
        </div>

        {/* Desktop View: Table */}
        <div className="hidden sm:block border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="px-6 py-4 w-10"></th>
                <th className="px-4 py-4 font-black text-[10px] uppercase text-zinc-500">Original File</th>
                <th className="px-4 py-4 font-black text-[10px] uppercase text-zinc-500">Target Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="py-20 text-center animate-pulse font-bold text-zinc-400">Recalculating paths...</td>
                </tr>
              ) : suggestions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-20 text-center font-bold text-zinc-400">No files eligible for ingestion.</td>
                </tr>
              ) : suggestions.map(s => (
                <IngestRow 
                  key={s.index} 
                  suggestion={s} 
                  isSelected={selectedIndices.has(s.index)} 
                  onToggle={() => handleToggleFile(s.index)} 
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="sm:hidden space-y-3">
          {isLoading ? (
            <div className="py-20 text-center animate-pulse font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
              Recalculating...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-20 text-center font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
              No files eligible.
            </div>
          ) : suggestions.map(s => (
            <IngestCard 
              key={s.index} 
              suggestion={s} 
              isSelected={selectedIndices.has(s.index)} 
              onToggle={() => handleToggleFile(s.index)} 
            />
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[24px] flex flex-col sm:flex-row items-stretch sm:items-center justify-between border border-zinc-200 dark:border-zinc-800 gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600/10 text-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0">
            <Package size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-xs font-black uppercase text-zinc-400 tracking-widest">Destination Root</p>
            <p className="text-base sm:text-lg font-black truncate">{selectedLibrary || 'Select a library'}</p>
          </div>
        </div>
        <button 
          disabled={selectedIndices.size === 0 || !selectedLibrary || isIngesting || isLoading}
          onClick={handleStartIngestion}
          className="h-12 sm:h-14 px-6 sm:px-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          {isIngesting ? 'Queuing...' : 'Start Ingestion'}
        </button>
      </div>
    </div>
  );
};

export default IngestTab;
