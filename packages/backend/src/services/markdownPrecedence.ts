/**
 * Markdown precedence (2026-11-04, Patrick: "Shouldn't the organizer have some way to say which rule wins?").
 *
 * Two automatic markdown mechanisms can apply to the same item:
 *  - markdownCron.ts: the sale's Day-2/Day-3 tiers (free, every tier), progress in Item.markdownTierApplied.
 *  - markdownCycleCron.ts: PRO/TEAMS MarkdownCycles, progress in Item.markdownStepIndexApplied.
 *
 * Since 2026-10-30 one mechanism owns an item: whichever cuts it first. This module lets the organizer choose:
 *  - FIRST_WINS (default; no row, missing table, unknown value or a non-PRO/TEAMS organizer all mean this):
 *    exactly the 2026-10-30 filters, byte for byte.
 *  - SALE_TIERS_WIN: the Day-2/Day-3 cron may take over an item a cycle has cut. The tier price is computed off the
 *    item's priceBeforeMarkdown anchor (never on top of the cycle's cut). The takeover clears
 *    markdownStepIndexApplied and stamps markdownTierApplied, so the cycle cron (which in this mode still requires
 *    markdownTierApplied = 0) leaves the item alone from then on.
 *  - CYCLES_WIN: the Day-2/Day-3 cron skips every item inside a running cycle's scope (an active cycle with steps,
 *    sale-scoped to this sale or organizer-wide), and the cycle cron may claim an item the Day-2/Day-3 cron already
 *    tiered. A claim keeps the cycle's own step pointer (so no step is ever applied twice and the usual catch-up
 *    rule decides the step), never raises the price (a claim whose step price is above the current price only
 *    stamps the pointer), and resets markdownTierApplied to 0 so exactly one pointer is ever non-zero.
 *
 * The setting only matters for PRO/TEAMS organizers (only they have running cycles); for anyone else the effective
 * mode is FIRST_WINS, so a downgraded organizer's paused cycles can never make the Day-2/Day-3 cron skip items.
 */

export const MARKDOWN_PRECEDENCE_VALUES = ['FIRST_WINS', 'SALE_TIERS_WIN', 'CYCLES_WIN'] as const;
export type MarkdownPrecedence = (typeof MARKDOWN_PRECEDENCE_VALUES)[number];
export const DEFAULT_MARKDOWN_PRECEDENCE: MarkdownPrecedence = 'FIRST_WINS';

const CYCLE_TIERS = new Set(['PRO', 'TEAMS']);

export function isMarkdownPrecedence(value: unknown): value is MarkdownPrecedence {
  return typeof value === 'string' && (MARKDOWN_PRECEDENCE_VALUES as readonly string[]).includes(value);
}

/** The mode the crons actually use: the stored choice for PRO/TEAMS, FIRST_WINS for everything else. */
export function effectiveMarkdownPrecedence(stored: unknown, subscriptionTier: unknown): MarkdownPrecedence {
  if (!isMarkdownPrecedence(stored)) return DEFAULT_MARKDOWN_PRECEDENCE;
  if (typeof subscriptionTier !== 'string' || !CYCLE_TIERS.has(subscriptionTier.toUpperCase())) {
    return DEFAULT_MARKDOWN_PRECEDENCE;
  }
  return stored;
}

// ---------------------------------------------------------------------------------------------------------------
// markdownCron.ts (sale Day-2/Day-3 tiers)
// ---------------------------------------------------------------------------------------------------------------

/** The 2026-10-30 guard: never an item a MarkdownCycle step has been applied to. */
export const CYCLE_UNTOUCHED_GUARD = [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }];

/** A cycle that is actually running (active, has steps, organizer PRO/TEAMS), reduced to its scope. */
export interface RunningCycleScope {
  organizerId: string;
  saleId: string | null;
}

export interface SaleTierSelection {
  /** True when no item of this sale may be touched by the Day-2/Day-3 cron (CYCLES_WIN + sale-scoped cycle). */
  skipSale: boolean;
  /** Spread into BOTH the item query's where and the conditional write's where. */
  where: Record<string, unknown>;
}

/**
 * Item-selection fragment for markdownCron.ts for one sale. FIRST_WINS returns exactly the 2026-10-30 fragment
 * ({ OR: CYCLE_UNTOUCHED_GUARD }) so the default reproduces today's queries.
 */
export function saleTierSelection(
  mode: MarkdownPrecedence,
  sale: { id: string; organizerId?: string | null },
  runningCycles: RunningCycleScope[] = []
): SaleTierSelection {
  if (mode === 'SALE_TIERS_WIN') {
    // The sale's tiers may take over a cycle-cut item: no cycle guard at all.
    return { skipSale: false, where: {} };
  }
  const where: Record<string, unknown> = { OR: CYCLE_UNTOUCHED_GUARD };
  if (mode === 'CYCLES_WIN') {
    const own = runningCycles.filter((c) => c.organizerId === sale.organizerId);
    if (own.some((c) => c.saleId === sale.id)) return { skipSale: true, where };
    if (sale.organizerId && own.some((c) => c.saleId == null)) {
      // An organizer-wide cycle covers items whose organizerId is this organizer (markdownCycleCron.ts's filter).
      // Items with a null organizerId are outside that scope, so they stay eligible ({ not } alone would drop NULLs).
      where.AND = [{ OR: [{ organizerId: null }, { organizerId: { not: sale.organizerId } }] }];
    }
  }
  return { skipSale: false, where };
}

