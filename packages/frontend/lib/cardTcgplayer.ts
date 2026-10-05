/**
 * cardTcgplayer (ADR-137 #660): pure logic and wording behind the TCGplayer sync screen and the counter notice.
 *
 * No React, no axios, no env reads, no network: plain data and functions, covered by lib/__tests__/cardTcgplayer.test.ts
 * (Run: npm test, node:test through tsx). The backend (services/cardTcgplayer, controllers/cardTcgplayerController.ts,
 * routes/cardTcgplayer.ts) is the source of truth for the HTTP contract this file reads:
 *
 *   GET  /api/card-tcgplayer/:saleId/status             { enabled, cardsTracked, listedOnTcgplayer, waitingToSend, exportWaiting, ... }
 *   GET  /api/card-tcgplayer/:saleId/register-check     ?itemIds=a,b  { enabled, items: [{ itemId, onTcgplayer, tcgplayerQty, available }] }
 *   POST /api/card-tcgplayer/:saleId/export             JSON { includeNew, includePrices, quantityColumn }  { fileName, rowCount, csv, summary }
 *   POST /api/card-tcgplayer/:saleId/export/uploaded    { marked }
 *   POST /api/card-tcgplayer/:saleId/reconcile/preview  multipart: file, lastExportUploaded, firstSync
 *   POST /api/card-tcgplayer/:saleId/reconcile/apply    same
 *
 * Every reader answers null when the shape is wrong, so a screen never renders half a response. Copy rules: plain
 * wording for a shop owner, no em dash, no mention of automation, "sale" for a sale.
 */

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

