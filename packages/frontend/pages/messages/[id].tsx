import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';

interface Message {
  id: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  sender: { id: string; name: string };
}

interface ConversationDetail {
  conversation: {
    id: string;
    shopperUser: { id: string; name: string };
    organizer: { id: string; businessName: string; userId: string };
    sale?: { id: string; title: string };
  };
  messages: Message[];
}

const MessageThreadPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery<ConversationDetail>({
    queryKey: ['messages', 'thread', id],
    queryFn: async () => {
      const res = await api.get(`/messages/${id}`);
      return res.data;
    },
    enabled: !!id && !!user,
    refetchInterval: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post(`/messages/${id}/reply`, { body: text });
    },
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['messages', 'thread', id] });
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
    },
  });

  // Scroll to bottom when messages load or update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || sendMutation.isPending) return;
    sendMutation.mutate(body.trim());
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-8">
        <Head><title>Messages – FindA.Sale</title></Head>
        <Link href="/login" className="px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold">Log in</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <Head><title>Messages – FindA.Sale</title></Head>
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-amber-600 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-8">
        <Head><title>Messages – FindA.Sale</title></Head>
        <div className="text-center">
          <p className="text-warm-600 mb-4">Conversation not found.</p>
          <Link href="/messages" className="text-amber-600 hover:underline">Back to messages</Link>
        </div>
      </div>
    );
  }

  const { conversation, messages } = data;
  const otherName = user.role === 'ORGANIZER'
    ? conversation.shopperUser.name
    : conversation.organizer.businessName;

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <Head>
        <title>{otherName} – Messages – FindA.Sale</title>
      </Head>

      {/* Header */}
      <div className="bg-white border-b border-warm-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/messages" className="text-warm-500 hover:text-warm-900 p-1 -ml-1" aria-label="Back">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
          {otherName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warm-900 truncate">{otherName}</p>
          {conversation.sale && (
            <Link href={`/sales/${conversation.sale.id}`} className="text-xs text-amber-600 hover:underline truncate block">
              {conversation.sale.title}
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-28">
        {messages.length === 0 && (
          <p className="text-center text-warm-400 text-sm py-8">No messages yet. Send one below.</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender.id === user.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-snug ${
                  isMine
                    ? 'bg-amber-600 text-white rounded-br-sm'
                    : 'bg-white text-warm-900 border border-warm-200 rounded-bl-sm'
                }`}
              >
                {msg.body}
                <div className={`text-[10px] mt-1 ${isMine ? 'text-amber-200' : 'text-warm-400'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 p-3 pb-safe flex gap-2 items-end z-20"
      >
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) sendMutation.mutate(body.trim());
            }
          }}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none rounded-xl border border-warm-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-warm-50 max-h-28 overflow-y-auto"
        />
        <button
          type="submit"
          disabled={!body.trim() || sendMutation.isPending}
          className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-amber-700 transition-colors flex-shrink-0"
          aria-label="Send message"
        >
          {sendMutation.isPending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
};

export default MessageThreadPage;
