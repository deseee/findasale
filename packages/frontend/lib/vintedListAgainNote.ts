/**
 * Note in the item form's "Where this is listed" section (1.0.76, 2026-10-27): the item sold on Vinted and stock is left.
 * Vinted is drafts only and nothing lists an item there again by itself, so the organizer is told to do it from the
 * extension. Pure module. Driven by platforms.vinted.readyToListAgain from GET /items/:id/marketplace-status.
 */
import type { MarketplaceStatus } from './itemMarketplaceApi';

/** The note text, or null when it should not show. */
export function vintedListAgainNoteText(status: MarketplaceStatus | undefined): string | null {
  const entry = status && status.platforms ? status.platforms.vinted : undefined;
  const left = entry && entry.readyToListAgain ? Number(entry.readyToListAgain.unitsLeft) : NaN;
  if (!Number.isFinite(left) || left < 1) return null;
  return `Sold one on Vinted, ${Math.floor(left)} left. List it on Vinted again from the extension (Vinted listings are drafts you upload).`;
}
