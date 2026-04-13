import React from 'react';

interface RarityBadgeProps {
  rarity?: string | null;
  size?: 'sm' | 'md';
}

const RarityBadge: React.FC<RarityBadgeProps> = ({ rarity, size = 'md' }) => {
  // COMMON items don't get a badge
  if (!rarity || rarity === 'COMMON') return null;

  // Size classes
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
  };

  // Shimmer animation for LEGENDARY
  const shimmerStyle = `
    @keyframes shimmer {
      0%, 100% {
        opacity: 1;
        box-shadow: 0 0 10px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.3);
      }
      50% {
        opacity: 0.8;
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4);
      }
    }
    .shimmer {
      animation: shimmer 2s ease-in-out infinite;
    }
  `;

  switch (rarity) {
    case 'UNCOMMON':
      return (
        <span
          className={`inline-flex items-center gap-1 ${sizeClasses[size]} rounded font-semibold text-gray-700 bg-gray-200 border border-gray-400 shadow`}
          title="Uncommon Item"
        >
          <span>✦</span>
          Uncommon
        </span>
      );

    case 'RARE':
      return (
        <span
          className={`inline-flex items-center gap-1 ${sizeClasses[size]} rounded font-semibold text-blue-700 bg-blue-100 border border-blue-400 shadow-lg`}
          style={{ borderColor: '#3B82F6', boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)' }}
          title="Rare Item"
        >
          <span>✦✦</span>
          Rare
        </span>
      );

    case 'ULTRA_RARE':
      return (
        <span
          className={`inline-flex items-center gap-1 ${sizeClasses[size]} rounded font-semibold text-purple-700 bg-purple-100 border border-purple-400 shadow-lg`}
          style={{
            borderColor: '#9333EA',
            boxShadow: '0 0 12px rgba(147, 51, 234, 0.5), 0 0 24px rgba(147, 51, 234, 0.25)',
          }}
          title="Ultra Rare Item"
        >
          <span>✦✦✦</span>
          Ultra Rare
        </span>
      );

    case 'LEGENDARY':
      return (
        <>
          <style>{shimmerStyle}</style>
          <span
            className={`inline-flex items-center gap-1 ${sizeClasses[size]} rounded font-bold text-yellow-800 bg-yellow-300 border border-yellow-500 shimmer`}
            title="Legendary Item"
          >
            <span>⭐</span>
            Legendary
          </span>
        </>
      );

    default:
      return null;
  }
};

export default RarityBadge;
