import React from 'react';
import { describeShopperCondition } from '../lib/shopperCondition';
import type { CanonicalCondition } from '../lib/conditionModel';

type BadgeColors = { bg: string; text: string; border: string };

/** Badge colors by canonical condition. Legacy stored values are mapped to a canonical condition before lookup. */
export const CONDITION_COLORS: Record<CanonicalCondition, BadgeColors> = {
  NEW: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  USED: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  REFURBISHED: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  PARTS_OR_REPAIR: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
};

/** For a stored value the condition model does not recognize. */
const NEUTRAL_COLORS: BadgeColors = { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };

interface ConditionBadgeProps {
  /** Stored Item.condition. Canonical (NEW, USED, REFURBISHED, PARTS_OR_REPAIR) or a legacy value (LIKE_NEW, EXCELLENT, FAIR, POOR ...). */
  condition: string | null | undefined;
  /** Stored Item.conditionGrade (A to D, legacy S). Shown in plain words for used goods only. */
  grade?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

const ConditionBadge: React.FC<ConditionBadgeProps> = ({
  condition,
  grade,
  size = 'md',
  showTooltip = false,
}) => {
  const described = describeShopperCondition(condition, grade);
  if (!described) return null;

  const colorConfig = described.condition ? CONDITION_COLORS[described.condition] : NEUTRAL_COLORS;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const badge = (
    <span
      className={`inline-block font-semibold rounded-full border ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border} border ${sizeClasses[size]} whitespace-nowrap`}
    >
      {described.text}
    </span>
  );

  if (!showTooltip || !described.description) {
    return badge;
  }

  return (
    <div className="relative inline-block group">
      {badge}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-warm-900 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap z-10 pointer-events-none shadow-md">
        {described.description}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-warm-900" />
      </div>
    </div>
  );
};

export default ConditionBadge;
