/**
 * Reconcile engine (ADR-137 section 5). Pure: no database, no I/O, no clock.
 *
 * A TCGplayer seller export tells us what TCGplayer holds NOW (T, the file's Total Quantity). FindA.Sale also changes
 * stock on its own (counter sales), so T alone cannot say who changed what. Each card therefore keeps a BASELINE B:
 * the quantity TCGplayer was last known to hold (set by an earlier reconcile or by "mark export as uploaded").
 * This is a three-way merge:
 *
 *     change = T - sum(B)            what happened on TCGplayer since we last looked
 *     FindA.Sale available' = available + change
 *     new baseline = T
 *
 * Properties this buys:
 *  - Counter sales are never lost: they are inside `available`, not inside `change`.
 *  - Re-running the same file changes nothing: the baseline already equals T, so change is 0.
 *  - What FindA.Sale still owes TCGplayer afterwards is `available' - T`, which is what the next export sends.
 *
 * A negative change removes units with the same call as any other sale on another channel (sellItemUnits, oldest item
 * first); it never goes below the units actually available, and the part it could not remove is reported as a
 * shortfall (TCGplayer sold more than FindA.Sale had: a possible double sale the seller must look at).
 * A positive change raises the stock total of the oldest AVAILABLE item. If the card has no AVAILABLE item (only a
 * sold-out one), nothing is changed and the card is listed as needing a new item through the regular import; reopening
 * a sold item is deliberately not done (a paid purchase on it would make a later sale fail).
 *
 * A card never synced before has no baseline. The seller picks the policy once per run:
 *   FLAG_ONLY        (default) assume TCGplayer is where we last left it (baseline = T): no stock changes, the
 *                    difference shows up in the next export.
 *   ADOPT_TCGPLAYER  assume the FindA.Sale count was right when the file was made (baseline = available): FindA.Sale
 *                    takes TCGplayer's number.
 *
 * An export that was uploaded but never marked uploaded would double count; the seller is asked (lastExportUploaded)
 * and the export's pending quantity is used as the baseline when the answer is yes.
 */
import { SyncGroup, SyncUnit, groupAvailable } from './groups';

export type FirstSyncPolicy = 'FLAG_ONLY' | 'ADOPT_TCGPLAYER';

export interface ReconcileOptions {
  /** True when the last export was uploaded to TCGplayer (so its pending quantities are what TCGplayer held). */
  lastExportUploaded: boolean;
  firstSync: FirstSyncPolicy;
}

export interface FileRow {
  /** Spreadsheet row number (header is row 1). */
  row: number;
  productId: number;
  conditionCode: string | null;
  foil: boolean;
  /** Total Quantity from the file, 0 or more. */
  total: number;
  key: string;
}

export type OutcomeKind = 'IN_SYNC' | 'DECREASE' | 'INCREASE' | 'NEEDS_NEW_ITEM';

export interface SellOp {
  itemId: string;
  units: number;
}

export interface RaiseOp {
  itemId: string;
  units: number;
}

export interface BaselineWrite {
  itemId: string;
  qty: number;
}

export interface GroupPlan {
  key: string;
  kind: OutcomeKind;
  /** The group had no baseline before this run. */
  firstSync: boolean;
  /** Quantity in the file. */
  fileTotal: number;
  /** FindA.Sale units available before this run. */
  availableBefore: number;
  /** Baseline used for the merge. */
  baselineUsed: number;
  /** fileTotal minus baselineUsed. */
  change: number;
  sells: SellOp[];
  raise: RaiseOp | null;
  /** Units TCGplayer sold that FindA.Sale could not remove (it had fewer available). */
  shortfall: number;
  availableAfter: number;
  /** Baselines to store (only values that differ from what is stored). null = leave the group's baselines alone. */
  baselineWrites: BaselineWrite[] | null;
  /** availableAfter minus fileTotal: what the next export will send to TCGplayer. */
  stillToSend: number;
}

function effectiveBaseline(u: SyncUnit, uploaded: boolean): number {
  if (uploaded && u.pending !== null) return u.pending;
  return u.baseline ?? 0;
}

function isKnown(g: SyncGroup, uploaded: boolean): boolean {
  return g.units.some((u) => u.baseline !== null || (uploaded && u.pending !== null));
}

/** Spreads the quantity TCGplayer holds over the group: the oldest item carries it, the others carry 0. */
function allocateBaselines(g: SyncGroup, total: number): BaselineWrite[] {
  const writes: BaselineWrite[] = [];
  g.units.forEach((u, i) => {
    const want = i === 0 ? total : 0;
    if (u.baseline !== want) writes.push({ itemId: u.itemId, qty: want });
  });
  return writes;
}

