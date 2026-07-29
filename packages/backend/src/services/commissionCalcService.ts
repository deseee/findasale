import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

/**
 * ADR-096: single shared source of truth for consignor commission math.
 *
 * ADR-090 already documented the cost of two independently-written payout
 * functions drifting out of sync (VendorBooth settlement code went stale and
 * ended up inverted). This file exists so consignorController.runPayout() and
 * consignorSettlementController.buildSettlementLines() can never diverge --
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

export interface ConsignorPayoutResult {
  gross: Decimal;
  net: Decimal;
  tierBreakdown: TierBreakdownLine[] | null;
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
  sortedTiers: { minPrice: Decimal; maxPrice: Decimal | null; consignorRate: Decimal }[]
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
 * If consignor.useTieredCommission is false: exact same math as before this
 * ADR (gross * commissionRate / 100) -- zero behavior change for every
 * existing consignor, since this is strictly opt-in.
 *
 * If true: resolves each item's rate individually from the workspace's
 * CommissionTier ladder and sums the per-item nets, plus returns a
 * tierBreakdown for the organizer's CSV export.
 */
export async function calculateConsignorPayout(
  consignor: { id: string; workspaceId: string; commissionRate: Decimal; useTieredCommission: boolean },
  soldItems: SoldItemForPayout[]
): Promise<ConsignorPayoutResult> {
  const gross = soldItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.price ?? 0)),
    new Decimal(0)
  );

  if (!consignor.useTieredCommission) {
    const net = gross.times(consignor.commissionRate).dividedBy(100);
    return { gross, net, tierBreakdown: null };
  }

  const tiers = await prisma.commissionTier.findMany({
    where: { workspaceId: consignor.workspaceId },
    orderBy: { minPrice: 'asc' },
  });

  if (tiers.length === 0) {
    // No ladder configured yet -- fall back to flat rate rather than paying 0%.
    const net = gross.times(consignor.commissionRate).dividedBy(100);
    return { gross, net, tierBreakdown: null };
  }

  const buckets = new Map<string, { minPrice: Decimal; maxPrice: Decimal | null; rate: Decimal; itemCount: number; gross: Decimal; net: Decimal }>();

  let net = new Decimal(0);
  for (const item of soldItems) {
    const price = new Decimal(item.price ?? 0);
    const tier = resolveTierForPrice(price, tiers);
    if (!tier) continue;
    const itemNet = price.times(tier.consignorRate).dividedBy(100);
    net = net.plus(itemNet);

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

  return { gross, net, tierBreakdown };
}

/** Seed the industry-benchmark default ladder for a workspace's first opt-in. Idempotent: no-op if tiers already exist. */
export async function seedDefaultCommissionTiers(workspaceId: string): Promise<void> {
  const existing = await prisma.commissionTier.count({ where: { workspaceId } });
  if (existing > 0) return;

  await prisma.commissionTier.createMany({
    data: [
      { workspaceId, minPrice: new Decimal(0), maxPrice: new Decimal(100), consignorRate: new Decimal(50) },
      { workspaceId, minPrice: new Decimal(100), maxPrice: new Decimal(500), consignorRate: new Decimal(60) },
      { workspaceId, minPrice: new Decimal(500), maxPrice: new Decimal(2000), consignorRate: new Decimal(65) },
      { workspaceId, minPrice: new Decimal(2000), maxPrice: null, consignorRate: new Decimal(75) },
    ],
  });
}
