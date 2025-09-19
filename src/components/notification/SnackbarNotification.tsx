import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

export enum NOTIFICATION {
  Success = 'success',
  Error = 'error',
  Info = 'info',
}

interface NotificationContextType {
  setNotificationMessage: (message: string) => void;
  setNotificationType: (type: NOTIFICATION) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NOTIFICATION>(NOTIFICATION.Info);
  const [visible, setVisible] = useState(false);

  const setNotificationMessage = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
  }, []);

  const setNotificationType = useCallback((notificationType: NOTIFICATION) => {
    setType(notificationType);
  }, []);

  const onDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <NotificationContext.Provider value={{ setNotificationMessage, setNotificationType }}>
      {children}
      <Snackbar
        visible={visible}
        onDismiss={onDismiss}
        duration={3000}
        style={{
          backgroundColor: type === NOTIFICATION.Error ? '#d32f2f' :
            type === NOTIFICATION.Success ? '#388e3c' : '#1976d2'
        }}
      >
        {t(message)}
      </Snackbar>
    </NotificationContext.Provider>
  );
} 