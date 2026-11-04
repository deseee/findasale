/**
 * Hold settlement guard for Mark Sold -> RECORD / POS_CART (2026-11-04).
 *
 * A CHECKOUT_LINK settlement moves the held item to INVOICE_ISSUED and creates an ACTIVE
 * POSPaymentLink, but it sets neither ItemReservation.invoiceId nor the invoice claim, so
 * isInvoicedOrClaimed() is blind to it. RECORD then wrote a PAID cash Purchase while the
 * shopper could still pay the Square link, settling the item twice. And when the link IS paid,
 * posPaymentLinkRecorder records the sale without closing the hold, so the hold stayed on the
 * holds list and could be recorded again.
 *
 * Rules (any one refuses the whole batch):
 *   - PAYMENT_LINK_OPEN: the item is INVOICE_ISSUED, or an ACTIVE payment link covers it.
 *   - HOLD_ALREADY_PAID: the item is SOLD, or the item is no longer RESERVED (a live hold always
 *     keeps its item RESERVED) and a COMPLETED payment link covers it.
 */

export type HoldSettlementConflictCode = 'PAYMENT_LINK_OPEN' | 'HOLD_ALREADY_PAID';

export interface HoldSettlementConflict {
  code: HoldSettlementConflictCode;
  message: string;
  itemId: string;
}

export interface GuardHold {
  item: { id: string; status: string };
}

type PaymentLinkReader = {
  pOSPaymentLink: {
    findMany: (args: any) => Promise<Array<{ itemIds: string[]; status: string }>>;
  };
};

export const PAYMENT_LINK_OPEN_MESSAGE =
  'One or more of these holds has a checkout link out that the shopper can still pay. Cancel the payment request first, or wait for the shopper to pay.';
export const HOLD_ALREADY_PAID_MESSAGE =
  'One or more of these holds has already been paid. It cannot be marked sold again.';

export async function findHoldSettlementConflict(
  db: PaymentLinkReader,
  organizerId: string,
  holds: GuardHold[]
): Promise<HoldSettlementConflict | null> {
  for (const h of holds) {
    if (h.item.status === 'INVOICE_ISSUED') {
      return { code: 'PAYMENT_LINK_OPEN', message: PAYMENT_LINK_OPEN_MESSAGE, itemId: h.item.id };
    }
    if (h.item.status === 'SOLD') {
      return { code: 'HOLD_ALREADY_PAID', message: HOLD_ALREADY_PAID_MESSAGE, itemId: h.item.id };
    }
  }
  const itemIds = holds.map((h) => h.item.id);
  if (itemIds.length === 0) return null;
  const links = await db.pOSPaymentLink.findMany({
    where: { organizerId, status: { in: ['ACTIVE', 'COMPLETED'] }, itemIds: { hasSome: itemIds } },
    select: { itemIds: true, status: true },
  });
  const active = new Set<string>();
  const completed = new Set<string>();
  for (const link of links) {
    for (const id of link.itemIds) (link.status === 'ACTIVE' ? active : completed).add(id);
  }
  for (const h of holds) {
    if (active.has(h.item.id)) {
      return { code: 'PAYMENT_LINK_OPEN', message: PAYMENT_LINK_OPEN_MESSAGE, itemId: h.item.id };
    }
  }
  for (const h of holds) {
    if (h.item.status !== 'RESERVED' && completed.has(h.item.id)) {
      return { code: 'HOLD_ALREADY_PAID', message: HOLD_ALREADY_PAID_MESSAGE, itemId: h.item.id };
    }
  }
  return null;
}

/** Thrown inside the RECORD transaction when the re-check finds a conflict. */
export class HoldSettlementConflictError extends Error {
  constructor(public readonly conflict: HoldSettlementConflict) {
    super(conflict.message);
    this.name = 'HoldSettlementConflictError';
  }
}
