import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthContext';
import api from '../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
}

const timeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const NotificationBell = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch notifications on mount and when bell opens
  useEffect(() => {
    if (!user || !isOpen) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/notifications/inbox');
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [user, isOpen]);

  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Mark as read
      await api.patch(`/notifications/inbox/${notification.id}/read`);

      // Update local state
      setNotifications(
        notifications.map((n) =>
          n.id === notification.id ? { ...n, read: true } : n
        )
      );
      setUnreadCount(Math.max(0, unreadCount - 1));

      // Navigate if link exists
      if (notification.link) {
        // Close dropdown and let the browser navigate
        setIsOpen(false);
        window.location.href = notification.link;
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notificationId: string
  ) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/inbox/${notificationId}`);

      setNotifications(notifications.filter((n) => n.id !== notificationId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Only show for logged-in users
  if (!user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-warm-900 dark:text-gray-200 hover:text-amber-600 focus:outline-none"
        aria-label="Notifications"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0018 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-warm-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50">
          <div className="border-b border-warm-200 dark:border-gray-700 px-4 py-3 flex justify-between items-center">
            <h3 className="font-semibold text-warm-900 dark:text-gray-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    await api.patch('/notifications/inbox/read-all');
                    setNotifications(
                      notifications.map((n) => ({ ...n, read: true }))
                    );
                    setUnreadCount(0);
                  } catch (err) {
                    console.error('Failed to mark all as read:', err);
                  }
                }}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-warm-500 dark:text-gray-400">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-warm-500 dark:text-gray-400">
              You're all caught up! No new notifications.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`cursor-pointer border-b border-warm-100 dark:border-gray-700 px-4 py-3 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors ${
                    !notification.read ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-warm-900 dark:text-gray-100">
                        {notification.title}
                      </p>
                      <p className="text-xs text-warm-600 dark:text-gray-300 mt-1">
                        {notification.body}
                      </p>
                      <p className="text-xs text-warm-400 dark:text-gray-500 mt-2">
                        {timeAgo(notification.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) =>
                        handleDeleteNotification(e, notification.id)
                      }
                      className="flex-shrink-0 text-warm-300 dark:text-gray-600 hover:text-warm-500 dark:hover:text-gray-400"
                      aria-label="Delete notification"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {notifications.length > 0 && (
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="block w-full text-center border-t border-warm-200 dark:border-gray-700 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 font-medium"
            >
              View all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
