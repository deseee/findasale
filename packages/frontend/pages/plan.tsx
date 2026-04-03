import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import api from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const PlanPage = () => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || 'your state';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    setIsLoading(true);

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
      setIsLoading(false);
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

  return (
    <>
      <Head>
        <title>Sale Planning Assistant | FindA.Sale</title>
        <meta
          name="description"
          content={`Get free guidance from a planning assistant about organizing your sale in ${defaultState}`}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-8">
          <div className="max-w-2xl mx-auto px-4">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Sale Planning Assistant</h1>
            <p className="text-warm-600 dark:text-warm-400 text-lg">
              Free guidance for organizing any type of sale
            </p>
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-grow flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
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
                      disabled={isLoading}
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

            {isLoading && (
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
                disabled={isLoading}
                placeholder="Ask about your sale..."
                className="flex-grow px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-500 disabled:bg-warm-50 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim()}
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
