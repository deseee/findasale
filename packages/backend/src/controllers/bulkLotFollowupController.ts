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

export const bulkLotFollowupHandlers = createBulkLotFollowupHandlers({
  db: prisma as unknown as FollowupDeps['db'],
  env: process.env,
  publicFilter: PUBLIC_ITEM_FILTER as Record<string, unknown>,
  resolveActor: (req, res) => resolveOrganizerOrTeamMember(req, res, { requireStripe: false }),
  sell: (tx, itemId, units) => sellItemUnitsInTransaction(tx, itemId, units),
  markPaid: (invoiceId, ref, opts) => markHoldInvoicePaid(invoiceId, ref, opts),
  createSquareLink: async (organizerId, p) => {
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
