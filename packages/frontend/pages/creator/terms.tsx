/**
 * Creator Program terms (2026-09-29).
 *
 * DRAFT COPY: the commission, hold, reversal, payout, tax and disclosure wording below needs legal
 * review before launch. Numbers come from lib/creatorProgram.ts (mirror of the backend config).
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { CREATOR_PROGRAM_DISPLAY as P } from '../../lib/creatorProgram';

const h2 = 'text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4';
const p = 'text-warm-700 dark:text-warm-300 leading-relaxed mb-4';
const li = 'text-warm-700 dark:text-warm-300 leading-relaxed';

const CreatorTermsPage = () => (
  <>
    <Head>
      <title>Creator Program Terms | FindA.Sale</title>
      <meta
        name="description"
        content="Terms for the FindA.Sale Creator Program: how affiliate links work, how commission is calculated, the hold period, reversals, and payouts."
      />
      <link rel="canonical" href="https://finda.sale/creator/terms" />
    </Head>
    <div className="min-h-screen bg-white dark:bg-gray-800">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Creator Program Terms</h1>
        <p className="text-warm-500 dark:text-warm-400 mb-10">Version {P.TERMS_VERSION}</p>

        <p className={`${p} mb-8`}>
          The Creator Program lets you share links to public sales on FindA.Sale and earn a commission when a
          shopper you send buys something. By joining you agree to these terms.
        </p>

        <section className="mb-8">
          <h2 className={h2}>1. Who can join</h2>
          <p className={p}>
            You need a FindA.Sale account with a verified email address. Joining is free and you can leave at any
            time from your creator dashboard settings or by contacting support.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>2. How it works</h2>
          <p className={p}>
            You generate a link for a public sale from your creator dashboard. When someone follows your link, we
            remember it on their device for {P.ATTRIBUTION_WINDOW_DAYS} days. If they buy an item from that sale
            within that time, the purchase is credited to you. If they follow more than one creator link, the most
            recent one gets the credit.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>3. Commission</h2>
          <p className={p}>
            You earn {P.COMMISSION_RATE_PERCENT}% of the platform fee FindA.Sale collects on a credited purchase,
            rounded down to the nearest cent. The commission is based on our fee, not on the item price, and does
            not reduce what the organizer or the shopper pays. Purchases that carry no platform fee earn no
            commission.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>4. Hold period and reversals</h2>
          <p className={p}>
            Each commission is held for {P.HOLD_DAYS} days after the purchase and shows as pending on your
            dashboard. It becomes approved when the hold ends. A commission is reversed, and shows as reversed, if
            the purchase is refunded, disputed, charged back, or fails.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>5. Payouts</h2>
          <p className={p}>
            Approved commissions are reviewed and paid by FindA.Sale. Payouts are not automatic, and we may ask you
            to connect a payout account or provide tax information first. Your dashboard shows what is pending,
            approved, paid, and reversed.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>6. Rules</h2>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li className={li}>No buying through your own link, and no links for sales you organize.</li>
            <li className={li}>
              No self-referral through other accounts, shared devices, or the same payment card or email.
            </li>
            <li className={li}>No fake or automated clicks, and no paying or rewarding people to click.</li>
            <li className={li}>
              No misleading claims about sales, items, prices, or FindA.Sale. Do not imply you run the sale.
            </li>
            <li className={li}>
              Tell your audience when a link is an affiliate link, in plain words near the link, for example
              &quot;affiliate link, I may earn a commission&quot;.
            </li>
          </ul>
          <p className={p}>
            Clicks and purchases that break these rules earn nothing, and we may reverse commissions and suspend
            your creator access.
          </p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>7. Taxes</h2>
          <p className={p}>You are responsible for any taxes on what you earn.</p>
        </section>

        <section className="mb-8">
          <h2 className={h2}>8. Changes and ending the program</h2>
          <p className={p}>
            We may change these terms, the commission rate, or the hold period, or end the program. When the terms
            change we will ask you to review and accept the new version. Changes apply to purchases made after the
            change.
          </p>
        </section>

        <section className="mb-10">
          <h2 className={h2}>9. Questions</h2>
          <p className={p}>
            Email{' '}
            <a href="mailto:support@finda.sale" className="text-amber-700 dark:text-amber-400 underline">
              support@finda.sale
            </a>
            .
          </p>
        </section>

        <Link
          href="/creator/join"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg"
        >
          Join the Creator Program
        </Link>
      </div>
    </div>
  </>
);

export default CreatorTermsPage;
