import { useEffect, useState } from 'react';
import type { QBPreferences } from '@soup/core/QBClient.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
}

/**
 * Modal dialog for viewing and editing qBittorrent application settings.
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, apiUrl }) => {
  const [settings, setSettings] = useState<QBPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/preferences`);
      const data = await response.json() as QBPreferences;
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSubmitting(true);
    try {
      await fetch(`${apiUrl}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">App Preferences</h2>
            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mt-1">qBittorrent Configuration</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="py-20 text-center font-bold text-zinc-400 animate-pulse">Loading settings...</div>
          ) : settings ? (
            <form id="settings-form" onSubmit={handleSave} className="space-y-8">
              {/* Downloads Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Downloads</h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Default Save Path</label>
                  <input
                    type="text"
                    value={(settings.save_path as string) || ''}
                    onChange={(e) => setSettings({ ...settings, save_path: e.target.value })}
                    className="w-full h-12 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Max Active Downloads</label>
                  <input
                    type="number"
                    value={(settings.max_active_downloads as number) || 0}
                    onChange={(e) => setSettings({ ...settings, max_active_downloads: parseInt(e.target.value, 10) })}
                    className="w-full h-12 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                  />
                </div>
              </section>

              {/* Network Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Network & Protocol</h3>
                
                <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <span className="text-sm font-bold">Enable DHT (Trackerless)</span>
                  <input
                    type="checkbox"
                    checked={!!settings.dht}
                    onChange={(e) => setSettings({ ...settings, dht: e.target.checked })}
                    className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50"
                  />
                </label>
              </section>

              {/* Speed Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Alternative Speed Limits</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Alt Download (KiB/s)</label>
                    <input
                      type="number"
                      value={Math.floor((settings.alt_dl_limit as number || 0) / 1024)}
                      onChange={(e) => setSettings({ ...settings, alt_dl_limit: parseInt(e.target.value, 10) * 1024 })}
                      className="w-full h-12 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Alt Upload (KiB/s)</label>
                    <input
                      type="number"
                      value={Math.floor((settings.alt_up_limit as number || 0) / 1024)}
                      onChange={(e) => setSettings({ ...settings, alt_up_limit: parseInt(e.target.value, 10) * 1024 })}
                      className="w-full h-12 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-blue-500/20">
                  <span className="text-sm font-bold">Enable Alt Limits Globally</span>
                  <input
                    type="checkbox"
                    checked={!!settings.use_alt_speed_limits}
                    onChange={(e) => setSettings({ ...settings, use_alt_speed_limits: e.target.checked })}
                    className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50"
                  />
                </label>
              </section>
            </form>
          ) : (
            <div className="py-20 text-center text-red-500 font-bold">Failed to load settings.</div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex space-x-4">
          <button
            onClick={onClose}
            className="flex-1 h-14 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            form="settings-form"
            type="submit"
            disabled={isSaving || !settings}
            className="flex-[2] h-14 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
          >
            {isSaving ? 'Saving...' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
