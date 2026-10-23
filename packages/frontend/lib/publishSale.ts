/**
 * publishSale: the one place the frontend asks the server to make a sale PUBLISHED.
 *
 * Contract (backend, 2026-10-13): PATCH /api/sales/:id/status with { status: 'PUBLISHED' }
 * on a sale with zero items answers HTTP 409 { code: 'EMPTY_SALE_PUBLISH', itemCount: 0, message }.
 * Sending { status: 'PUBLISHED', allowEmpty: true } publishes it anyway.
 *
 * allowEmpty must only ever be sent after the organizer confirmed in PublishWithoutItemsDialog.
 *
 * Ready items (2026-10-23): publishing a sale also publishes its unpublished items that are ready (a title,
 * a price above zero and a photo), in one server transaction, unless the body says publishReadyItems: false.
 * GET /api/sales/:id/publish-readiness lists which items will go live and which are not ready and why;
 * PublishSaleItemsDialog shows it with "Also publish N ready items" ticked by default.
 * Every caller goes through useGuardedPublish (hooks/useGuardedPublish.tsx) or, for the
 * create-sale wizard which owns its own copy of that dialog, through these two functions.
 */
import api from './api';

export const EMPTY_SALE_PUBLISH_CODE = 'EMPTY_SALE_PUBLISH';

export interface PublishSaleOptions {
  /** Only true after the organizer chose "Publish, then add items" in PublishWithoutItemsDialog. */
  allowEmpty?: boolean;
  /** false only when the organizer unticked "Also publish N ready items". Omitted means yes. */
  publishReadyItems?: boolean;
}

export async function publishSaleStatus(saleId: string, opts: PublishSaleOptions = {}) {
  const body: { status: 'PUBLISHED'; allowEmpty?: true; publishReadyItems?: boolean } = { status: 'PUBLISHED' };
  if (opts.allowEmpty === true) body.allowEmpty = true;
  if (typeof opts.publishReadyItems === 'boolean') body.publishReadyItems = opts.publishReadyItems;
  return api.patch(`/sales/${saleId}/status`, body);
}

export interface SalePublishReadiness {
  readyItems: Array<{ id: string; title: string }>;
  notReadyItems: Array<{ id: string; title: string; reasons: string[]; reasonLabels: string[] }>;
  publishedItemCount: number;
}

/** Unpublished items that will go live with the sale, and the ones that are not ready. null when unavailable. */
export async function fetchSalePublishReadiness(saleId: string): Promise<SalePublishReadiness | null> {
  try {
    const res = await api.get(`/sales/${saleId}/publish-readiness`);
    const d = res?.data;
    if (!d || !Array.isArray(d.readyItems) || !Array.isArray(d.notReadyItems)) return null;
    return {
      readyItems: d.readyItems,
      notReadyItems: d.notReadyItems,
      publishedItemCount: typeof d.publishedItemCount === 'number' ? d.publishedItemCount : 0,
    };
  } catch {
    // Older backend or a network blip: publish still works, the server applies its default.
    return null;
  }
}

/** True when the server refused because the organizer's email is not verified yet (verify to publish, 2026-10-23). */
export function isEmailNotVerifiedError(error: unknown): boolean {
  const err = error as { response?: { status?: number; data?: { code?: string } } } | null;
  return err?.response?.status === 403 && err?.response?.data?.code === 'EMAIL_NOT_VERIFIED';
}

/** True when the server rolled the whole publish back because an item changed mid-publish. */
export function isSaleItemsChangedError(error: unknown): boolean {
  const err = error as { response?: { status?: number; data?: { code?: string } } } | null;
  return err?.response?.status === 409 && err?.response?.data?.code === 'SALE_ITEMS_CHANGED';
}

/** True when the server refused the publish because the sale has no items yet. */
export function isEmptySalePublishError(error: unknown): boolean {
  const err = error as { response?: { status?: number; data?: { code?: string } } } | null;
  return err?.response?.status === 409 && err?.response?.data?.code === EMPTY_SALE_PUBLISH_CODE;
}

/** True when the server refused the publish because of the concurrent-sales tier limit. */
export function isTierLimitPublishError(error: unknown): boolean {
  const err = error as { response?: { status?: number; data?: { code?: string } } } | null;
  return err?.response?.status === 409 && err?.response?.data?.code === 'TIER_LIMIT_EXCEEDED';
}
