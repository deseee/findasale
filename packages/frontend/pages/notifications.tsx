import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthContext';
import EmptyState from '../components/EmptyState';
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
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [channel, setChannel] = useState<'ALL' | 'OPERATIONAL' | 'DISCOVERY'>('ALL');
  const [channelUnreadCounts, setChannelUnreadCounts] = useState({
    ALL: 0,
    OPERATIONAL: 0,
    DISCOVERY: 0,
  });

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async (selectedChannel: 'ALL' | 'OPERATIONAL' | 'DISCOVERY') => {
      setIsLoading(true);
      try {
        const res = await api.get('/notifications/inbox', {
          params: { channel: selectedChannel },
        });
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
        setChannelUnreadCounts((prev) => ({
          ...prev,
          [selectedChannel]: res.data.unreadCount,
        }));
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications(channel);
  }, [user, channel]);

  // H-003: _app.tsx wraps all pages in <Layout> — do NOT add another <Layout> here.
  // Returning bare JSX; the global layout handles header/footer.
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16">
        <p className="text-center text-warm-500 dark:text-warm-400">
          Please log in to view your notifications.
        </p>
        <div className="text-center mt-4">
          <Link href="/login" className="text-amber-600 hover:text-amber-700 font-medium">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  const displayedNotifications =
    filter === 'unread'
      ? notifications.filter((n) => !n.read)
      : notifications;

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/notifications/inbox/${id}/read`);

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
      await api.patch('/notifications/inbox/read-all');

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
      await api.delete(`/notifications/inbox/${id}`);

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
      const isExternal = notification.link.startsWith('http://') || notification.link.startsWith('https://');
      if (isExternal) {
        window.open(notification.link, '_blank', 'noopener,noreferrer');
      } else {
        router.push(notification.link);
      }
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
    <>
      <Head><title>Notifications – FindA.Sale</title></Head>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Notifications</h1>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Channel Tabs */}
          <div className="flex gap-1 mb-6 border-b border-warm-200 dark:border-gray-700">
            <button
              onClick={() => setChannel('ALL')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                channel === 'ALL'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setChannel('OPERATIONAL')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                channel === 'OPERATIONAL'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Operational {channelUnreadCounts.OPERATIONAL > 0 && `(${channelUnreadCounts.OPERATIONAL})`}
            </button>
            <button
              onClick={() => setChannel('DISCOVERY')}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                channel === 'DISCOVERY'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              Discovery {channelUnreadCounts.DISCOVERY > 0 && `(${channelUnreadCounts.DISCOVERY})`}
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-100 dark:bg-gray-800 text-warm-900 dark:text-warm-100 hover:bg-warm-200 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-100 dark:bg-gray-800 text-warm-900 dark:text-warm-100 hover:bg-warm-200 dark:hover:bg-gray-700'
              }`}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-warm-500 dark:text-warm-400">Loading notifications...</p>
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
                    <h2 className="text-sm font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-3">
                      {group}
                    </h2>
                    <div className="space-y-2">
                      {notifs.map((notification) => (
                        <div
                          key={notification.id}
                          className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                            notification.read
                              ? 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-warm-50 dark:hover:bg-gray-700'
                              : 'border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
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
                                  <h3 className="font-semibold text-warm-900 dark:text-warm-100">
                                    {notification.title}
                                  </h3>
                                  <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.read && (
                                  <div className="flex-shrink-0 h-2 w-2 bg-amber-600 rounded-full mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                                {timeAgo(notification.createdAt)}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNotification(notification.id);
                              }}
                              className="flex-shrink-0 text-warm-300 hover:text-warm-500 dark:text-warm-400 p-1"
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
    </>
  );
};

export default NotificationsPage;
