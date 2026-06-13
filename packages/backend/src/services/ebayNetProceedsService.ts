/**
 * ebayNetProceedsService — fee-aware net-proceeds engine for eBay listings.
 *
 * Computes what an organizer actually keeps after eBay fees, and back-solves the
 * item price needed to hit a target net margin ("Suggest price" button).
 *
 * Fee rates come from EbayCategoryFee (seeded published 2026 rates until enough
 * settled orders exist). A single configurable safety buffer is ADDED to the FVF
 * so the displayed net is a conservative FLOOR, never an optimistic number.
 */

import { prisma } from '../lib/prisma';

/**
 * Margin-of-error buffer added on top of the looked-up FVF percent.
 * Until enough real settled-order fees exist, displayed net must read as a floor.
 * Single configurable constant per locked product decision #3.
 * 0.0125 = 1.25 percentage points (e.g. 13.60% FVF -> 14.85% applied).
 */
export const FEE_SAFETY_BUFFER_PCT = 0.0125;

const DEFAULT_FVF_PERCENT = 0.136; // eBay 2026 published default final value fee
const DEFAULT_PER_ORDER_CENTS = 40;

export interface NetProceedsInput {
  itemPrice: number; // organizer's listed item price (dollars)
  buyerShipping: number; // amount the buyer pays for shipping (dollars)
  tax?: number; // sales tax collected (dollars) - eBay charges FVF on tax too
  ebayCategoryId?: string | null;
  promotedPercent?: number; // Promoted Listings ad rate as a decimal (e.g. 0.02 = 2%)
  labelCost: number; // organizer's actual shipping label cost (dollars)
}

export interface NetProceedsBreakdown {
  itemPrice: number;
  buyerShipping: number;
  tax: number;
  fvfPercentApplied: number; // base FVF + safety buffer
  fvfBase: number; // amount FVF is charged on (item + shipping + tax)
  fvfAmount: number;
  perOrderFee: number;
  promotedFee: number;
  labelCost: number;
  net: number;
}

export interface NetProceedsResult {
  net: number;
  breakdown: NetProceedsBreakdown;
}

interface ResolvedFee {
  fvfPercent: number; // raw looked-up percent (no buffer)
  perOrderCents: number;
}

/**
 * Look up the FVF percent + per-order fee for a category, falling back to the
 * global default row, then to hard-coded published defaults.
 */
