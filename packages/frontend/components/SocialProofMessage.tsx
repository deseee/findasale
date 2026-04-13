import React from 'react';
import { useItemSocialProof } from '../hooks/useSocialProof';

interface SocialProofMessageProps {
  itemId: string;
  className?: string;
}

/**
 * SocialProofMessage — Feature #54: Contextual urgency messaging for shoppers.
 * Shows activity-based messages like "3 people are watching this" or "2 active holds"
 * when engagement is high. Renders null if no activity.
 * Uses amber/orange styling to match urgency theme.
 */
const SocialProofMessage: React.FC<SocialProofMessageProps> = ({
  itemId,
  className = '',
}) => {
  const { socialProof, loading } = useItemSocialProof(itemId);

  // No render while loading or if no data
  if (loading || !socialProof) {
    return null;
  }

  // Destructure for cleaner logic
  const { activeHoldCount, activeBidCount, favoriteCount } = socialProof;

  // Generate message based on thresholds
  let message = '';
  let emoji = '';

  if (activeHoldCount >= 2) {
    emoji = '🔒';
    message = `${activeHoldCount} people ${activeHoldCount === 1 ? 'has' : 'have'} this on hold`;
  } else if (activeBidCount >= 3) {
    emoji = '🔥';
    message = `${activeBidCount} active bids — bidding is competitive`;
  } else if (favoriteCount >= 10) {
    emoji = '⭐';
    message = `Popular item — ${favoriteCount} people saved this`;
  } else if (favoriteCount >= 5) {
    emoji = '👀';
    message = `${favoriteCount} people are watching this item`;
  } else {
    // No engagement high enough to warrant a message
    return null;
  }

  return (
    <div
      className={`px-3 py-2 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200 ${className}`}
    >
      <span className="mr-2">{emoji}</span>
      <span>{message}</span>
    </div>
  );
};

export default SocialProofMessage;
