import TorrentCard from './TorrentCard';
import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { PawPrint } from 'lucide-react';

interface TorrentListProps {
  torrents: TorrentWithMetadata[];
  isLoading: boolean;
  pendingHashes: Set<string>;
  onSelect: (hash: string) => void;
}

const TorrentList: React.FC<TorrentListProps> = ({ 
  torrents, isLoading, pendingHashes, onSelect 
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-zinc-500 dark:text-zinc-400 font-medium animate-pulse">Loading torrents...</p>
      </div>
    );
  }

  if (torrents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl m-4">
        <PawPrint size={48} className="mb-4 text-zinc-300 dark:text-zinc-700" strokeWidth={1.5} />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No torrents found</h3>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-xs mt-1">
          Your qBittorrent instance seems empty or MML is still matching metadata.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {torrents.map((torrent) => (
        <TorrentCard 
          key={torrent.hash} 
          torrent={torrent} 
          isLoading={pendingHashes.has(torrent.hash)}
          onClick={() => onSelect(torrent.hash)}
        />
      ))}
    </div>
  );
};

export default TorrentList;
