import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  channel?: string;
  createdAt: string;
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

const getTypeIcon = (type: string): string => {
  const icons: Record<string, string> = {
    sale_alert: '🏪',
    flash_deal: '⚡',
    message: '💬',
    review: '⭐',
    system: '📢',
    auction_update: '🔨',
    shipping: '📦',
    payment: '💳',
  };
  return icons[type] || '🔔';
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [channel, setChannel] = useState<'ALL' | 'OPERATIONAL' | 'DISCOVERY'>('ALL');

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/shopper/notifications');
    }
  }, [user, authLoading, router]);

  // Fetch notifications
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const params = channel !== 'ALL' ? `?channel=${channel}` : '';
        const res = await api.get(`/notifications/inbox${params}`);
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [user, channel]);

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
        router.push(notification.link);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await api.delete(`/notifications/inbox/${notificationId}`);
      setNotifications(notifications.filter((n) => n.id !== notificationId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
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

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>Notifications — FindA.Sale</title>
        </Head>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">Notifications</h1>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Notifications — FindA.Sale</title>
        <meta name="description" content="Your FindA.Sale notifications" />
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Notifications</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 font-medium"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Channel Filter Tabs */}
        <div className="flex gap-3 mb-8 border-b border-warm-200 dark:border-gray-700">
          {(['ALL', 'OPERATIONAL', 'DISCOVERY'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                channel === ch
                  ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400'
                  : 'text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200'
              }`}
            >
              {ch === 'ALL' && 'All'}
              {ch === 'OPERATIONAL' && 'Organizer Alerts'}
              {ch === 'DISCOVERY' && 'Discoveries'}
            </button>
          ))}
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            heading="You're all caught up!"
            subtext="No new notifications yet. We'll let you know when something interesting happens."
            cta={{
              label: 'Back to Dashboard',
              href: '/shopper/dashboard',
            }}
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  !notification.read
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50'
                    : 'bg-white dark:bg-gray-800 border-warm-200 dark:border-gray-700'
                }`}
              >
                <div className="flex gap-4">
                  <div className="text-2xl flex-shrink-0">
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h3 className="font-semibold text-warm-900 dark:text-gray-100">
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-amber-500"></span>
                      )}
                    </div>
                    <p className="text-sm text-warm-600 dark:text-gray-300 mb-2">
                      {notification.body}
                    </p>
                    <p className="text-xs text-warm-400 dark:text-gray-500">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(notification.id);
                    }}
                    className="flex-shrink-0 text-warm-300 dark:text-gray-600 hover:text-warm-500 dark:hover:text-gray-400 transition-colors p-1"
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
        )}
      </div>
    </>
  );
}