export function planGroup(g: SyncGroup, file: Pick<FileRow, 'total'>, opts: ReconcileOptions): GroupPlan {
  const available = groupAvailable(g);
  const T = file.total;
  const known = isKnown(g, opts.lastExportUploaded);

  let base: number;
  if (known) base = g.units.reduce((s, u) => s + effectiveBaseline(u, opts.lastExportUploaded), 0);
  else base = opts.firstSync === 'ADOPT_TCGPLAYER' ? available : T;

  const change = T - base;
  const plan: GroupPlan = {
    key: g.key,
    kind: 'IN_SYNC',
    firstSync: !known,
    fileTotal: T,
    availableBefore: available,
    baselineUsed: base,
    change,
    sells: [],
    raise: null,
    shortfall: 0,
    availableAfter: available,
    baselineWrites: null,
    stillToSend: 0,
  };

  if (change < 0) {
    const want = -change;
    let left = Math.min(want, available);
    for (const u of g.units) {
      if (left <= 0) break;
      if (u.available <= 0) continue;
      const take = Math.min(u.available, left);
      plan.sells.push({ itemId: u.itemId, units: take });
      left -= take;
    }
    const removed = Math.min(want, available);
    plan.kind = 'DECREASE';
    plan.shortfall = want - removed;
    plan.availableAfter = available - removed;
  } else if (change > 0) {
    const target = g.units.find((u) => u.status === 'AVAILABLE');
    if (target) {
      plan.kind = 'INCREASE';
      plan.raise = { itemId: target.itemId, units: change };
      plan.availableAfter = available + change;
    } else {
      plan.kind = 'NEEDS_NEW_ITEM';
    }
  }

  if (plan.kind !== 'NEEDS_NEW_ITEM') plan.baselineWrites = allocateBaselines(g, T);
  plan.stillToSend = plan.availableAfter - T;
  return plan;
}

/** What to do with a card FindA.Sale tracks but the file does not mention. Stock is never changed. */
export interface AbsentPlan {
  key: string;
  /** Baseline sum (0 when never synced). */
  baseline: number;
  /** True when TCGplayer is believed to hold units of it but the file has no row (it may have sold out there). */
  listedButMissing: boolean;
  baselineWrites: BaselineWrite[];
}

export function planAbsent(g: SyncGroup, opts: ReconcileOptions): AbsentPlan {
  const baseline = g.units.reduce((s, u) => s + (u.baseline ?? 0), 0);
  const writes: BaselineWrite[] = [];
  if (opts.lastExportUploaded) {
    // The export was uploaded: its pending quantity is what TCGplayer holds now.
    for (const u of g.units) if (u.pending !== null && u.pending !== u.baseline) writes.push({ itemId: u.itemId, qty: u.pending });
  }
  const known = g.units.some((u) => u.baseline !== null);
  return { key: g.key, baseline, listedButMissing: known && baseline > 0, baselineWrites: writes };
}

export interface FileDuplicate {
  key: string;
  rows: number[];
}

export interface ReconcilePlan {
  plans: GroupPlan[];
  absent: AbsentPlan[];
  /** File rows with no FindA.Sale card (use the regular import to add them). */
  notInFindasale: FileRow[];
  /** Keys that appear on more than one row of the file. Those cards are skipped entirely. */
  duplicates: FileDuplicate[];
}

export function reconcile(groups: ReadonlyMap<string, SyncGroup>, fileRows: readonly FileRow[], opts: ReconcileOptions): ReconcilePlan {
  const byKey = new Map<string, FileRow[]>();
  for (const r of fileRows) {
    const list = byKey.get(r.key);
    if (list) list.push(r);
    else byKey.set(r.key, [r]);
  }

  const plans: GroupPlan[] = [];
  const absent: AbsentPlan[] = [];
  const notInFindasale: FileRow[] = [];
  const duplicates: FileDuplicate[] = [];

  for (const [key, rows] of byKey) {
    if (rows.length > 1) {
      duplicates.push({ key, rows: rows.map((r) => r.row) });
      continue;
    }
    const g = groups.get(key);
    if (!g) notInFindasale.push(rows[0]);
    else plans.push(planGroup(g, rows[0], opts));
  }
  for (const [key, g] of groups) {
    if (byKey.has(key)) continue;
    absent.push(planAbsent(g, opts));
  }

  plans.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  notInFindasale.sort((a, b) => a.row - b.row);
  duplicates.sort((a, b) => a.rows[0] - b.rows[0]);
  return { plans, absent, notInFindasale, duplicates };
}

export interface ReconcileTotals {
  inSync: number;
  decreased: number;
  increased: number;
  needsNewItem: number;
  unitsRemoved: number;
  unitsAdded: number;
  shortfallCards: number;
  shortfallUnits: number;
  firstSyncCards: number;
  /** Cards where FindA.Sale still has a difference to send to TCGplayer after this run. */
  stillToSendCards: number;
  notInFindasale: number;
  listedButMissing: number;
  duplicateKeys: number;
}

export function totalsOf(plan: ReconcilePlan): ReconcileTotals {
  const t: ReconcileTotals = {
    inSync: 0,
    decreased: 0,
    increased: 0,
    needsNewItem: 0,
    unitsRemoved: 0,
    unitsAdded: 0,
    shortfallCards: 0,
    shortfallUnits: 0,
    firstSyncCards: 0,
    stillToSendCards: 0,
    notInFindasale: plan.notInFindasale.length,
    listedButMissing: plan.absent.filter((a) => a.listedButMissing).length,
    duplicateKeys: plan.duplicates.length,
  };
  for (const p of plan.plans) {
    if (p.kind === 'IN_SYNC') t.inSync += 1;
    else if (p.kind === 'DECREASE') {
      t.decreased += 1;
      t.unitsRemoved += p.sells.reduce((s, x) => s + x.units, 0);
    } else if (p.kind === 'INCREASE') {
      t.increased += 1;
      t.unitsAdded += p.raise?.units ?? 0;
    } else t.needsNewItem += 1;
    if (p.shortfall > 0) {
      t.shortfallCards += 1;
      t.shortfallUnits += p.shortfall;
    }
    if (p.firstSync) t.firstSyncCards += 1;
    if (p.stillToSend !== 0 && p.kind !== 'NEEDS_NEW_ITEM') t.stillToSendCards += 1;
  }
  return t;
}
