/**
 * Ledger deletion guards (2026-11-05, schema review #3/#4).
 *
 * Migration z20261105000200_ledger_fk_restrict turns these foreign keys to ON DELETE RESTRICT so money records can no
 * longer be cascade-deleted with their parent:
 *   HoldInvoice.organizerUserId -> User, HoldInvoice.saleId -> Sale (HoldInvoice.shopperUserId is now SET NULL)
 *   ConsignorPayout.consignorId, ConsignorPayoutItem.consignorId -> Consignor
 *   ConsignorSettlementBatch.workspaceId -> OrganizerWorkspace
 *   VendorBoothPayout / VendorBoothFeeCharge.vendorBoothId -> VendorBooth
 *   BoothCartTransaction / HubOwnerShareManualPayout.hubId -> SaleHub
 *   SaleSettlement.saleId, SaleTransaction.saleId -> Sale; ClientPayout.settlementId -> SaleSettlement
 *
 * A hard delete of a User cascades User -> Organizer -> OrganizerWorkspace -> Consignor, so an account whose workspace
 * holds consignor payouts or settlement batches, or which is the organizer on any HoldInvoice, would now hit a raw
 * Postgres FK violation (a 500). The account-deletion paths call this first and answer with a clear message instead.
 * (Sales and sale hubs already block deletion through their own RESTRICT FKs and are counted by the callers.)
 */
import { prisma } from '../lib/prisma';

export interface UserLedgerBlockers {
  holdInvoices: number;
  consignorPayouts: number;
  consignorPayoutLines: number;
  consignorSettlementBatches: number;
}

export async function countUserLedgerBlockers(userId: string, organizerId: string | null | undefined): Promise<UserLedgerBlockers> {
  const [holdInvoices, consignorPayouts, consignorPayoutLines, consignorSettlementBatches] = await Promise.all([
    prisma.holdInvoice.count({ where: { organizerUserId: userId } }),
    organizerId ? prisma.consignorPayout.count({ where: { consignor: { workspace: { ownerId: organizerId } } } }) : Promise.resolve(0),
    organizerId ? prisma.consignorPayoutItem.count({ where: { consignor: { workspace: { ownerId: organizerId } } } }) : Promise.resolve(0),
    organizerId ? prisma.consignorSettlementBatch.count({ where: { workspace: { ownerId: organizerId } } }) : Promise.resolve(0),
  ]);
  return { holdInvoices, consignorPayouts, consignorPayoutLines, consignorSettlementBatches };
}

/** Human-readable blocker phrases (empty when nothing blocks), in the style of userController.deleteAccount's list. */
export function describeUserLedgerBlockers(b: UserLedgerBlockers): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (b.holdInvoices > 0) out.push(plural(b.holdInvoices, 'invoice', 'invoices'));
  if (b.consignorPayouts > 0) out.push(plural(b.consignorPayouts, 'consignor payout', 'consignor payouts'));
  if (b.consignorPayoutLines > 0) out.push(plural(b.consignorPayoutLines, 'consignor payout line', 'consignor payout lines'));
  if (b.consignorSettlementBatches > 0) out.push(plural(b.consignorSettlementBatches, 'consignor settlement batch', 'consignor settlement batches'));
  return out;
}
