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
        Browse estate sales on the <Link href="/" className="text-amber-600 hover:underline">homepage</Link> or map.
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
        <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link> and
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
      </>
    ),
  },
  {
    question: 'Can I edit my sale or items after going live?',
    answer: (
      <>
        Yes. Visit your <Link href="/organizer/dashboard" className="text-amber-600 hover:underline">dashboard</Link> and
        click the <strong>Edit</strong> button on your sale card. You can update pricing, descriptions, photos, and more.
      </>
    ),
  },
  {
    question: 'Do you offer refunds?',
    answer: (
      <>
        All sales are final once payment is completed. However, if there's a genuine issue (item not as described,
        damage, etc.), contact the organizer directly through the sale page or reach out to our support team and
        we'll try to help.
      </>
    ),
  },
];

const FAQPage = () => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <>
      <Head>
        <title>FAQ - FindA.Sale</title>
        <meta name="description" content="Frequently asked questions about FindA.Sale" />
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 mb-8">Frequently Asked Questions</h1>
          
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-warm-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-warm-50 focus:outline-none"
                >
                  <p className="text-left text-lg font-semibold text-warm-900">{faq.question}</p>
                  <span
                    className={`ml-4 text-warm-600 transform transition-transform ${
                      expandedIndex === index ? 'rotate-180' : ''
                    }`}
                  >
                    ▼
                  </span>
                </button>
                {expandedIndex === index && (
                  <div className="px-6 py-4 bg-warm-50 border-t border-warm-200 text-warm-700">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default FAQPage;
