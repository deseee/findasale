/**
 * Read-only note under the item form's "In stock" field: which listed markets cannot take an automatic stock count.
 * Pure module (no imports). Driven by the per-platform `supportsQuantity` flag from GET /items/:id/marketplace-status.
 */
import type { MarketplaceStatus } from './itemMarketplaceApi';

/** A platform counts as actively listed when it is live or listed and waiting on a manual update. */
const ACTIVE_STATUSES = ['live', 'listed_needs_manual_update'];

/** Labels of the actively listed platforms that cannot take an automatic count, in the order the server sent them. */
export function platformsWithoutQuantity(status: MarketplaceStatus | undefined): string[] {
  if (!status || !status.platforms) return [];
  const labels: string[] = [];
  Object.keys(status.platforms).forEach((key) => {
    const entry = status.platforms[key];
    if (!entry || entry.supportsQuantity !== false) return;
    if (ACTIVE_STATUSES.indexOf(String(entry.status)) === -1) return;
    labels.push(entry.label || entry.platform || key);
  });
  return labels;
}

/** "Reverb", "Reverb and Vinted", "Reverb, Vinted and Mercari". */
export function joinPlatformLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join('');
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
}

/** The note text, or null when it should not show (no such listing, or the loaded in stock number is 1 or less). */
export function stockCountNoteText(status: MarketplaceStatus | undefined, loadedInStock: number): string | null {
  if (!(loadedInStock > 1)) return null;
  const labels = platformsWithoutQuantity(status);
  if (labels.length === 0) return null;
  return `FindA.Sale can't set the count on ${joinPlatformLabels(labels)}. Sales there lower your in stock number automatically, but that listing keeps its own count and may need a manual update.`;
}
