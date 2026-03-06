/**
 * Sale Performance Badge Component
 *
 * Shows a mini performance indicator on sale cards:
 * - 🔥 Hot — >80% items sold
 * - 📈 Active — 50-80% sold
 * - 🟡 Slow — <50% sold but sale is active
 * - ✅ Complete — sale ended
 */

interface SalePerformanceBadgeProps {
  itemCount: number;
  itemsSold: number;
  saleStatus: string;
  endDate: string;
}

const SalePerformanceBadge: React.FC<SalePerformanceBadgeProps> = ({
  itemCount,
  itemsSold,
  saleStatus,
  endDate,
}) => {
  if (itemCount === 0) {
    return null;
  }

  const conversionRate = (itemsSold / itemCount) * 100;
  const saleEnded = new Date(endDate) < new Date() || saleStatus === 'ENDED';

  let badge = { emoji: '✅', label: 'Complete', color: 'bg-gray-100 text-gray-700' };

  if (!saleEnded) {
    if (conversionRate > 80) {
      badge = { emoji: '🔥', label: 'Hot', color: 'bg-red-100 text-red-700' };
    } else if (conversionRate >= 50) {
      badge = { emoji: '📈', label: 'Active', color: 'bg-green-100 text-green-700' };
    } else {
      badge = { emoji: '🟡', label: 'Slow', color: 'bg-yellow-100 text-yellow-700' };
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>
      <span>{badge.emoji}</span>
      <span>{badge.label}</span>
    </span>
  );
};

export default SalePerformanceBadge;
