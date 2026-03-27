/**
 * ToastContext — Global toast notifications for FindA.Sale
 *
 * A lightweight context + provider for showing transient alerts throughout the app.
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Success!', 'success');
 *   showToast('\uD83C\uDFC6 +1 pt earned!', 'points'); // amber, bottom-right
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Phase 27: added 'points' type — renders in amber at bottom-right above BottomTabNav
export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'points';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: Toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const standardToasts = toasts.filter((t) => t.type !== 'points');
  const pointsToasts = toasts.filter((t) => t.type === 'points');

  const typeClasses: Record<ToastType, string> = {
    success: 'bg-green-500 text-white dark:bg-green-700',
    error: 'bg-red-500 text-white dark:bg-red-700',
    info: 'bg-blue-500 text-white dark:bg-blue-700',
    warning: 'bg-yellow-500 text-white dark:bg-yellow-700',
    points: 'bg-amber-500 text-white dark:bg-amber-700',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Standard toasts — top-right */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {standardToasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded shadow-lg font-medium max-w-xs dark:shadow-2xl ${typeClasses[toast.type]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Points toasts — bottom-right, above BottomTabNav */}
      <div className="fixed bottom-20 right-4 z-50 space-y-2">
        {pointsToasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-3 py-2 rounded-lg shadow-lg font-semibold text-sm max-w-xs dark:shadow-2xl ${typeClasses.points}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
