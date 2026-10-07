/**
 * Consignor Square status helpers (2026-10-06). Dependency-free on purpose so controllers that
 * only need the status label (consignorController.ts listConsignors) do not pull the Square SDK
 * into their import graph. consignorSquareConnectService.ts re-exports these.
 */
export type ConsignorSquareStatus = 'NOT_CONNECTED' | 'ACTIVE' | 'NEEDS_ACTIVATION';

export function consignorSquareStatus(row: { squareAccountId?: string | null; squareOnboarded?: boolean | null }): ConsignorSquareStatus {
  if (!row.squareAccountId) return 'NOT_CONNECTED';
  return row.squareOnboarded ? 'ACTIVE' : 'NEEDS_ACTIVATION';
}

/** The consignor portal may only start a Square connection while the consignor is not fully connected. */
export function portalCanConnectSquare(row: { squareAccountId?: string | null; squareOnboarded?: boolean | null }): boolean {
  return !(row.squareOnboarded && row.squareAccountId);
}

/**
 * Every Square column on Consignor that a disconnect clears. ConnectBankFingerprint rows are NOT
 * Consignor columns and are kept on purpose (admin fraud-review evidence, keyed by merchant id);
 * payoutsFlaggedForReview / payoutsFlaggedReason are likewise left for admin review.
 */
export const CONSIGNOR_SQUARE_CLEARED_FIELDS = {
  squareAccountId: null,
  squareOnboarded: false,
  squareAccessTokenEncrypted: null,
  squareRefreshTokenEncrypted: null,
  squareTokenExpiresAt: null,
  squarePortalOAuthNonce: null,
} as const;

export interface ConsignorSquareRow {
  id: string;
  squareAccountId?: string | null;
  squareOnboarded?: boolean | null;
  squareAccessTokenEncrypted?: string | null;
  squareRefreshTokenEncrypted?: string | null;
  squarePortalOAuthNonce?: string | null;
}

/** True when the row holds any Square connection data worth clearing. */
export function consignorHasSquareData(row: Partial<ConsignorSquareRow>): boolean {
  return Boolean(
    row.squareAccountId ||
      row.squareOnboarded ||
      row.squareAccessTokenEncrypted ||
      row.squareRefreshTokenEncrypted ||
      row.squarePortalOAuthNonce
  );
}
