'use client';

import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface CrawlerStats {
  totalThisWeek: number;
  byBot: Record<string, number>;
  topSaleId: string | null;
}

const BOT_DISPLAY_NAMES: Record<string, string> = {
  GPTBot: 'OpenAI Search',
  'OAI-SearchBot': 'OpenAI Search',
  ClaudeBot: 'Anthropic',
  'Claude-Web': 'Anthropic',
  PerplexityBot: 'Perplexity',
  GoogleBot: 'Google',
  Googlebot: 'Google',
  BingBot: 'Microsoft',
  bingbot: 'Microsoft',
  Bytespider: 'ByteDance',
};

function friendlyBotName(raw: string): string {
  return BOT_DISPLAY_NAMES[raw] ?? raw;
}

/** Merge duplicate friendly names (e.g. GPTBot + OAI-SearchBot both → "OpenAI Search") */
function mergeByBot(byBot: Record<string, number>): Array<{ name: string; count: number }> {
  const merged: Record<string, number> = {};
  for (const [raw, count] of Object.entries(byBot)) {
    const friendly = friendlyBotName(raw);
    merged[friendly] = (merged[friendly] ?? 0) + count;
  }
  return Object.entries(merged)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export default function SmartSearchViewsCard() {
  const [stats, setStats] = useState<CrawlerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<CrawlerStats>('/crawler-stats/organizer')
      .then((res) => {
        setStats(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-5 animate-pulse">
        <div className="h-4 w-40 bg-amber-200 dark:bg-amber-700 rounded mb-3" />
        <div className="h-10 w-16 bg-amber-200 dark:bg-amber-700 rounded mb-2" />
        <div className="h-3 w-56 bg-amber-100 dark:bg-amber-800 rounded" />
      </div>
    );
  }

  if (error) return null;

  const total = stats?.totalThisWeek ?? 0;
  const topBots = stats?.byBot ? mergeByBot(stats.byBot) : [];

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-600 dark:text-amber-400 text-lg" aria-hidden="true">🔍</span>
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
          Search Engine Visibility
        </h3>
      </div>

      {total === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
          No search engine views yet. Your sales will appear in results as you publish more.
        </p>
      ) : (
        <>
          {/* Big number */}
          <div className="mb-1">
            <span className="text-4xl font-bold text-amber-900 dark:text-amber-100">{total.toLocaleString()}</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
            Smart search assistants have viewed your sales this week
          </p>

          {/* Bot breakdown */}
          {topBots.length > 0 && (
            <div className="space-y-1.5">
              {topBots.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-amber-800 dark:text-amber-200 font-medium">{name}</span>
                  <span className="text-amber-600 dark:text-amber-400 tabular-nums">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
