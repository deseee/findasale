/**
 * Database side of the TCGplayer round trip (ADR-137 sections 4 to 6). Everything here goes through an injected
 * database object and injected stock functions, so this module imports no Prisma code and tests run on an in-memory
 * fake. The default wiring (shared Prisma client, sellItemUnits, eBay propagation) lives in wiring.ts.
 *
 * Scope: ONE sale. The card intake merges only within a sale (ADR-134 section 4.6), so the round trip does too: a card
 * shop that keeps its stock in several sales runs the round trip once per sale (ADR-137 open question 6).
 *
 * Nothing here touches Purchase, payments or any non-card item: every query requires an ItemCard row.
 */
import {
  GroupSkips,
  SyncGroup,
  SyncItemRow,
  buildGroups,
  conditionWord,
  groupAvailable,
  groupBaseline,
  isListedOnTcgplayer,
} from './groups';
import { ExportOptions, ExportPlan, buildExportPlan, exportFileName } from './exportBuilder';
import {
  FileRow,
  GroupPlan,
  OutcomeKind,
  SellOp,
  ReconcileOptions,
  ReconcilePlan,
  ReconcileTotals,
  planGroup,
  reconcile,
  totalsOf,
} from './reconcileEngine';
import { FileProblem } from './reconcileFile';
import { GROUP_TX_TIMEOUT_MS, LIST_CAP, LOAD_PAGE_SIZE, PROBLEM_SAMPLE_CAP, REGISTER_CHECK_MAX_ITEMS, WRITE_CHUNK_SIZE } from './config';
import { NOTES } from './messages';

