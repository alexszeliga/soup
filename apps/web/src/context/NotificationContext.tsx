import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Snackbar from '../components/Snackbar';

type NotificationType = 'error' | 'success' | 'info';

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotificationType>('info');
  const [isVisible, setIsVisible] = useState(false);

  const showNotification = useCallback((msg: string, t: NotificationType = 'info') => {
    setMessage(msg);
    setType(t);
    setIsVisible(true);
  }, []);

  const hideNotification = useCallback(() => {
    setIsVisible(false);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <Snackbar 
        message={message} 
        isVisible={isVisible} 
        type={type} 
        onClose={hideNotification} 
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
