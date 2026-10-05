/**
 * Builds the TCGplayer upload CSV from FindA.Sale card stock (ADR-137 section 4). Pure: no database, no I/O.
 *
 * Columns are limited to names the card intake's TCGplayer importer already reads, which come from TCGplayer's own
 * seller export (ADR-134 section 4.4): TCGplayer Id, Product Line, Set Name, Product Name, Number, Rarity, Condition,
 * Add to Quantity or Total Quantity, and optionally TCG Marketplace Price. Header casing, how foil is written in
 * Condition, whether a negative Add to Quantity is accepted and what a blank price means are NOT confirmed against a
 * real TCGplayer upload (ADR-137 section 9). The defaults are the least risky choices: no price column, only cards
 * whose quantity changed, only cards already known to be on TCGplayer.
 *
 * Quantity written per card, in the default ADD mode, is the DELTA: FindA.Sale units available now minus the
 * quantity last known on TCGplayer. Every cell goes through csvCell, so text that starts with = + - or @ cannot run as
 * a formula; the quantity is written as a number, so a negative delta keeps its minus sign.
 */
import { csvCell } from '../../utils/csvSafe';
import {
  SyncGroup,
  conditionWord,
  groupAvailable,
  groupBaseline,
  productLineWord,
} from './groups';

export type QuantityColumn = 'ADD' | 'TOTAL';

export interface ExportOptions {
  /** Include cards never synced with TCGplayer. That LISTS them on TCGplayer when the file is uploaded. Default false. */
  includeNew: boolean;
  /** Add the TCG Marketplace Price column from the FindA.Sale price. Default false. */
  includePrices: boolean;
  /** ADD writes Add to Quantity (the change); TOTAL writes Total Quantity (the full count). Default ADD. */
  quantityColumn: QuantityColumn;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { includeNew: false, includePrices: false, quantityColumn: 'ADD' };

export const HEADER = {
  id: 'TCGplayer Id',
  line: 'Product Line',
  set: 'Set Name',
  name: 'Product Name',
  number: 'Number',
  rarity: 'Rarity',
  condition: 'Condition',
  addQty: 'Add to Quantity',
  totalQty: 'Total Quantity',
  price: 'TCG Marketplace Price',
} as const;

export function exportHeaders(opts: Pick<ExportOptions, 'includePrices' | 'quantityColumn'>): string[] {
  const cols: string[] = [HEADER.id, HEADER.line, HEADER.set, HEADER.name, HEADER.number, HEADER.rarity, HEADER.condition];
  cols.push(opts.quantityColumn === 'TOTAL' ? HEADER.totalQty : HEADER.addQty);
  if (opts.includePrices) cols.push(HEADER.price);
  return cols;
}

export interface ExportRow {
  key: string;
  productId: number;
  /** FindA.Sale units available now. */
  available: number;
  /** Quantity last known on TCGplayer (0 when the card was never synced). */
  baseline: number;
  /** available minus baseline: what the file asks TCGplayer to add (negative = remove). */
  delta: number;
  isNew: boolean;
}

export interface PendingWrite {
  itemId: string;
  qty: number;
}

export interface ExportSummary {
  /** Cards in the file. */
  rows: number;
  /** Cards in the file that are not on TCGplayer yet (only when includeNew is on). */
  newListings: number;
  /** Cards on TCGplayer whose quantity already matches (not in the file). */
  unchanged: number;
  /** Cards never synced and left out because includeNew is off. */
  notOnTcgplayer: number;
}

export interface ExportPlan {
  csv: string;
  headers: string[];
  rows: ExportRow[];
  summary: ExportSummary;
  /** Per item: the quantity it holds once this file is uploaded. Saved so "mark uploaded" can move the baseline. */
  pending: PendingWrite[];
}

function priceCell(g: SyncGroup): string {
  const sellable = g.units.find((u) => u.available > 0 && u.price !== null) ?? g.units.find((u) => u.price !== null);
  return sellable && sellable.price !== null ? sellable.price.toFixed(2) : '';
}

function compareGroups(a: SyncGroup, b: SyncGroup): number {
  const an = (a.cardName ?? '').toLowerCase();
  const bn = (b.cardName ?? '').toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  const as = (a.setName ?? '').toLowerCase();
  const bs = (b.setName ?? '').toLowerCase();
  if (as !== bs) return as < bs ? -1 : 1;
  const an2 = a.collectorNumber ?? '';
  const bn2 = b.collectorNumber ?? '';
  if (an2 !== bn2) return an2 < bn2 ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function buildExportPlan(groups: Iterable<SyncGroup>, options: Partial<ExportOptions> = {}): ExportPlan {
  const opts: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const headers = exportHeaders(opts);
  const summary: ExportSummary = { rows: 0, newListings: 0, unchanged: 0, notOnTcgplayer: 0 };
  const picked: Array<{ group: SyncGroup; row: ExportRow }> = [];

  for (const g of groups) {
    const base = groupBaseline(g);
    const available = groupAvailable(g);
    if (!base.known && !opts.includeNew) {
      summary.notOnTcgplayer += 1;
      continue;
    }
    const baseline = base.known ? base.sum : 0;
    const delta = available - baseline;
    if (delta === 0) {
      if (base.known) summary.unchanged += 1;
      continue;
    }
    picked.push({ group: g, row: { key: g.key, productId: g.productId, available, baseline, delta, isNew: !base.known } });
  }

  picked.sort((x, y) => compareGroups(x.group, y.group));

  const lines: string[] = [headers.map(csvCell).join(',')];
  const pending: PendingWrite[] = [];
  for (const { group: g, row } of picked) {
    const qty = opts.quantityColumn === 'TOTAL' ? row.available : row.delta;
    const cells: unknown[] = [
      row.productId,
      productLineWord(g.game),
      g.setName ?? '',
      g.cardName ?? '',
      g.collectorNumber ?? '',
      g.rarity ?? '',
      conditionWord(g.conditionCode, g.foil),
      qty,
    ];
    if (opts.includePrices) cells.push(priceCell(g));
    lines.push(cells.map(csvCell).join(','));
    summary.rows += 1;
    if (row.isNew) summary.newListings += 1;
    for (const u of g.units) pending.push({ itemId: u.itemId, qty: u.available });
  }

  return { csv: `${lines.join('\n')}\n`, headers, rows: picked.map((p) => p.row), summary, pending };
}

/** File name for the download, dated in UTC so the same day's files sort together. */
export function exportFileName(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `tcgplayer-update-${d}.csv`;
}
