import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';

interface Bid {
  id: string;
  itemId: string;
  amount: number;
  status: string;
  createdAt: string;
  item: {
    id: string;
    title: string;
    photoUrls?: string[];
  };
  sale: {
    id: string;
    title: string;
  };
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusBadge = (status: string) => {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    active: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      label: 'Active',
    },
    winning: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      label: 'Winning',
    },
    outbid: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-700 dark:text-orange-400',
      label: 'Outbid',
    },
    closed: {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-700 dark:text-gray-300',
      label: 'Closed',
    },
  };
  const badge = badges[status.toLowerCase()] || badges.active;
  return { ...badge, label: badge.label };
};

export default function BidsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<'all' | 'active' | 'winning' | 'closed'>('all');

  // Redirect if not logged in
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/shopper/bids');
    }
  }, [user, authLoading, router]);

  const { data: bidsData, isLoading } = useQuery({
    queryKey: ['bids', filter, user?.id],
    queryFn: async () => {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await api.get('/bids', { params });
      return res.data;
    },
    enabled: !!user?.id,
  });

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>My Bids — FindA.Sale</title>
        </Head>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">My Bids</h1>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </>
    );
  }

  const bids: Bid[] = bidsData?.bids || [];

  return (
    <>
      <Head>
        <title>My Bids — FindA.Sale</title>
        <meta name="description" content="Your active and past bids on auction items" />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">My Bids</h1>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-8 border-b border-warm-200 dark:border-gray-700 overflow-x-auto">
          {[
            { value: 'all', label: 'All Bids' },
            { value: 'active', label: 'Active' },
            { value: 'winning', label: 'Winning' },
            { value: 'closed', label: 'Closed' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as any)}
              className={`pb-2 font-medium whitespace-nowrap transition-colors ${
                filter === tab.value
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {bids.length === 0 ? (
          <EmptyState
            icon="🔨"
            heading="No bids yet"
            subtext="Start bidding on auction items to see your bids here. Browse upcoming sales to find items you're interested in."
            cta={{
              label: 'Browse Auctions',
              href: '/',
            }}
          />
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => {
              const badge = getStatusBadge(bid.status);
              return (
                <Link
                  key={bid.id}
                  href={`/items/${bid.itemId}`}
                  className="flex gap-4 p-4 rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
                >
                  {/* Item Image */}
                  <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-warm-100 dark:bg-gray-700">
                    {bid.item.photoUrls?.[0] ? (
                      <img
                        src={bid.item.photoUrls[0]}
                        alt={bid.item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        📷
                      </div>
                    )}
                  </div>

                  {/* Bid Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 line-clamp-1 mb-1">
                      {bid.item.title}
                    </h3>
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">
                      at {bid.sale.title}
                    </p>
                    <p className="text-xs text-warm-500 dark:text-warm-400">
                      Bid placed {formatDate(bid.createdAt)}
                    </p>
                  </div>

                  {/* Bid Amount & Status */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="text-xl font-bold text-warm-900 dark:text-warm-100">
                      ${bid.amount.toFixed(2)}
                    </p>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
