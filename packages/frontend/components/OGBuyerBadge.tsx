/**
 * OGBuyerBadge — Feature #404
 * Displays a scoped badge chip for shoppers who were among the first 100 buyers at a sale.
 */

interface OGBuyerBadgeProps {
  saleTitle: string;
  awardedAt?: string | Date;
  size?: 'sm' | 'md';
}

export const OGBuyerBadge = ({ saleTitle, awardedAt, size = 'md' }: OGBuyerBadgeProps) => {
  const isSmall = size === 'sm';

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 dark:bg-amber-900/40 dark:border-amber-600 font-semibold text-amber-700 dark:text-amber-300 ${
        isSmall ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
      title={awardedAt ? `Earned ${new Date(awardedAt).toLocaleDateString()}` : undefined}
    >
      <span aria-hidden="true">🏆</span>
      <span>OG Buyer – {saleTitle}</span>
    </div>
  );
};

/**
 * OGBuyerBadgeList — renders all OG Buyer badges for a user.
 */
interface OGBuyerBadgeListProps {
  badges: Array<{ saleId: string; saleTitle: string; awardedAt: string | Date }>;
  size?: 'sm' | 'md';
}

export const OGBuyerBadgeList = ({ badges, size = 'md' }: OGBuyerBadgeListProps) => {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <OGBuyerBadge key={b.saleId} saleTitle={b.saleTitle} awardedAt={b.awardedAt} size={size} />
      ))}
    </div>
  );
};

/**
 * OGBuyerCountBadge — for organizer dashboard sale cards.
 * Shows progress toward the 100-buyer milestone.
 */
interface OGBuyerCountBadgeProps {
  count: number;
  limit?: number;
}

export const OGBuyerCountBadge = ({ count, limit = 100 }: OGBuyerCountBadgeProps) => {
  const isFull = count >= limit;
  const remaining = Math.max(0, limit - count);

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold text-xs px-2.5 py-1 ${
        isFull
          ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
          : 'border-gray-300 bg-gray-100 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-300'
      }`}
      title={
        isFull
          ? 'All 100 OG Buyer badges claimed'
          : `${remaining} OG Buyer badge${remaining === 1 ? '' : 's'} remaining`
      }
    >
      <span aria-hidden="true">🏆</span>
      <span>
        {count} / {limit} OG Buyers
      </span>
    </div>
  );
};
