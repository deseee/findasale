import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { DEFAULT_LADDER } from './commissionTierService';

/**
 * ADR-096: single shared source of truth for consignor commission math.
 *
 * ADR-090 already documented the cost of two independently-written payout
 * functions drifting out of sync (VendorBooth settlement code went stale and
 * ended up inverted). This file exists so consignorController.runPayout() and
 * the settlement ledger (consignorLedgerService.loadUnsettled, which the settlement
 * controller uses; it replaced buildSettlementLines on 2026-09-29) can never diverge --
 * both MUST call calculateConsignorPayout() rather than compute their own
 * gross * rate math.
 */

export interface SoldItemForPayout {
  id: string;
  price: number | Decimal | null;
}

export interface TierBreakdownLine {
  label: string;
  itemCount: number;
  gross: string;
  rate: string;
  net: string;
}

/**
 * Organizer-settles ledger (2026-09-29): one line per sold item, so a payout can be stored and
 * shown to the consignor item by item. `share` is already rounded half-up to cents, and `net`
 * on the result is exactly the sum of these rounded shares, so the total a consignor is told
 * always equals the sum of the lines they can see (no penny drift between statement and total).
 */
export interface PayoutLine {
  itemId: string;
  price: Decimal; // rounded to cents
  ratePct: Decimal; // percent of price that goes to the consignor for this item
  share: Decimal; // consignor share for this item, rounded half-up to cents
  tierLabel: string | null; // set only when tiered commission resolved this item's rate
}

export interface ConsignorPayoutResult {
  gross: Decimal;
  net: Decimal;
  tierBreakdown: TierBreakdownLine[] | null;
  lines: PayoutLine[];
}

/** Round half-up to whole cents. The single rounding rule used by every ledger money figure. */
export function roundToCents(value: number | string | Decimal): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function safePrice(raw: number | Decimal | null | undefined): Decimal {
  if (raw === null || raw === undefined) return new Decimal(0);
  const d = new Decimal(raw);
  if (!d.isFinite() || d.isNegative()) return new Decimal(0);
  return roundToCents(d);
}

function tierLabel(minPrice: Decimal, maxPrice: Decimal | null): string {
  const min = minPrice.toFixed(2);
  return maxPrice ? `$${min}-$${maxPrice.toFixed(2)}` : `$${min}+`;
}

/**
 * Resolve a single item's consignor rate from a workspace's tier ladder.
 * Ladder must be sorted by minPrice ascending before calling this. Boundary
 * rule: minPrice is inclusive, maxPrice is exclusive -- an item priced exactly
 * at a tier's minPrice falls into that (higher) tier, never the one below it.
 */
function resolveTierForPrice(
  price: Decimal,
  sortedTiers: { id: string; minPrice: Decimal; maxPrice: Decimal | null; consignorRate: Decimal }[]
) {
  for (const tier of sortedTiers) {
    const atOrAboveMin = price.greaterThanOrEqualTo(tier.minPrice);
    const belowMax = tier.maxPrice === null || price.lessThan(tier.maxPrice);
    if (atOrAboveMin && belowMax) return tier;
  }
  // Defensive fallback: price below the lowest configured tier (e.g. organizer
  // deleted the $0 tier) -- use the lowest tier's rate rather than 0%, so a
  // misconfigured ladder underpays instead of silently paying nothing.
  return sortedTiers[0] ?? null;
}

/**
 * Compute a consignor's payout for a set of SOLD items.
 *
 * If consignor.useTieredCommission is false: every item's share is price * commissionRate / 100
 * (same rate as before this ADR -- zero behavior change for every existing consignor, since
 * tiered is strictly opt-in).
 *
 * If true: resolves each item's rate individually from the workspace's CommissionTier ladder
 * and returns a tierBreakdown for the organizer's CSV export.
 *
 * 2026-09-29 (organizer-settles ledger): each item's share is rounded half-up to cents and
 * `net` is the SUM of those rounded shares, so the per-item lines always add up to the total.
 * `lines` carries the per-item detail. Both consignorController.runPayout and the settlement
 * ledger (consignorLedgerService) call this one function (ADR-096 rule: no second copy of
 * the commission math anywhere).
 */