export interface SyncTx {
  item: {
    findMany(args: any): Promise<any[]>;
  };
  itemCard: {
    findMany(args: any): Promise<any[]>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface SyncDb extends SyncTx {
  $transaction<T>(fn: (tx: SyncTx) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}

export interface SoldResult {
  itemId: string;
  fullySoldOut: boolean;
  remainingStock: number;
}

/** Stock functions the reconcile needs. The defaults (wiring.ts) call sellItemUnits and a guarded SQL update. */
export interface SyncDeps {
  /** Same call every other "sold on another channel" path uses. Throws when fewer units remain than asked. */
  sellUnits(itemId: string, units: number, tx: SyncTx): Promise<{ fullySoldOut: boolean; remainingStock: number }>;
  /** Adds units to the stock total of an AVAILABLE item. Returns false when the item was no longer AVAILABLE. */
  raiseUnits(itemId: string, units: number, tx: SyncTx): Promise<boolean>;
  /** Called after commit for every item that lost units (marketplace propagation). Never awaited, never throws. */
  onSold?(result: SoldResult): void;
  now(): Date;
}

const ITEM_SELECT = {
  id: true,
  createdAt: true,
  status: true,
  stockTotal: true,
  stockSold: true,
  price: true,
  card: {
    select: {
      game: true,
      cardName: true,
      setName: true,
      collectorNumber: true,
      rarity: true,
      conditionCode: true,
      finish: true,
      grader: true,
      tcgplayerProductId: true,
      tcgplayerQty: true,
      tcgplayerPendingQty: true,
      tcgplayerSyncedAt: true,
    },
  },
};

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Card items of one sale (not deleted), read in pages. productIds limits the read to those TCGplayer Ids. */
export async function loadCardItems(db: Pick<SyncTx, 'item'>, saleId: string, productIds?: number[]): Promise<SyncItemRow[]> {
  const cardFilter = productIds ? { is: { tcgplayerProductId: { in: productIds } } } : { isNot: null };
  const out: SyncItemRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.item.findMany({
      where: { saleId, deletedAt: null, card: cardFilter },
      select: ITEM_SELECT,
      orderBy: { id: 'asc' },
      take: LOAD_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    out.push(...(page as SyncItemRow[]));
    if (page.length < LOAD_PAGE_SIZE) break;
    cursor = page[page.length - 1].id as string;
  }
  return out;
}

function lastSyncedAt(rows: readonly SyncItemRow[]): string | null {
  let best = 0;
  for (const r of rows) {
    const v = r.card?.tcgplayerSyncedAt;
    if (!v) continue;
    const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
    if (Number.isFinite(ms) && ms > best) best = ms;
  }
  return best > 0 ? new Date(best).toISOString() : null;
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

export interface CardLine {
  key: string;
  productId: number;
  cardName: string | null;
  setName: string | null;
  collectorNumber: string | null;
  condition: string;
  /** Units available in FindA.Sale now. */
  available: number;
  /** Quantity last known on TCGplayer. */
  onTcgplayer: number;
  /** available minus onTcgplayer: what TCGplayer still has to be told. */
  toSend: number;
}

export interface SyncStatus {
  /** Distinct cards (TCGplayer Id, condition, foil) that can take part. */
  cardsTracked: number;
  listedOnTcgplayer: number;
  /** Cards not yet known to be on TCGplayer that have stock here. */
  notOnTcgplayer: number;
  waitingToSendCount: number;
  waitingToSend: CardLine[];
  /** An update file was downloaded and not yet marked uploaded or reconciled. */
  exportWaiting: boolean;
  exportWaitingCards: number;
  lastSyncedAt: string | null;
  skipped: GroupSkips;
}

function lineOf(g: SyncGroup): CardLine {
  const available = groupAvailable(g);
  const b = groupBaseline(g);
  const onTcgplayer = b.known ? b.sum : 0;
  return {
    key: g.key,
    productId: g.productId,
    cardName: g.cardName,
    setName: g.setName,
    collectorNumber: g.collectorNumber,
    condition: conditionWord(g.conditionCode, g.foil),
    available,
    onTcgplayer,
    toSend: available - onTcgplayer,
  };
}

export async function getStatus(db: SyncDb, saleId: string): Promise<SyncStatus> {
  const rows = await loadCardItems(db, saleId);
  const { groups, skipped } = buildGroups(rows);
  let listed = 0;
  let notOn = 0;
  let waiting = 0;
  let exportWaitingCards = 0;
  const lines: CardLine[] = [];
  for (const g of groups.values()) {
    const b = groupBaseline(g);
    if (g.units.some((u) => u.pending !== null)) exportWaitingCards += 1;
    if (b.known) {
      if (b.sum > 0) listed += 1;
      const line = lineOf(g);
      if (line.toSend !== 0) {
        waiting += 1;
        lines.push(line);
      }
    } else if (groupAvailable(g) > 0) {
      notOn += 1;
    }
  }
  lines.sort((a, b) => (a.cardName ?? '').localeCompare(b.cardName ?? '') || (a.key < b.key ? -1 : 1));
  return {
    cardsTracked: groups.size,
    listedOnTcgplayer: listed,
    notOnTcgplayer: notOn,
    waitingToSendCount: waiting,
    waitingToSend: lines.slice(0, LIST_CAP),
    exportWaiting: exportWaitingCards > 0,
    exportWaitingCards,
    lastSyncedAt: lastSyncedAt(rows),
    skipped,
  };
}

/** True when an export of this sale is waiting to be marked uploaded (used to decide whether the reconcile must ask). */
export async function hasPendingExport(db: SyncDb, saleId: string): Promise<boolean> {
  const rows = await db.itemCard.findMany({
    where: { tcgplayerPendingQty: { not: null }, item: { is: { saleId, deletedAt: null } } },
    select: { itemId: true },
    take: 1,
  });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

export interface ExportResult {
  fileName: string;
  plan: ExportPlan;
  skipped: GroupSkips;
}

function groupIdsByQty(entries: ReadonlyArray<{ itemId: string; qty: number }>): Map<number, string[]> {
  const byQty = new Map<number, string[]>();
  for (const e of entries) {
    const list = byQty.get(e.qty);
    if (list) list.push(e.itemId);
    else byQty.set(e.qty, [e.itemId]);
  }
  return byQty;
}

/** Builds the file and, when it has rows, remembers what each item will hold once it is uploaded. */
export async function createExport(db: SyncDb, saleId: string, options: Partial<ExportOptions>, now: Date): Promise<ExportResult> {
  const rows = await loadCardItems(db, saleId);
  const { groups, skipped } = buildGroups(rows);
  const plan = buildExportPlan(groups.values(), options);
  if (plan.rows.length > 0) {
    const byQty = groupIdsByQty(plan.pending);
    await db.$transaction(
      async (tx) => {
        await tx.itemCard.updateMany({
          where: { tcgplayerPendingQty: { not: null }, item: { is: { saleId } } },
          data: { tcgplayerPendingQty: null, tcgplayerPendingAt: null },
        });
        for (const [qty, ids] of byQty) {
          for (const part of chunk(ids, WRITE_CHUNK_SIZE)) {
            await tx.itemCard.updateMany({
              where: { itemId: { in: part } },
              data: { tcgplayerPendingQty: qty, tcgplayerPendingAt: now },
            });
          }
        }
      },
      { timeout: 60000 }
    );
  }
  return { fileName: exportFileName(now), plan, skipped };
}

/** The seller uploaded the file: what it set is now what TCGplayer holds. Returns the number of items moved. */
export async function markExportUploaded(db: SyncDb, saleId: string, now: Date): Promise<number> {
  const waiting = await db.itemCard.findMany({
    where: { tcgplayerPendingQty: { not: null }, item: { is: { saleId, deletedAt: null } } },
    select: { itemId: true, tcgplayerPendingQty: true },
  });
  if (waiting.length === 0) return 0;
  const byQty = groupIdsByQty(waiting.map((w: any) => ({ itemId: w.itemId as string, qty: w.tcgplayerPendingQty as number })));
  await db.$transaction(
    async (tx) => {
      for (const [qty, ids] of byQty) {
        for (const part of chunk(ids, WRITE_CHUNK_SIZE)) {
          await tx.itemCard.updateMany({
            where: { itemId: { in: part } },
            data: { tcgplayerQty: qty, tcgplayerSyncedAt: now, tcgplayerPendingQty: null, tcgplayerPendingAt: null },
          });
        }
      }
    },
    { timeout: 60000 }
  );
  return waiting.length;
}

// ---------------------------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------------------------

export interface ChangeLine extends CardLine {
  kind: OutcomeKind;
  fileTotal: number;
  availableAfter: number;
  change: number;
  shortfall: number;
  firstSync: boolean;
  note: string | null;
}

export interface FileOnlyLine {
  row: number;
  productId: number;
  condition: string;
  total: number;
}

export interface ReconcileReport {
  rowsInFile: number;
  problemCount: number;
  problems: FileProblem[];
  totals: ReconcileTotals;
  /** Cards whose stock changes, or that need a look. Capped; totals are complete. */
  changes: ChangeLine[];
  notInFindasale: FileOnlyLine[];
  listedButMissing: CardLine[];
  duplicateKeys: Array<{ key: string; rows: number[] }>;
  applied: boolean;
}

function noteFor(p: GroupPlan): string | null {
  if (p.kind === 'NEEDS_NEW_ITEM') return NOTES.NEEDS_NEW_ITEM;
  if (p.shortfall > 0) return NOTES.SHORTFALL;
  if (p.firstSync && p.stillToSend !== 0) return NOTES.FIRST_SYNC_DIFFERS;
  return null;
}

function interesting(p: GroupPlan): boolean {
  return p.kind !== 'IN_SYNC' || p.shortfall > 0 || (p.firstSync && p.stillToSend !== 0);
}

export interface ParsedFileInput {
  rows: FileRow[];
  problems: FileProblem[];
  problemCount: number;
  rowsTotal: number;
}

function buildReport(plan: ReconcilePlan, groups: ReadonlyMap<string, SyncGroup>, file: ParsedFileInput, applied: boolean): ReconcileReport {
  const changes: ChangeLine[] = [];
  for (const p of plan.plans) {
    if (!interesting(p)) continue;
    const g = groups.get(p.key);
    if (!g) continue;
    changes.push({
      ...lineOf(g),
      kind: p.kind,
      fileTotal: p.fileTotal,
      availableAfter: p.availableAfter,
      change: p.change,
      shortfall: p.shortfall,
      firstSync: p.firstSync,
      note: noteFor(p),
    });
  }
  changes.sort((a, b) => (a.cardName ?? '').localeCompare(b.cardName ?? '') || (a.key < b.key ? -1 : 1));

  const missing: CardLine[] = [];
  for (const a of plan.absent) {
    if (!a.listedButMissing) continue;
    const g = groups.get(a.key);
    if (g) missing.push(lineOf(g));
  }

  return {
    rowsInFile: file.rowsTotal,
    problemCount: file.problemCount,
    problems: file.problems.slice(0, PROBLEM_SAMPLE_CAP),
    totals: totalsOf(plan),
    changes: changes.slice(0, LIST_CAP),
    notInFindasale: plan.notInFindasale.slice(0, PROBLEM_SAMPLE_CAP).map((r) => ({
      row: r.row,
      productId: r.productId,
      condition: conditionWord(r.conditionCode, r.foil),
      total: r.total,
    })),
    listedButMissing: missing.slice(0, LIST_CAP),
    duplicateKeys: plan.duplicates.slice(0, PROBLEM_SAMPLE_CAP),
    applied,
  };
}

/** Nothing is written. */
export async function previewReconcile(db: SyncDb, saleId: string, file: ParsedFileInput, opts: ReconcileOptions): Promise<ReconcileReport> {
  const rows = await loadCardItems(db, saleId);
  const { groups } = buildGroups(rows);
  const plan = reconcile(groups, file.rows, opts);
  return buildReport(plan, groups, file, false);
}

function hasPendingUnits(g: SyncGroup): boolean {
  return g.units.some((u) => u.pending !== null);
}

export async function applyReconcile(
  db: SyncDb,
  saleId: string,
  file: ParsedFileInput,
  opts: ReconcileOptions,
  deps: SyncDeps
): Promise<ReconcileReport> {
  const rows = await loadCardItems(db, saleId);
  const { groups } = buildGroups(rows);
  const plan = reconcile(groups, file.rows, opts);
  const fileByKey = new Map<string, FileRow>();
  for (const r of file.rows) fileByKey.set(r.key, r);
  const sold: SoldResult[] = [];

  // 1. Cards whose stock moves: one transaction each, re-planned from fresh rows inside it.
  // 2. Cards that only need their baseline stored: batched, no stock change, nothing to re-plan.
  const baselineOnly: GroupPlan[] = [];
  for (let i = 0; i < plan.plans.length; i++) {
    const p = plan.plans[i];
    if (p.kind === 'NEEDS_NEW_ITEM') continue;
    const g = groups.get(p.key);
    const f = fileByKey.get(p.key);
    if (!g || !f) continue;
    if (p.sells.length > 0 || p.raise) {
      const result = await applyStockGroup(db, saleId, f, opts, deps, sold);
      if (result) plan.plans[i] = result;
    } else if ((p.baselineWrites && p.baselineWrites.length > 0) || hasPendingUnits(g)) {
      baselineOnly.push(p);
    }
  }

  const writes: Array<{ itemId: string; qty: number }> = [];
  const clearIds: string[] = [];
  for (const p of baselineOnly) {
    const g = groups.get(p.key) as SyncGroup;
    for (const w of p.baselineWrites ?? []) writes.push(w);
    for (const u of g.units) if (u.pending !== null) clearIds.push(u.itemId);
  }
  // Cards the file does not mention: only an uploaded export moves their baseline.
  for (const a of plan.absent) {
    const g = groups.get(a.key) as SyncGroup;
    for (const w of a.baselineWrites) writes.push(w);
    for (const u of g.units) if (u.pending !== null) clearIds.push(u.itemId);
  }
  await writeBaselines(db, writes, clearIds, deps.now());

  for (const s of sold) {
    try {
      deps.onSold?.(s);
    } catch {
      // propagation is best effort and must never fail the reconcile
    }
  }
  return buildReport(plan, groups, file, true);
}

async function writeBaselines(db: SyncDb, writes: ReadonlyArray<{ itemId: string; qty: number }>, clearIds: readonly string[], now: Date): Promise<void> {
  if (writes.length === 0 && clearIds.length === 0) return;
  const byQty = groupIdsByQty(writes);
  const toClear = Array.from(new Set(clearIds));
  await db.$transaction(
    async (tx) => {
      for (const [qty, ids] of byQty) {
        for (const part of chunk(ids, WRITE_CHUNK_SIZE)) {
          await tx.itemCard.updateMany({ where: { itemId: { in: part } }, data: { tcgplayerQty: qty, tcgplayerSyncedAt: now } });
        }
      }
      for (const part of chunk(toClear, WRITE_CHUNK_SIZE)) {
        await tx.itemCard.updateMany({ where: { itemId: { in: part } }, data: { tcgplayerPendingQty: null, tcgplayerPendingAt: null } });
      }
    },
    { timeout: 60000 }
  );
}

/**
 * One card whose stock changes. The card is read again inside the transaction and planned again from that read, so a
 * counter sale that happened since the first read is part of `available`, not lost.
 */
async function applyStockGroup(
  db: SyncDb,
  saleId: string,
  file: FileRow,
  opts: ReconcileOptions,
  deps: SyncDeps,
  soldOut: SoldResult[]
): Promise<GroupPlan | null> {
  const result = await db.$transaction(
    async (tx): Promise<{ plan: GroupPlan; removed: SoldResult[] } | null> => {
      const rows = await loadCardItems(tx, saleId, [file.productId]);
      const { groups } = buildGroups(rows);
      const g = groups.get(file.key);
      if (!g) return null;
      const fresh = planGroup(g, file, opts);
      if (fresh.kind === 'NEEDS_NEW_ITEM') return { plan: fresh, removed: [] };

      let shortfall = fresh.shortfall;
      const removed: SoldResult[] = [];
      const done: SellOp[] = [];
      for (const s of fresh.sells) {
        try {
          const r = await deps.sellUnits(s.itemId, s.units, tx);
          done.push(s);
          removed.push({ itemId: s.itemId, fullySoldOut: r.fullySoldOut, remainingStock: r.remainingStock });
        } catch (err) {
          if ((err as { name?: string })?.name === 'InsufficientStockError') shortfall += s.units;
          else throw err;
        }
      }
      if (fresh.raise) {
        const ok = await deps.raiseUnits(fresh.raise.itemId, fresh.raise.units, tx);
        if (!ok) {
          // The item stopped being AVAILABLE a moment ago. Leave the card for the next run.
          fresh.kind = 'NEEDS_NEW_ITEM';
          fresh.raise = null;
          return { plan: fresh, removed: [] };
        }
      }
      const now = deps.now();
      for (const w of fresh.baselineWrites ?? []) {
        await tx.itemCard.update({ where: { itemId: w.itemId }, data: { tcgplayerQty: w.qty, tcgplayerSyncedAt: now } });
      }
      await tx.itemCard.updateMany({
        where: { itemId: { in: g.units.map((u) => u.itemId) }, tcgplayerPendingQty: { not: null } },
        data: { tcgplayerPendingQty: null, tcgplayerPendingAt: null },
      });
      // Report what really happened: units that could not be removed (a race with a counter sale) are a shortfall.
      fresh.sells = done;
      fresh.shortfall = shortfall;
      fresh.availableAfter = fresh.availableBefore - done.reduce((n, x) => n + x.units, 0) + (fresh.raise?.units ?? 0);
      fresh.stillToSend = fresh.availableAfter - fresh.fileTotal;
      return { plan: fresh, removed };
    },
    { timeout: GROUP_TX_TIMEOUT_MS }
  );
  if (!result) return null;
  // Only after the transaction committed is the stock change reported for marketplace propagation.
  soldOut.push(...result.removed);
  return result.plan;
}

// ---------------------------------------------------------------------------------------------
// Register check
// ---------------------------------------------------------------------------------------------

export interface RegisterCheckRow {
  itemId: string;
  onTcgplayer: boolean;
  /** Quantity last known on TCGplayer for this card (all items of the same card added together). */
  tcgplayerQty: number;
  /** Units of this card available in FindA.Sale now. */
  available: number;
}

export async function registerCheck(db: SyncDb, saleId: string, itemIds: readonly string[]): Promise<RegisterCheckRow[]> {
  const ids = Array.from(new Set(itemIds.filter((i) => typeof i === 'string' && i.length > 0 && i.length <= 64))).slice(0, REGISTER_CHECK_MAX_ITEMS);
  if (ids.length === 0) return [];
  const asked = await db.item.findMany({
    where: { id: { in: ids }, saleId, deletedAt: null, card: { isNot: null } },
    select: { id: true, card: { select: { tcgplayerProductId: true } } },
  });
  const productIds = Array.from(
    new Set(asked.map((a: any) => a.card?.tcgplayerProductId).filter((p: unknown): p is number => Number.isInteger(p) && (p as number) > 0))
  );
  const byItem = new Map<string, SyncGroup>();
  if (productIds.length > 0) {
    const rows = await loadCardItems(db, saleId, productIds);
    const { groups } = buildGroups(rows);
    for (const g of groups.values()) for (const u of g.units) byItem.set(u.itemId, g);
  }
  return ids.map((itemId) => {
    const g = byItem.get(itemId);
    if (!g) return { itemId, onTcgplayer: false, tcgplayerQty: 0, available: 0 };
    const b = groupBaseline(g);
    return { itemId, onTcgplayer: isListedOnTcgplayer(g), tcgplayerQty: b.known ? b.sum : 0, available: groupAvailable(g) };
  });
}
