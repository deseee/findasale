import React from 'react';

interface UsageBarProps {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  variant?: 'success' | 'warning' | 'error';
  showPercent?: boolean;
}

/**
 * UsageBar — Progress bar showing usage vs tier limit
 * Example: "12 / 20 sales" with visual progress bar
 */
const UsageBar: React.FC<UsageBarProps> = ({
  label,
  current,
  limit,
  unit = '',
  variant,
  showPercent = true,
}) => {
  const percentage = limit > 0 ? (current / limit) * 100 : 0;

  // Auto-detect variant if not specified
  let resolvedVariant = variant;
  if (!resolvedVariant) {
    if (percentage >= 90) resolvedVariant = 'error';
    else if (percentage >= 70) resolvedVariant = 'warning';
    else resolvedVariant = 'success';
  }

  const barColors = {
    success: 'bg-sage-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const textColors = {
    success: 'text-sage-600',
    warning: 'text-amber-600',
    error: 'text-red-600',
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className={`text-sm font-semibold ${textColors[resolvedVariant]}`}>
          {current} / {limit} {unit}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${barColors[resolvedVariant]} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {showPercent && (
        <p className="text-xs text-gray-500">
          {Math.round(percentage)}% of limit
        </p>
      )}
    </div>
  );
};

export default UsageBar;
