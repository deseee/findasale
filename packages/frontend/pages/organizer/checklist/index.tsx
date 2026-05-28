/**
 * Sale Launch Checklist — Feature #148
 *
 * Interactive pre-launch checklist for organizers.
 * Local state only — no DB persistence required.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import { useRouter } from 'next/router';

interface ChecklistItem {
  id: string;
  label: string;
}

interface ChecklistSection {
  title: string;
  emoji: string;
  items: ChecklistItem[];
}

const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    title: 'Before You Publish',
    emoji: '📋',
    items: [
      { id: 'bp-1', label: 'Add photos to all items' },
      { id: 'bp-2', label: 'Set prices on all items' },
      { id: 'bp-3', label: 'Write a sale description (dates, hours, parking, directions)' },
      { id: 'bp-4', label: 'Set your sale dates and hours' },
      { id: 'bp-5', label: 'Enable holds if you are accepting them' },
    ],
  },
  {
    title: 'Day Before',
    emoji: '📅',
    items: [
      { id: 'db-1', label: 'Share your sale link on social media (Facebook, Nextdoor, neighborhood groups)' },
      { id: 'db-2', label: 'Send an email to past customers' },
      { id: 'db-3', label: 'Confirm your address is correct on the sale page' },
    ],
  },
  {
    title: 'Day Of',
    emoji: '🏷️',
    items: [
      { id: 'do-1', label: 'Open on time' },
      { id: 'do-2', label: 'Have change ready for cash sales ($100–$200 in small bills)' },
      { id: 'do-3', label: 'Check your FindA.Sale dashboard for incoming holds and RSVPs' },
    ],
  },
  {
    title: 'Wrap Up',
    emoji: '✅',
    items: [
      { id: 'wu-1', label: 'Mark sold items as sold' },
      { id: 'wu-2', label: 'Settle any outstanding holds' },
      { id: 'wu-3', label: 'Download your CSV report' },
      { id: 'wu-4', label: 'Leave the sale as ENDED (not deleted) to preserve SEO' },
    ],
  },
];

function buildInitialState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  CHECKLIST_SECTIONS.forEach((section) => {
    section.items.forEach((item) => {
      state[item.id] = false;
    });
  });
  return state;
}

export default function ChecklistPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>(buildInitialState);

  // Auth guard — after all hooks
  if (!authLoading && (!user || !(user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER' || user.role === 'ADMIN'))) {
    router.push('/login');
    return null;
  }

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetAll = () => {
    setChecked(buildInitialState());
  };

  const totalItems = CHECKLIST_SECTIONS.reduce((sum, s) => sum + s.items.length, 0);
  const completedCount = Object.values(checked).filter(Boolean).length;
  const progressPct = Math.round((completedCount / totalItems) * 100);

  return (
    <>
      <Head>
        <title>Sale Launch Checklist — FindA.Sale</title>
        <meta
          name="description"
          content="A step-by-step pre-launch checklist to help organizers run a great sale."
        />
      </Head>

      <div className="min-h-screen bg-amber-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Back link */}
          <div className="mb-6">
            <Link
              href="/organizer/dashboard"
              className="text-amber-600 hover:underline text-sm font-medium"
            >
              ← Back to dashboard
            </Link>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Sale Launch Checklist
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Work through these steps before and during your sale for the best results.
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {completedCount} of {totalItems} complete
              </span>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {progressPct}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {CHECKLIST_SECTIONS.map((section) => {
              const sectionDone = section.items.every((item) => checked[item.id]);
              return (
                <div
                  key={section.title}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <div
                    className={`px-5 py-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 ${
                      sectionDone
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : 'bg-gray-50 dark:bg-gray-800/60'
                    }`}
                  >
                    <span className="text-lg" aria-hidden="true">{section.emoji}</span>
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                      {section.title}
                    </h2>
                    {sectionDone && (
                      <span className="ml-auto text-xs font-medium text-green-600 dark:text-green-400">
                        Done
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <label
                          className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-amber-50 dark:hover:bg-gray-700/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked[item.id] ?? false}
                            onChange={() => toggle(item.id)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-400 focus:ring-offset-0 cursor-pointer accent-amber-500"
                          />
                          <span
                            className={`text-sm ${
                              checked[item.id]
                                ? 'line-through text-gray-400 dark:text-gray-500'
                                : 'text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {item.label}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a
              href="/downloads/sale-starter-kit.pdf"
              download="FindASale-StarterKit.pdf"
              className="inline-flex items-center justify-center gap-2 border border-amber-600 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Checklist PDF
            </a>
            <button
              onClick={resetAll}
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm"
            >
              Reset all
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
