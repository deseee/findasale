import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Bring-Your-Own-Rails (BYOR) off-platform sales.
 *
 * Organizers who opt in can mark a plain AVAILABLE item "sold" without it
 * going through FindA.Sale's own checkout (cash, Venmo, their own Square
 * reader, etc.). FindA.Sale never sees or processes that payment -- it just
 * records that the item sold. FindA.Sale never charges organizers for sales
 * made off-platform (Patrick 2026-10-23), so recording them is free.
 *
 * See: claude_docs/feature-notes/bring-your-own-rails-architecture-and-scoping-2026-09-06.md
 *
 * Contract verified directly against the live backend (billingController.ts,
 * itemController.ts, routes/organizers.ts) on 2026-09-06 -- the backend and
 * frontend for this feature were built in parallel dispatches against the
 * same architecture doc, and the doc itself did not spell out response
 * bodies, so the shapes below are read from the real handlers, not guessed:
 *
 *   POST /items/:id/mark-sold-off-platform
 *     body: { quantity?, reportedAmount?, paymentMethodNote?, buyerNameNote?, buyerEmailNote? }
 *     200: { ok, item: { id, status, lastSoldVia }, offPlatformSale }
 *
 *   GET /organizers/off-platform-sales?page=&limit=
 *     200: { items: OffPlatformSaleLogEntry[], page, limit, total, totalPages }
 *
 *   GET /billing/off-platform-usage
 *     200: { offPlatformSalesEnabled, billingPeriodKey, itemCount, amountCents: 0, feeApplies: false, pricingNotYetSet: false }
 *
 *   POST /billing/off-platform-sales/opt-in
 *     body: { enabled: boolean }  <-- REQUIRED, this is a real on/off toggle, not opt-in-only
 *     200: { ok, offPlatformSalesEnabled, offPlatformSalesConsentedAt }
 */

export interface OffPlatformUsage {
  /** Maps from the backend's `offPlatformSalesEnabled` field. */
  enabled: boolean;
  itemCount: number;
  billingPeriodKey: string | null;
  /** Always 0: off-platform sales are never charged (Patrick 2026-10-23). */
  amountCents: number | null;
  /** Always false: no fee applies to off-platform sales. */
  feeApplies: boolean;
  /** Legacy field, always false. */
  pricingNotYetSet: boolean;
}

const DEFAULT_USAGE: OffPlatformUsage = {
  enabled: false,
  itemCount: 0,
  billingPeriodKey: null,
  amountCents: 0,
  feeApplies: false,
  pricingNotYetSet: false,
};

/**
 * Current opt-in status + this-billing-period usage.
 * Fails closed: a fetch error (including a 404 if the backend endpoint were
 * ever unreachable) is swallowed and reported as "not enabled" via the
 * `usage` fallback rather than thrown, so callers can render a safe default
 * instead of crashing. Check `isLoading`/`isError` if you need to
 * distinguish "still finding out" from "confirmed off".
 */
export function useOffPlatformUsage() {
  const query = useQuery({
    queryKey: ['off-platform-usage'],
    queryFn: async () => {
      const response = await api.get('/billing/off-platform-usage');
      const data = response.data || {};
      return {
        enabled: !!data.offPlatformSalesEnabled,
        itemCount: data.itemCount ?? 0,
        billingPeriodKey: data.billingPeriodKey ?? null,
        amountCents: data.amountCents ?? 0,
        feeApplies: data.feeApplies === true,
        pricingNotYetSet: data.pricingNotYetSet === true,
      } as OffPlatformUsage;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  return {
    ...query,
    /** Safe default while loading or on error -- never treat "unknown" as "enabled". */
    usage: query.data ?? DEFAULT_USAGE,
  };
}

/**
 * Toggles Organizer.offPlatformSalesEnabled. This is a real on/off switch --
 * the endpoint name says "opt-in" but its body is `{ enabled: boolean }` and
 * it accepts false too (turning it off pauses the feature; the backend
 * never clears the historical consent timestamp when that happens).
 */
export function useOffPlatformOptIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await api.post('/billing/off-platform-sales/opt-in', { enabled });
      return response.data as {
        ok: boolean;
        offPlatformSalesEnabled: boolean;
        offPlatformSalesConsentedAt: string | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['off-platform-usage'] });
    },
  });
}

export interface MarkSoldOffPlatformPayload {
  reportedAmount?: number;
  paymentMethodNote?: string;
  buyerNameNote?: string;
  buyerEmailNote?: string;
}

/**
 * Marks one item sold off-platform. Single item at a time by design (the
 * backend 400s any item with stockTotal>1 -- see the architecture doc) --
 * a caller that needs to apply this to several selected items loops over
 * this function itself; there is no bulk variant of this endpoint.
 */
export async function markItemSoldOffPlatform(
  itemId: string,
  payload: MarkSoldOffPlatformPayload
) {
  const response = await api.post(`/items/${itemId}/mark-sold-off-platform`, payload);
  return response.data;
}

export interface OffPlatformSaleLogEntry {
  id: string;
  itemId: string;
  item?: { id: string; title?: string; photoUrls?: string[] } | null;
  saleId: string;
  quantity: number;
  reportedAmount?: string | number | null;
  paymentMethodNote?: string | null;
  buyerNameNote?: string | null;
  buyerEmailNote?: string | null;
  billingPeriodKey?: string;
  invoiceId?: string | null;
  createdAt: string;
}

/**
 * Undo a mark-sold-off-platform action (2026-09-07). Backend scopes this tightly --
 * only fires on an item that is SOLD via lastSoldVia === 'OFF_PLATFORM_MANUAL' and
 * whose OffPlatformSale row is not yet invoiced. Reverts Item.status to AVAILABLE and
 * removes the row from this log. See itemController.ts's undoItemSoldOffPlatform for
 * the full rationale -- this is BYOR's own undo path since BYOR sales have no Purchase
 * record for the existing refund-based undo flow to key off.
 */
export function useUndoOffPlatformSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.post(`/items/${itemId}/undo-sold-off-platform`);
      return response.data as { ok: boolean; item: { id: string; status: string } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['off-platform-sales-log'] });
      queryClient.invalidateQueries({ queryKey: ['off-platform-usage'] });
    },
  });
}

export interface OffPlatformSalesLogPage {
  items: OffPlatformSaleLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Organizer's own off-platform sales log (GET /organizers/off-platform-sales).
 * v1 fetches the first page only -- the endpoint supports ?page=&limit= for
 * a future "load more" control, not wired up yet since nothing in this
 * dispatch's scope needed it.
 */
export function useOffPlatformSalesLog() {
  const query = useQuery({
    queryKey: ['off-platform-sales-log'],
    queryFn: async () => {
      const response = await api.get('/organizers/off-platform-sales');
      const data = response.data || {};
      return {
        items: Array.isArray(data.items) ? (data.items as OffPlatformSaleLogEntry[]) : [],
        page: data.page ?? 1,
        limit: data.limit ?? 25,
        total: data.total ?? 0,
        totalPages: data.totalPages ?? 1,
      } as OffPlatformSalesLogPage;
    },
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    /** Flat list for callers that just want to render the log -- defaults to []. */
    data: query.data?.items ?? [],
    page: query.data ?? null,
  };
}
