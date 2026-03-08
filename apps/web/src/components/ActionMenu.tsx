import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success' | 'warning';
  active?: boolean;
}

interface ActionMenuProps {
  primaryLabel: string;
  primaryIcon: React.ReactNode;
  onPrimaryClick: () => void;
  items: ActionMenuItem[];
}

const ActionMenu: React.FC<ActionMenuProps> = ({ primaryLabel, primaryIcon, onPrimaryClick, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX, // Align start (left)
      });
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    if (isOpen) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="flex items-center" ref={containerRef}>
      {/* Primary Action Button */}
      <button 
        onClick={(e) => { e.stopPropagation(); onPrimaryClick(); }}
        className="h-10 sm:h-12 px-4 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-l-xl sm:rounded-l-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 border-r border-white/10"
      >
        {primaryIcon}
        {primaryLabel}
      </button>

      {/* Dropdown Toggle */}
      <button 
        onClick={toggleMenu}
        className={`h-10 sm:h-12 px-3 sm:px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl sm:rounded-r-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center ${isOpen ? 'bg-blue-800' : ''}`}
      >
        <ChevronDown size={16} strokeWidth={3} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Portal Menu */}
      {isOpen && createPortal(
        <div 
          className="fixed z-[100] w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden py-2 animate-in fade-in zoom-in-95 duration-200"
          style={{ top: coords.top, left: coords.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-colors
                ${item.variant === 'danger' ? 'text-red-500 hover:bg-red-500/10' : 
                  item.variant === 'success' ? 'text-green-500 hover:bg-green-500/10' :
                  item.variant === 'warning' ? 'text-orange-500 hover:bg-orange-500/10' :
                  'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}
                ${item.active ? 'bg-blue-500/5 !text-blue-500' : ''}
              `}
            >
              <span className={item.active ? 'text-blue-500' : 'opacity-70'}>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default ActionMenu;