async function resolveCategoryFee(ebayCategoryId?: string | null): Promise<ResolvedFee> {
  try {
    if (ebayCategoryId) {
      const exact = await prisma.ebayCategoryFee.findUnique({
        where: { ebayCategoryId },
      });
      if (exact) {
        return {
          fvfPercent: Number(exact.fvfPercent),
          perOrderCents: exact.perOrderFeeCents,
        };
      }
    }
    // Global default row (ebayCategoryId = null)
    const def = await prisma.ebayCategoryFee.findFirst({
      where: { ebayCategoryId: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (def) {
      return {
        fvfPercent: Number(def.fvfPercent),
        perOrderCents: def.perOrderFeeCents,
      };
    }
  } catch (err) {
    console.warn('[NetProceeds] EbayCategoryFee lookup failed, using published defaults', err);
  }
  return { fvfPercent: DEFAULT_FVF_PERCENT, perOrderCents: DEFAULT_PER_ORDER_CENTS };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Compute net proceeds for a sale at a given item price + buyer-paid shipping.
 * net = (itemPrice + buyerShipping)
 *       - fvfBase * (fvf + buffer)
 *       - perOrderFee
 *       - itemPrice * promotedPercent
 *       - labelCost
 * where fvfBase = itemPrice + buyerShipping + tax.
 */
export async function computeNetProceeds(input: NetProceedsInput): Promise<NetProceedsResult> {
  const { fvfPercent, perOrderCents } = await resolveCategoryFee(input.ebayCategoryId);
  const fvfApplied = fvfPercent + FEE_SAFETY_BUFFER_PCT;

  const itemPrice = Math.max(0, input.itemPrice || 0);
  const buyerShipping = Math.max(0, input.buyerShipping || 0);
  const tax = Math.max(0, input.tax ?? 0);
  const promotedPercent = Math.max(0, input.promotedPercent ?? 0);
  const labelCost = Math.max(0, input.labelCost || 0);

  const fvfBase = itemPrice + buyerShipping + tax;
  const fvfAmount = fvfBase * fvfApplied;
  const perOrderFee = perOrderCents / 100;
  const promotedFee = itemPrice * promotedPercent;

  const net = (itemPrice + buyerShipping) - fvfAmount - perOrderFee - promotedFee - labelCost;

  return {
    net: round2(net),
    breakdown: {
      itemPrice: round2(itemPrice),
      buyerShipping: round2(buyerShipping),
      tax: round2(tax),
      fvfPercentApplied: fvfApplied,
      fvfBase: round2(fvfBase),
      fvfAmount: round2(fvfAmount),
      perOrderFee: round2(perOrderFee),
      promotedFee: round2(promotedFee),
      labelCost: round2(labelCost),
      net: round2(net),
    },
  };
}

export interface SuggestPriceInput {
  targetMarginPct: number; // desired net as a fraction of item price (e.g. 0.30 = 30%)
  buyerShipping: number;
  tax?: number;
  ebayCategoryId?: string | null;
  promotedPercent?: number;
  labelCost: number;
}

export interface SuggestPriceResult {
  suggestedItemPrice: number;
  projectedNet: number;
  targetMarginPct: number;
  breakdown: NetProceedsBreakdown;
}

/**
 * Back-solve the item price required so that net >= targetMarginPct * itemPrice.
 *
 * Solving for P (item price), with buyer shipping S, tax T, fvf rate f (incl. buffer),
 * per-order fee K, promoted rate a, label cost L, target margin m:
 *
 *   net = (P + S) - (P + S + T)*f - K - P*a - L
 *   want: net = m * P
 *
 *   m*P = P + S - (P + S + T)*f - K - P*a - L
 *   m*P = P*(1 - f - a) + S - (S + T)*f - K - L
 *   P*(m - 1 + f + a) = S - (S + T)*f - K - L
 *   P = [ S - (S + T)*f - K - L ] / (m - 1 + f + a)
 *
 * The denominator (m - 1 + f + a) is negative for normal inputs, and so is the
 * numerator, yielding a positive price. If the math is degenerate (denominator ~0
 * or a non-positive price), we fall back to a safe positive suggestion.
 *
 * This NEVER auto-sets the price - it only returns a suggestion the organizer accepts.
 */
export async function suggestPriceForMargin(input: SuggestPriceInput): Promise<SuggestPriceResult> {
  const { fvfPercent, perOrderCents } = await resolveCategoryFee(input.ebayCategoryId);
  const f = fvfPercent + FEE_SAFETY_BUFFER_PCT;
  const a = Math.max(0, input.promotedPercent ?? 0);
  const m = input.targetMarginPct;
  const S = Math.max(0, input.buyerShipping || 0);
  const T = Math.max(0, input.tax ?? 0);
  const K = perOrderCents / 100;
  const L = Math.max(0, input.labelCost || 0);

  const numerator = S - (S + T) * f - K - L;
  const denominator = m - 1 + f + a;

  let suggestedItemPrice: number;
  if (Math.abs(denominator) < 1e-6) {
    // Degenerate: target margin equals the fee structure - no finite solve. Floor at $1.
    suggestedItemPrice = 1;
  } else {
    suggestedItemPrice = numerator / denominator;
  }

  if (!isFinite(suggestedItemPrice) || suggestedItemPrice <= 0) {
    suggestedItemPrice = 1;
  }

  // Round UP to the nearest cent so the realized net never dips below target.
  suggestedItemPrice = Math.ceil(suggestedItemPrice * 100) / 100;

  const proceeds = await computeNetProceeds({
    itemPrice: suggestedItemPrice,
    buyerShipping: S,
    tax: T,
    ebayCategoryId: input.ebayCategoryId,
    promotedPercent: a,
    labelCost: L,
  });

  return {
    suggestedItemPrice,
    projectedNet: proceeds.net,
    targetMarginPct: m,
    breakdown: proceeds.breakdown,
  };
}
