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

export class InvoiceClaimLostError extends Error {
  constructor() { super('Invoice claim lost to a concurrent request'); }
}
