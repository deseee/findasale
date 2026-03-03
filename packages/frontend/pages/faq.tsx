import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const faqs: FAQItem[] = [
  {
    question: 'How does buying work?',
    answer: (
      <>
        Browse estate sales on the <Link href="/" className="text-blue-600 hover:underline">homepage</Link> or map.
        Click into any sale to see the items listed for purchase. When you find something you want, click{' '}
        <strong>Buy Now</strong> and complete checkout with your card via Stripe. Once your payment goes through,
        the item is marked sold and you'll receive a confirmation. Coordinate pickup directly with the organizer —
        their contact info is on the sale page.
      </>
    ),
  },
  {
    question: 'How do I get paid as an organizer?',
    answer: (
      <>
        Organizers receive payouts via{' '}
        <strong>Stripe Connect</strong>. Before your sale goes live, visit your{' '}
        <Link href="/organizer/dashboard" className="text-blue-600 hover:underline">dashboard</Link> and
        click <strong>Setup Payments</strong> to complete Stripe onboarding. Once verified, your share
        of each completed sale is deposited to your connected bank account according to Stripe's standard
        payout schedule (typically 2 business days after a charge).
      </>
    ),
  },
  {
    question: 'What is the platform fee?',
    answer: (
      <>
        FindA.Sale charges a small platform fee on each completed purchase to cover payment processing and
        platform maintenance:
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>5%</strong> for regular (fixed-price) sales</li>
          <li><strong>7%</strong> for auction sales</li>
        </ul>
        The fee is shown transparently in the checkout modal before the buyer confirms payment.
        Organizers receive the remainder after Stripe's own processing fee is deducted.
      </>
    ),
  },
  {
    question: 'How do auctions work?',
    answer: (
      <>
        Organizers can mark a sale as an <strong>auction sale</strong> when creating it and set a starting
        bid and bid increment on individual items. Shoppers place bids in real time — the current highest
        bid is always visible. When the auction timer expires, the highest bidder wins and receives a
        notification to complete checkout. If the winning bidder doesn't pay within the allowed window,
        the item may be offered to the next bidder at the organizer's discretion.
      </>
    ),
  },
  {
    question: 'Can I get a refund?',
    answer: (
      <>
        <strong>All sales are final.</strong> Because estate sale items are unique physical goods, we cannot
        offer automatic refunds after a purchase is completed. If you believe you were charged in error or
        have a genuine dispute, please{' '}
        <Link href="/contact" className="text-blue-600 hover:underline">contact support</Link> within 7 days
        of the transaction. We review each case individually. See our{' '}
        <Link href="/terms#refund-policy" className="text-blue-600 hover:underline">Refund Policy</Link> for
        the full details.
      </>
    ),
  },
  {
    question: 'How do I contact support?',
    answer: (
      <>
        The best way to reach us is through the{' '}
        <Link href="/contact" className="text-blue-600 hover:underline">Contact page</Link>. Fill out the form
        and we'll respond by email as quickly as we can, usually within one business day. You can also email
        us directly at{' '}
        <a href="mailto:support@finda.sale" className="text-blue-600 hover:underline">
          support@finda.sale
        </a>.
      </>
    ),
  },
];

const FAQAccordion = ({ question, answer }: FAQItem) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-5 text-left text-gray-900 font-medium hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
        aria-expanded={open}
      >
        <span>{question}</span>
        <svg
          className={`h-5 w-5 text-gray-500 flex-shrink-0 ml-4 transition-transform ${open ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="pb-5 text-gray-700 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};

const FAQPage = () => (
  <div className="min-h-screen bg-gray-50">
    <Head>
      <title>FAQ - FindA.Sale</title>
      <meta name="description" content="Frequently asked questions about FindA.Sale — buying, selling, platform fees, auctions, and refunds." />
    </Head>

    <main className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-3 text-center">Frequently Asked Questions</h1>
        <p className="text-center text-gray-600 mb-10">
          Can't find what you're looking for?{' '}
          <Link href="/contact" className="text-blue-600 hover:underline">
            Contact us
          </Link>
          .
        </p>

        <div className="bg-white rounded-lg shadow-md px-6 divide-y divide-gray-200">
          {faqs.map((faq) => (
            <FAQAccordion key={faq.question} {...faq} />
          ))}
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          Still have questions?{' '}
          <Link href="/contact" className="text-blue-600 hover:underline">
            Send us a message
          </Link>{' '}
          or email{' '}
          <a href="mailto:support@finda.sale" className="text-blue-600 hover:underline">
            support@finda.sale
          </a>
          .
        </div>
      </div>
    </main>
  </div>
);

export default FAQPage;
