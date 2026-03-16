import { useEffect, useState } from 'react';
import { Package, HardDrive } from 'lucide-react';
import type { QBPreferences, QBServerState } from '@soup/core/QBClient.js';
import { useNotification } from '../context/NotificationContext';
import FolderExplorerModal from './FolderExplorerModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  backendType?: 'qbittorrent' | 'soup-go';
}

/**
 * Modal dialog for viewing and editing application settings.
 * Backend-aware to show only relevant configurations.
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  apiUrl,
  backendType = 'qbittorrent'
}) => {
  const [settings, setSettings] = useState<QBPreferences | null>(null);
  const [initialSettings, setInitialSettings] = useState<QBPreferences | null>(null);
  const [isAltSpeedsEnabled, setIsAltSpeedsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dlUnit, setDlUnit] = useState<'KB' | 'MB'>('KB');
  const [upUnit, setUpUnit] = useState<'KB' | 'MB'>('KB');
  const { showNotification } = useNotification();

  // Explorer State
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [explorerTarget, setExplorerTarget] = useState<'save_path' | 'media_root' | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const [prefsRes, stateRes] = await Promise.all([
        fetch(`${apiUrl}/preferences`),
        fetch(`${apiUrl}/state`)
      ]);

      if (!prefsRes.ok || !stateRes.ok) throw new Error('Failed to fetch data');
      
      const prefs = await prefsRes.json() as QBPreferences;
      const state = await stateRes.json() as QBServerState;

      setSettings(prefs);
      setInitialSettings(prefs);
      setIsAltSpeedsEnabled(!!state.use_alt_speed_limits);

      // Determine initial units
      const dlLimit = (prefs.alt_dl_limit as number) || 0;
      const upLimit = (prefs.alt_up_limit as number) || 0;
      
      if (dlLimit >= 1024 * 1024) setDlUnit('MB');
      else setDlUnit('KB');

      if (upLimit >= 1024 * 1024) setUpUnit('MB');
      else setUpUnit('KB');

    } catch (err) {
      console.error('Failed to fetch settings:', err);
      showNotification('Failed to load settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const getUnitMultiplier = (unit: 'KB' | 'MB') => unit === 'MB' ? 1024 * 1024 : 1024;

  const handleAltDlChange = (val: number) => {
    if (!settings) return;
    setSettings({ ...settings, alt_dl_limit: val * getUnitMultiplier(dlUnit) });
  };

  const handleAltUpChange = (val: number) => {
    if (!settings) return;
    setSettings({ ...settings, alt_up_limit: val * getUnitMultiplier(upUnit) });
  };

  const handleDlUnitChange = (unit: 'KB' | 'MB') => {
    if (!settings) return;
    const currentVal = Math.floor((settings.alt_dl_limit as number || 0) / getUnitMultiplier(dlUnit));
    setDlUnit(unit);
    setSettings({ ...settings, alt_dl_limit: currentVal * (unit === 'MB' ? 1024 * 1024 : 1024) });
  };

  const handleUpUnitChange = (unit: 'KB' | 'MB') => {
    if (!settings) return;
    const currentVal = Math.floor((settings.alt_up_limit as number || 0) / getUnitMultiplier(upUnit));
    setUpUnit(unit);
    setSettings({ ...settings, alt_up_limit: currentVal * (unit === 'MB' ? 1024 * 1024 : 1024) });
  };

  const openExplorer = (key: 'save_path' | 'media_root') => {
    setExplorerTarget(key);
    setIsExplorerOpen(true);
  };

  const handleFolderSelect = (path: string) => {
    if (explorerTarget && settings) {
      setSettings({ ...settings, [explorerTarget]: path });
    }
    setIsExplorerOpen(false);
    setExplorerTarget(null);
  };

  const handleToggleAltSpeeds = async (enabled: boolean) => {
    if (enabled === isAltSpeedsEnabled) return;
    
    try {
      const res = await fetch(`${apiUrl}/toggle-alt-speeds`, { method: 'POST' });
      if (!res.ok) throw new Error('Toggle failed');
      setIsAltSpeedsEnabled(enabled);
    } catch (err) {
      console.error('Failed to toggle alt speeds:', err);
      showNotification('Failed to toggle speed mode', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !initialSettings) return;

    setIsSaving(true);
    try {
      // Find only changed keys to avoid potential side effects
      const changes: Partial<QBPreferences> = {};
      for (const key in settings) {
        if (settings[key] !== initialSettings[key]) {
          changes[key] = settings[key];
        }
      }

      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }

      const response = await fetch(`${apiUrl}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });

      if (response.ok) {
        showNotification('Settings saved successfully', 'success');
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Save failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to save settings:', err);
      showNotification(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">App Preferences</h2>
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mt-1">
                {backendType === 'soup-go' ? 'Soup-Go' : 'qBittorrent'} Configuration
              </p>
            </div>
            <button onClick={onClose} disabled={isSaving} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-2xl leading-none disabled:opacity-30">&times;</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {isLoading ? (
              <div className="py-20 text-center font-bold text-zinc-400 animate-pulse">Loading settings...</div>
            ) : settings ? (
              <form id="settings-form" onSubmit={handleSave} className={`space-y-8 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Downloads Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Downloads & Storage</h3>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Default Save Path</label>
                    <div className="relative group">
                      <input
                        type="text"
                        readOnly
                        onClick={() => openExplorer('save_path')}
                        value={(settings.save_path as string) || ''}
                        className="w-full h-12 px-4 pr-12 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm cursor-pointer hover:border-blue-500/50"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 group-hover:text-blue-500 transition-colors pointer-events-none">
                        <Package size={16} />
                      </div>
                    </div>
                  </div>

                  {backendType === 'soup-go' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Media Library Root</label>
                      <div className="relative group">
                        <input
                          type="text"
                          readOnly
                          onClick={() => openExplorer('media_root')}
                          value={(settings.media_root as string) || ''}
                          className="w-full h-12 px-4 pr-12 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm cursor-pointer hover:border-blue-500/50"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 group-hover:text-blue-500 transition-colors pointer-events-none">
                          <HardDrive size={16} />
                        </div>
                      </div>
                    </div>
                  )}

                  {backendType === 'qbittorrent' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Max Active Downloads</label>
                      <input
                        type="number"
                        value={(settings.max_active_downloads as number) || 0}
                        onChange={(e) => setSettings({ ...settings, max_active_downloads: parseInt(e.target.value, 10) })}
                        className="w-full h-12 px-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                      />
                    </div>
                  )}
                </section>

                {/* Network Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Network & Protocol</h3>
                  
                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      <span className="text-sm font-bold">Enable DHT (Trackerless)</span>
                      <input
                        type="checkbox"
                        checked={!!settings.dht}
                        onChange={(e) => setSettings({ ...settings, dht: e.target.checked })}
                        className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50"
                      />
                    </label>

                    {backendType === 'soup-go' && (
                      <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <span className="text-sm font-bold">Enable Peer Exchange (PEX)</span>
                        <input
                          type="checkbox"
                          checked={!!settings.pex}
                          onChange={(e) => setSettings({ ...settings, pex: e.target.checked })}
                          className="w-5 h-5 rounded-lg border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500/50"
                        />
                      </label>
                    )}
                  </div>
                </section>

                {/* Speed Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400">Alternative Speed Limits</h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Alt Download</label>
                      <div className="flex space-x-2">
                        <input
                          type="number"
                          value={Math.floor((settings.alt_dl_limit as number || 0) / getUnitMultiplier(dlUnit))}
                          onChange={(e) => handleAltDlChange(parseInt(e.target.value, 10) || 0)}
                          className="flex-1 h-12 px-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                        />
                        <select 
                          value={dlUnit}
                          onChange={(e) => handleDlUnitChange(e.target.value as 'KB' | 'MB')}
                          className="h-12 px-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-xs uppercase"
                        >
                          <option value="KB">KB/s</option>
                          <option value="MB">MB/s</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Alt Upload</label>
                      <div className="flex space-x-2">
                        <input
                          type="number"
                          value={Math.floor((settings.alt_up_limit as number || 0) / getUnitMultiplier(upUnit))}
                          onChange={(e) => handleAltUpChange(parseInt(e.target.value, 10) || 0)}
                          className="flex-1 h-12 px-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-sm"
                        />
                        <select 
                          value={upUnit}
                          onChange={(e) => handleUpUnitChange(e.target.value as 'KB' | 'MB')}
                          className="h-12 px-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold text-xs uppercase"
                        >
                          <option value="KB">KB/s</option>
                          <option value="MB">MB/s</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-blue-500/20">
                    <span className="text-sm font-bold">Enable Alt Limits Globally</span>
                    <input
                      type="checkbox"
                      checked={isAltSpeedsEnabled}
                      onChange={(e) => handleToggleAltSpeeds(e.target.checked)}
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
              disabled={isSaving}
              className="flex-1 h-14 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black rounded-2xl transition-all disabled:opacity-50"
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

      <FolderExplorerModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        onSelect={handleFolderSelect}
        initialPath={(explorerTarget && settings ? (settings[explorerTarget] as string) : '') || '/'}
        apiUrl={apiUrl}
      />
    </>
  );
};

export default SettingsModal;
