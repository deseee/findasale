import { prisma } from '../lib/prisma';
import { calculateConsignorPayout } from './commissionCalcService';

/**
 * Feature #309 "item sold" consignor email: which consignor, and what they actually net.
 *
 * WHY THIS IS ITS OWN FILE (2026-09-29): stripeController's inline math used
 * `price * (100 - commissionRate) / 100`, but `Consignor.commissionRate` is the CONSIGNOR's share
 * (70.00 = the consignor gets 70%, see the schema comment and ADR-096), so the email told a 70%
 * consignor they would receive 30% of the price. It also picked the consignor from the sale's
 * first matching item row rather than from the sold item itself. Both are fixed here: the
 * consignor comes from the SOLD item's own `consignorId`, and the net comes from
 * calculateConsignorPayout, the one shared commission function (ADR-096: no second copy of the
 * commission math anywhere; it also honours tiered commission).
 */

export interface ConsignorItemSoldPayout {
  consignor: {
    id: string;
    name: string;
    email: string | null;
  };
  /** Dollars the consignor nets on this item, rounded half-up to cents by calculateConsignorPayout. */
  consignorPayout: number;
}

/**
 * Returns the sold item's consignor and their net, or null when the item has no consignor or the
 * consignor row is gone. Never throws for a missing consignor; a DB failure propagates so the
 * caller's existing try/catch logs it.
 */
export async function getConsignorItemSoldPayout(item: {
  id: string;
  price: number | null | undefined;
  consignorId?: string | null;
}): Promise<ConsignorItemSoldPayout | null> {
  if (!item.consignorId) return null;
  const consignor = await prisma.consignor.findUnique({ where: { id: item.consignorId } });
  if (!consignor) return null;

  const result = await calculateConsignorPayout(
    {
      id: consignor.id,
      workspaceId: consignor.workspaceId,
      commissionRate: consignor.commissionRate,
      useTieredCommission: consignor.useTieredCommission,
    },
    [{ id: item.id, price: item.price ?? 0 }]
  );

  return {
    consignor: { id: consignor.id, name: consignor.name, email: consignor.email },
    consignorPayout: Number(result.net.toFixed(2)),
  };
}
