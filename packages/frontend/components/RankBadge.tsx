import React from 'react';

export type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';
export type RankSize = 'sm' | 'md' | 'lg';

interface RankBadgeProps {
  rank: ExplorerRank;
  size?: RankSize;
}

const RANK_CONFIG: Record<ExplorerRank, { emoji: string; label: string; bgColor: string; textColor: string; borderColor: string; darkBg: string; darkText: string; darkBorder: string }> = {
  INITIATE: {
    emoji: '🌱',
    label: 'Initiate',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    darkBg: 'dark:bg-blue-900',
    darkText: 'dark:text-blue-300',
    darkBorder: 'dark:border-blue-700',
  },
  SCOUT: {
    emoji: '🔍',
    label: 'Scout',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    darkBg: 'dark:bg-purple-900',
    darkText: 'dark:text-purple-300',
    darkBorder: 'dark:border-purple-700',
  },
  RANGER: {
    emoji: '🎯',
    label: 'Ranger',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    darkBg: 'dark:bg-green-900',
    darkText: 'dark:text-green-300',
    darkBorder: 'dark:border-green-700',
  },
  SAGE: {
    emoji: '✨',
    label: 'Sage',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    darkBg: 'dark:bg-amber-900',
    darkText: 'dark:text-amber-300',
    darkBorder: 'dark:border-amber-700',
  },
  GRANDMASTER: {
    emoji: '👑',
    label: 'Grandmaster',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    darkBg: 'dark:bg-red-900',
    darkText: 'dark:text-red-300',
    darkBorder: 'dark:border-red-700',
  },
};

const SIZE_CONFIG: Record<RankSize, { containerPadding: string; emojiSize: string; textSize: string; borderWidth: string }> = {
  sm: {
    containerPadding: 'px-2.5 py-1.5',
    emojiSize: 'text-lg',
    textSize: 'text-xs',
    borderWidth: 'border',
  },
  md: {
    containerPadding: 'px-3 py-2',
    emojiSize: 'text-2xl',
    textSize: 'text-sm',
    borderWidth: 'border',
  },
  lg: {
    containerPadding: 'px-4 py-2.5',
    emojiSize: 'text-4xl',
    textSize: 'text-base',
    borderWidth: 'border-2',
  },
};

export const RankBadge: React.FC<RankBadgeProps> = ({ rank, size = 'md' }) => {
  const config = RANK_CONFIG[rank];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-lg ${sizeConfig.containerPadding} ${sizeConfig.borderWidth} ${config.borderColor} ${config.bgColor} ${config.darkBorder} ${config.darkBg} transition-all`}
      title={config.label}
    >
      <span className={sizeConfig.emojiSize}>{config.emoji}</span>
      <span className={`${sizeConfig.textSize} font-semibold ${config.textColor} ${config.darkText} mt-1`}>
        {config.label}
      </span>
    </div>
  );
};

export default RankBadge;