export const TCG_COPY = {
  pageTitle: 'Sync with TCGplayer',
  pageIntro:
    'Keep the quantities here and on TCGplayer in step. You download a file from this page and upload it in your TCGplayer seller account. You export your inventory from TCGplayer and bring it back here. Nothing is sent to TCGplayer for you, and FindA.Sale never asks for your TCGplayer login.',
  backToItems: 'Back to add items',
  loading: 'Loading',
  notEnabled: 'The TCGplayer sync is not turned on for your account yet.',
  loadFailed: 'We could not load this page. Please reload it and try again.',
  networkFailed: 'We could not reach the server. Check your connection and try again.',

  statusHeading: 'Where things stand',
  cardsTrackedLabel: 'Cards that can be matched',
  listedLabel: 'Cards on TCGplayer',
  notListedLabel: 'Cards not on TCGplayer yet',
  waitingLabel: 'Cards waiting to be sent',
  lastSyncedLabel: 'Last matched with TCGplayer',
  neverSynced: 'Not yet',
  skippedNote: 'Cards with no TCGplayer ID, and graded cards, are left out because TCGplayer cannot match them.',

  exportHeading: 'Send changes to TCGplayer',
  exportIntro:
    'The file lists the cards whose quantity here no longer matches what TCGplayer holds, for example cards you sold at the counter. Upload it in your TCGplayer seller account.',
  exportButton: 'Download TCGplayer update file',
  exportWorking: 'Preparing the file',
  exportNothing: 'There are no changes to send to TCGplayer right now.',
  exportFailed: 'The file could not be made. Nothing was changed. Please try again.',
  uploadedButton: 'I uploaded it',
  uploadedWorking: 'Saving',
  uploadedHint: 'Press this after the file is uploaded in TCGplayer, so we know what TCGplayer holds now.',
  uploadedFailed: 'We could not save that. Please try again.',
  optionsHeading: 'More choices',
  includeNewLabel: 'Also add cards that are not on TCGplayer yet',
  includeNewHelp: 'Uploading the file then lists those cards on TCGplayer for sale.',
  includePricesLabel: 'Include my FindA.Sale prices',
  includePricesHelp: 'Leave this off to keep your TCGplayer prices as they are.',
  quantityLabel: 'How quantities are written',
  quantityAdd: 'The change (Add to Quantity)',
  quantityTotal: 'The full count (Total Quantity)',
  quantityHelp: 'If TCGplayer does not accept the change style, switch to the full count and download the file again.',

  waitingHeading: 'Cards waiting to be sent',
  waitingEmpty: 'Nothing is waiting. TCGplayer matches what you have here.',
  waitingMore: 'More cards are waiting than are listed here. The file includes all of them.',
  colCard: 'Card',
  colHere: 'Here',
  colTcgplayer: 'On TCGplayer',
  colToSend: 'To send',

  reconcileHeading: 'Bring TCGplayer sales back here',
  reconcileIntro:
    'Export your inventory from your TCGplayer seller account and choose that file. We show what would change before anything is saved. Cards you sold at the counter since your last file are kept.',
  fileLabel: 'TCGplayer inventory export (CSV)',
  previewButton: 'Check the file',
  previewWorking: 'Checking the file',
  applyButton: 'Update my quantities',
  applyWorking: 'Updating',
  startOver: 'Choose a different file',
  uploadedQuestion: 'Did you upload the last update file to TCGplayer?',
  uploadedYes: 'Yes, I uploaded it',
  uploadedNo: 'No, I did not',
  uploadedQuestionHelp: 'We ask so the same sales are not counted twice.',
  firstSyncQuestion: 'For cards we have not matched with TCGplayer before',
  firstSyncKeep: 'Keep my quantity here and send the difference later',
  firstSyncAdopt: 'Use the quantity from TCGplayer',

  reportPreviewHeading: 'What would change',
  reportAppliedHeading: 'What changed',
  reportNothing: 'Nothing needs to change. Your quantities already match this file.',
  reportProblemsHeading: 'Rows we could not read',
  reportProblemsMore: 'More rows could not be read than are listed here.',
  reportNotHereHeading: 'On TCGplayer but not in this sale',
  reportNotHereHelp: 'Add these cards with the regular card import, then run this again.',
  reportMissingHeading: 'Here but not in your file',
  reportMissingHelp: 'We think TCGplayer holds these cards, but your file has no row for them. Nothing was changed.',
  reportDuplicatesHeading: 'Repeated rows',
  reportDuplicatesHelp: 'The same card, condition and foil appears more than once in your file, so those cards were skipped.',
  reportCardsHeading: 'Cards that change',
  reportMoreCards: 'More cards change than are listed here.',
  colFile: 'In file',
  colAfter: 'Here after',

  shippingHeading: 'Shipping on eBay',
  shippingNote: 'eBay orders between $20 and $30 will be tracked. A raw card priced under $20 can still ship in a plain envelope.',

  counterOne: 'This card is also listed on TCGplayer. Update TCGplayer after the sale.',
  counterMany: 'Some of these cards are also listed on TCGplayer. Update TCGplayer after the sale.',
  soldOne: 'You sold a card that is also listed on TCGplayer. Update TCGplayer so nobody buys it there.',
  soldMany: 'You sold cards that are also listed on TCGplayer. Update TCGplayer so nobody buys them there.',
  counterDownload: 'Download TCGplayer update file',
  counterOpenPage: 'Open TCGplayer sync',
  counterDownloaded: 'File downloaded. Upload it in your TCGplayer seller account, then press "I uploaded it" on the sync page.',
  counterNothingToSend: 'There is nothing to send to TCGplayer right now.',
  counterFailed: 'The file could not be made. Open the TCGplayer sync page to try again.',
} as const;

/** Wording for the error codes the backend can send (controllers/cardTcgplayerController.ts and the intake middleware it reuses). */
export const TCG_ERROR_WORDING: Record<string, string> = {
  FEATURE_DISABLED: 'The TCGplayer sync is not turned on for your account yet.',
  UNAUTHORIZED: 'Sign in as an organizer to use this page.',
  FORBIDDEN: 'Sign in as an organizer to use this page.',
  SALE_NOT_FOUND: 'We could not find that sale.',
  NOT_YOUR_SALE: 'That sale belongs to another account.',
  NO_FILE: 'Choose the CSV file you exported from your TCGplayer seller account.',
  FILE_TOO_LARGE: 'That file is too large. Export a smaller inventory and try again.',
  UNSUPPORTED_FILE_TYPE: 'Only CSV, TSV or TXT files can be used. Export your inventory as CSV and try again.',
  UPLOAD_FAILED: 'The file could not be uploaded. Please try again.',
  NOT_A_CSV_FILE: 'This does not look like a CSV file. Export your inventory as CSV and try again.',
  PARSE_ERROR: 'The file could not be read. Check that it is a normal CSV export and try again.',
  EMPTY_FILE: 'This file has no rows.',
  TOO_MANY_ROWS: 'This file has too many rows. Export a smaller inventory and try again.',
  NOT_A_TCGPLAYER_FILE: 'This does not look like a TCGplayer seller inventory export. It needs the columns TCGplayer Id, Condition and Total Quantity.',
  BAD_PARAMS: 'Some choices are not valid. Reload the page and try again.',
  UPLOAD_ANSWER_REQUIRED: 'Tell us whether you uploaded the last update file to TCGplayer.',
  NO_PENDING_EXPORT: 'There is no update file waiting. Download a new one first.',
  ALREADY_RUNNING: 'An update for this sale is already running. Wait for it to finish and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a while and try again.',
  SERVER_ERROR: 'Something went wrong. Nothing was lost and you can try again.',
};

