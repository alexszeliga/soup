import { useState } from 'react';

interface AddTorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: { url?: string; file?: File }) => Promise<void>;
}

const AddTorrentModal: React.FC<AddTorrentModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (file) {
        await onAdd({ file });
      } else if (url) {
        await onAdd({ url });
      }
      onClose();
      setUrl('');
      setFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Add Torrent</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-2xl leading-none">&times;</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Magnet Link Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Magnet Link / URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setFile(null); }}
                className="w-full h-12 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                placeholder="paste magnet link here..."
              />
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
              <span className="flex-shrink mx-4 text-[10px] font-black uppercase text-zinc-400">OR</span>
              <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
            </div>

            {/* File Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Torrent File</label>
              <div className={`relative h-24 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${file ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                <input
                  type="file"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setUrl(''); }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".torrent"
                />
                <span className="text-xl mb-1">{file ? '📄' : '📁'}</span>
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                  {file ? file.name : 'Click or drop .torrent file'}
                </span>
              </div>
            </div>

            <button
              disabled={isSubmitting || (!url && !file)}
              className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
            >
              {isSubmitting ? 'Adding...' : 'Add Torrent'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddTorrentModal;
