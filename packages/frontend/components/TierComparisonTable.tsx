import React from 'react';
import Link from 'next/link';

interface Feature {
  name: string;
  simple: boolean | string;
  pro: boolean | string;
  teams: boolean | string;
}

interface TierComparisonTableProps {
  currentTier?: 'SIMPLE' | 'PRO' | 'TEAMS';
}

const FEATURES: Feature[] = [
  {
    name: 'Photo to listing',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Item uploads per sale',
    simple: '200',
    pro: '500',
    teams: 'Unlimited*',
  },
  {
    name: 'Photos per item',
    simple: '5',
    pro: '10',
    teams: 'Unlimited*',
  },
  {
    name: 'Auto tags per month',
    simple: '100',
    pro: '2,000',
    teams: 'Unlimited*',
  },
  {
    name: 'Concurrent sales',
    simple: '1',
    pro: '3',
    teams: 'Unlimited*',
  },
  {
    name: 'QR codes',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Social post generator',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Email & SMS reminders',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Point Of Sale',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Holds & reservations',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Basic sales analytics',
    simple: true,
    pro: true,
    teams: true,
  },
    {
    name: 'Ripples',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Batch item operations',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Seller verification badge',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Brand Kit customization',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Smart Pricing',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Flip Report (post-sale PDF)',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Advanced analytics & insights',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Data export (CSV/PDF)',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Multi-platform exports (CSV, JSON, Text)',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Support',
    simple: 'Help center + guides',
    pro: '24/7 support assistant',
    teams: '24/7 support assistant',
  },
  {
    name: 'Custom storefront slug',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Command Center (multi-sale)',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Team workspace',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Invite team members',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Role-based permissions',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Shared inventory & sales',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Team activity audit logs',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Webhooks',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'API Access',
    simple: false,
    pro: false,
    teams: 'Enterprise',
  },
  {
    name: 'White-label App',
    simple: false,
    pro: false,
    teams: 'Enterprise',
  },
  {
    name: 'Custom Integrations',
    simple: false,
    pro: false,
    teams: 'Enterprise',
  },
];

const FeatureCheck: React.FC<{ included: boolean | string }> = ({ included }) => {
  if (typeof included === 'string') {
    return <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{included}</span>;
  }

  return included ? (
    <span className="text-sage-600 dark:text-sage-400">
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </span>
  ) : (
    <span className="text-gray-400 dark:text-gray-500">
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </span>
  );
};

/**
 * TierComparisonTable — Feature matrix showing all three subscription tiers
 * Displays which features are available at each tier level
 */
const TierComparisonTable: React.FC<TierComparisonTableProps> = ({ currentTier = 'SIMPLE' }) => {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        {/* Header */}
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-4 px-4 font-semibold text-gray-900 dark:text-gray-100 min-w-48">Feature</th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">SIMPLE</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Free</p>
              </div>
            </th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">PRO</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">$29/mo</p>
              </div>
            </th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">TEAMS</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">$79/mo</p>
              </div>
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {FEATURES.map((feature, index) => (
            <tr
              key={index}
              className={`border-b border-gray-100 dark:border-gray-700 ${index % 2 === 1 ? 'bg-gray-50 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'}`}
            >
              <td className="py-4 px-4 text-sm text-gray-700 dark:text-gray-300 font-medium">{feature.name}</td>
              <td className="py-4 px-4">
                <div className="flex items-center justify-center">
                  <FeatureCheck included={feature.simple} />
                </div>
              </td>
              <td className="py-4 px-4">
                <div className="flex items-center justify-center">
                  <FeatureCheck included={feature.pro} />
                </div>
              </td>
              <td className="py-4 px-4">
                <div className="flex items-center justify-center">
                  <FeatureCheck included={feature.teams} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CTA Footer */}
      <div className="mt-8 flex flex-wrap gap-4 justify-center">
        {currentTier !== 'SIMPLE' && (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 w-full">
            You are currently on the {currentTier} plan.
          </p>
        )}
      </div>
    </div>
  );
};

export default TierComparisonTable;
