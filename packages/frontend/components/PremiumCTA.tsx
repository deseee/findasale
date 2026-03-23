import React from 'react';
import Link from 'next/link';

interface PremiumCTAProps {
  tier?: 'SIMPLE' | 'PRO' | 'TEAMS';
  title?: string;
  description?: string;
  benefits?: string[];
  ctaText?: string;
  ctaHref?: string;
  compact?: boolean;
}

/**
 * PremiumCTA — Call-to-action card for upgrading to premium tier
 * Shows benefits and links to upgrade page
 */
const PremiumCTA: React.FC<PremiumCTAProps> = ({
  tier = 'SIMPLE',
  title = 'Unlock Premium Features',
  description = 'Upgrade to PRO to unlock advanced tools and analytics.',
  benefits = [
    'Brand Kit customization',
    'Advanced analytics & insights',
    'Command Center for multi-sale management',
    'Data export capabilities',
    'Priority support',
  ],
  ctaText = 'Upgrade to PRO',
  ctaHref = '/pricing',
  compact = false,
}) => {
  if (tier !== 'SIMPLE') {
    return null;
  }

  return (
    <div className={`bg-gradient-to-br from-sage-50 to-sage-100 border-2 border-sage-200 rounded-lg overflow-hidden ${
      compact ? 'p-4' : 'p-6 sm:p-8'
    }`}>
      {/* Header */}
      <div className={compact ? 'mb-3' : 'mb-6'}>
        <h3 className={`font-fraunces font-bold text-sage-900 ${
          compact ? 'text-lg' : 'text-2xl'
        } mb-2`}>
          {title}
        </h3>
        <p className={`text-sage-800 ${compact ? 'text-sm' : 'text-base'}`}>
          {description}
        </p>
      </div>

      {/* Benefits List */}
      {!compact && (
        <ul className="space-y-3 mb-8">
          {benefits.map((benefit, index) => (
            <li key={index} className="flex items-start gap-3">
              <svg className="w-5 h-5 text-sage-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sage-800 text-sm">{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {/* CTA Button */}
      <Link
        href={ctaHref}
        className={`inline-block bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition ${
          compact ? 'px-4 py-2 text-sm' : 'px-6 py-3'
        }`}
      >
        {ctaText}
      </Link>
    </div>
  );
};

export default PremiumCTA;