export const TCG_FALLBACK_ERROR = 'Something went wrong. Please try again.';

/** The sentence to show for a failed request: our wording for the code first, then the server text, then the generic line. */
export function wordingForTcgError(code: unknown, serverText?: unknown): string {
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(TCG_ERROR_WORDING, code)) return TCG_ERROR_WORDING[code];
  if (typeof serverText === 'string' && serverText.trim() !== '') return serverText.trim();
  return TCG_FALLBACK_ERROR;
}

/** The sentence for a failed axios call: our wording for the response code, the server text, or a network or generic line. */
export function tcgErrorSentence(err: unknown): string {
  const e = err as { response?: { status?: unknown; data?: unknown } } | null;
  if (!e || !e.response) return TCG_COPY.networkFailed;
  const data = e.response.data;
  const body = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const status = typeof e.response.status === 'number' ? e.response.status : 0;
  let code: unknown = body ? body.code : undefined;
  if (typeof code !== 'string') code = status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'SERVER_ERROR' : undefined;
  return wordingForTcgError(code, body ? body.error : undefined);
}

/** Every user-facing string, flattened, for the copy lint test. */
export function allTcgCopy(): string[] {
  return [...Object.values(TCG_COPY), ...Object.values(TCG_ERROR_WORDING), TCG_FALLBACK_ERROR];
}

// ---------------------------------------------------------------------------
// Response shapes and readers
// ---------------------------------------------------------------------------

export interface CardLineDto {
  key: string;
  productId: number;
  cardName: string | null;
  setName: string | null;
  collectorNumber: string | null;
  condition: string;
  available: number;
  onTcgplayer: number;
  toSend: number;
}

export interface TcgStatus {
  enabled: true;
  cardsTracked: number;
  listedOnTcgplayer: number;
  notOnTcgplayer: number;
  waitingToSendCount: number;
  waitingToSend: CardLineDto[];
  exportWaiting: boolean;
  exportWaitingCards: number;
  lastSyncedAt: string | null;
  skipped: { noTcgplayerId: number; graded: number; notACard: number };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readCardLine(raw: unknown): CardLineDto | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key);
  const productId = num(raw.productId);
  const available = num(raw.available);
  const onTcgplayer = num(raw.onTcgplayer);
  const toSend = num(raw.toSend);
  if (key === null || productId === null || available === null || onTcgplayer === null || toSend === null) return null;
  return {
    key,
    productId,
    cardName: str(raw.cardName),
    setName: str(raw.setName),
    collectorNumber: str(raw.collectorNumber),
    condition: str(raw.condition) ?? '',
    available,
    onTcgplayer,
    toSend,
  };
}

/** Result of reading a status response: null when the shape is wrong, { enabled: false } when the feature is off. */
export function readStatus(body: unknown): TcgStatus | { enabled: false } | null {
  if (!isObj(body) || !isObj(body.data)) return null;
  const d = body.data;
  if (d.enabled === false) return { enabled: false };
  if (d.enabled !== true) return null;
  const cardsTracked = num(d.cardsTracked);
  const listed = num(d.listedOnTcgplayer);
  const notOn = num(d.notOnTcgplayer);
  const waitingCount = num(d.waitingToSendCount);
  if (cardsTracked === null || listed === null || notOn === null || waitingCount === null) return null;
  if (!Array.isArray(d.waitingToSend)) return null;
  const waiting: CardLineDto[] = [];
  for (const row of d.waitingToSend) {
    const line = readCardLine(row);
    if (!line) return null;
    waiting.push(line);
  }
  const skipped = isObj(d.skipped) ? d.skipped : {};
  return {
    enabled: true,
    cardsTracked,
    listedOnTcgplayer: listed,
    notOnTcgplayer: notOn,
    waitingToSendCount: waitingCount,
    waitingToSend: waiting,
    exportWaiting: d.exportWaiting === true,
    exportWaitingCards: num(d.exportWaitingCards) ?? 0,
    lastSyncedAt: str(d.lastSyncedAt),
    skipped: { noTcgplayerId: num(skipped.noTcgplayerId) ?? 0, graded: num(skipped.graded) ?? 0, notACard: num(skipped.notACard) ?? 0 },
  };
}

