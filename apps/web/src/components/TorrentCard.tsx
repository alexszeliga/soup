interface TorrentCardProps {
  torrent: {
    hash: string;
    name: string;
    progress: number;
    state: string;
    mediaMetadata?: {
      title: string;
      year: number;
      posterPath: string;
    };
  };
  onPause: (hash: string) => void;
  onResume: (hash: string) => void;
  onDelete: (hash: string) => void;
}

const TorrentCard: React.FC<TorrentCardProps> = ({ torrent, onPause, onResume, onDelete }) => {
  const { mediaMetadata, progress } = torrent;
  const displayTitle = mediaMetadata?.title || torrent.name;
  const progressPercent = Math.round(progress * 100);
  const isPaused = torrent.state.includes('paused') || torrent.state.includes('stalled');

  return (
    <div className="group relative flex flex-row sm:flex-col bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 hover:border-blue-500/50 transition-all duration-300 active:scale-[0.98] shadow-sm hover:shadow-xl">
      {/* Poster Area */}
      <div className="relative w-28 sm:w-full flex-shrink-0 aspect-[2/3] sm:aspect-[2/3] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
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

          <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter rounded-lg backdrop-blur-md border shadow-lg ${isPaused ? 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50' : 'bg-black/60 text-white border-white/10'}`}>
            {torrent.state}
          </span>
        </div>
      </div>
...

      {/* Info Area */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight line-clamp-2 sm:line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1">
              {displayTitle}
            </h3>
          </div>
          <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 truncate">
            {torrent.name}
          </p>
        </div>

        {/* Progress & Actions Section */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
              <span className="text-zinc-400 dark:text-zinc-600">Progress</span>
              <span className={progress === 1 ? 'text-green-500' : 'text-blue-500'}>
                {progressPercent}%
              </span>
            </div>
            <div className="h-1.5 sm:h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ease-in-out ${progress === 1 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-1">
            {isPaused ? (
              <button 
                onClick={(e) => { e.stopPropagation(); onResume(torrent.hash); }}
                className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center space-x-2 shadow-sm active:scale-[0.98] transition-all"
              >
                <span className="text-xs">▶️</span>
                <span className="text-[10px] font-black uppercase tracking-widest">Resume</span>
              </button>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); onPause(torrent.hash); }}
                className="flex-1 h-9 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl flex items-center justify-center space-x-2 shadow-sm active:scale-[0.98] transition-all"
              >
                <span className="text-xs">⏸️</span>
                <span className="text-[10px] font-black uppercase tracking-widest">Pause</span>
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); if(confirm('Delete torrent?')) onDelete(torrent.hash); }}
              className="w-9 h-9 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl flex items-center justify-center transition-all group/del"
              title="Delete"
            >
              <span className="text-xs group-hover/del:scale-110 transition-transform">🗑️</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TorrentCard;
