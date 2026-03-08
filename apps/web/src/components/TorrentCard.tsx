import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';
import { Torrent } from '@soup/core/Torrent.js';
import { formatDuration } from '../utils/format';

interface TorrentCardProps {
  torrent: TorrentWithMetadata;
  isLoading?: boolean;
  onClick: () => void;
}

const TorrentCard: React.FC<TorrentCardProps> = ({ torrent, isLoading, onClick }) => {
  const { mediaMetadata, progress } = torrent;
  const displayTitle = mediaMetadata?.title || torrent.name;
  const progressPercent = Math.round(progress * 100);
  
  const isActive = Torrent.ACTIVE_STATES.includes(torrent.state);

  return (
    <div 
      onClick={onClick}
      className={`group relative cursor-pointer flex flex-row sm:flex-col bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 hover:border-blue-500/50 transition-all duration-300 shadow-sm hover:shadow-xl ${isLoading ? 'opacity-70 pointer-events-none' : 'active:scale-[0.98]'}`}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/10 dark:bg-black/10 backdrop-blur-[1px]">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Poster Area */}
      <div className="relative w-28 sm:w-full flex-shrink-0 aspect-[2/3] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        {mediaMetadata?.posterPath ? (
          <img 
            src={mediaMetadata.posterPath} 
            alt={displayTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 text-zinc-400 dark:text-zinc-600">
            <span className="text-2xl sm:text-4xl mb-1 sm:mb-2 opacity-20 font-serif italic">Soup</span>
            <span className="text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-center">Metadata Pending</span>
          </div>
        )}

        {/* Progress Overlay (Subtle Gradient) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 hidden sm:block" />

        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded-lg backdrop-blur-md border shadow-lg ${!isActive ? 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50' : 'bg-black/60 text-white border-white/10'}`}>
            {torrent.stateName}
          </span>
        </div>
      </div>

      {/* Info Area */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words">
            {displayTitle}
          </h3>
          <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 break-all opacity-70">
            {torrent.name}
          </p>
        </div>

        {/* Progress Section */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
            <span className="text-zinc-400 dark:text-zinc-600">Progress</span>
            <span className={progress === 1 ? 'text-green-500' : 'text-blue-500'}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-in-out ${progress === 1 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Seeding Stats */}
          <div className="flex justify-between items-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400 pt-0.5">
            <div className="flex items-center space-x-2">
              <span>Ratio: <span className="font-bold text-zinc-700 dark:text-zinc-300">{torrent.ratio?.toFixed(2) || '0.00'}</span></span>
              {torrent.seedingTime && torrent.seedingTime > 0 && (
                <span className="opacity-50">|</span>
              )}
              {torrent.seedingTime && torrent.seedingTime > 0 && (
                <span>Seeded: <span className="font-bold text-zinc-700 dark:text-zinc-300">{formatDuration(torrent.seedingTime)}</span></span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TorrentCard;
