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
    name: 'Create unlimited sales',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Manage item inventory',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'Item uploads per sale',
    simple: '100',
    pro: '500',
    teams: 'Unlimited',
  },
  {
    name: 'Photos per item',
    simple: '3',
    pro: '10',
    teams: 'Unlimited',
  },
  {
    name: 'Email & SMS reminders',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'POS integration',
    simple: true,
    pro: true,
    teams: true,
  },
  {
    name: 'AI-powered item tags',
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
    name: 'Brand Kit customization',
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
    name: 'Command Center (multi-sale)',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Batch item operations',
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
    name: 'Social media templates',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Priority support (24h)',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Custom storefront slug',
    simple: false,
    pro: true,
    teams: true,
  },
  {
    name: 'Multi-user team workspace',
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
    name: 'API access & webhooks',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'White-label customization',
    simple: false,
    pro: false,
    teams: true,
  },
  {
    name: 'Dedicated account manager',
    simple: false,
    pro: false,
    teams: true,
  },
];

const FeatureCheck: React.FC<{ included: boolean | string }> = ({ included }) => {
  if (typeof included === 'string') {
    return <span className="text-sm font-medium text-gray-900">{included}</span>;
  }

  return included ? (
    <span className="text-sage-600">
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </span>
  ) : (
    <span className="text-gray-300">
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
          <tr className="border-b border-gray-200">
            <th className="text-left py-4 px-4 font-semibold text-gray-900 min-w-48">Feature</th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">SIMPLE</p>
                <p className="text-sm text-gray-600">Free</p>
              </div>
            </th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">PRO</p>
                <p className="text-sm text-gray-600">$29/mo</p>
              </div>
            </th>
            <th className="text-center py-4 px-4">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">TEAMS</p>
                <p className="text-sm text-gray-600">$79/mo</p>
              </div>
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {FEATURES.map((feature, index) => (
            <tr
              key={index}
              className={`border-b border-gray-100 ${index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
            >
              <td className="py-4 px-4 text-sm text-gray-700 font-medium">{feature.name}</td>
              <td className="py-4 px-4 text-center">
                <FeatureCheck included={feature.simple} />
              </td>
              <td className="py-4 px-4 text-center">
                <FeatureCheck included={feature.pro} />
              </td>
              <td className="py-4 px-4 text-center">
                <FeatureCheck included={feature.teams} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CTA Footer */}
      <div className="mt-8 flex flex-wrap gap-4 justify-center">
        {currentTier !== 'SIMPLE' && (
          <p className="text-center text-sm text-gray-600 w-full">
            You are currently on the {currentTier} plan.
          </p>
        )}
        <Link
          href="/organizer/upgrade"
          className="inline-block bg-sage-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-sage-700 transition"
        >
          View Plans & Pricing
        </Link>
      </div>
    </div>
  );
};

export default TierComparisonTable;