/**
 * Extra fields for markdownCron.ts's conditional write. In SALE_TIERS_WIN the write is also pinned to the step
 * pointer read with the item (a cycle step landing in between makes it a no-op, retried next run) and a takeover
 * clears the step pointer so only one mechanism owns the item. Empty for the other modes.
 */
export function saleTierTakeover(
  mode: MarkdownPrecedence,
  item: { markdownStepIndexApplied?: number | null }
): { where: Record<string, unknown>; data: Record<string, unknown> } {
  if (mode !== 'SALE_TIERS_WIN') return { where: {}, data: {} };
  const step = item.markdownStepIndexApplied ?? null;
  return {
    where: { markdownStepIndexApplied: step },
    data: step != null && step > 0 ? { markdownStepIndexApplied: null } : {},
  };
}

// ---------------------------------------------------------------------------------------------------------------
// markdownCycleCron.ts (PRO/TEAMS cycles)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Item-selection fragment for markdownCycleCron.ts. FIRST_WINS and SALE_TIERS_WIN keep the 2026-10-30
 * { markdownTierApplied: 0 } (the cycle leaves tiered items alone); CYCLES_WIN drops it so the cycle can claim them.
 */
export function cycleItemSelection(mode: MarkdownPrecedence): Record<string, unknown> {
  return mode === 'CYCLES_WIN' ? {} : { markdownTierApplied: 0 };
}

/**
 * Lock fields for markdownCycleCron.ts's conditional writes. Default: { markdownTierApplied: 0 } exactly as today.
 * CYCLES_WIN pins the tier read with the item instead (a Day-2/Day-3 write in between makes it a no-op).
 */
export function cycleWriteLock(mode: MarkdownPrecedence, item: { markdownTierApplied?: number | null }): Record<string, unknown> {
  if (mode !== 'CYCLES_WIN') return { markdownTierApplied: 0 };
  return { markdownTierApplied: item.markdownTierApplied ?? 0 };
}

/** True when this cycle write takes an item over from the Day-2/Day-3 cron (CYCLES_WIN only). */
export function isCycleClaim(mode: MarkdownPrecedence, item: { markdownTierApplied?: number | null }): boolean {
  return mode === 'CYCLES_WIN' && (item.markdownTierApplied ?? 0) > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------------------

/** True for Prisma's "table does not exist" error (P2021), i.e. the OrganizerMarkdownPrecedence migration is not applied yet. */
export function isMissingPrecedenceTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'P2021') return true;
  const msg = String(e.message || '');
  return /does not exist/i.test(msg) && /OrganizerMarkdownPrecedence/.test(msg);
}

interface PrecedenceClient {
  organizerMarkdownPrecedence: {
    findMany: (args: any) => Promise<Array<{ organizerId: string; precedence: string }>>;
  };
  organizer: {
    findMany: (args: any) => Promise<Array<{ id: string; subscriptionTier: string | null }>>;
  };
}

/**
 * Effective precedence for each organizer id that has a non-default choice. Organizers missing from the map are
 * FIRST_WINS. Never throws: a missing table, or any read error (logged), means FIRST_WINS for everyone, i.e. the
 * crons fall back to exactly the 2026-10-30 behavior. Makes no query at all when organizerIds is empty.
 */
export async function loadMarkdownPrecedences(
  client: PrecedenceClient,
  organizerIds: Array<string | null | undefined>,
  logTag = '[markdown-precedence]'
): Promise<Map<string, MarkdownPrecedence>> {
  const out = new Map<string, MarkdownPrecedence>();
  const ids = Array.from(new Set(organizerIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (ids.length === 0) return out;
  try {
    const rows = await client.organizerMarkdownPrecedence.findMany({
      where: { organizerId: { in: ids }, precedence: { not: DEFAULT_MARKDOWN_PRECEDENCE } },
      select: { organizerId: true, precedence: true },
    });
    const chosen = rows.filter((r) => isMarkdownPrecedence(r.precedence) && r.precedence !== DEFAULT_MARKDOWN_PRECEDENCE);
    if (chosen.length === 0) return out;
    const orgs = await client.organizer.findMany({
      where: { id: { in: chosen.map((r) => r.organizerId) } },
      select: { id: true, subscriptionTier: true },
    });
    const tierById = new Map(orgs.map((o) => [o.id, o.subscriptionTier]));
    for (const r of chosen) {
      const mode = effectiveMarkdownPrecedence(r.precedence, tierById.get(r.organizerId));
      if (mode !== DEFAULT_MARKDOWN_PRECEDENCE) out.set(r.organizerId, mode);
    }
    return out;
  } catch (err) {
    if (!isMissingPrecedenceTableError(err)) {
      console.warn(`${logTag} could not read markdown precedence, using first-one-wins for this run:`, err);
    }
    return new Map();
  }
}
