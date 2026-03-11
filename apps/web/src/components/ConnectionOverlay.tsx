import React from 'react';
import { WifiOff } from 'lucide-react';

interface ConnectionOverlayProps {
  isConnectionLost: boolean;
  onReconnect: () => void;
}

const ConnectionOverlay: React.FC<ConnectionOverlayProps> = ({ isConnectionLost, onReconnect }) => {
  if (!isConnectionLost) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-24 h-24 bg-red-500 rounded-[32px] flex items-center justify-center text-white mx-auto shadow-2xl shadow-red-500/20 animate-pulse">
          <WifiOff size={48} strokeWidth={2.5} />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tighter text-white uppercase">Connection Lost</h2>
          <p className="text-zinc-400 font-bold leading-relaxed">
            The Multimedia Layer has lost contact with the Soup Server. Check your network or server status.
          </p>
        </div>
        <button 
          onClick={onReconnect}
          className="px-8 py-4 bg-white text-black font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl"
        >
          Attempt Reconnect
        </button>
      </div>
    </div>
  );
};

export default ConnectionOverlay;
