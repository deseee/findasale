import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Sale {
  id: string;
  title: string;
  saleType?: string;
  startDate: string;
  status: string;
  city?: string;
  state?: string;
}

const PlanPage = () => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || 'your state';
  const { user, isLoading: authLoading } = useAuth();

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['plan-sales'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/sales');
      return res.data;
    },
    enabled: !!user?.id && user.roles?.includes('ORGANIZER'),
  });

  const sales = salesData || [];

  // Filter to PUBLISHED, UPCOMING, and DRAFT only (most recent first)
  const activeSales = sales
    .filter(s => ['PUBLISHED', 'UPCOMING', 'DRAFT'].includes(s.status))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const mostRecentActiveSale = activeSales[0] || null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  // Scroll to top on page load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const starterPrompts = [
    'Where do I start planning a sale?',
    'How do I price items for my sale?',
    `What are ${defaultState} sale laws and regulations?`,
    'How do I handle unsold items after the sale?',
  ];

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setError(null);
    setIsLoadingChat(true);

    try {
      const response = await api.post('/planner/chat', {
        messages: [
          ...messages,
          userMessage,
        ].map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      const data = response.data;
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMsg);
      console.error('Chat error:', err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleSend = () => {
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOrganizer = !authLoading && user?.roles?.includes('ORGANIZER');

  return (
    <>
      <Head>
        <title>Planning Assistant | FindA.Sale</title>
        <meta
          name="description"
          content="Get expert planning advice for your sale"
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col">
        {/* Header with breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-4">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 text-sm">
                ← Dashboard
              </Link>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Planning Assistant</h1>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-grow flex flex-col">
          <div className="flex-grow flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
            {/* Progress Tracker CTA */}
            {!authLoading && isOrganizer && mostRecentActiveSale && (
              <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Track your sale progress</p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">View 6 stages and 40+ tasks to complete</p>
                  </div>
                  <Link
                    href={`/organizer/plan/${mostRecentActiveSale.id}`}
                    className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white text-sm font-medium rounded transition-colors flex-shrink-0"
                  >
                    Open Planner →
                  </Link>
                </div>
              </div>
            )}

            {/* Messages list */}
            <div className="flex-grow overflow-y-auto mb-6 space-y-4 min-h-96">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-warm-600 dark:text-warm-400 mb-6 text-lg">
                      Ask anything about planning your sale. We're here to help!
                    </p>

                    {/* Starter prompts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          disabled={isLoadingChat}
                          className="px-4 py-3 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left border border-warm-300 dark:border-gray-600"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs sm:max-w-md lg:max-w-lg px-4 py-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 rounded-br-none'
                          : 'bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 text-warm-900 dark:text-warm-100 rounded-bl-none'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-start gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-sage-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                            A
                          </div>
                          <span className="text-xs text-warm-500 dark:text-warm-400 font-medium">Assistant</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {isLoadingChat && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 px-4 py-3 rounded-lg rounded-bl-none">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-sage-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          A
                        </div>
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce"></span>
                          <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                          <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex justify-center">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm max-w-xs">
                      {error}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-warm-200 dark:border-gray-700 pt-4 mt-auto">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoadingChat}
                    placeholder="Ask about your sale..."
                    className="flex-grow px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-500 disabled:bg-warm-50 text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoadingChat || !inputValue.trim()}
                    className="px-6 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg font-medium transition-colors disabled:bg-warm-300 disabled:cursor-not-allowed text-sm"
                  >
                    Send
                  </button>
                </div>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                  You can send up to 20 messages per session
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="bg-warm-50 dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 py-6">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <p className="text-warm-700 dark:text-warm-300 mb-3">
              Ready to list your sale?{' '}
              <Link href="/guide" className="text-sage-600 hover:text-sage-700 font-medium underline">
                Read the organizer guide →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PlanPage;
