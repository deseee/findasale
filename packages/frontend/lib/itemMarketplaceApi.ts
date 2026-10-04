/**
 * Client for the item marketplace endpoints used by the item form (Edit page and the sheet).
 *
 *   GET  /items/:id/marketplace-status         per-platform status, eBay hold, failed-push count, recent eBay pushes
 *   POST /items/:id/marketplace-push/ack       mark this item's failed eBay pushes as seen
 *   POST /items/:id/ebay-repush                "Update eBay now" (body { retry: true } only for a retry)
 *   POST /items/:id/ebay-hold/release          "Resume syncing"
 *
 * Pure module: it takes the axios-style client as an argument (the app passes lib/api, tests pass a stub), so it has no
 * imports and no side effects. Booleans in request bodies are strict: `retry` is sent only when it is exactly true.
 */

export type PushStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED_HELD' | 'SKIPPED_NOT_LISTED';

export interface PushRow {
  id: string;
  trigger?: string;
  status: PushStatus | string;
  fieldsAttempted: string[];
  fieldsPushed?: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
  /** The server sends startedAt/finishedAt; createdAt is read too in case a later version adds it. */
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** The server sends `acknowledged` (boolean); acknowledgedAt is read too. */
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
}

export type PlatformStatusValue = 'live' | 'listed_needs_manual_update' | 'eligible' | 'none' | 'paused';

export interface PlatformEntry {
  platform: string;
  label: string;
  status: PlatformStatusValue | string;
  ids?: Record<string, string | null>;
  lastPush?: PushRow | null;
  heldAt?: string | null;
  ineligible?: boolean;
}

export interface EbayHold {
  heldAt: string | null;
  heldFields: string[];
  contentDirtyAt: string | null;
}

export interface MarketplaceStatus {
  itemId: string;
  platforms: Record<string, PlatformEntry>;
  ebayHold: EbayHold;
  failedUnacknowledgedPushCount: number;
  recentPushes: PushRow[];
}

export interface RepushOutcome {
  status: PushStatus | string;
  fieldsAttempted: string[];
  fieldsPushed?: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface RepushResult {
  outcome: RepushOutcome | null;
  ebayHold: EbayHold;
  message: string;
}

/** The slice of axios the module needs. */
export interface ApiClientLike {
  get(url: string, config?: unknown): Promise<{ data: any }>;
  post(url: string, body?: unknown, config?: unknown): Promise<{ data: any }>;
}

const EMPTY_HOLD: EbayHold = { heldAt: null, heldFields: [], contentDirtyAt: null };

function normalizeHold(raw: any): EbayHold {
  return {
    heldAt: typeof raw?.heldAt === 'string' && raw.heldAt ? raw.heldAt : null,
    heldFields: Array.isArray(raw?.heldFields) ? raw.heldFields.filter((f: unknown) => typeof f === 'string') : [],
    contentDirtyAt: typeof raw?.contentDirtyAt === 'string' && raw.contentDirtyAt ? raw.contentDirtyAt : null,
  };
}

/** Defaults every field the UI reads so a partial or older response never throws. */
export function normalizeMarketplaceStatus(raw: any, itemId: string): MarketplaceStatus {
  return {
    itemId: typeof raw?.itemId === 'string' ? raw.itemId : itemId,
    platforms: raw && typeof raw.platforms === 'object' && raw.platforms ? raw.platforms : {},
    ebayHold: raw?.ebayHold ? normalizeHold(raw.ebayHold) : { ...EMPTY_HOLD },
    failedUnacknowledgedPushCount:
      typeof raw?.failedUnacknowledgedPushCount === 'number' ? raw.failedUnacknowledgedPushCount : 0,
    recentPushes: Array.isArray(raw?.recentPushes) ? raw.recentPushes : [],
  };
}

const enc = (id: string) => encodeURIComponent(id);

export function createItemMarketplaceApi(client: ApiClientLike) {
  return {
    async getStatus(itemId: string): Promise<MarketplaceStatus> {
      const res = await client.get(`/items/${enc(itemId)}/marketplace-status`);
      return normalizeMarketplaceStatus(res.data, itemId);
    },

    async ackPushFailures(itemId: string): Promise<{ acknowledged: number }> {
      const res = await client.post(`/items/${enc(itemId)}/marketplace-push/ack`);
      return { acknowledged: typeof res.data?.acknowledged === 'number' ? res.data.acknowledged : 0 };
    },

    /** retry is sent as { retry: true } only when strictly true; otherwise there is no body. */
    async repush(itemId: string, opts?: { retry?: boolean }): Promise<RepushResult> {
      const url = `/items/${enc(itemId)}/ebay-repush`;
      const res = opts && opts.retry === true ? await client.post(url, { retry: true }) : await client.post(url);
      return {
        outcome: res.data?.outcome ?? null,
        ebayHold: res.data?.ebayHold ? normalizeHold(res.data.ebayHold) : { ...EMPTY_HOLD },
        message: typeof res.data?.message === 'string' ? res.data.message : '',
      };
    },

    async releaseHold(itemId: string): Promise<{ released: boolean; ebayHold: EbayHold }> {
      const res = await client.post(`/items/${enc(itemId)}/ebay-hold/release`);
      return {
        released: res.data?.released === true,
        ebayHold: res.data?.ebayHold ? normalizeHold(res.data.ebayHold) : { ...EMPTY_HOLD },
      };
    },
  };
}

export type ItemMarketplaceApi = ReturnType<typeof createItemMarketplaceApi>;

/** The server's own message for a failed request (409 "already running", 429 "too many", 4xx validation), or the fallback. */
export function marketplaceErrorMessage(err: unknown, fallback: string): string {
  const data = (err as any)?.response?.data;
  const msg = data?.message ?? data?.error;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}