export interface RegisterCheckItem {
  itemId: string;
  onTcgplayer: boolean;
  tcgplayerQty: number;
  available: number;
}

export function readRegisterCheck(body: unknown): { enabled: boolean; items: RegisterCheckItem[] } | null {
  if (!isObj(body) || !isObj(body.data)) return null;
  const d = body.data;
  if (d.enabled === false) return { enabled: false, items: [] };
  if (d.enabled !== true || !Array.isArray(d.items)) return null;
  const items: RegisterCheckItem[] = [];
  for (const raw of d.items) {
    if (!isObj(raw)) return null;
    const itemId = str(raw.itemId);
    if (itemId === null || typeof raw.onTcgplayer !== 'boolean') return null;
    items.push({ itemId, onTcgplayer: raw.onTcgplayer, tcgplayerQty: num(raw.tcgplayerQty) ?? 0, available: num(raw.available) ?? 0 });
  }
  return { enabled: true, items };
}

export interface ExportResultDto {
  fileName: string;
  rowCount: number;
  /** null when there is nothing to send. */
  csv: string | null;
  summary: { rows: number; newListings: number; unchanged: number; notOnTcgplayer: number };
}

export function readExport(body: unknown): ExportResultDto | null {
  if (!isObj(body) || !isObj(body.data)) return null;
  const d = body.data;
  const fileName = str(d.fileName);
  const rowCount = num(d.rowCount);
  if (fileName === null || rowCount === null) return null;
  const csv = d.csv === null ? null : str(d.csv);
  if (d.csv !== null && csv === null) return null;
  const s = isObj(d.summary) ? d.summary : {};
  return {
    fileName,
    rowCount,
    csv,
    summary: { rows: num(s.rows) ?? 0, newListings: num(s.newListings) ?? 0, unchanged: num(s.unchanged) ?? 0, notOnTcgplayer: num(s.notOnTcgplayer) ?? 0 },
  };
}

export type OutcomeKind = 'IN_SYNC' | 'DECREASE' | 'INCREASE' | 'NEEDS_NEW_ITEM';

export interface ChangeLineDto extends CardLineDto {
  kind: OutcomeKind;
  fileTotal: number;
  availableAfter: number;
  change: number;
  shortfall: number;
  firstSync: boolean;
  note: string | null;
}

export interface ReportTotals {
  inSync: number;
  decreased: number;
  increased: number;
  needsNewItem: number;
  unitsRemoved: number;
  unitsAdded: number;
  shortfallCards: number;
  shortfallUnits: number;
  firstSyncCards: number;
  stillToSendCards: number;
  notInFindasale: number;
  listedButMissing: number;
  duplicateKeys: number;
}

export interface ReconcileReportDto {
  rowsInFile: number;
  problemCount: number;
  problems: Array<{ row: number; message: string }>;
  totals: ReportTotals;
  changes: ChangeLineDto[];
  notInFindasale: Array<{ row: number; productId: number; condition: string; total: number }>;
  listedButMissing: CardLineDto[];
  duplicateKeys: Array<{ key: string; rows: number[] }>;
  applied: boolean;
  exportWaiting: boolean;
}

const TOTAL_KEYS: Array<keyof ReportTotals> = [
  'inSync', 'decreased', 'increased', 'needsNewItem', 'unitsRemoved', 'unitsAdded', 'shortfallCards', 'shortfallUnits',
  'firstSyncCards', 'stillToSendCards', 'notInFindasale', 'listedButMissing', 'duplicateKeys',
];
const KINDS: OutcomeKind[] = ['IN_SYNC', 'DECREASE', 'INCREASE', 'NEEDS_NEW_ITEM'];

