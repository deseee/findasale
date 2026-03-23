/**
 * CA7: Expanded FAQ Page
 * Shopper + Organizer tabs, comprehensive Q&As.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const shopperFAQs: FAQItem[] = [
  {
    question: 'How do I find sales near me?',
    answer: (
      <>
        Open the FindA.Sale app and use the map or search feature. Sales are sorted by proximity to
        your location by default. You can also filter by sale type (regular or auction), date range,
        or search for specific items or locations. Follow your favorite organizers to get notified
        when they post new sales.
      </>
    ),
  },
  {
    question: 'How do I search for specific items?',
    answer: (
      <>
        Use the search bar to type what you're looking for — "vintage lamps," "oak furniture," "china dinnerware," etc.
        Results show all matching items across current and upcoming sales in your area. Browse by
        category or use tags to narrow results further.
      </>
    ),
  },
  {
    question: 'How does bidding on auction items work?',
    answer: (
      <>
        In an auction sale, items go to the highest bidder. Place a bid, and if someone outbids you,
        you'll receive a notification. Bidding continues until the auction end time — the highest bid
        at closing wins. Auction end times are clearly marked so you always know the deadline.
      </>
    ),
  },
  {
    question: 'What is a Hold or Reservation?',
    answer: (
      <>
        A hold lets you request that an item be set aside for you until the sale opens. The organizer
        can accept or decline your request. Holds are useful for high-value or popular items you want
        to secure before opening day. Accepted holds are marked on the item listing.
      </>
    ),
  },
  {
    question: 'How do I complete a purchase?',
    answer: (
      <>
        Click <strong>Buy Now</strong> on any item, review your order, and complete checkout with your
        card via Stripe. Once payment goes through, the item is marked sold and you'll receive a
        confirmation. Coordinate pickup directly with the organizer — their contact info is on the sale page.
      </>
    ),
  },
  {
    question: 'What payment methods are accepted?',
    answer: (
      <>
        FindA.Sale accepts all major credit and debit cards (Visa, Mastercard, American Express,
        Discover) through Stripe. We do not accept cash, checks, or other payment methods through
        the platform.
      </>
    ),
  },
  {
    question: 'What is Hunt Pass and how do I earn points?',
    answer: (
      <>
        Hunt Pass is our loyalty rewards program. Every purchase earns points based on your spending.
        Accumulate points to unlock discounts on future purchases. View your balance and redemption
        options in <strong>Account → Hunt Pass</strong>.
      </>
    ),
  },
  {
    question: 'How do I follow an organizer?',
    answer: (
      <>
        On any sale detail page, click <strong>Follow</strong> to stay connected to that organizer.
        You'll receive notifications when they create new sales, and their listings appear first in
        your search results. Manage followed organizers in your account preferences.
      </>
    ),
  },
  {
    question: 'How do push notifications work?',
    answer: (
      <>
        Enable notifications in your account settings to get alerted when sales you're watching are
        about to start, when popular items are running low, or when organizers you follow post new
        sales. Toggle notifications on or off at any time, or customize which types of alerts you receive.
      </>
    ),
  },
  {
    question: 'What is the return and refund policy?',
    answer: (
      <>
        Estate sale items are generally sold as-is. If an item arrives damaged or doesn't match its
        description, contact the organizer immediately with photos. The organizer may offer a refund
        at their discretion. If you can't resolve the issue, contact{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">our support team</Link> for assistance.
        All refunds are returned to your original payment method.
      </>
    ),
  },
  {
    question: 'How do I contact an organizer?',
    answer: (
      <>
        Click the organizer's name on the sale page to open their profile, then click <strong>Message</strong> to
        send a direct message. Most organizers respond within a few hours.
      </>
    ),
  },
  {
    question: 'How do I report a problem with an item?',
    answer: (
      <>
        Contact the organizer directly through the messaging system with photos of the issue. If the
        organizer doesn't respond, reach out to{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">FindA.Sale support</Link> and
        we'll help mediate.
      </>
    ),
  },
];

const organizerFAQs: FAQItem[] = [
  {
    question: 'How does buying work for shoppers?',
    answer: (
      <>
        Shoppers browse estate sales on the{' '}
        <Link href="/" className="text-amber-600 hover:underline">homepage</Link> or map,
        click into any sale to see items, then click <strong>Buy Now</strong> and complete checkout
        via Stripe. Once paid, the item is marked sold and they receive a confirmation. They coordinate
        pickup directly with you.
      </>
    ),
  },
  {
    question: 'How do I get paid?',
    answer: (
      <>
        Organizers receive payouts via <strong>Stripe Connect</strong>. Before your sale goes live,
        visit your <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link> and
        click <strong>Setup Payments</strong> to complete Stripe onboarding. Once verified, your share
        of each completed sale is deposited to your bank account within 2 business days.
      </>
    ),
  },
  {
    question: 'What is the platform fee?',
    answer: (
      <>
        FindA.Sale charges a <strong>10% flat platform fee</strong> on each completed purchase, regardless of sale
        type (fixed-price or auction). The fee is shown transparently in the checkout modal before the buyer
        confirms payment.
      </>
    ),
  },
  {
    question: 'Can I edit my sale or items after going live?',
    answer: (
      <>
        Yes. Visit your <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link>,
        click a sale, then click <strong>Edit</strong> to update pricing, descriptions, photos, tags,
        and more. You can edit at any time — before, during, or after the sale.
      </>
    ),
  },
  {
    question: 'How does the AI auto-tagging work?',
    answer: (
      <>
        After you upload a photo, our AI analyzes the image and suggests
        a title, description, category, and tags. You review each suggestion and apply, edit, or dismiss
        as you see fit. The AI saves time on the first draft — you stay in control of the final listing.
      </>
    ),
  },
  {
    question: 'How do I run an auction sale?',
    answer: (
      <>
        When creating your sale, enable the <strong>Auction</strong> option. Then, for each item you
        want to auction, mark it as an auction item and set a starting bid. Bidding is live — shoppers
        see real-time bids. At the end time you set, the highest bidder wins and payment is processed
        automatically. The standard 10% platform fee applies.
      </>
    ),
  },
  {
    question: 'What is a QR code and how do I use it?',
    answer: (
      <>
        Every sale gets a unique QR code linking directly to its page. Find it under <strong>Share</strong> on
        your sale detail page. Print it on posters, flyers, or lawn signs. When shoppers scan it with
        their phone camera, they're taken straight to your sale. You can also share the QR image on
        social media for digital promotion.
      </>
    ),
  },
  {
    question: 'Can I connect FindA.Sale to Zapier or other apps?',
    answer: (
      <>
        Yes. Go to <strong>Settings → Integrations → Webhooks</strong> and add your Zapier webhook URL.
        Select which events should trigger your Zap (purchase completed, sale published, auction won, etc.).
        Use Zapier to log sales to Google Sheets, send emails, post to Facebook, and more. See the full
        guide on your{' '}
        <Link href="/organizer/webhooks" className="text-amber-600 hover:underline">Webhooks settings page</Link>.
      </>
    ),
  },
  {
    question: 'Do you offer refunds to shoppers?',
    answer: (
      <>
        All sales are final once payment is completed. If there's a genuine issue (item not as described,
        damage, etc.), the organizer can issue a refund through their Stripe dashboard. Our support team
        can also help mediate disputes — contact us at{' '}
        <Link href="/contact" className="text-amber-600 hover:underline">support@finda.sale</Link>.
      </>
    ),
  },
  {
    question: 'How do I export my inventory?',
    answer: (
      <>
        From your sale dashboard, click <strong>Export</strong> to download a CSV of your full inventory.
        The file includes titles, descriptions, prices, categories, tags, and sold status — useful for
        accounting, record-keeping, or import into other systems.
      </>
    ),
  },
];

interface FAQAccordionProps {
  faqs: FAQItem[];
}

const FAQAccordion = ({ faqs }: FAQAccordionProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
        >
          <button
            onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-inset"
            aria-expanded={expandedIndex === index}
          >
            <p className="text-left text-base font-semibold text-warm-900 dark:text-warm-100">{faq.question}</p>
            <span
              className={`ml-4 text-warm-500 dark:text-warm-400 transform transition-transform flex-shrink-0 ${
                expandedIndex === index ? 'rotate-180' : ''
              }`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {expandedIndex === index && (
            <div className="px-6 py-4 bg-warm-50 dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 text-warm-700 dark:text-warm-300 leading-relaxed text-sm">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

type Tab = 'shopper' | 'organizer';

const FAQPage = () => {
  const [tab, setTab] = useState<Tab>('shopper');

  return (
    <>
      <Head>
        <title>FAQ – FindA.Sale</title>
        <meta name="description" content="Frequently asked questions about buying and selling on FindA.Sale \u2014 the estate sale marketplace." />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Frequently Asked Questions</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-8">Find answers for shoppers and organizers below.</p>

          {/* Tab switcher */}
          <div className="flex border-b border-warm-200 dark:border-gray-700 mb-8">
            <button
              onClick={() => setTab('shopper')}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === 'shopper'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-800'
              }`}
            >
              For Shoppers
            </button>
            <button
              onClick={() => setTab('organizer')}
              className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === 'organizer'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-warm-500 dark:text-warm-400 hover:text-warm-800'
              }`}
            >
              For Organizers
            </button>
          </div>

          {tab === 'shopper' ? (
            <FAQAccordion faqs={shopperFAQs} />
          ) : (
            <FAQAccordion faqs={organizerFAQs} />
          )}

          {/* Bottom help prompt */}
          <div className="mt-10 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-warm-700 dark:text-warm-300">
            {tab === 'organizer' ? (
              <>
                Looking for the full walkthrough?{' '}
                <Link href="/guide" className="text-amber-600 hover:underline font-medium">Read the Organizer Guide →</Link>
              </>
            ) : (
              <>
                Still have questions?{' '}
                <Link href="/contact" className="text-amber-600 hover:underline font-medium">Contact our support team →</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FAQPage;
