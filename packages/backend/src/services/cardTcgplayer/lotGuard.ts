/**
 * Keeps bulk lots out of the TCGplayer round trip (ADR-136 Addendum C, ADR-137). A lot is a count of cards priced per
 * 1,000, and TCGplayer has no row for it, so a TCGplayer file must never sell cards from one or add cards to one.
 * buildGroups (groups.ts) already drops lots from every export and reconcile plan; these two guards are the second
 * line of defense at the two places stock is written (wiring.ts), so a lot cannot be touched even if a group were
 * built from a lot by mistake. Pure: the transaction is passed in.
 */

export const TCGPLAYER_LOT_ERROR = 'Bulk lots are not part of the TCGplayer update, so their stock was not changed.';

/** Throws when `itemId` is a bulk lot. Run before any stock write that comes from a TCGplayer file. */
export async function assertNotBulkLot(tx: { item: { findMany(args: any): Promise<any[]> } }, itemId: string): Promise<void> {
  const rows = await tx.item.findMany({ where: { id: itemId, bulkLot: { isNot: null } }, select: { id: true }, take: 1 });
  if (rows.length > 0) throw new Error(TCGPLAYER_LOT_ERROR);
}
