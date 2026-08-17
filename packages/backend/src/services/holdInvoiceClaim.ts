/**
 * Hold-to-Pay invoice claim primitives.
 *
 * Background (P0, 2026-08-16): markSoldAndCreateInvoice used to take its in-flight
 * claim by writing a `CLAIMING:<holdId>` sentinel into `ItemReservation.invoiceId`.
 * That column carries a live Postgres foreign key to `HoldInvoice.id`
 * (`ItemReservation_invoiceId_fkey`, created by migration 20260330_add_hold_invoice
 * but never declared in schema.prisma). Prisma/tsc therefore accepted the write and
 * Postgres rejected it every single time with P2003 -- Hold-to-Pay invoice creation
 * was 100% broken in production for every organizer and every item.
 *
 * The claim now lives in dedicated NON-FK columns on ItemReservation:
 *   invoiceClaimToken  String?    -- per-attempt fencing token (randomUUID)
 *   invoiceClaimedAt   DateTime?  -- claim timestamp; basis for the stale-claim steal
 *
 * `ItemReservation.invoiceId` goes back to meaning exactly one thing: a real
 * HoldInvoice row exists for this hold. Never write anything but a real
 * HoldInvoice.id or null into it.
 *
 * The old claim was load-bearing across six read sites precisely because it lived in
 * invoiceId and was visible to everything that checked that field. Every one of those
 * sites now uses the helpers below instead; anything that checks only `invoiceId` is
 * re-opening a cross-path double-sell window.
 */

/**
 * How long a claim is considered live before another request may steal it.
 * The Stripe node SDK's default request timeout is 80s, so a claim taken immediately
 * before a Stripe Checkout Session create cannot legitimately outlive this window.
 */
export const INVOICE_CLAIM_TTL_MS = 120_000;

export const invoiceClaimCutoff = () => new Date(Date.now() - INVOICE_CLAIM_TTL_MS);

/**
 * Prisma WHERE fragment: this reservation is free to invoice -- no real invoice, and no
 * live in-flight claim. NOTE the explicit OR-with-null form: a `{ not: ... }` filter would
 * silently drop NULL rows in Prisma, which would exclude every unclaimed hold -- the exact
 * opposite of what is wanted here.
 */
export const invoiceableWhere = () => ({
  invoiceId: null,
  OR: [
    { invoiceClaimToken: null },
    { invoiceClaimedAt: { lt: invoiceClaimCutoff() } },
  ],
});

/** True if this row currently has a real invoice OR a live claim. For in-memory checks. */
export const isInvoicedOrClaimed = (r: { invoiceId: string | null; invoiceClaimedAt: Date | null }) =>
  !!r.invoiceId || (!!r.invoiceClaimedAt && r.invoiceClaimedAt >= invoiceClaimCutoff());

/**
 * HoldInvoice statuses that mean "this invoice is dead and will never be paid".
 * A dead invoice must not keep holding anything hostage.
 */
export const DEAD_INVOICE_STATUSES = ['CANCELLED', 'EXPIRED'] as const;

/**
 * Release the `HoldInvoice.reservationId` anchor held by any DEAD invoice on these
 * reservations.
 *
 * P0 (2026-08-17, found by live Chrome QA against SHA 73233bbd3, corroborated by a
 * direct production read the same day): `HoldInvoice.reservationId` is `@unique`
 * (`HoldInvoice_reservationId_key`, confirmed live in Postgres) and NOTHING ever
 * nulled it. releaseInvoice flipped the invoice to CANCELLED, invoiceExpiryJob and
 * stripeController's charge.failed flipped it to EXPIRED -- all three cleared
 * `ItemReservation.invoiceId` but left the invoice's own anchor pointing back at the
 * reservation forever. The very next invoice attempt on that hold therefore died with
 * P2002 on `reservationId`, permanently. Production carried exactly this row:
 * HoldInvoice `cmswti848000jgse8z2y9gyhx`, status CANCELLED, releasedAt 2026-08-17
 * 05:58, still anchored to reservation `cmswtg37s000ggse82x6jqxy5`.
 *
 * The durable fix is twofold and both halves are needed:
 *   (a) every terminal transition now writes `reservationId: null` alongside the
 *       status flip (releaseInvoice, invoiceExpiryJob, charge.failed), so no NEW
 *       dead anchor is ever created; and
 *   (b) this function, called immediately before every HoldInvoice insert, clears
 *       any dead anchor already on the row -- which is what unbricks holds stranded
 *       by (a)'s absence before it shipped, with no data migration required.
 *
 * Deliberately scoped to DEAD statuses only: a PENDING invoice's anchor is live and
 * must never be stolen (that would silently detach a payable invoice), and a PAID
 * invoice's anchor is the historical record of a completed sale.
 *
 * Accepts either the global prisma client or a `$transaction` tx -- callers inside a
 * transaction should pass `tx` so the clear and the insert commit together.
 */
export async function releaseDeadInvoiceAnchors(
  // Structurally typed so the SAME function accepts both the global prisma client and a
  // `$transaction` tx without importing @prisma/client here (this module is deliberately
  // dependency-free so every call site can import it without a cycle).
  client: { holdInvoice: { updateMany: (args: any) => Promise<any> } },
  reservationIds: string[]
): Promise<number> {
  const ids = reservationIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await client.holdInvoice.updateMany({
    where: { reservationId: { in: ids }, status: { in: [...DEAD_INVOICE_STATUSES] } },
    data: { reservationId: null },
  });
  const count: number = result?.count ?? 0;
  if (count > 0) {
    console.log(`[hold-invoice] Released ${count} dead HoldInvoice anchor(s) blocking reservation(s) ${ids.join(',')}.`);
  }
  return count;
}

export class InvoiceClaimLostError extends Error {
  constructor() { super('Invoice claim lost to a concurrent request'); }
}
