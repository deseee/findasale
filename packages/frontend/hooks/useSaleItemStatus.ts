/**
 * useSaleItemStatus: guided first-sale flow (spec: claude_docs/ux-spotchecks/guided-first-sale-flow-spec-2026-10-12.md).
 *
 * Reuses the exact query the organizer dashboard already runs (GET /sales/mine under
 * ['organizer-sales', user.id]) so the dashboard pays no extra request, and add-items'
 * invalidation of ['organizer-sales'] refreshes every nudge automatically.
 *
 * stats.liveItemCount is new (backend getMySales, 2026-10-12). When it is missing (older
 * backend still deployed) it is treated as unknown: LIVE_UNREVIEWED is never computed and
 * the review-count line is never shown. Frontend and backend may deploy in either order.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

export type SaleItemState = 'LIVE_EMPTY' | 'LIVE_UNREVIEWED' | 'DRAFT_READY' | 'DRAFT_EMPTY' | 'OK';

export interface SaleItemSummary {
  id: string;
  title?: string;
  status: string; // DRAFT | PUBLISHED | ENDED
  saleType?: string | null;
  endDate?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  stats?: {
    itemCount?: number;
    liveItemCount?: number;
    holdCount?: number;
    visitorCount?: number;
  };
}

export interface SaleItemNudge {
  sale: SaleItemSummary;
  state: Exclude<SaleItemState, 'OK' | 'DRAFT_EMPTY'>;
  total: number;
  live: number | undefined;
}

export function getSaleItemState(sale: SaleItemSummary | null | undefined): SaleItemState {
  if (!sale) return 'OK';
  const total = sale.stats?.itemCount ?? 0;
  const live = sale.stats?.liveItemCount;
  if (sale.status === 'PUBLISHED') {
    if (total === 0) return 'LIVE_EMPTY';
    if (typeof live === 'number' && live === 0) return 'LIVE_UNREVIEWED';
    return 'OK';
  }
  if (sale.status === 'DRAFT') {
    return total > 0 ? 'DRAFT_READY' : 'DRAFT_EMPTY';
  }
  return 'OK';
}

/**
 * True when the organizer has at least one OTHER non-deleted sale created before this one, i.e.
 * this is their second sale or later. Rule (Patrick, 2026-10-16): "simple is always free. Ala carte
 * is after the first one." The optional $9.99 per-sale upgrade is only offered when this is true.
 * Unknown (sale not in the list, list not loaded) returns false, so publishing is never held up.
 * Source is GET /sales/mine, which already excludes deleted sales and inventory containers.
 */
export function isSecondSaleOrLater(
  saleId: string | null | undefined,
  sales: Array<{ id: string; createdAt?: string | null }>
): boolean {
  if (!saleId) return false;
  const current = sales.find((s) => s.id === saleId);
  if (!current) return false;
  const others = sales.filter((s) => s.id !== saleId);
  if (others.length === 0) return false;
  const currentMs = current.createdAt ? Date.parse(current.createdAt) : NaN;
  if (!Number.isFinite(currentMs)) return true; // several sales and no usable timestamp
  return others.some((o) => {
    const ms = o.createdAt ? Date.parse(o.createdAt) : NaN;
    if (!Number.isFinite(ms)) return false;
    return ms < currentMs || (ms === currentMs && o.id < saleId);
  });
}

/** "1 item" / "3 items". Never renders a literal "(s)". */
export function pluralItems(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

const NUDGE_RANK: Record<SaleItemNudge['state'], number> = {
  LIVE_EMPTY: 0,
  LIVE_UNREVIEWED: 1,
  DRAFT_READY: 2,
};

function updatedAtMs(sale: SaleItemSummary): number {
  const t = sale.updatedAt ? Date.parse(sale.updatedAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Ordered dashboard nudges: LIVE_EMPTY, then LIVE_UNREVIEWED, then DRAFT_READY; newest first inside each. */
export function buildNudges(sales: SaleItemSummary[]): SaleItemNudge[] {
  const out: SaleItemNudge[] = [];
  for (const sale of sales) {
    const state = getSaleItemState(sale);
    if (state === 'LIVE_EMPTY' || state === 'LIVE_UNREVIEWED' || state === 'DRAFT_READY') {
      out.push({ sale, state, total: sale.stats?.itemCount ?? 0, live: sale.stats?.liveItemCount });
    }
  }
  out.sort((a, b) => NUDGE_RANK[a.state] - NUDGE_RANK[b.state] || updatedAtMs(b.sale) - updatedAtMs(a.sale));
  return out;
}

export function useSaleItemStatus() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery<SaleItemSummary[]>({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales || [];
    },
    enabled: !!user?.id,
  });

  const sales: SaleItemSummary[] = Array.isArray(data) ? data : [];
  // Never nudge from a state that cannot be computed (loading or error -> nothing).
  const ready = !isLoading && !isError && Array.isArray(data);
  const nudges = ready ? buildNudges(sales) : [];

  const findSale = (saleId?: string | null): SaleItemSummary | undefined =>
    saleId ? sales.find((s) => s.id === saleId) : undefined;

  const saleState = (saleId?: string | null): SaleItemState | null => {
    if (!ready) return null;
    const sale = findSale(saleId);
    return sale ? getSaleItemState(sale) : null;
  };

  return { sales, isLoading, isError, nudges, saleState, findSale };
}

export default useSaleItemStatus;

/** Optional measurement (spec "Optional measurement"). Never throws. */
export function trackNudgeEvent(name: string, params: Record<string, unknown>): void {
  try {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (w && typeof w.gtag === 'function') w.gtag('event', name, params);
  } catch {
    /* analytics must never break the page */
  }
}
