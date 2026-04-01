import React from 'react';

interface OrganizerTierBadgeProps {
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
}

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  BRONZE: {
    label: 'Bronze Organizer',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: '🥉',
  },
  SILVER: {
    label: 'Silver Organizer',
    bg: 'bg-slate-200',
    text: 'text-slate-700',
    icon: '🥈',
  },
  GOLD: {
    label: 'Gold Organizer',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '🥇',
  },
};

const OrganizerTierBadge: React.FC<OrganizerTierBadgeProps> = ({ tier }) => {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
      title={config.label}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

export default OrganizerTierBadge;
