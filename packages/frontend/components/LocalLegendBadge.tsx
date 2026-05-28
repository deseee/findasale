/**
 * LocalLegendBadge — Feature #399
 * Displays a scoped badge chip for shoppers who have attended 3+ sales in a ZIP code.
 */

interface LocalLegendBadgeProps {
  zip: string;
  awardedAt?: string | Date;
  size?: 'sm' | 'md';
}

export const LocalLegendBadge = ({ zip, awardedAt, size = 'md' }: LocalLegendBadgeProps) => {
  const isSmall = size === 'sm';

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 dark:border-emerald-600 font-semibold text-emerald-700 dark:text-emerald-300 ${
        isSmall ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
      title={awardedAt ? `Earned ${new Date(awardedAt).toLocaleDateString()}` : undefined}
    >
      <span aria-hidden="true">📍</span>
      <span>Local Legend – {zip}</span>
    </div>
  );
};

/**
 * LocalLegendBadgeList — renders all Local Legend badges for a user.
 */
interface LocalLegendBadgeListProps {
  badges: Array<{ zip: string; awardedAt: string | Date }>;
  size?: 'sm' | 'md';
}

export const LocalLegendBadgeList = ({ badges, size = 'md' }: LocalLegendBadgeListProps) => {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <LocalLegendBadge key={b.zip} zip={b.zip} awardedAt={b.awardedAt} size={size} />
      ))}
    </div>
  );
};
