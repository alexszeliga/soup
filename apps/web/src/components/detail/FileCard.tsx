import React from 'react';
import { Download, Lock } from 'lucide-react';
import { formatBytes } from '../../utils/format';

interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number;
}

interface FileCardProps {
  file: TorrentFile;
  torrentHash: string;
  isPending: boolean;
  onSetPriority: (indices: number[], priority: number) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, torrentHash, isPending, onSetPriority }) => (
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
