/**
 * Bulk lot runs (ADR-140 section 8.5): reprice the organizer's bulk lots from the rate card, with no second pricing path.
 *
 *   previewLotRun   one row per lot: the target is the SELL per 1,000 rate of the lot's tier (finish ANY). Same price is
 *                   UNCHANGED, no rate is NO_RATE, a pin is LOCKED. Warnings on a changed row: a pack that would come to less
 *                   than 99 cents, and eBay bundles that follow the lot price.
 *   applyLotRun     the shared apply loop of runService (chunks of 200, idempotent, 409 ALREADY_APPLIED). Each row is written
 *                   by one call of the INJECTED updateBulkLot(itemId, { pricePerThousand: dollars }). That function owns
 *                   validation, rounding to cents and the stock rules; this file writes nothing to Item itself.
 *   undoLotRun      the same function with the old value, only where the lot still has the price the run wrote.
 *
 * A lot is never in a card run and a card is never in a lot run (runService lists cards without lots; this file lists lots
 * only). Item.price of a lot is dollars per 1,000 cards, so a run item holds cents per 1,000 cards in its price columns.
 * No ItemPriceHistory row is written: updateBulkLot is the only sanctioned way to change a lot price and it decides that.
 *
 * Unlike a card, a lot has no compare and swap inside the write (updateBulkLot takes no expected price), so the price is
 * re-read just before the call. A change landing between that read and the write is possible and would be overwritten with
 * the rate card price, which is the price the shop asked for in this run.
 */
import { chunk, dollarsToCents, validationError } from './db';
import type { ItemBulkLotRow, ItemRow, RunItemRow, RunRow, ServiceCtx } from './db';
import { lotPricePerThousandCents, tierForLotKind } from './bulkRates';
import { COPY, TIER_LABELS, fill, formatCentsUsd } from './messages';
import { PRICE_ITEM_SELECT } from './priceWriteService';
import { loadBulkRates, toBulkRate } from './referenceService';
import { activePins, applyRunWith, assertKeys, createPreviewRun, optBool, optString, previewResult, requireUsableBook, undoRunWith } from './runService';
import type { ApplySummary, NewRunItem, PreviewResult, PriceChange, RunRowWriter, UndoSummary } from './runService';
import type { BulkLotKindName } from './vocabulary';

/** The smallest charge a card payment can take, in cents (the same 99 as MIN_CARD_SALE_CENTS; a test pins them together). */
export const PACK_MIN_CHARGE_CENTS = 99;

/** Item statuses a lot run lists. Other lots (sold out, hidden) are not listed. */
const LOT_STATUSES = ['AVAILABLE', 'RESERVED'];

/** The injected writer: the real updateBulkLot with the database and organizer already bound (wired in the controller). */
export type UpdateBulkLotFn = (itemId: string, input: { pricePerThousand: number }) => Promise<unknown>;

export interface LotRunDeps {
  updateBulkLot: UpdateBulkLotFn;
  /** Called after a lot price changes (best effort, errors ignored). */
  onPriceChanged?: (change: PriceChange) => void | Promise<void>;
}

export const LOT_KIND_LABELS: Readonly<Record<BulkLotKindName, string>> = {
  BULK_COMMON: 'Bulk commons',
  BULK_UNCOMMON: 'Bulk uncommons',
  BULK_COMMON_UNCOMMON: 'Bulk commons and uncommons',
  BULK_RARE: 'Bulk rares',
  BULK_LAND: 'Bulk lands',
  BULK_MIXED: 'Mixed bulk',
};

export function lotKindLabel(kind: string): string {
  return (LOT_KIND_LABELS as Record<string, string>)[kind] ?? 'this kind of lot';
}

export const LOT_WARNING_CODES = ['PACK_BELOW_CARD_MINIMUM', 'EBAY_BUNDLES_FOLLOW'] as const;

export const LOT_COPY = {
  noRate: 'No rate set for {kind}.',
  unchanged: 'The price already matches your rate card.',
  rateCard: 'Your rate card: {rate} per 1,000 for {kind}.',
  notAvailable: 'This lot is not on the shelf right now, so it was left alone.',
  packBelowMinimum: 'This pack would be under {min}, so it cannot be sold online by card.',
  ebayBundlesFollow: 'The eBay bundle price will follow this change.',
  changedSince: 'This lot changed after the preview, so it was left alone.',
} as const;

