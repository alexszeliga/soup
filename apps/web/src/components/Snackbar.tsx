import React, { useEffect } from 'react';

interface SnackbarProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
  type?: 'error' | 'success' | 'info';
}

/**
 * A Material 3 inspired Snackbar component for brief feedback.
 * Replaces browser-native alert() calls.
 */
const Snackbar: React.FC<SnackbarProps> = ({
  message,
  isVisible,
  onClose,
  duration = 4000,
  type = 'info'
}) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const typeStyles = {
    error: 'bg-red-600 text-white',
    success: 'bg-green-600 text-white',
    info: 'bg-zinc-800 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900',
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center min-w-[320px] max-w-lg animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-auto select-none">
      <div className={`absolute inset-0 rounded-2xl opacity-90 ${typeStyles[type]}`} />
      <p className="relative font-bold text-sm tracking-tight flex-1">
        {message}
      </p>
      <button 
        onClick={onClose}
        className="relative ml-4 text-xs font-black uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
      >
        Dismiss
      </button>
    </div>
  );
};

export default Snackbar;
