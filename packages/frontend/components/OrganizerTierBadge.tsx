import React from 'react';
import Tooltip from './Tooltip';

interface OrganizerTierBadgeProps {
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  showLevelUpCopy?: boolean;
  completedSales?: number;
}

const TIER_CONFIG: Record<string, {
  label: string;
  bg: string;
  text: string;
  icon: string;
  nextLevelMessage?: string;
}> = {
  BRONZE: {
    label: 'Bronze Organizer',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: '🥉',
    nextLevelMessage: 'Reach Silver at 5 sales — get priority search placement and access to advanced analytics',
  },
  SILVER: {
    label: 'Silver Organizer',
    bg: 'bg-slate-200',
    text: 'text-slate-700',
    icon: '🥈',
    nextLevelMessage: 'Reach Gold at 15 sales — get featured on the homepage and early access to new features',
  },
  GOLD: {
    label: 'Gold Organizer',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '🥇',
    nextLevelMessage: "You've reached Gold — your sales are featured on the homepage and you get early access to new features",
  },
};

const OrganizerTierBadge: React.FC<OrganizerTierBadgeProps> = ({ tier, showLevelUpCopy = false }) => {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;

  return (
    <div>
      <div className="inline-flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
          title={config.label}
        >
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </span>
        <Tooltip content="Earned by completing sales. Silver unlocks priority search placement. Gold unlocks homepage featuring." />
      </div>
      {showLevelUpCopy && config.nextLevelMessage && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {config.nextLevelMessage}
        </p>
      )}
    </div>
  );
};

export default OrganizerTierBadge;