export function readReconcileReport(body: unknown): ReconcileReportDto | null {
  if (!isObj(body) || !isObj(body.data)) return null;
  const d = body.data;
  const rowsInFile = num(d.rowsInFile);
  const problemCount = num(d.problemCount);
  if (rowsInFile === null || problemCount === null || !isObj(d.totals)) return null;
  const totals = {} as ReportTotals;
  for (const k of TOTAL_KEYS) {
    const v = num(d.totals[k]);
    if (v === null) return null;
    totals[k] = v;
  }
  if (!Array.isArray(d.changes) || !Array.isArray(d.problems) || !Array.isArray(d.notInFindasale) || !Array.isArray(d.listedButMissing) || !Array.isArray(d.duplicateKeys)) return null;

  const changes: ChangeLineDto[] = [];
  for (const raw of d.changes) {
    const base = readCardLine(raw);
    if (!base || !isObj(raw)) return null;
    const kind = KINDS.find((k) => k === raw.kind);
    const fileTotal = num(raw.fileTotal);
    const availableAfter = num(raw.availableAfter);
    const change = num(raw.change);
    const shortfall = num(raw.shortfall);
    if (!kind || fileTotal === null || availableAfter === null || change === null || shortfall === null) return null;
    changes.push({ ...base, kind, fileTotal, availableAfter, change, shortfall, firstSync: raw.firstSync === true, note: str(raw.note) });
  }
  const problems: Array<{ row: number; message: string }> = [];
  for (const raw of d.problems) {
    if (!isObj(raw)) return null;
    const row = num(raw.row);
    const message = str(raw.message);
    if (row === null || message === null) return null;
    problems.push({ row, message });
  }
  const notIn: ReconcileReportDto['notInFindasale'] = [];
  for (const raw of d.notInFindasale) {
    if (!isObj(raw)) return null;
    const row = num(raw.row);
    const productId = num(raw.productId);
    const total = num(raw.total);
    if (row === null || productId === null || total === null) return null;
    notIn.push({ row, productId, condition: str(raw.condition) ?? '', total });
  }
  const missing: CardLineDto[] = [];
  for (const raw of d.listedButMissing) {
    const line = readCardLine(raw);
    if (!line) return null;
    missing.push(line);
  }
  const dups: ReconcileReportDto['duplicateKeys'] = [];
  for (const raw of d.duplicateKeys) {
    if (!isObj(raw) || !Array.isArray(raw.rows)) return null;
    const key = str(raw.key);
    if (key === null) return null;
    dups.push({ key, rows: raw.rows.filter((r): r is number => typeof r === 'number') });
  }
  return {
    rowsInFile,
    problemCount,
    problems,
    totals,
    changes,
    notInFindasale: notIn,
    listedButMissing: missing,
    duplicateKeys: dups,
    applied: d.applied === true,
    exportWaiting: d.exportWaiting === true,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "Lightning Bolt, Alpha #161, Near Mint" with every missing part left out. */
export function cardLabel(line: { cardName: string | null; setName: string | null; collectorNumber: string | null; condition: string; productId?: number }): string {
  const name = (line.cardName ?? '').trim() || (line.productId !== undefined ? 'TCGplayer ID ' + line.productId : 'Card');
  const set = [(line.setName ?? '').trim(), (line.collectorNumber ?? '').trim() ? '#' + (line.collectorNumber ?? '').trim() : ''].filter(Boolean).join(' ');
  return [name, set, line.condition].filter((p) => p !== '').join(', ');
}

/** A signed number for the To send column: "+2", "-1", "0". */
export function signed(n: number): string {
  if (n > 0) return '+' + n;
  return String(n);
}

/** Plain sentences that summarise a reconcile report, in the order a shop owner cares about. */
export function reportSentences(report: ReconcileReportDto): string[] {
  const t = report.totals;
  const done = report.applied;
  const out: string[] = [];
  if (t.decreased > 0) {
    out.push(
      (done ? 'Removed ' : 'Would remove ') +
        t.unitsRemoved + ' ' + plural(t.unitsRemoved, 'unit', 'units') + ' across ' + t.decreased + ' ' + plural(t.decreased, 'card', 'cards') + ' that sold on TCGplayer.'
    );
  }
  if (t.increased > 0) {
    out.push(
      (done ? 'Added ' : 'Would add ') +
        t.unitsAdded + ' ' + plural(t.unitsAdded, 'unit', 'units') + ' across ' + t.increased + ' ' + plural(t.increased, 'card', 'cards') + ' that TCGplayer shows more of.'
    );
  }
  if (t.shortfallCards > 0) {
    out.push(
      t.shortfallUnits + ' ' + plural(t.shortfallUnits, 'unit', 'units') + ' sold on TCGplayer ' + plural(t.shortfallUnits, 'was', 'were') +
        ' not in stock here. Check that none of ' + plural(t.shortfallUnits, 'it', 'them') + ' also sold at the counter.'
    );
  }
  if (t.needsNewItem > 0) {
    out.push(t.needsNewItem + ' ' + plural(t.needsNewItem, 'card needs', 'cards need') + ' to be added with the regular card import.');
  }
  if (t.firstSyncCards > 0) {
    out.push(t.firstSyncCards + ' ' + plural(t.firstSyncCards, 'card was', 'cards were') + ' matched with TCGplayer for the first time.');
  }
  if (t.stillToSendCards > 0) {
    out.push(t.stillToSendCards + ' ' + plural(t.stillToSendCards, 'card still differs', 'cards still differ') + ' from TCGplayer. The next update file will send the difference.');
  }
  return out;
}

export function reportHasChanges(report: ReconcileReportDto): boolean {
  const t = report.totals;
  return t.decreased > 0 || t.increased > 0 || t.needsNewItem > 0 || t.firstSyncCards > 0 || t.stillToSendCards > 0 || t.shortfallCards > 0;
}

/** A readable date for the status line, or the "not yet" word. */
export function formatSyncedAt(iso: string | null): string {
  if (!iso) return TCG_COPY.neverSynced;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return TCG_COPY.neverSynced;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Counter notice
// ---------------------------------------------------------------------------

/** Item ids with a card to ask about: unique, non-empty, in order. */
export function registerIds(ids: ReadonlyArray<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Stable cache key for a set of ids (order does not matter). */
export function registerKey(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

export function listedCount(items: readonly RegisterCheckItem[]): number {
  return items.filter((i) => i.onTcgplayer).length;
}

/** The counter sentence, or null when none of the items is listed on TCGplayer. */
export function counterMessage(listed: number, sold: boolean): string | null {
  if (listed <= 0) return null;
  if (sold) return listed === 1 ? TCG_COPY.soldOne : TCG_COPY.soldMany;
  return listed === 1 ? TCG_COPY.counterOne : TCG_COPY.counterMany;
}

const DISABLED_MEMORY_MS = 5 * 60 * 1000;
const disabledUntil = new Map<string, number>();

/** The feature answered "off" for this sale: stop asking for a few minutes. */
export function rememberDisabled(saleId: string, now: number = Date.now()): void {
  disabledUntil.set(saleId, now + DISABLED_MEMORY_MS);
}

export function isKnownDisabled(saleId: string, now: number = Date.now()): boolean {
  const until = disabledUntil.get(saleId);
  if (until === undefined) return false;
  if (now >= until) {
    disabledUntil.delete(saleId);
    return false;
  }
  return true;
}

export function forgetDisabled(): void {
  disabledUntil.clear();
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ExportChoices {
  includeNew: boolean;
  includePrices: boolean;
  quantityColumn: 'ADD' | 'TOTAL';
}

export const DEFAULT_EXPORT_CHOICES: ExportChoices = { includeNew: false, includePrices: false, quantityColumn: 'ADD' };

export type FirstSyncChoice = 'FLAG_ONLY' | 'ADOPT_TCGPLAYER';

/** Text fields for the reconcile request. lastExportUploaded is sent only when a file is waiting and the seller answered. */
export function reconcileFields(args: { exportWaiting: boolean; uploaded: boolean | null; firstSync: FirstSyncChoice }): Array<[string, string]> {
  const fields: Array<[string, string]> = [['firstSync', args.firstSync]];
  if (args.exportWaiting && args.uploaded !== null) fields.push(['lastExportUploaded', args.uploaded ? 'true' : 'false']);
  return fields;
}

/** True when the seller still has to answer "did you upload the last file". */
export function needsUploadedAnswer(exportWaiting: boolean, uploaded: boolean | null): boolean {
  return exportWaiting && uploaded === null;
}

export function reconcileUrl(saleId: string, step: 'preview' | 'apply'): string {
  return '/card-tcgplayer/' + encodeURIComponent(saleId) + '/reconcile/' + step;
}

export function syncPagePath(saleId: string): string {
  return '/organizer/card-tcgplayer/' + encodeURIComponent(saleId);
}

/** Saves text as a file in the browser. Browser only; returns false when there is no document. */
export function saveTextFile(fileName: string, text: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
