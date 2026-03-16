import React, { useEffect, useState } from 'react';
import { Folder, ChevronRight, Home, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface FolderExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath: string;
  apiUrl: string;
}

const FolderExplorerModal: React.FC<FolderExplorerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialPath,
  apiUrl
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath || '/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Sync currentPath with initialPath when modal opens
  useEffect(() => {
    if (isOpen && initialPath) {
      setCurrentPath(initialPath);
    }
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (isOpen) {
      fetchEntries(currentPath);
    }
  }, [isOpen, currentPath, showHidden]);

  const fetchEntries = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/system/explore?path=${encodeURIComponent(path)}&showHidden=${showHidden}`);
      if (!res.ok) throw new Error('Failed to list directory');
      const data = await res.json();
      setEntries(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <div>
            <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Select Folder</h2>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-zinc-500 overflow-x-auto whitespace-nowrap scrollbar-none">
              <Home size={12} className="flex-shrink-0" />
              <ChevronRight size={10} className="flex-shrink-0" />
              <span>{currentPath}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowHidden(!showHidden)}
              title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
              className={`p-2 rounded-xl transition-all ${showHidden ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              {showHidden ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[300px]">
          {isLoading ? (
            <div className="py-20 text-center font-bold text-zinc-400 animate-pulse">Scanning server...</div>
          ) : error ? (
            <div className="py-20 text-center text-red-500 px-6">
              <p className="font-black text-sm uppercase tracking-widest mb-2">Error</p>
              <p className="text-xs opacity-70">{error}</p>
              <button 
                onClick={() => setCurrentPath('/')}
                className="mt-4 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                Reset to Root
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => setCurrentPath(entry.path)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-all group active:scale-[0.98]"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${entry.name === '..' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                    {entry.name === '..' ? <ArrowLeft size={18} /> : <Folder size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${entry.name === '..' ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'} ${entry.name.startsWith('.') ? 'opacity-50' : ''}`}>
                      {entry.name}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-blue-400 transition-colors" />
                </button>
              ))}
              {entries.length === 0 && (
                <div className="py-20 text-center text-zinc-400 font-bold">This folder is empty.</div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex space-x-4">
          <button
            onClick={onClose}
            className="flex-1 h-14 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(currentPath)}
            className="flex-[2] h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
          >
            Select Current
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderExplorerModal;
