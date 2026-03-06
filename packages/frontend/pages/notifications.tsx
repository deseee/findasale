import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';

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
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const getNotificationIcon = (type: string): string => {
  switch (type) {
    case 'purchase':
      return '✅';
    case 'sale_alert':
      return '🔔';
    case 'flash_deal':
      return '⚡';
    case 'message':
      return '💬';
    case 'badge':
      return '🏆';
    case 'system':
      return '📢';
    default:
      return '📬';
  }
};

const NotificationsPage = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/notifications/inbox', {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (response.ok) {
          const data: NotificationResponse = await response.json();
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [user]);

  if (!user) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <p className="text-center text-warm-500">
            Please log in to view your notifications.
          </p>
          <div className="text-center mt-4">
            <Link href="/login" className="text-amber-600 hover:text-amber-700 font-medium">
              Go to login
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const displayedNotifications =
    filter === 'unread'
      ? notifications.filter((n) => !n.read)
      : notifications;

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/inbox/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      setNotifications(
        notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        )
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/inbox/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      setNotifications(
        notifications.map((n) => ({ ...n, read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await fetch(`/api/notifications/inbox/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      setNotifications(notifications.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNavigate = async (notification: Notification) => {
    if (!notification.read) {
      await handleMarkRead(notification.id);
    }

    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const groupedNotifications = displayedNotifications.reduce(
    (acc, notif) => {
      const date = new Date(notif.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      let group = 'Older';
      if (
        date.toDateString() === today.toDateString()
      ) {
        group = 'Today';
      } else if (
        date.toDateString() === yesterday.toDateString()
      ) {
        group = 'Yesterday';
      } else if (date > weekAgo) {
        group = 'This Week';
      }

      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(notif);
      return acc;
    },
    {} as Record<string, Notification[]>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-warm-900">Notifications</h1>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-100 text-warm-900 hover:bg-warm-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-100 text-warm-900 hover:bg-warm-200'
              }`}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-warm-500">Loading notifications...</p>
            </div>
          ) : displayedNotifications.length === 0 ? (
            <EmptyState
              icon="✨"
              heading="You're all caught up!"
              subtext={filter === 'unread'
                ? 'No unread notifications. Great job staying on top of things!'
                : 'No notifications yet. You will see updates about your activity here.'}
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedNotifications)
                .sort((a, b) => {
                  const order = { Today: 0, Yesterday: 1, 'This Week': 2, Older: 3 };
                  return (order[a[0] as keyof typeof order] || 999) -
                    (order[b[0] as keyof typeof order] || 999);
                })
                .map(([group, notifs]) => (
                  <div key={group}>
                    <h2 className="text-sm font-semibold text-warm-500 uppercase tracking-wide mb-3">
                      {group}
                    </h2>
                    <div className="space-y-2">
                      {notifs.map((notification) => (
                        <div
                          key={notification.id}
                          className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                            notification.read
                              ? 'border-warm-200 bg-white hover:bg-warm-50'
                              : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                          }`}
                          onClick={() => handleNavigate(notification)}
                        >
                          <div className="flex gap-4">
                            <div className="text-2xl flex-shrink-0">
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-warm-900">
                                    {notification.title}
                                  </h3>
                                  <p className="text-sm text-warm-600 mt-1">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.read && (
                                  <div className="flex-shrink-0 h-2 w-2 bg-amber-600 rounded-full mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-warm-500 mt-2">
                                {timeAgo(notification.createdAt)}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNotification(notification.id);
                              }}
                              className="flex-shrink-0 text-warm-300 hover:text-warm-500 p-1"
                              aria-label="Delete notification"
                            >
                              <svg
                                className="h-5 w-5"
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
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default NotificationsPage;
