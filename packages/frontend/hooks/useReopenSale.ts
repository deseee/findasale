import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * "Mark available again" for an item whose marketplace sale was cancelled (2026-10-10).
 *
 *   POST /items/:id/reopen-sale
 *     body: { confirm?: boolean }  <-- required (true) for organizer-attested marketplaces; eBay is verified by the server
 *     200: { ok: true, itemId?, marketplace? }
 *     409: { message, code, requiresConfirmation?, marketplace? }  <-- shown to the organizer as-is
 *
 * The backend dispatches on Item.lastSoldVia (itemController / saleReopenController): eBay is checked against eBay,
 * an off-platform manual sale is undone, the other marketplaces need the confirm flag, and sales paid through
 * FindA.Sale checkout or the register are refused (they are reopened by refunding the sale).
 */

/** Marketplace names shown in the confirm dialog, keyed by Item.lastSoldVia. */
export const REOPEN_MARKETPLACE_LABELS: Record<string, string> = {
  EBAY: 'eBay',
  FB_NATIVE: 'Facebook Marketplace',
  FB_EMAIL_ORDER: 'Facebook Marketplace',
  MERCARI: 'Mercari',
  VINTED: 'Vinted',
  ETSY: 'Etsy',
  POSHMARK: 'Poshmark',
  GRAILED: 'Grailed',
  REVERB: 'Reverb',
  DISCOGS: 'Discogs',
  OFF_PLATFORM_MANUAL: 'outside FindA.Sale',
};

/** Sold through FindA.Sale's own payment rails: no reopen button, the sale is refunded instead. */
export function isPaidOnPlatformRails(lastSoldVia?: string | null): boolean {
  return lastSoldVia === 'STRIPE' || lastSoldVia === 'POS';
}

/** True when the item is SOLD and the reopen button should be offered (the server still has the final say). */
export function canOfferReopen(item?: { status?: string | null; lastSoldVia?: string | null } | null): boolean {
  return !!item && item.status === 'SOLD' && !isPaidOnPlatformRails(item.lastSoldVia);
}

export function useReopenSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, confirm }: { itemId: string; confirm: boolean }) => {
      const response = await api.post(`/items/${itemId}/reopen-sale`, { confirm });
      return response.data as { ok: boolean; itemId?: string; marketplace?: string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['item', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['off-platform-sales-log'] });
      queryClient.invalidateQueries({ queryKey: ['off-platform-usage'] });
    },
  });
}
