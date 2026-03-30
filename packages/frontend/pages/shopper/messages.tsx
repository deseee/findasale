import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import useConversations, { ConversationDTO } from '../../hooks/useConversations';
import Skeleton from '../../components/Skeleton';
import { format, parseISO } from 'date-fns';

const ShopperMessagesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const { data: conversations, isLoading, error } = useConversations(!!user);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Messages</h1>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Messages</h1>
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-200">
              Failed to load messages. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const conversationList = conversations || [];
  const hasConversations = conversationList.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            {hasConversations ? `${conversationList.length} conversation${conversationList.length !== 1 ? 's' : ''}` : 'No messages yet'}
          </p>
        </div>

        {/* Conversations List */}
        {hasConversations ? (
          <div className="space-y-2">
            {conversationList.map((conversation: ConversationDTO) => {
              const lastMessage = conversation.messages?.[0];
              const preview = lastMessage
                ? lastMessage.body.substring(0, 50) + (lastMessage.body.length > 50 ? '...' : '')
                : 'No messages yet';
              const unreadCount = conversation._count?.messages || 0;
              const timestamp = conversation.lastMessageAt
                ? format(parseISO(conversation.lastMessageAt), 'MMM d, h:mm a')
                : '';

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
                    hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {conversation.organizer?.businessName || 'Unknown Organizer'}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {conversation.sale?.title || 'General inquiry'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{timestamp}</p>
                      {unreadCount > 0 && (
                        <div className="inline-block mt-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/50
                          text-blue-700 dark:text-blue-200 text-xs font-semibold rounded-full">
                          {unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                    {preview}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-300 mb-4">No messages yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-300 mb-4">
              Start messaging organizers about their sales
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Browse Sales
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopperMessagesPage;
