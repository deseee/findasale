/**
 * Sale Day Starter Kit — Feature #396
 *
 * Downloadable/printable guide for organizers:
 * pre-sale checklist, pricing tips, day-of runbook, and post-sale steps.
 * No backend required — static page with print CSS + PDF download.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useRouter } from 'next/router';

const PRE_SALE_CHECKLIST = [
  'Photograph all key items (aim for 3+ photos each)',
  'Create your sale on FindA.Sale and publish the listing',
  'Enable Sneak Peek — publish 48 hours early so followers get first look',
  'Connect Stripe to accept card payments at checkout',
  'Share your sale link on Facebook, Nextdoor, and neighborhood groups',
  'Print QR code signs and place them around your sale location',
  'Set prices on all items — use round numbers for speed',
  'Arrange items by category so shoppers can browse easily',
  'Prepare cash for making change ($100–$200 in small bills)',
  "Charge your phone overnight — you'll need it all day",
  'Send a morning-of update to your followers via FindA.Sale',
];

const PRICING_TIPS = [
  { bold: 'Research eBay sold listings', detail: "Search eBay for your item → filter by \"Sold\" to see what people actually paid, not asking prices." },
  { bold: 'Price for a quick sale, not retail', detail: '25–50% of retail is the sweet spot. People come for deals — honor that expectation.' },
  { bold: 'Use round numbers', detail: '$5, $10, $25 makes checkout fast and avoids coin-hunting delays.' },
  { bold: 'Bundle deals boost revenue', detail: 'Group small items in a "fill a bag for $5" bin to clear clutter and move volume.' },
  { bold: 'Let Markdown Cycles do the work', detail: "Turn on automatic Day 2 markdowns in your FindA.Sale settings — no manual repricing needed." },
];

const DAYOF_RUNBOOK = [
  { time: '6:00 AM', step: 'Arrive 90 min before open. Set up tables, signs, and QR codes.' },
  { time: '7:00 AM', step: 'Final price check — every item needs a tag or sticker.' },
  { time: '7:30 AM', step: 'Open your FindA.Sale dashboard. Mark your sale as live if not already.' },
  { time: '8:00 AM', step: 'Doors open. Greet shoppers and direct them to high-value items.' },
  { time: 'Ongoing', step: 'Use the POS tab to mark items sold and accept card payments.' },
  { time: 'Midday', step: 'Consolidate sparse tables — a full table feels like better deals.' },
  { time: '1 Hour Out', step: 'Enable holds for hot items. Announce closing-time markdowns on social.' },
  { time: 'Close', step: 'Mark remaining items sold, archived, or carry-over. Run your earnings report.' },
];

const POST_SALE = [
  { bold: 'Run the Settlement Wizard', detail: 'Dashboard → Settlement → generate a full earnings breakdown by category.' },
  { bold: 'Generate a donation receipt', detail: 'For unsold items, use the Donation Receipt tool to produce a tax-ready document.' },
  { bold: 'Export to QuickBooks', detail: 'Download your sales CSV and import directly into QuickBooks for clean bookkeeping.' },
  { bold: 'Ask for a review', detail: 'Send a follow-up to your attendees — great reviews bring more shoppers to your next sale.' },
];

export default function StarterKitPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Head>
        <title>Sale Day Starter Kit — FindA.Sale</title>
        <meta
          name="description"
          content="Your complete sale day guide — checklist, pricing tips, day-of rundown, and post-sale steps."
        />
        <style>{`
          @media print {
            nav, header, footer, .no-print { display: none !important; }
            body { font-size: 12pt; color: #000; background: #fff; }
            .print-page { padding: 0; }
            .section-card { break-inside: avoid; border: 1px solid #e5e7eb; margin-bottom: 1rem; }
            a { color: inherit; text-decoration: none; }
          }
        `}</style>
      </Head>

      <div className="min-h-screen bg-amber-50 dark:bg-gray-900 print-page">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="no-print flex items-center justify-between mb-8">
            <Link
              href="/organizer/dashboard"
              className="text-amber-600 hover:underline text-sm font-medium"
            >
              ← Back to dashboard
            </Link>
            <div className="flex items-center gap-3">
              <a
                href="/downloads/sale-starter-kit.pdf"
                download="FindASale-StarterKit.pdf"
                className="border border-amber-600 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download PDF
              </a>
              <button
                onClick={handlePrint}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print
              </button>
            </div>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Sale Day Starter Kit
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-lg">
              Your complete guide — checklist, pricing tips, day-of rundown, and post-sale steps.
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-sm mt-1 font-medium">
              finda.sale
            </p>
          </div>

          {/* Section 1: Pre-Sale Checklist */}
          <div className="section-card bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-amber-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">✅</span>
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                Pre-Sale Checklist
              </h2>
            </div>
            <ul className="space-y-3">
              {PRE_SALE_CHECKLIST.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-amber-400 dark:border-amber-500 inline-block" aria-hidden="true" />
                  <span className="text-warm-800 dark:text-warm-200 text-sm leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Section 2: Pricing Tips */}
          <div className="section-card bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-amber-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">💰</span>
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                Pricing Tips
              </h2>
            </div>
            <ol className="space-y-4">
              {PRICING_TIPS.map(({ bold, detail }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-warm-800 dark:text-warm-200 text-sm leading-relaxed">
                    <strong>{bold}</strong> — {detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Section 3: Day-Of Rundown */}
          <div className="section-card bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-amber-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">📋</span>
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                Day-Of Rundown
              </h2>
            </div>
            <div className="space-y-3">
              {DAYOF_RUNBOOK.map(({ time, step }, i) => (
                <div key={i} className="flex items-start gap-4">
                  <span className="flex-shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400 w-20 pt-0.5 text-right">
                    {time}
                  </span>
                  <div className="flex-1 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500" />
                    <span className="text-warm-800 dark:text-warm-200 text-sm leading-relaxed">
                      {step}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Post-Sale */}
          <div className="section-card bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-amber-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🏁</span>
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                Post-Sale
              </h2>
            </div>
            <ol className="space-y-4">
              {POST_SALE.map(({ bold, detail }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-warm-800 dark:text-warm-200 text-sm leading-relaxed">
                    <strong>{bold}</strong> — {detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Footer */}
          <div className="text-center py-6 text-warm-500 dark:text-warm-500 text-xs no-print">
            <p>
              Questions?{' '}
              <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">
                Back to your dashboard
              </Link>
              {' '}·{' '}
              <Link href="/organizer/print-kit" className="text-amber-600 hover:underline">
                Print Kit
              </Link>
            </p>
          </div>

          {/* Print footer */}
          <div className="hidden print:block text-center mt-8 text-xs text-gray-500">
            <p>FindA.Sale — finda.sale · Printed from your organizer dashboard</p>
          </div>

        </div>
      </div>
    </>
  );
}