/** Plain words for a warning code on a lot row. */
export function lotWarningText(code: string): string {
  if (code === 'PACK_BELOW_CARD_MINIMUM') return fill(LOT_COPY.packBelowMinimum, { min: formatCentsUsd(PACK_MIN_CHARGE_CENTS) });
  if (code === 'EBAY_BUNDLES_FOLLOW') return LOT_COPY.ebayBundlesFollow;
  return code;
}

/** Every string a lot run can show, for the copy lint test. */
export function allLotRunMessages(): string[] {
  const out: string[] = [];
  out.push(...Object.values(LOT_KIND_LABELS));
  out.push(fill(LOT_COPY.noRate, { kind: 'Bulk commons' }), fill(LOT_COPY.rateCard, { rate: '$8.00', kind: 'Bulk commons' }));
  out.push(LOT_COPY.unchanged, LOT_COPY.notAvailable, LOT_COPY.ebayBundlesFollow, LOT_COPY.changedSince);
  out.push(...LOT_WARNING_CODES.map((c) => lotWarningText(c)));
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What a pack of packSize cards costs at P cents per 1,000 cards (ADR-136 arithmetic). */
export function packPriceCents(packSize: number, perThousandCents: number): number {
  return Math.floor((packSize * perThousandCents + 500) / 1000);
}

interface LotEntry {
  item: ItemRow;
  lot: ItemBulkLotRow;
}

async function loadLots(ctx: ServiceCtx, saleId: string | null): Promise<LotEntry[]> {
  const lots = await ctx.db.itemBulkLot.findMany({ where: { organizerId: ctx.organizerId }, orderBy: { itemId: 'asc' } });
  const byItem = new Map<string, ItemBulkLotRow>();
  for (const l of lots) if (!byItem.has(l.itemId)) byItem.set(l.itemId, l);
  const out: LotEntry[] = [];
  for (const part of chunk(Array.from(byItem.keys()), 1000)) {
    const where: Record<string, unknown> = { organizerId: ctx.organizerId, deletedAt: null, status: { in: LOT_STATUSES }, id: { in: part } };
    if (saleId) where.saleId = saleId;
    const items = await ctx.db.item.findMany({ where, select: PRICE_ITEM_SELECT });
    for (const item of items) {
      const lot = byItem.get(item.id);
      if (lot) out.push({ item, lot });
    }
  }
  out.sort((a, b) => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  return out;
}

async function bundleItems(ctx: ServiceCtx, itemIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(Array.from(itemIds), 1000)) {
    for (const b of await ctx.db.itemBulkLotEbayBundle.findMany({ where: { organizerId: ctx.organizerId, itemId: { in: part } } })) {
      if (b.enabled) out.add(b.itemId);
    }
  }
  return out;
}

function baseLotRow(item: ItemRow, version: number): NewRunItem {
  return {
    itemId: item.id,
    itemTitle: (item.title || 'Bulk lot').slice(0, 200),
    oldPriceCents: dollarsToCents(item.price),
    newPriceCents: null,
    state: 'SKIPPED',
    selected: false,
    skipReason: null,
    priceSource: null,
    referenceOrigin: null,
    referenceCents: null,
    referenceAsOf: null,
    ruleId: null,
    ruleName: null,
    conditionCode: null,
    finish: null,
    warnings: [],
    reviewReasons: [],
    whyText: null,
    bookVersion: version,
    appliedAt: null,
    undoneAt: null,
  };
}

/** The pure decision for one lot: a pending change or a skip with its reason. */
export function decideLotRow(
  item: ItemRow,
  lot: ItemBulkLotRow,
  targetCents: number | null,
  pinned: boolean,
  hasEbayBundle: boolean,
  version: number
): NewRunItem {
  const base = baseLotRow(item, version);
  const kind = lotKindLabel(lot.lotKind);
  const skip = (reason: string, why: string): NewRunItem => ({ ...base, skipReason: reason, whyText: why });
  if (pinned) return skip('LOCKED', COPY.locked);
  if (item.status !== 'AVAILABLE') return skip('NOT_AVAILABLE', LOT_COPY.notAvailable);
  if (targetCents === null) return skip('NO_RATE', fill(LOT_COPY.noRate, { kind }));
  const why = fill(LOT_COPY.rateCard, { rate: formatCentsUsd(targetCents), kind });
  if (base.oldPriceCents === targetCents) {
    return { ...base, newPriceCents: targetCents, skipReason: 'UNCHANGED', priceSource: 'RATE_CARD', whyText: LOT_COPY.unchanged };
  }
  const warnings: string[] = [];
  if (typeof lot.packSize === 'number' && lot.packSize > 0 && packPriceCents(lot.packSize, targetCents) < PACK_MIN_CHARGE_CENTS) {
    warnings.push('PACK_BELOW_CARD_MINIMUM');
  }
  if (hasEbayBundle) warnings.push('EBAY_BUNDLES_FOLLOW');
  return {
    ...base,
    newPriceCents: targetCents,
    state: 'PENDING',
    selected: true,
    priceSource: 'RATE_CARD',
    referenceOrigin: 'Rate card',
    referenceCents: targetCents,
    ruleName: 'Rate card',
    warnings,
    whyText: why,
  };
}

function parseLotPreview(raw: unknown): { saleId: string | null } {
  if (!isPlainObject(raw)) throw validationError('Send an object.');
  assertKeys(raw, ['kind', 'scope', 'includeMarkedDown', 'includeEbayLive'], 'body');
  if (raw.kind !== 'LOT') throw validationError('kind must be LOT for a lot run.', { field: 'kind' });
  // The two card checkboxes mean nothing for lots (lots are never marked down by the crons and have no eBay listing of their own).
  optBool(raw.includeMarkedDown, 'includeMarkedDown');
  optBool(raw.includeEbayLive, 'includeEbayLive');
  const scope = raw.scope === undefined || raw.scope === null ? {} : raw.scope;
  if (!isPlainObject(scope)) throw validationError('scope must be an object.', { field: 'scope' });
  assertKeys(scope, ['saleId'], 'scope');
  return { saleId: optString(scope.saleId, 'saleId') };
}

/** Computes and stores a lot run preview from the rate card. Writes only the run and its rows. */
export async function previewLotRun(ctx: ServiceCtx, input: unknown): Promise<PreviewResult> {
  const parsed = parseLotPreview(input);
  const book = await requireUsableBook(ctx);
  const entries = await loadLots(ctx, parsed.saleId);
  const rates = (await loadBulkRates(ctx.db, book.id)).map(toBulkRate);
  const pins = await activePins(ctx.db, book.id, entries.map((e) => e.item.id), ctx.now);
  const bundles = await bundleItems(ctx, entries.map((e) => e.item.id));
  const rows = entries.map((e) => {
    const target = tierForLotKind(e.lot.lotKind) ? lotPricePerThousandCents(rates, { game: e.lot.game, lotKind: e.lot.lotKind }) : null;
    return decideLotRow(e.item, e.lot, target, pins.has(e.item.id), bundles.has(e.item.id), book.version);
  });
  const run = await createPreviewRun(
    ctx,
    book,
    { kind: 'LOT', scope: { saleId: parsed.saleId, game: null, setCode: null, rarityClass: null, finish: null, onlyUnpriced: false }, flags: { includeMarkedDown: false, includeEbayLive: false } },
    rows
  );
  return previewResult(ctx, run, []);
}

async function notify(deps: LotRunDeps, change: PriceChange): Promise<void> {
  if (!deps.onPriceChanged) return;
  try {
    await deps.onPriceChanged(change);
  } catch (e) {
    void e; // a failed alert never undoes a price
  }
}

function changeOf(kind: 'APPLY' | 'UNDO', run: RunRow, item: ItemRow, oldCents: number | null, newCents: number | null): PriceChange {
  return {
    runId: run.id,
    kind,
    itemId: item.id,
    organizerId: item.organizerId ?? '',
    oldPriceCents: oldCents,
    newPriceCents: newCents,
    oldPrice: oldCents === null ? null : oldCents / 100,
    newPrice: newCents === null ? null : newCents / 100,
    ebayListed: Boolean(item.ebayListingId || item.ebayOfferId),
  };
}

async function readLot(ctx: ServiceCtx, itemId: string): Promise<{ item: ItemRow; lot: ItemBulkLotRow } | null> {
  const item = await ctx.db.item.findFirst({ where: { id: itemId, organizerId: ctx.organizerId, deletedAt: null }, select: PRICE_ITEM_SELECT });
  if (!item) return null;
  const lot = await ctx.db.itemBulkLot.findFirst({ where: { itemId, organizerId: ctx.organizerId } });
  return lot ? { item, lot } : null;
}

/** Writes lot prices through the injected updateBulkLot. The row is claimed first, so two calls at once write a lot once. */
export function createLotRowWriter(deps: LotRunDeps): RunRowWriter {
  return {
    async applyRow(ctx: ServiceCtx, run: RunRow, row: RunItemRow) {
      const claim = await ctx.db.priceBookRunItem.updateMany({
        where: { id: row.id, runId: run.id, state: 'PENDING', selected: true },
        data: { state: 'APPLIED', appliedAt: ctx.now },
      });
      if (claim.count !== 1) return 'RACED';
      const found = await readLot(ctx, row.itemId);
      const target = row.newPriceCents;
      const stale =
        !found || found.item.status !== 'AVAILABLE' || dollarsToCents(found.item.price) !== row.oldPriceCents || target === null || target < 1;
      if (stale || !found || target === null) {
        await ctx.db.priceBookRunItem.updateMany({ where: { id: row.id, runId: run.id }, data: { state: 'CHANGED_SINCE_PREVIEW', appliedAt: null } });
        return 'CHANGED';
      }
      await deps.updateBulkLot(found.item.id, { pricePerThousand: target / 100 });
      await notify(deps, changeOf('APPLY', run, found.item, row.oldPriceCents, target));
      return 'APPLIED';
    },

    async undoRow(ctx: ServiceCtx, run: RunRow, row: RunItemRow) {
      const claim = await ctx.db.priceBookRunItem.updateMany({
        where: { id: row.id, runId: run.id, state: 'APPLIED' },
        data: { state: 'UNDONE', undoneAt: ctx.now },
      });
      if (claim.count !== 1) return 'RACED';
      const found = await readLot(ctx, row.itemId);
      const back = row.oldPriceCents;
      // A lot cannot go back to no price (updateBulkLot needs a price), so a run that priced an unpriced lot cannot be undone.
      const stale = !found || dollarsToCents(found.item.price) !== row.newPriceCents || back === null || back < 1;
      if (stale || !found || back === null) {
        await ctx.db.priceBookRunItem.updateMany({ where: { id: row.id, runId: run.id }, data: { state: 'UNDO_SKIPPED', undoneAt: null } });
        return 'SKIPPED';
      }
      await deps.updateBulkLot(found.item.id, { pricePerThousand: back / 100 });
      await notify(deps, changeOf('UNDO', run, found.item, row.newPriceCents, back));
      return 'UNDONE';
    },
  };
}

/** Applies the next chunk of a lot run (kind LOT). */
export function applyLotRun(ctx: ServiceCtx, runId: unknown, input: unknown, deps: LotRunDeps): Promise<ApplySummary> {
  return applyRunWith(ctx, runId, input, 'LOT', createLotRowWriter(deps));
}

/** Undoes the next chunk of a lot run (kind LOT). */
export function undoLotRun(ctx: ServiceCtx, runId: unknown, deps: LotRunDeps): Promise<UndoSummary> {
  return undoRunWith(ctx, runId, 'LOT', createLotRowWriter(deps));
}

/** Tier label of a lot kind, for screens that show the rate card next to the lot. Null for a name that is not a lot kind. */
export function lotTierLabel(lotKind: string): string | null {
  const tier = tierForLotKind(lotKind);
  return tier ? TIER_LABELS[tier] : null;
}
