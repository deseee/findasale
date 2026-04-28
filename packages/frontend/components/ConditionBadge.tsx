import React from 'react';

export const CONDITION_COLORS: Record<string, { bg: string; text: string; border: string; description: string }> = {
  'like new': {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    description: 'Like New (S). No signs of wear or use. May still have original packaging or tags.',
  },
  excellent: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    description: 'Excellent (A). Light cosmetic wear only. Fully functional and looks great.',
  },
  good: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
    description: 'Good (B). Visible signs of use but fully functional. Minor cosmetic imperfections that don\'t affect use.',
  },
  fair: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
    description: 'Fair (C). Noticeable wear, scratches, or patina. Fully functional.',
  },
  poor: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-300',
    description: 'Poor (D). Heavy wear, damage, or missing parts. May need repair.',
  },
  'as-is': {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
    description: 'As-Is. Sold without warranty regardless of grade. Inspect before purchase.',
  },
};

interface ConditionBadgeProps {
  condition: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

const ConditionBadge: React.FC<ConditionBadgeProps> = ({
  condition,
  size = 'md',
  showTooltip = false,
}) => {
  const normalizedCondition = (condition || '').toLowerCase();
  const colorConfig = CONDITION_COLORS[normalizedCondition] || CONDITION_COLORS.good;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const displayLabel = normalizedCondition.charAt(0).toUpperCase() + normalizedCondition.slice(1);

  const badge = (
    <span
      className={`inline-block font-semibold rounded-full border ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border} border ${sizeClasses[size]} whitespace-nowrap`}
    >
      {displayLabel}
    </span>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <div className="relative inline-block group">
      {badge}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-warm-900 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap z-10 pointer-events-none shadow-md">
        {colorConfig.description}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-warm-900" />
      </div>
    </div>
  );
};

export default ConditionBadge;
