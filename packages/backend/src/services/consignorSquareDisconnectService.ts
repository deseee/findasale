/**
 * Consignor Square disconnect helpers (2026-10-06). Shared by the portal self-serve disconnect
 * (consignorSquareConnectService.disconnectPortalSquare) and the organizer-side archive purge
 * (consignorController.setConsignorArchived), so both clear exactly the same columns and revoke the
 * same way. Ledger, payout and sales records are never touched here.
 *
 * Revoke rule: Square's POST /oauth2/revoke revokes EVERY OAuth token the merchant has granted this
 * application, whichever token is named (Square docs, RevokeToken). One Square merchant can
 * legitimately be connected on several rows (same person consigning for several organizers, or also
 * an organizer / booth operator; see consignorSquareConnectService header). So the revoke is skipped
 * whenever any OTHER row still holds a token for the same merchant, to avoid breaking those
 * connections; the stored tokens are still cleared locally. Any failure is non-fatal and logged
 * without token material.
 */
import { prisma } from '../lib/prisma';
import { decryptToken } from '../utils/tokenCrypto';
import { revokeSquareAccessToken } from './squareConnectService';
import { CONSIGNOR_SQUARE_CLEARED_FIELDS, consignorHasSquareData, type ConsignorSquareRow } from '../utils/consignorSquareStatus';

// Re-exported so service callers have one import; the controller imports them from utils directly
// (it must not pull the Square SDK into its import graph, see utils/consignorSquareStatus.ts).
export { CONSIGNOR_SQUARE_CLEARED_FIELDS, consignorHasSquareData };
export type { ConsignorSquareRow };

export interface ConsignorSquareRevokeResult {
  revoked: boolean;
  skippedSharedMerchant: boolean;
}

async function otherHoldersOfMerchant(merchantId: string, excludeConsignorId: string): Promise<boolean> {
  const [consignors, organizers, booths] = await Promise.all([
    prisma.consignor.count({
      where: { squareAccountId: merchantId, id: { not: excludeConsignorId }, squareAccessTokenEncrypted: { not: null } },
    }),
    prisma.organizer.count({ where: { squareMerchantId: merchantId, squareAccessTokenEncrypted: { not: null } } }),
    prisma.vendorBooth.count({ where: { squareAccountId: merchantId, squareAccessTokenEncrypted: { not: null } } }),
  ]);
  return consignors + organizers + booths > 0;
}

/** Revokes the consignor's stored Square token at Square when safe. Never throws. */
export async function revokeConsignorSquareConnection(row: ConsignorSquareRow): Promise<ConsignorSquareRevokeResult> {
  try {
    if (!row.squareAccessTokenEncrypted) return { revoked: false, skippedSharedMerchant: false };
    if (row.squareAccountId) {
      let shared = true; // fail safe: if the lookup fails, do not risk revoking someone else's connection
      try {
        shared = await otherHoldersOfMerchant(row.squareAccountId, row.id);
      } catch (err: any) {
        console.warn('[consignorSquareDisconnect] shared-merchant lookup failed; skipping Square revoke:', err?.message || err);
      }
      if (shared) {
        console.log(`[consignorSquareDisconnect] Square merchant also connected elsewhere; not revoking at Square for consignor ${row.id}.`);
        return { revoked: false, skippedSharedMerchant: true };
      }
    }
    let accessToken: string;
    try {
      accessToken = decryptToken(row.squareAccessTokenEncrypted);
    } catch {
      console.warn(`[consignorSquareDisconnect] could not decrypt stored token for consignor ${row.id}; not revoked at Square.`);
      return { revoked: false, skippedSharedMerchant: false };
    }
    const revoked = await revokeSquareAccessToken(accessToken);
    if (!revoked) console.warn(`[consignorSquareDisconnect] Square revoke not confirmed for consignor ${row.id}; clearing locally anyway.`);
    return { revoked, skippedSharedMerchant: false };
  } catch (err: any) {
    console.warn('[consignorSquareDisconnect] revoke failed (non-fatal):', err?.message || err);
    return { revoked: false, skippedSharedMerchant: false };
  }
}