export async function calculateConsignorPayout(
  consignor: { id: string; workspaceId: string; commissionRate: Decimal; useTieredCommission: boolean },
  soldItems: SoldItemForPayout[]
): Promise<ConsignorPayoutResult> {
  const priced = soldItems.map((item) => ({ id: item.id, price: safePrice(item.price) }));
  const gross = priced.reduce((sum, item) => sum.plus(item.price), new Decimal(0));

  const flatResult = (): ConsignorPayoutResult => {
    const flatRate = new Decimal(consignor.commissionRate);
    const lines: PayoutLine[] = priced.map((item) => ({
      itemId: item.id,
      price: item.price,
      ratePct: flatRate,
      share: roundToCents(item.price.times(flatRate).dividedBy(100)),
      tierLabel: null,
    }));
    const net = lines.reduce((sum, l) => sum.plus(l.share), new Decimal(0));
    return { gross, net, tierBreakdown: null, lines };
  };

  if (!consignor.useTieredCommission) {
    return flatResult();
  }

  const tiers = await prisma.commissionTier.findMany({
    where: { workspaceId: consignor.workspaceId },
    orderBy: { minPrice: 'asc' },
  });

  if (tiers.length === 0) {
    // No ladder configured yet -- fall back to flat rate rather than paying 0%.
    return flatResult();
  }

  const buckets = new Map<string, { minPrice: Decimal; maxPrice: Decimal | null; rate: Decimal; itemCount: number; gross: Decimal; net: Decimal }>();
  const lines: PayoutLine[] = [];

  let net = new Decimal(0);
  for (const item of priced) {
    const price = item.price;
    const tier = resolveTierForPrice(price, tiers);
    if (!tier) continue;
    const itemNet = roundToCents(price.times(tier.consignorRate).dividedBy(100));
    net = net.plus(itemNet);
    lines.push({
      itemId: item.id,
      price,
      ratePct: new Decimal(tier.consignorRate),
      share: itemNet,
      tierLabel: tierLabel(tier.minPrice, tier.maxPrice),
    });

    const key = tier.id;
    const existing = buckets.get(key);
    if (existing) {
      existing.itemCount += 1;
      existing.gross = existing.gross.plus(price);
      existing.net = existing.net.plus(itemNet);
    } else {
      buckets.set(key, {
        minPrice: tier.minPrice,
        maxPrice: tier.maxPrice,
        rate: tier.consignorRate,
        itemCount: 1,
        gross: price,
        net: itemNet,
      });
    }
  }

  const tierBreakdown: TierBreakdownLine[] = Array.from(buckets.values())
    .sort((a, b) => a.minPrice.comparedTo(b.minPrice))
    .map((b) => ({
      label: tierLabel(b.minPrice, b.maxPrice),
      itemCount: b.itemCount,
      gross: b.gross.toFixed(2),
      rate: b.rate.toFixed(2),
      net: b.net.toFixed(2),
    }));

  return { gross, net, tierBreakdown, lines };
}

/**
 * Seed the industry-benchmark default ladder for a workspace's first opt-in.
 * Idempotent: no-op if tiers already exist.
 *
 * The band values live in commissionTierService.DEFAULT_LADDER, shared with the
 * organizer-facing "restore starting rates" action. Two hardcoded copies of a
 * payout ladder is exactly the drift ADR-090 and ADR-096 were written to stop.
 */
export async function seedDefaultCommissionTiers(workspaceId: string): Promise<void> {
  const existing = await prisma.commissionTier.count({ where: { workspaceId } });
  if (existing > 0) return;

  await prisma.commissionTier.createMany({
    data: DEFAULT_LADDER.map((tier) => ({
      workspaceId,
      minPrice: new Decimal(tier.minPrice),
      maxPrice: tier.maxPrice === null ? null : new Decimal(tier.maxPrice),
      consignorRate: new Decimal(tier.consignorRate),
    })),
  });
}

export interface ConsignorMarkdownPolicyNotice {
  configured: boolean; // true if an active MarkdownCycle exists for this organizer
  summary: string; // plain-language, one-sentence schedule (or "none configured") explanation
}

/**
 * Consignor intake disclosure (Patrick, 2026-09-25): calculateConsignorPayout() above
 * (and consignorSettlementController.buildSettlementLines()) computes payout from each
 * sold Item's `price` field directly -- and both markdownCron.ts (Sale-level clearance)
 * and markdownCycleCron.ts (this organizer/sale-configurable MarkdownCycle system) write
 * the marked-down amount straight into that same `price` field. So a markdown that fires
 * before an item sells mechanically lowers the consignor's payout with zero payout-math
 * change needed -- the gap is that neither the organizer nor the consignor is ever told
 * this can happen. This turns the organizer's own MarkdownCycle configuration into a
 * one-sentence, plain-language summary for onboarding copy (consignorController.createConsignor)
 * and the consignor payment-setup-invite email (stripeConnectController.initiateConsignorOnboarding).
 *
 * Only MarkdownCycle is considered here (not the separate fixed-schedule Sale.markdownEnabled
 * clearance system), matching the scope Patrick asked for. Prefers the organizer's
 * workspace-wide cycle (saleId: null -- applies to all their sales); a sale-specific-only
 * cycle is called out generically since it isn't guaranteed to apply to this consignor's
 * future items.
 */
export async function getConsignorMarkdownPolicyNotice(organizerId: string): Promise<ConsignorMarkdownPolicyNotice> {
  // ADR-markdown-cycle-n-steps (2026-09-28): a cycle now has 1-6 ordered steps instead of a
  // fixed first/second pair -- steps included here, ordered ascending, to build N-clause prose.
  const cycles = await prisma.markdownCycle.findMany({
    where: { organizerId, isActive: true },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });

  const general = cycles.find((c) => c.saleId === null);
  if (general && general.steps.length > 0) {
    const clauses = general.steps.map(
      (step) => `after ${step.dayThreshold} day${step.dayThreshold === 1 ? '' : 's'} unsold, ${step.pctOff}% off`
    );

    let summary: string;
    if (clauses.length === 1) {
      // Capitalize the single clause into its own sentence, matching the pre-existing phrasing.
      summary = `After ${general.steps[0].dayThreshold} day${general.steps[0].dayThreshold === 1 ? '' : 's'} unsold, items are automatically marked down ${general.steps[0].pctOff}%.`;
    } else {
      // "After N1 days unsold, X% off, after N2 days unsold, Y% off, and after N3 days unsold, Z% off."
      const joined =
        clauses.length === 2
          ? clauses.join(', and ')
          : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
      summary = `Items are automatically marked down on a schedule: ${joined}.`;
    }

    return { configured: true, summary };
  }

  if (cycles.length > 0) {
    return {
      configured: true,
      summary: 'A custom markdown schedule is configured for specific sales -- ask the organizer whether it applies to your items.',
    };
  }

  return {
    configured: false,
    summary: 'No automatic markdown schedule is currently set up for this organizer.',
  };
}
