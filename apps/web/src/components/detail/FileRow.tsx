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

interface FileRowProps {
  file: TorrentFile;
  torrentHash: string;
  isPending: boolean;
  onSetPriority: (indices: number[], priority: number) => void;
}

export const FileRow: React.FC<FileRowProps> = ({ file, torrentHash, isPending, onSetPriority }) => (
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
