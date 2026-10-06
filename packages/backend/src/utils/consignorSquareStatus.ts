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
