import React, { useState } from 'react';
import { Package } from 'lucide-react';
import type { IngestionTask } from '../hooks/useTorrents';

interface TaskMonitorProps {
  externalTasks: IngestionTask[];
  isWebSocketActive: boolean;
}

/**
 * Monitor for background ingestion tasks.
 * Relies on external state (typically WebSocket sync) for real-time updates.
 */
const TaskMonitor: React.FC<TaskMonitorProps> = ({ externalTasks }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClearFinished = async () => {
    try {
      await fetch('/api/tasks/clear', { method: 'POST' });
    } catch (err) {
      console.error('Failed to clear tasks', err);
    }
  };

  const activeTasks = externalTasks.filter(t => t.status === 'queued' || t.status === 'processing');
  const recentTasks = externalTasks.filter(t => t.status === 'completed' || t.status === 'failed').slice(0, 5);

  if (externalTasks.length === 0) return null;

  return (
    <div className="flex items-center space-x-6">
      <div className="h-10 w-px bg-zinc-200 dark:bg-zinc-800" />
      
      <div className="relative">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="relative h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
        >
          <Package size={20} className={activeTasks.length > 0 ? 'animate-pulse text-blue-600' : 'text-zinc-600 dark:text-zinc-400'} />
          {activeTasks.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
              {activeTasks.length}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute top-12 right-0 w-80 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <header className="p-4 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Background Tasks</h4>
              <button 
                onClick={handleClearFinished}
                className="text-[10px] font-black text-blue-600 uppercase hover:text-blue-700 transition-colors"
              >
                Clear Finished
              </button>
            </header>

            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {activeTasks.length === 0 && recentTasks.length === 0 && (
                <p className="py-8 text-center text-xs font-bold text-zinc-400 italic">No activity</p>
              )}

              {[...activeTasks, ...recentTasks].map(task => {
                // Handle potentially missing or malformed fileMap
                let totalFiles = 0;
                try {
                  const fileEntries = Object.entries(JSON.parse(task.fileMap || '{}'));
                  totalFiles = fileEntries.length;
                } catch (e) {
                  // Fallback for non-JSON or missing map
                }
                
                return (
                  <div key={task.id} className="p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-black truncate flex-1 pr-2 uppercase tracking-tight">
                        {task.status === 'processing' && task.currentFile ? task.currentFile : `Task (${totalFiles} files)`}
                      </p>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                        task.status === 'processing' ? 'bg-blue-500/20 text-blue-500' :
                        task.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                        task.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                        'bg-zinc-500/20 text-zinc-500'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    
                    {task.status === 'processing' && (
                      <p className="text-[10px] font-bold text-zinc-400 mb-2 truncate">
                        Processing file...
                      </p>
                    )}

                    {task.status !== 'completed' && task.status !== 'failed' && (
                      <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${task.status === 'processing' ? 'bg-blue-500' : 'bg-zinc-400'}`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                    
                    {task.errorMessage && (
                      <p className="text-[9px] text-red-500 font-bold mt-1 leading-tight">{task.errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskMonitor;
