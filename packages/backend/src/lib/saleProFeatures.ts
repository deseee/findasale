/**
 * saleProFeatures.ts -- the ONE place that decides whether a sale gets PRO features.
 *
 * Patrick's rules (2026-10-16): SIMPLE always publishes free. From the second sale on, a SIMPLE organizer may buy the
 * optional $9.99 a-la-carte upgrade for ONE sale. The payment paths (squarePaymentController.createAlaCarteSquarePayment
 * and the two ALA_CARTE branches in stripeController) set Sale.purchaseModel = 'ALA_CARTE' and alaCarteFeePaid = true.
 * The upgrade is advertised (organizer/subscription.tsx, pricing.tsx, AlaCartePublishModal.tsx, TierComparisonTable.tsx)
 * as including, for that sale only:
 *   - 10 photos per item                    -> effectiveTierForSale() (itemController photo + import caps)
 *   - 500 auto tags for that sale's items   -> ALA_CARTE_AI_TAGS_PER_SALE, metered per sale in lib/aiTagsQuotaTracker.ts
 *   - Flip Report                           -> middleware/requireTier.ts requireTierOrSaleUpgrade (routes/flipReport.ts)
 *   - Virtual Queue                         -> same middleware (routes/lines.ts organizer routes)
 *
 * Security invariants (findasale-hacker pass, 2026-10-23):
 *   - Per sale, never per organizer: another sale of the same organizer never gets the benefits.
 *   - Owner only: the sale's organizerId must equal the caller's own Organizer.id. Other organizers, a staff member's
 *     own organizer profile, and shoppers never qualify (the caller's tier is never borrowed from the sale owner).
 *   - Not client-settable: purchaseModel / alaCarteFeePaid are not in saleCreateSchema / saleUpdateSchema (zod strips
 *     unknown keys); only the payment webhooks write them. Both must be set, so a half-written row grants nothing.
 */

import { prisma } from './prisma';
import { organizerHasTier } from '../utils/tierAccess';

/** Auto tags included with the $9.99 upgrade, usable only on items of that one sale. */
export const ALA_CARTE_AI_TAGS_PER_SALE = 500;

export interface SaleEntitlementFields {
  id?: string;
  organizerId: string;
  purchaseModel?: string | null;
  alaCarteFeePaid?: boolean | null;
}

export interface OrganizerEntitlementFields {
  id: string;
  subscriptionTier?: string | null;
}

/** Prisma select for loadSaleEntitlement and for callers that want to pass a sale straight in. */
export const SALE_ENTITLEMENT_SELECT = {
  id: true,
  organizerId: true,
  purchaseModel: true,
  alaCarteFeePaid: true,
} as const;

/** True when the $9.99 upgrade was paid for this sale (both columns set by the payment webhook). */
export function isPaidAlaCarteSale(sale: Pick<SaleEntitlementFields, 'purchaseModel' | 'alaCarteFeePaid'> | null | undefined): boolean {
  return !!sale && sale.purchaseModel === 'ALA_CARTE' && sale.alaCarteFeePaid === true;
}

function ownsSale(sale: SaleEntitlementFields | null | undefined, organizer: OrganizerEntitlementFields | null | undefined): boolean {
  return !!sale && !!organizer && typeof organizer.id === 'string' && organizer.id.length > 0 && sale.organizerId === organizer.id;
}

/** The organizer owns this sale AND paid the $9.99 upgrade for it. Independent of the organizer's tier. */
export function saleHasAlaCarteUpgrade(
  sale: SaleEntitlementFields | null | undefined,
  organizer: OrganizerEntitlementFields | null | undefined,
): boolean {
  return ownsSale(sale, organizer) && isPaidAlaCarteSale(sale);
}

/**
 * True when this organizer gets PRO features on this sale: the sale must be theirs, and they are on PRO/TEAMS or
 * paid the $9.99 upgrade for this sale.
 */
export function saleHasProFeatures(
  sale: SaleEntitlementFields | null | undefined,
  organizer: OrganizerEntitlementFields | null | undefined,
): boolean {
  if (!ownsSale(sale, organizer)) return false;
  return organizerHasTier(organizer!.subscriptionTier, 'PRO') || isPaidAlaCarteSale(sale);
}

/**
 * Tier to use for per-sale capacity limits (photos per item, import photo cap). Lifts SIMPLE to PRO on the upgraded
 * sale only; never lowers a PRO/TEAMS/ENTERPRISE tier.
 */
export function effectiveTierForSale(
  sale: SaleEntitlementFields | null | undefined,
  organizer: OrganizerEntitlementFields | null | undefined,
): 'SIMPLE' | 'PRO' | 'TEAMS' | 'ENTERPRISE' {
  const raw = organizer?.subscriptionTier;
  if (raw === 'PRO' || raw === 'TEAMS' || raw === 'ENTERPRISE') return raw;
  return saleHasAlaCarteUpgrade(sale, organizer) ? 'PRO' : 'SIMPLE';
}

/** Minimal sale row for an entitlement decision, or null when the id is not a string or the sale does not exist. */
export async function loadSaleEntitlement(saleId: unknown): Promise<(SaleEntitlementFields & { id: string }) | null> {
  if (typeof saleId !== 'string' || saleId.length === 0 || saleId.length > 64) return null;
  return prisma.sale.findUnique({ where: { id: saleId }, select: SALE_ENTITLEMENT_SELECT });
}
