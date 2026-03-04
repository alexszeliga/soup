import React from 'react';
import { ArrowDown, ArrowUp, HardDrive, Zap, ZapOff } from 'lucide-react';
import type { QBServerState } from '@soup/core/QBClient.js';
import { formatBytes } from '../utils/format';

interface GlobalStatsProps {
  serverState: QBServerState | null;
  pendingAltSpeedTarget: boolean | null;
  onToggleAltSpeeds: () => void;
  isMobile?: boolean;
}

/**
 * Shared component for displaying real-time global transfer speeds,
 * disk space, and alternative speed limit toggle.
 */
const GlobalStats: React.FC<GlobalStatsProps> = ({ 
  serverState, 
  pendingAltSpeedTarget, 
  onToggleAltSpeeds,
  isMobile = false
}) => {
  return (
    <div className={`${isMobile ? '' : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50'} rounded-3xl p-4 space-y-4 shadow-inner`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ArrowDown size={14} className="text-blue-500" />
          <span className="text-[11px] font-black">{serverState ? formatBytes(serverState.dl_info_speed) : '0 B'}/s</span>
        </div>
        <div className="flex items-center space-x-2">
          <ArrowUp size={14} className="text-emerald-500" />
          <span className="text-[11px] font-black">{serverState ? formatBytes(serverState.up_info_speed) : '0 B'}/s</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-400">
          <div className="flex items-center space-x-1">
            <HardDrive size={10} />
            <span>Free Space</span>
          </div>
          <span className="text-zinc-600 dark:text-zinc-300">{serverState ? formatBytes(serverState.free_space_on_disk, 1) : '0 GB'}</span>
        </div>
        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500/50 w-[70%]" /> {/* Mock fill until we have total capacity */}
        </div>
      </div>

      {/* Alt Speed Limits Toggle */}
      <button 
        onClick={onToggleAltSpeeds}
        disabled={pendingAltSpeedTarget !== null}
        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all ${pendingAltSpeedTarget !== null ? 'opacity-50 cursor-default' : 'cursor-pointer'} ${serverState?.use_alt_speed_limits ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-400'}`}
      >
        <div className="flex items-center space-x-2">
          {serverState?.use_alt_speed_limits ? <Zap size={14} /> : <ZapOff size={14} />}
          <span className="text-[10px] font-black uppercase tracking-tight">Alt Speeds</span>
        </div>
        <div className={`w-6 h-3 rounded-full relative transition-colors ${serverState?.use_alt_speed_limits ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
          <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${serverState?.use_alt_speed_limits ? 'left-3.5' : 'left-0.5'}`} />
        </div>
      </button>
    </div>
  );
};

export default GlobalStats;
