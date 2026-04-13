import React from 'react';

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  awardedAt?: string;
}

interface BadgeDisplayProps {
  badges: Badge[];
  size?: 'sm' | 'md' | 'lg';
}

const BadgeDisplay: React.FC<BadgeDisplayProps> = ({ badges, size = 'md' }) => {
  if (!badges || badges.length === 0) {
    return null;
  }

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs px-2 py-1',
    md: 'h-8 w-8 text-sm px-3 py-1.5',
    lg: 'h-10 w-10 text-base px-4 py-2',
  };

  const badgeColors: {[key: string]: {bg: string; text: string; icon: string}} = {
    'first-time-organizer': {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      icon: '🌟'
    },
    'verified-organizer': {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: '✓'
    },
    'top-rated-organizer': {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      icon: '⭐'
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => {
        const color = badgeColors[badge.name] || {
          bg: 'bg-warm-100',
          text: 'text-warm-800',
          icon: '⊙'
        };

        return (
          <div
            key={badge.id}
            className={`inline-flex items-center gap-1 rounded-full ${color.bg} ${color.text} ${sizeClasses[size]} font-medium`}
            title={badge.description}
          >
            <span>{color.icon}</span>
            <span>{badge.name.replace(/-/g, ' ')}</span>
          </div>
        );
      })}
    </div>
  );
};

export default BadgeDisplay;
