import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import useThread from '../../hooks/useThread';
import useReplyInThread from '../../hooks/useReplyInThread';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';
import { format, parseISO } from 'date-fns';

const ThreadDetailPage = () => {
  const router = useRouter();
  const { conversationId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [replyBody, setReplyBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const { data: thread, isLoading, error } = useThread(
    conversationId as string | null,
    !!user && !!conversationId
  );
  const replyMutation = useReplyInThread(conversationId as string | null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages]);

  // Check access (user must be organizer or shopper in conversation)
  useEffect(() => {
    if (thread && user) {
      const isOrganizer = user.roles?.includes('ORGANIZER');
      const hasAccess = isOrganizer
        ? thread.conversation.organizer.userId === user.id
        : thread.conversation.shopperUserId === user.id;

      if (!hasAccess) {
        router.push('/');
        showToast('You do not have access to this conversation', 'error');
      }
    }
  }, [thread, user, router, showToast]);

  const handleSendReply = async () => {
    if (!replyBody.trim()) {
      showToast('Message cannot be empty', 'error');
      return;
    }

    try {
      await replyMutation.mutateAsync({ body: replyBody.trim() });
      setReplyBody('');
      showToast('Message sent', 'success');
    } catch (error) {
      console.error('Failed to send reply:', error);
      showToast('Failed to send message. Please try again.', 'error');
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4">
          <div className="mb-6">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4">
          <Link
            href="/shopper/messages"
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
          >
            ← Back
          </Link>
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-200">
              Conversation not found or you do not have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const messages = thread.messages || [];
  const isOrganizer = user?.roles?.includes('ORGANIZER');
  const otherParty = isOrganizer ? thread.conversation.shopperUser : thread.conversation.organizer;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-2xl mx-auto">
          <Link
            href={isOrganizer ? '/organizer/messages' : '/shopper/messages'}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm inline-block mb-3"
          >
            ← Back to Messages
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {otherParty?.name || otherParty?.businessName || 'Unknown'}
            </h1>
            {thread.conversation.sale && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {thread.conversation.sale.title}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => {
              const isSentByUser = message.senderId === user?.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${isSentByUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      isSentByUser
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                    }`}
                  >
                    <p className="text-sm font-medium mb-1 opacity-75">
                      {message.sender.name}
                    </p>
                    <p className="text-sm break-words">{message.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isSentByUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {format(parseISO(message.createdAt), 'h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply Composer */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleSendReply();
                }
              }}
              placeholder="Type a message... (Ctrl+Enter or Cmd+Enter to send)"
              rows={3}
              disabled={replyMutation.isPending}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white
                resize-none"
            />
            <button
              onClick={handleSendReply}
              disabled={!replyBody.trim() || replyMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                text-white rounded-md font-medium transition-colors self-end"
            >
              {replyMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>

          {replyMutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              Failed to send message. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreadDetailPage;
