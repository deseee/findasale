/**
 * Bulk lot follow-up controller (ADR-136 Addendum B, roadmap #659): binds the handlers in bulkLotFollowupHandlers.ts to
 * the shared Prisma client, the stock helper, the hold-invoice recorder and Square. No logic lives here.
 */
import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { sellItemUnitsInTransaction } from '../services/itemStockService';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';
import { createHoldInvoiceSquareCheckout } from '../services/holdInvoiceSquareCheckoutHelper';
import { deleteSquareCheckoutLink } from '../services/squareCheckoutLinkService';
import { calculateInclusiveCommissionCents, SubscriptionTier } from '../utils/feeCalculator';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';
import { onBulkHoldEnded, onBulkHoldPlaced } from '../services/bulkLot/bulkLotHoldEmailWiring'; // ADR-136 Addendum D: customer emails for holds
import { createBulkLotFollowupHandlers, FollowupDeps } from './bulkLotFollowupHandlers';
import { gateCardCharge } from '../services/restrictedItem/cardPaymentGate'; // 2026-11-06 restricted-item card gate

export const bulkLotFollowupHandlers = createBulkLotFollowupHandlers({
  db: prisma as unknown as FollowupDeps['db'],
  env: process.env,
  publicFilter: PUBLIC_ITEM_FILTER as Record<string, unknown>,
  resolveActor: (req, res) => resolveOrganizerOrTeamMember(req, res, { requireStripe: false }),
  sell: (tx, itemId, units) => sellItemUnitsInTransaction(tx, itemId, units),
  markPaid: (invoiceId, ref, opts) => markHoldInvoicePaid(invoiceId, ref, opts),
  createSquareLink: async (organizerId, p) => {
    // Restricted-item card gate (2026-11-06): the bulk lot hold's link charges the whole line. A block creates no link and
    // the convert answers BULK_HOLD_PAYMENT_FAILED with the gate's message (the hold stays active for a cash convert).
    const gate = await gateCardCharge({
      processor: 'SQUARE',
      organizerId,
      lines: [{ itemId: p.itemId ?? null, amountCents: p.amountCents }],
      cardChargeCents: p.amountCents,
      context: { path: 'square.pos.bulkLotHold', sessionRef: p.holdInvoiceId },
    });
    if (!gate.ok) return { ok: false, message: gate.body.message };
    const r = await createHoldInvoiceSquareCheckout({ organizerId, holdInvoiceId: p.holdInvoiceId, amountCents: p.amountCents, description: p.description, appFeeCents: p.appFeeCents });
    return r.ok ? { ok: true, url: r.url, paymentLinkId: r.paymentLinkId, orderId: r.orderId } : { ok: false, message: r.message };
  },
  deleteSquareLink: async (organizerId, p) => {
    const r = await deleteSquareCheckoutLink({ organizerId, paymentLinkId: p.paymentLinkId });
    return { ok: r.ok === true };
  },
  feeFor: (tier, amountCents) => calculateInclusiveCommissionCents(amountCents, (tier ?? 'SIMPLE') as SubscriptionTier, 'ONLINE'),
  afterStockChange: (itemId, why) => reconcileBulkLotEbayInBackgroundIfEnabled(itemId, why),
  holdNotify: { onPlaced: onBulkHoldPlaced, onEnded: onBulkHoldEnded },
});
