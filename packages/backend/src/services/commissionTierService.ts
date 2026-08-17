import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

/**
 * commissionTierService.ts — CommissionTier ladder validation + persistence.
 *
 * ADR-096 shipped the CommissionTier model and seedDefaultCommissionTiers(),
 * but no way to read or change the ladder afterward. This service is the single
 * place that decides whether a ladder is valid; the controller only does auth,
 * shape-checking and HTTP.
 *
 * Why validate the WHOLE ladder on every mutation (not just the changed row):
 * a commission ladder is only meaningful as a contiguous cover of the price
 * axis. A single band is never valid or invalid on its own — "$100–$500 @ 60%"
 * is fine next to a $0–$100 band and broken next to a $0–$250 band. Every
 * mutation therefore projects the resulting ladder and validates that, so a gap
 * or overlap can never be persisted one row at a time.
 *
 * A broken ladder mis-pays real people, so an invalid ladder is rejected with a
 * specific message rather than partially written.
 */

/** Hard ceiling on ladder size. Keeps a hostile client from writing thousands of bands. */
export const MAX_TIERS = 20;

/** Decimal(10,2) on minPrice/maxPrice — largest value the column can hold. */
const MAX_PRICE = 99999999.99;

export interface TierInput {
  minPrice: number;
  maxPrice: number | null;
  consignorRate: number;
}

export interface SerializedTier {
  id: string;
  minPrice: string;
  maxPrice: string | null;
  consignorRate: string;
  createdAt: Date;
  updatedAt: Date;
}

export class LadderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LadderValidationError';
  }
}

/** Round-trip through cents so float noise never trips the contiguity check. */
function cents(n: number): number {
  return Math.round(n * 100);
}

function isMoney(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** True when n has more than 2 decimal places (tolerant of binary float error). */
function hasSubCentPrecision(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
}

/**
 * Coerce one untrusted client object into a TierInput.
 *
 * Mass-assignment defence: this is the ONLY path from req.body into tier data.
 * It reads exactly three fields by name and ignores everything else, so a client
 * cannot smuggle id, workspaceId, createdAt or updatedAt into a write.
 */
export function coerceTierInput(raw: any, label: string): TierInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LadderValidationError(
      `${label} must be an object with minPrice, maxPrice and consignorRate.`
    );
  }

  const minPrice = typeof raw.minPrice === 'string' ? Number(raw.minPrice) : raw.minPrice;
  const consignorRate =
    typeof raw.consignorRate === 'string' ? Number(raw.consignorRate) : raw.consignorRate;
  const rawMax = raw.maxPrice;
  const maxPrice =
    rawMax === null || rawMax === undefined || rawMax === ''
      ? null
      : typeof rawMax === 'string'
        ? Number(rawMax)
        : rawMax;

  if (!isMoney(minPrice)) {
    throw new LadderValidationError(`${label}: starting price must be a number.`);
  }
  if (maxPrice !== null && !isMoney(maxPrice)) {
    throw new LadderValidationError(
      `${label}: ending price must be a number, or blank for the top band.`
    );
  }
  if (!isMoney(consignorRate)) {
    throw new LadderValidationError(`${label}: consignor rate must be a number.`);
  }

  return { minPrice, maxPrice, consignorRate };
}

/** Coerce a whole ladder payload. Rejects anything that isn't an array of band objects. */
export function coerceLadderInput(raw: any): TierInput[] {
  if (!Array.isArray(raw)) {
    throw new LadderValidationError('Expected a list of price bands.');
  }
  if (raw.length > MAX_TIERS) {
    throw new LadderValidationError(`A commission ladder can have at most ${MAX_TIERS} price bands.`);
  }
  return raw.map((entry, i) => coerceTierInput(entry, `Band ${i + 1}`));
}

/**
 * Validate a complete ladder and return it sorted low band → high band.
 *
 * Rules enforced (each has its own message so the organizer knows what to fix):
 *  1. at least one band, at most MAX_TIERS
 *  2. every value finite, non-negative, at most 2 decimal places, within column range
 *  3. rate between 0 and 100
 *  4. each band's ending price is above its starting price
 *  5. exactly one open-ended band, and it is the highest one
 *  6. the lowest band starts at exactly 0 (the ladder covers every price)
 *  7. each band starts exactly where the previous one ends (no gaps, no overlaps)
 */
