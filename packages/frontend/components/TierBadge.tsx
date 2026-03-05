import React from 'react';

interface TierBadgeProps {
  tier: string;
  className?: string;
}

interface TierConfig {
  label: string;
  classes: string;
}

const TIER_CONFIG: Record<string, TierConfig> = {
  TRUSTED: {
    label: 'Trusted Seller',
    classes: 'bg-blue-100 text-blue-800',
  },
  ESTATE_CURATOR: {
    label: 'Estate Curator ✦',
    classes: 'bg-amber-100 text-amber-800',
  },
};

/**
 * Phase 22: Compact tier badge for inline and card use.
 * Renders nothing for NEW tier — no badge needed.
 */
const TierBadge: React.FC<TierBadgeProps> = ({ tier, className = '' }) => {
  const config = TIER_CONFIG[tier];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  );
};

export default TierBadge;
