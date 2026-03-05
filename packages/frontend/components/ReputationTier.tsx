import React from 'react';

interface ReputationTierProps {
  tier: string;
  size?: 'sm' | 'md';
}

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  NEW: {
    label: 'New Organizer',
    bg: 'bg-warm-200',
    text: 'text-warm-700',
    icon: '🏷️',
  },
  TRUSTED: {
    label: 'Trusted Organizer',
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: '✅',
  },
  ESTATE_CURATOR: {
    label: 'Estate Curator',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: '🏅',
  },
};

const ReputationTier: React.FC<ReputationTierProps> = ({ tier, size = 'md' }) => {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.NEW;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bg} ${config.text} ${padding}`}
      title={config.label}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

export default ReputationTier;