export function validateLadder(tiers: TierInput[]): TierInput[] {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new LadderValidationError('A commission ladder needs at least one price band.');
  }
  if (tiers.length > MAX_TIERS) {
    throw new LadderValidationError(`A commission ladder can have at most ${MAX_TIERS} price bands.`);
  }

  tiers.forEach((t, i) => {
    const label = `Band ${i + 1}`;

    // Defence in depth. coerceTierInput() already rejects non-numbers, but this
    // function is the money-path authority and must not trust its caller: NaN
    // silently passes every < and > comparison below.
    if (!isMoney(t.minPrice)) {
      throw new LadderValidationError(`${label}: starting price must be a number.`);
    }
    if (t.maxPrice !== null && !isMoney(t.maxPrice)) {
      throw new LadderValidationError(`${label}: ending price must be a number, or blank for the top band.`);
    }
    if (!isMoney(t.consignorRate)) {
      throw new LadderValidationError(`${label}: consignor rate must be a number.`);
    }

    if (t.minPrice < 0) {
      throw new LadderValidationError(`${label}: starting price cannot be negative.`);
    }
    if (t.minPrice > MAX_PRICE) {
      throw new LadderValidationError(`${label}: starting price is too large.`);
    }
    if (hasSubCentPrecision(t.minPrice)) {
      throw new LadderValidationError(`${label}: starting price can have at most 2 decimal places.`);
    }

    if (t.maxPrice !== null) {
      if (t.maxPrice > MAX_PRICE) {
        throw new LadderValidationError(`${label}: ending price is too large.`);
      }
      if (hasSubCentPrecision(t.maxPrice)) {
        throw new LadderValidationError(`${label}: ending price can have at most 2 decimal places.`);
      }
      if (cents(t.maxPrice) <= cents(t.minPrice)) {
        throw new LadderValidationError(
          `${label}: ending price must be higher than its starting price.`
        );
      }
    }

    if (t.consignorRate < 0 || t.consignorRate > 100) {
      throw new LadderValidationError(`${label}: consignor rate must be between 0 and 100.`);
    }
    if (hasSubCentPrecision(t.consignorRate)) {
      throw new LadderValidationError(`${label}: consignor rate can have at most 2 decimal places.`);
    }
  });

  // Sort low → high by starting price. The open-ended band has the highest
  // starting price in any valid ladder, so it lands last on its own.
  const sorted = [...tiers].sort((a, b) => cents(a.minPrice) - cents(b.minPrice));

  const openEnded = sorted.filter((t) => t.maxPrice === null);
  if (openEnded.length === 0) {
    throw new LadderValidationError(
      'The highest band must be open-ended — leave its ending price blank so items priced above it are still covered.'
    );
  }
  if (openEnded.length > 1) {
    throw new LadderValidationError(
      'Only the highest band can be open-ended. Give every other band an ending price.'
    );
  }
  if (sorted[sorted.length - 1].maxPrice !== null) {
    throw new LadderValidationError(
      'The open-ended band must be the highest one. Give it the largest starting price, or set an ending price on the bands above it.'
    );
  }

  if (cents(sorted[0].minPrice) !== 0) {
    throw new LadderValidationError('The lowest band must start at $0 so every item price is covered.');
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (cents(current.minPrice) === cents(next.minPrice)) {
      throw new LadderValidationError(
        `Two bands both start at $${current.minPrice.toFixed(2)}. Each band needs its own price range.`
      );
    }
    // current.maxPrice is non-null here: only the last band may be open-ended.
    const currentMax = current.maxPrice as number;

    if (cents(currentMax) > cents(next.minPrice)) {
      throw new LadderValidationError(
        `Bands overlap: $${current.minPrice.toFixed(2)}–$${currentMax.toFixed(2)} runs past the start of the next band at $${next.minPrice.toFixed(2)}.`
      );
    }
    if (cents(currentMax) < cents(next.minPrice)) {
      throw new LadderValidationError(
        `There's a gap between $${currentMax.toFixed(2)} and $${next.minPrice.toFixed(2)}. Bands must connect end-to-end so no price falls between them.`
      );
    }
  }

  return sorted;
}

/** Prisma Decimals don't survive JSON — send strings, matching consignorController. */
export function serializeTier(tier: {
  id: string;
  minPrice: Decimal;
  maxPrice: Decimal | null;
  consignorRate: Decimal;
  createdAt: Date;
  updatedAt: Date;
}): SerializedTier {
  return {
    id: tier.id,
    minPrice: tier.minPrice.toFixed(2),
    maxPrice: tier.maxPrice ? tier.maxPrice.toFixed(2) : null,
    consignorRate: tier.consignorRate.toFixed(2),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
}

/** Read a workspace's ladder, low band → high band. */
export async function listTiers(workspaceId: string): Promise<SerializedTier[]> {
  const tiers = await prisma.commissionTier.findMany({
    where: { workspaceId },
    orderBy: { minPrice: 'asc' },
  });
  return tiers.map(serializeTier);
}

/**
 * Replace a workspace's entire ladder in one transaction.
 *
 * This is the primitive the UI saves through, and it is also what "reorder"
 * means for a price ladder: band order is derived from minPrice, never stored,
 * so repositioning a band IS rewriting the ladder. Delete-then-create inside a
 * transaction means a failed write leaves the previous ladder intact rather
 * than a half-applied one.
 *
 * The delete is scoped to workspaceId, so this can never touch another
 * organizer's rows even if the request body claims otherwise.
 */
export async function replaceLadder(
  workspaceId: string,
  tiers: TierInput[]
): Promise<SerializedTier[]> {
  const validated = validateLadder(tiers);

  await prisma.$transaction([
    prisma.commissionTier.deleteMany({ where: { workspaceId } }),
    prisma.commissionTier.createMany({
      data: validated.map((t) => ({
        workspaceId,
        minPrice: new Decimal(t.minPrice),
        maxPrice: t.maxPrice === null ? null : new Decimal(t.maxPrice),
        consignorRate: new Decimal(t.consignorRate),
      })),
    }),
  ]);

  return listTiers(workspaceId);
}

/** Current ladder as plain numbers — the base every single-row mutation is projected onto. */
export async function loadLadderAsInput(
  workspaceId: string
): Promise<{ id: string; input: TierInput }[]> {
  const tiers = await prisma.commissionTier.findMany({
    where: { workspaceId },
    orderBy: { minPrice: 'asc' },
  });
  return tiers.map((t) => ({
    id: t.id,
    input: {
      minPrice: Number(t.minPrice),
      maxPrice: t.maxPrice === null ? null : Number(t.maxPrice),
      consignorRate: Number(t.consignorRate),
    },
  }));
}

/** The ladder seedDefaultCommissionTiers() writes — reused by the "restore defaults" action. */
export const DEFAULT_LADDER: TierInput[] = [
  { minPrice: 0, maxPrice: 100, consignorRate: 50 },
  { minPrice: 100, maxPrice: 500, consignorRate: 60 },
  { minPrice: 500, maxPrice: 2000, consignorRate: 65 },
  { minPrice: 2000, maxPrice: null, consignorRate: 75 },
];
