import React from 'react';
import { ItemSocialProof, SaleSocialProof } from '../hooks/useSocialProof';

interface SocialProofBadgeProps {
  socialProof: ItemSocialProof | SaleSocialProof | null;
  loading?: boolean;
  variant?: 'compact' | 'full'; // compact = just counts, full = with labels
  className?: string;
}

/**
 * SocialProofBadge — Feature 67: Display social proof metrics.
 * Shows "X people viewed", "Y favorited", "Z have holds".
 * Sage-green theme with subtle animation.
 */
const SocialProofBadge: React.FC<SocialProofBadgeProps> = ({
  socialProof,
  loading = false,
  variant = 'compact',
  className = '',
}) => {
  if (!socialProof || socialProof.totalEngagement === 0) {
    return null; // Don't render if no engagement
  }

  // Check if this is an ItemSocialProof or SaleSocialProof
  const isItemProof = 'activeBidCount' in socialProof;

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
      </div>
    );
  }

  // Compact variant: just show main engagement count with icon
  if (variant === 'compact') {
    const message =
      socialProof.totalEngagement === 1
        ? `${socialProof.totalEngagement} person`
        : `${socialProof.totalEngagement} people`;

    const engagementLabel = isItemProof
      ? 'interested in this'
      : 'interested in this sale';

    return (
      <div
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 text-xs font-medium text-[#5a7a60] border border-[#6B8F71]/20 ${className}`}
      >
        <span className="text-[#6B8F71]">👥</span>
        <span>
          {message} {engagementLabel}
        </span>
      </div>
    );
  }

  // Full variant: detailed breakdown
  if (isItemProof) {
    const itemProof = socialProof as ItemSocialProof;
    return (
      <div
        className={`inline-flex flex-col gap-2 p-3 rounded-lg bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 border border-[#6B8F71]/20 ${className}`}
      >
        <div className="text-xs font-semibold text-[#5a7a60]">Activity</div>
        <div className="flex gap-4 text-sm">
          {itemProof.favoriteCount > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">❤️</span>
              <span className="text-[#5a7a60]">
                {itemProof.favoriteCount} fav{itemProof.favoriteCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {itemProof.activeBidCount > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">🏆</span>
              <span className="text-[#5a7a60]">
                {itemProof.activeBidCount} bid{itemProof.activeBidCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {itemProof.activeHoldCount > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">🛒</span>
              <span className="text-[#5a7a60]">
                {itemProof.activeHoldCount} hold{itemProof.activeHoldCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  } else {
    const saleProof = socialProof as SaleSocialProof;
    return (
      <div
        className={`inline-flex flex-col gap-2 p-3 rounded-lg bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 border border-[#6B8F71]/20 ${className}`}
      >
        <div className="text-xs font-semibold text-[#5a7a60]">Sale Activity</div>
        <div className="flex gap-4 text-sm">
          {saleProof.totalFavorites > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">❤️</span>
              <span className="text-[#5a7a60]">
                {saleProof.totalFavorites} fav{saleProof.totalFavorites !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {saleProof.totalActiveBids > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">🏆</span>
              <span className="text-[#5a7a60]">
                {saleProof.totalActiveBids} bid{saleProof.totalActiveBids !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {saleProof.totalActiveHolds > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-lg">🛒</span>
              <span className="text-[#5a7a60]">
                {saleProof.totalActiveHolds} hold{saleProof.totalActiveHolds !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
};

export default SocialProofBadge;
