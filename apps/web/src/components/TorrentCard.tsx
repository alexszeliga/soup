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
}

const TorrentCard: React.FC<TorrentCardProps> = ({ torrent }) => {
  const { mediaMetadata, progress } = torrent;
  const displayTitle = mediaMetadata?.title || torrent.name;
  const displayYear = mediaMetadata?.year;
  const progressPercent = (progress * 100).toFixed(1);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-md overflow-hidden flex flex-row border border-zinc-200 dark:border-zinc-800 hover:shadow-lg transition-shadow duration-300 max-w-2xl m-4">
      {/* Poster */}
      <div className="w-24 h-36 flex-shrink-0 bg-zinc-100 dark:bg-zinc-800">
        {mediaMetadata?.posterPath ? (
          <img 
            src={mediaMetadata.posterPath} 
            alt={displayTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400">
            <span className="text-xs uppercase font-bold text-center p-2">No Poster</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate pr-2">
              {displayTitle}
            </h3>
            {displayYear && (
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {displayYear}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate mt-1">
            {torrent.name}
          </p>
        </div>

        <div className="mt-4">
          <div className="flex justify-between items-end mb-1">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              {torrent.state}
            </span>
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 dark:bg-blue-500 h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TorrentCard;
