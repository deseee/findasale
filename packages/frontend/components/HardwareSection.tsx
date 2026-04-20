import React from 'react';
import Link from 'next/link';

interface Reader {
  id: string;
  name: string;
  icon: string;
  price: number;
  bestFor: string;
  connectivity: string;
  specs: string[];
}

const READERS: Reader[] = [
  {
    id: 's700',
    name: 'Stripe Reader S700',
    icon: '📱',
    price: 299,
    bestFor: 'Estate sales, yard sales, flea markets, and resale shops. The most popular choice — works with any WiFi network.',
    connectivity: 'WiFi',
    specs: [
      '5.5" customer-facing display',
      'Accepts tap, chip, and swipe',
      'No additional setup or cabling',
      '3–5 day delivery from Stripe',
    ],
  },
  {
    id: 's710',
    name: 'Stripe Reader S710',
    icon: '📡',
    price: 299,
    bestFor: 'Outdoor events, flea markets, or venues with spotty WiFi. Adds cellular fallback so you never lose connectivity.',
    connectivity: 'WiFi + Cellular (LTE)',
    specs: [
      'Same 5.5" display as S700',
      'Built-in LTE cellular backup',
      'Falls back automatically if WiFi drops',
      'Same payment types (tap, chip, swipe)',
    ],
  },
];

export default function HardwareSection() {
  return (
    <div className="my-8 py-8 border-t border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Accept Card Payments In Person
        </h3>
        <p className="text-gray-700 dark:text-gray-300">
          For fixed checkout stations or high-volume sales, connect a Stripe Terminal reader to FindA.Sale.
          Set up in minutes — no additional software needed.
        </p>
      </div>

      {/* Reader Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {READERS.map((reader) => (
          <div
            key={reader.id}
            className="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow min-h-96 flex flex-col"
          >
            {/* Price Badge */}
            <div className="absolute top-6 right-6 bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-3 py-1 rounded-full text-sm font-semibold">
              ${reader.price}
            </div>

            {/* Reader Icon & Name */}
            <div className="mb-4 mt-4">
              <span className="text-3xl">{reader.icon}</span>
              <h4 className="font-bold text-lg text-warm-900 dark:text-warm-100 mt-2">
                {reader.name}
              </h4>
            </div>

            {/* Best For Blurb */}
            <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
              {reader.bestFor}
            </p>

            {/* Connectivity Badge */}
            <div className="mb-4 inline-block">
              <span className="bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {reader.connectivity}
              </span>
            </div>

            {/* Key Specs */}
            <div className="mb-auto space-y-2 mb-6">
              {reader.specs.map((spec, idx) => (
                <div key={idx} className="flex items-start">
                  <svg
                    className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-warm-700 dark:text-warm-300">
                    {spec}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA Link */}
            <a
              href="https://dashboard.stripe.com/terminal/hardware"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sage-600 dark:text-sage-400 font-semibold hover:underline"
            >
              Order from Stripe
              <svg
                className="w-4 h-4 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
        Readers ship directly from Stripe. Typical delivery 3–5 business days.
      </p>
    </div>
  );
}
