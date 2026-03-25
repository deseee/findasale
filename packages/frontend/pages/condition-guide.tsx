import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import ConditionBadge, { CONDITION_COLORS } from '../components/ConditionBadge';

const ConditionGuide: React.FC = () => {
  const conditions = [
    {
      key: 'excellent',
      name: 'Excellent',
      description:
        'Like new. No signs of wear or use. May still have original packaging. Priced near retail.',
      examples: ['New in box items', 'Rarely used vintage collectibles', 'Display pieces in perfect condition'],
      priceRange: '80-100% of retail',
    },
    {
      key: 'good',
      name: 'Good',
      description:
        'Minor signs of use. Fully functional. Small cosmetic imperfections that don\'t affect use.',
      examples: ['Gently used furniture', 'Dishes without chips', 'Electronics in working order'],
      priceRange: '50-75% of retail',
    },
    {
      key: 'fair',
      name: 'Fair',
      description:
        'Visible wear or age. Fully functional. Noticeable cosmetic issues (scratches, fading, patina).',
      examples: ['Well-loved vintage items', 'Furniture with minor scuffs', 'Books with reading wear'],
      priceRange: '25-50% of retail',
    },
    {
      key: 'poor',
      name: 'Poor',
      description: 'Heavy wear, damage, or missing parts. May need repair. For parts or restoration projects.',
      examples: [
        'Chipped or cracked ceramics',
        'Furniture needing reupholstering',
        'Electronics with cosmetic damage',
      ],
      priceRange: '10-25% of retail',
    },
    {
      key: 'as-is',
      name: 'As-Is',
      description: 'Sold in current condition without warranty or implied fitness. May not function. Inspect before purchasing.',
      examples: ['Unknown condition electronics', 'Untested vintage items', 'Items sold as found'],
      priceRange: 'Negotiable / Lowest price',
    },
  ];

  const faqs = [
    {
      question: 'Who decides the condition?',
      answer:
        'The estate sale organizer or item seller sets the condition rating based on their professional assessment. You can always contact them with questions about a specific item\'s condition.',
    },
    {
      question: 'Can I dispute a condition rating?',
      answer:
        'If you believe an item\'s condition is misrepresented, contact the organizer directly through the item\'s listing. They may provide additional photos or details to clarify.',
    },
    {
      question: 'What if an item arrives in worse condition than listed?',
      answer:
        'Check the organizer\'s return and refund policy on their profile. Most provide a grace period for inspection after pickup or delivery. Contact them immediately with photos if there\'s a significant discrepancy.',
    },
    {
      question: 'Does "Good" mean it\'s actually good?',
      answer:
        'Yes. "Good" condition items are fully functional and safe to use. Any significant flaws are noted in the item description. Check the photos and full description for details.',
    },
    {
      question: 'Are "Fair" condition items worth buying?',
      answer:
        'Absolutely! Fair condition items can be excellent finds for budget shoppers, collectors, or people restoring/upcycling items. The lower price reflects cosmetic wear, not safety concerns.',
    },
  ];

  return (
    <>
      <Head>
        <title>Item Condition Guide - FindA.Sale</title>
        <meta
          name="description"
          content="Learn about FindA.Sale item condition ratings: Excellent, Good, Fair, Poor, and As-Is. Understand what each rating means and typical price ranges."
        />
        <meta property="og:title" content="Item Condition Guide - FindA.Sale" />
        <meta
          property="og:description"
          content="Understand item condition ratings and price ranges at FindA.Sale estate sales and auctions."
        />
      </Head>

      <main className="bg-warm-50 dark:bg-gray-900 py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-warm-900 dark:text-warm-100 mb-3">Item Condition Guide</h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">Understanding FindA.Sale condition ratings</p>
          </div>

          {/* Condition Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
            {conditions.map((condition) => {
              const colorConfig = CONDITION_COLORS[condition.key];
              return (
                <div
                  key={condition.key}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden flex flex-col"
                >
                  {/* Color stripe */}
                  <div className={`h-2 ${colorConfig.bg}`} />

                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    {/* Badge */}
                    <div className="mb-3 flex justify-center">
                      <ConditionBadge condition={condition.key} size="md" />
                    </div>

                    {/* Name */}
                    <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 text-center mb-2">{condition.name}</h2>

                    {/* Description */}
                    <p className="text-sm text-warm-700 dark:text-warm-300 mb-4 flex-1">{condition.description}</p>

                    {/* Examples */}
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold text-warm-600 dark:text-warm-400 uppercase mb-2">Common Examples:</h3>
                      <ul className="text-xs text-warm-600 dark:text-warm-400 space-y-1">
                        {condition.examples.map((example, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-600 mt-0.5">•</span>
                            <span>{example}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Price range */}
                    <div className="bg-warm-50 dark:bg-gray-900 rounded px-3 py-2 text-center">
                      <p className="text-xs text-warm-600 dark:text-warm-400">Typical Price Range</p>
                      <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{condition.priceRange}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FAQ Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-12">
            <div className="bg-gradient-to-r from-amber-50 to-warm-50 px-6 md:px-8 py-8">
              <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Frequently Asked Questions</h2>
              <p className="text-warm-600 dark:text-warm-400">Common questions about item conditions</p>
            </div>

            <div className="divide-y divide-warm-200">
              {faqs.map((faq, idx) => (
                <details
                  key={idx}
                  className="group px-6 md:px-8 py-4 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition-colors cursor-pointer"
                >
                  <summary className="font-semibold text-warm-900 dark:text-warm-100 flex items-center justify-between text-base">
                    {faq.question}
                    <span className="ml-2 text-amber-600 group-open:rotate-180 transition-transform">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </span>
                  </summary>
                  <p className="text-warm-700 dark:text-warm-300 mt-4">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-r from-amber-50 to-warm-50 rounded-lg shadow-md p-8 text-center">
            <h3 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">Ready to browse items?</h3>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Use these condition ratings to find the perfect items for your collection or budget.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/items"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Browse Items
              </Link>
              <Link
                href="/"
                className="inline-block bg-white dark:bg-gray-800 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 text-warm-900 dark:text-warm-100 border border-warm-300 dark:border-gray-600 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default ConditionGuide;
