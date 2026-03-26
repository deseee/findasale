import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import EmptyState from '../../components/EmptyState';

interface ConversationSummary {
  id: string;
  sale?: { id: string; title: string };
  shopperUser?: { id: string; name: string };
  organizer?: { id: string; businessName: string; userId: string };
  lastMessageAt: string;
  messages: Array<{ body: string; createdAt: string; senderId: string }>;
  _count: { messages: number };
}

const MessagesPage = () => {
  const { user } = useAuth();
  const router = useRouter();

  // Redirect to /messages/new if ?organizerId= param is present
  useEffect(() => {
    if (router.isReady && router.query.organizerId) {
      const params = new URLSearchParams();
      params.append('organizerId', router.query.organizerId as string);
      if (router.query.saleId) {
        params.append('saleId', router.query.saleId as string);
      }
      router.push(`/messages/new?${params.toString()}`);
    }
  }, [router.isReady, router.query.organizerId, router.query.saleId]);

  const { data: conversations, isLoading, isError } = useQuery<ConversationSummary[]>({
    queryKey: ['messages', 'conversations'],
    queryFn: async () => {
      const res = await api.get('/messages');
      return res.data;
    },
    enabled: !!user,
    refetchInterval: 10_000,
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-8">
        <Head><title>Messages – FindA.Sale</title></Head>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">💬</div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-3">Messages</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-6">Log in to view your messages.</p>
          <Link href="/login" className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex flex-col">
      <Head>
        <title>Messages – FindA.Sale</title>
        <meta name="description" content="Your messages on FindA.Sale" />
      </Head>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl pb-24">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">Messages</h1>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warm-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-warm-200 rounded w-1/3" />
                    <div className="h-3 bg-warm-100 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-warm-600 dark:text-warm-400">Failed to load messages. Try refreshing.</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && conversations?.length === 0 && (
          <EmptyState
            icon="💬"
            heading="No messages yet"
            subtext={user.roles?.includes('ORGANIZER')
              ? "When shoppers ask about your items or sales, messages will appear here. Check back soon!"
              : "Questions about items? Message an organizer from any sale page to ask details or make an offer."}
            cta={{ label: 'Browse Sales', href: '/' }}
          />
        )}

        {/* Conversation list */}
        {!isLoading && !isError && conversations && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map(conv => {
              const preview = conv.messages[0];
              const unread = conv._count.messages;
              const otherName = user.roles?.includes('ORGANIZER')
                ? conv.shopperUser?.name ?? 'Shopper'
                : conv.organizer?.businessName ?? 'Organizer';
              const timeAgo = new Date(conv.lastMessageAt).toLocaleDateString();

              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-xl p-4 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors border border-warm-100 dark:border-gray-700"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 text-amber-700 dark:text-amber-300 font-bold text-sm">
                    {otherName.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold text-warm-900 dark:text-warm-100 truncate ${unread > 0 ? 'font-bold' : ''}`}>
                        {otherName}
                      </span>
                      <span className="text-xs text-warm-400 flex-shrink-0">{timeAgo}</span>
                    </div>
                    {conv.sale && (
                      <p className="text-xs text-amber-600 truncate">{conv.sale.title}</p>
                    )}
                    {preview && (
                      <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-warm-900 dark:text-warm-100 font-medium' : 'text-warm-500 dark:text-warm-400'}`}>
                        {preview.senderId === user.id ? 'You: ' : ''}{preview.body}
                      </p>
                    )}
                  </div>
                  {/* Unread badge */}
                  {unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default MessagesPage;
