/**
 * Feature #17: Fraud Badge Component
 * Displays visual indicator of fraud confidence score
 * Shows as: null (0-29), amber (30-59), orange (60-79), red (80-100)
 */

import React from 'react';

export interface FraudBadgeProps {
  confidenceScore: number;
  size?: 'sm' | 'md';
}

const FraudBadge: React.FC<FraudBadgeProps> = ({ confidenceScore, size = 'md' }) => {
  // No badge for low-risk scores
  if (confidenceScore < 30) {
    return null;
  }

  // Determine badge color and text based on score
  let bgColor = '';
  let textColor = '';
  let borderColor = '';
  let badgeText = '';
  let icon = '';

  if (confidenceScore < 60) {
    // 30-59: Amber — Suspicious
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-800';
    borderColor = 'border-amber-300';
    badgeText = 'Suspicious';
    icon = '⚠';
  } else if (confidenceScore < 80) {
    // 60-79: Orange — High Risk
    bgColor = 'bg-orange-50';
    textColor = 'text-orange-800';
    borderColor = 'border-orange-300';
    badgeText = 'High Risk';
    icon = '⚠⚠';
  } else {
    // 80-100: Red — Bot Suspected
    bgColor = 'bg-red-50';
    textColor = 'text-red-800';
    borderColor = 'border-red-300';
    badgeText = 'Bot Suspected';
    icon = '🚨';
  }

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 ${sizeClass} rounded-md border ${bgColor} ${borderColor} font-medium ${textColor}`}
    >
      {icon} {badgeText}
    </span>
  );
};

export default FraudBadge;
