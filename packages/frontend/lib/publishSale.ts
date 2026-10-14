/**
 * publishSale: the one place the frontend asks the server to make a sale PUBLISHED.
 *
 * Contract (backend, 2026-10-13): PATCH /api/sales/:id/status with { status: 'PUBLISHED' }
 * on a sale with zero items answers HTTP 409 { code: 'EMPTY_SALE_PUBLISH', itemCount: 0, message }.
 * Sending { status: 'PUBLISHED', allowEmpty: true } publishes it anyway.
 *
 * allowEmpty must only ever be sent after the organizer confirmed in PublishWithoutItemsDialog.
 * Every caller goes through useGuardedPublish (hooks/useGuardedPublish.tsx) or, for the
 * create-sale wizard which owns its own copy of that dialog, through these two functions.
 */
import api from './api';

export const EMPTY_SALE_PUBLISH_CODE = 'EMPTY_SALE_PUBLISH';

export interface PublishSaleOptions {
  /** Only true after the organizer chose "Publish, then add items" in PublishWithoutItemsDialog. */
  allowEmpty?: boolean;
}

export async function publishSaleStatus(saleId: string, opts: PublishSaleOptions = {}) {
  const body: { status: 'PUBLISHED'; allowEmpty?: true } = { status: 'PUBLISHED' };
  if (opts.allowEmpty === true) body.allowEmpty = true;
  return api.patch(`/sales/${saleId}/status`, body);
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
