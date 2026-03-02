import { useEffect, useState } from 'react';
import TorrentList from './components/TorrentList';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`;

function App() {
  const [torrents, setTorrents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTorrents = async () => {
    try {
      const response = await fetch(`${API_URL}/torrents`);
      if (!response.ok) throw new Error('Failed to fetch torrents');
      const data = await response.json();
      setTorrents(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTorrents();
    const interval = setInterval(fetchTorrents, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🥣</span>
            <h1 className="text-xl font-bold tracking-tight">Soup Dashboard</h1>
          </div>
          <div className="flex items-center space-x-4 text-sm font-medium">
            <span className={`px-2 py-1 rounded-full ${error ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
              {error ? 'API Offline' : 'Connected'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl mb-6 text-red-700 dark:text-red-400">
            <p className="font-bold">Error connecting to server</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <TorrentList torrents={torrents} isLoading={isLoading} />
      </main>
    </div>
  );
}

export default App;
