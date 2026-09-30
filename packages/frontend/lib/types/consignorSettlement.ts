/**
 * Consignor payouts ("organizer settles" ledger).
 *
 * Product decision: FindA.Sale never sends or holds consignor money. The organizer pays
 * each consignor themselves (cash, check, Square, bank transfer, other) and records it here.
 * FindA.Sale keeps the numbers and the paper trail.
 *
 * The backend was being built in parallel with this UI, so every shape below is TOLERANT:
 * fields are optional or normalized with fallbacks, and the normalizers accept a few likely
 * spellings of the same value. A small server deviation must never crash the page.
 */

export type PaymentMethod = 'CASH' | 'CHECK' | 'SQUARE' | 'BANK_TRANSFER' | 'OTHER';

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHECK', label: 'Check' },
  { value: 'SQUARE', label: 'Square' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'OTHER', label: 'Other' },
];

export const methodLabel = (m: string | null | undefined): string => {
  if (!m) return '';
  const hit = PAYMENT_METHODS.filter((p) => p.value === String(m).toUpperCase())[0];
  return hit ? hit.label : String(m).replace(/_/g, ' ').toLowerCase();
};

/** Returns a valid PaymentMethod for a stored preference, or null when there is none. */
export const asPaymentMethod = (m: unknown): PaymentMethod | null => {
  if (typeof m !== 'string') return null;
  const up = m.toUpperCase();
  const hit = PAYMENT_METHODS.filter((p) => p.value === up)[0];
  return hit ? hit.value : null;
};

/** Batch run statuses. Anything not listed here is treated as a legacy run. */
export const OPEN_BATCH_STATUSES = ['DRAFT', 'APPROVED', 'PARTIALLY_PAID'];
export const LIVE_BATCH_STATUSES = ['APPROVED', 'PARTIALLY_PAID', 'PAID'];
export const KNOWN_BATCH_STATUSES = ['DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

export const batchStatusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'APPROVED':
      return 'Statements ready';
    case 'PARTIALLY_PAID':
      return 'Partly paid';
    case 'PAID':
      return 'All paid';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return 'Legacy';
  }
};

export const isLegacyBatchStatus = (status: string | null | undefined): boolean =>
  KNOWN_BATCH_STATUSES.indexOf(String(status)) === -1;

export const payoutStatusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case 'PENDING':
    case undefined:
    case null:
    case '':
      return 'Owed';
    case 'ON_HOLD':
      return 'On hold';
    case 'PAID':
      return 'Paid';
    case 'VOID':
      return 'Cancelled';
    case 'SIMULATED':
      return 'Test only. No money was sent.';
    default:
      return 'Legacy';
  }
};

// ---------------------------------------------------------------------------
// Small tolerant helpers
// ---------------------------------------------------------------------------

export const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

const toNumOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
};

const toStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '' ? null : s;
};

const firstDefined = (...vals: unknown[]): any => {
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] !== undefined && vals[i] !== null) return vals[i];
  }
  return undefined;
};

const hasAnyKey = (obj: any, keys: string[]): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(obj, keys[i])) return true;
  }
  return false;
};

export const fmtMoney = (v: unknown): string => {
  const n = toNum(v);
  return (
    '$' +
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Today as yyyy-mm-dd in the browser's local time zone (for <input type="date">). */
export const todayInputValue = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
};

/** yyyy-mm-dd (local) to an ISO timestamp. Today keeps the current time, other days use local noon. */
export const inputDateToIso = (value: string): string => {
  if (value === todayInputValue()) return new Date().toISOString();
  const parts = value.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  return d.toISOString();
};

export const errMsg = (e: any, fallback: string): string => {
  const d = e && e.response && e.response.data;
  if (d && typeof d.error === 'string' && d.error) return d.error;
  if (d && typeof d.message === 'string' && d.message) return d.message;
  if (e && typeof e.message === 'string' && e.message && !/status code/i.test(e.message)) {
    return e.message;
  }
  return fallback;
};

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Count from either an array (length) or a number. */
export const countOf = (v: unknown): number => {
  if (Array.isArray(v)) return v.length;
  return toNum(v);
};

// ---------------------------------------------------------------------------
// Normalized shapes
// ---------------------------------------------------------------------------

export interface ItemLine {
  id: string;
  title: string;
  saleTitle: string | null;
  soldAt: string | null;
  salePrice: number;
  /** The consignor's share of this item, when the server sends it. */
  net: number | null;
  /** Consignor's rate on this item (percent), when the server sends it. */
  ratePct: number | null;
  /** True when this line sold for a different amount than the tag price (needs acknowledging to approve). */
  varianceFlag?: boolean;
}

export interface UnsettledLine {
  consignorId: string;
  name: string;
  email: string | null;
  emailKnown: boolean;
  preferredPayoutMethod: PaymentMethod | null;
  commissionRate: number | null;
  tiered: boolean;
  itemCount: number;
  gross: number;
  net: number;
  items: ItemLine[];
}

export interface RunSummary {
  /** Batch id. Empty when the server row is a lone payout that is not in a run. */
  id: string;
  payoutId: string | null;
  status: string;
  createdAt: string | null;
  totalNet: number;
  payoutCount: number;
}

export interface SettlementPreview {
  mode: string | null;
  saleTitle: string | null;
  unsettled: UnsettledLine[];
  priorRuns: RunSummary[];
  /** Id of a run that is still open for this scope, when the server says so. */
  openBatchId: string | null;
  /** In consignor mode: this consignor already has an unpaid payout sitting in a run. */
  hasOpenPayout: boolean;
}

export interface BatchPayout {
  id: string;
  /** Match payouts to consignors by this id, never by name. */
  consignorId: string;
  status: string;
  simulated: boolean;
  /** Made before the ledger existed. Shown for the record, no actions. */
  legacy: boolean;
  netPayout: number;
  gross: number;
  commissionAmount: number;
  commissionRate: number | null;
  tiered: boolean;
  method: string | null;
  paidAt: string | null;
  reference: string | null;
  note: string | null;
  statementSentAt: string | null;
  name: string | null;
  email: string | null;
  emailKnown: boolean;
  preferredPayoutMethod: PaymentMethod | null;
  items: ItemLine[];
}

export interface Batch {
  id: string;
  status: string;
  /** Legacy runs (made before the ledger, including Stripe test runs) are read only. */
  legacy: boolean;
  saleId: string | null;
  saleTitle: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  totalGross: number;
  totalNet: number;
  payouts: BatchPayout[];
}

/** One display row on the payouts page. payoutId is null before a run exists. */
export interface PayoutRow {
  key: string;
  payoutId: string | null;
  consignorId: string;
  name: string;
  email: string | null;
  emailKnown: boolean;
  preferredPayoutMethod: PaymentMethod | null;
  itemCount: number;
  gross: number;
  rate: number | null;
  tiered: boolean;
  net: number;
  status: string;
  simulated: boolean;
  legacy: boolean;
  method: string | null;
  paidAt: string | null;
  reference: string | null;
  statementSentAt: string | null;
  items: ItemLine[];
}

export const normalizeItem = (raw: any): ItemLine => {
  const r = raw || {};
  return {
    id: String(firstDefined(r.id, r.itemId, r.item && r.item.id, Math.random().toString(36).slice(2))),
    title: String(firstDefined(r.title, r.itemTitle, r.item && r.item.title, r.name, 'Item')),
    saleTitle: toStr(firstDefined(r.saleTitle, r.sale && r.sale.title)),
    soldAt: toStr(firstDefined(r.soldAt, r.soldDate, r.purchasedAt, r.date)),
    // collectedAmount (what the buyer actually paid) wins over the list price when both are sent.
    salePrice: toNum(firstDefined(r.salePrice, r.soldPrice, r.collectedAmount, r.listPrice, r.price, r.amount, r.gross)),
    net: toNumOrNull(firstDefined(r.net, r.netAmount, r.consignorShare, r.owed, r.netPayout)),
    ratePct: toNumOrNull(r.ratePct),
    varianceFlag: r.varianceFlag === true,
  };
};

/** One rate when every line shares it, otherwise "tiered" (rates vary by item). */
const deriveRate = (items: ItemLine[]): { rate: number | null; tiered: boolean } => {
  const seen: number[] = [];
  items.forEach((i) => {
    if (i.ratePct !== null && seen.indexOf(i.ratePct) === -1) seen.push(i.ratePct);
  });
  if (seen.length === 1) return { rate: seen[0], tiered: false };
  if (seen.length > 1) return { rate: null, tiered: true };
  return { rate: null, tiered: false };
};

const itemsOf = (r: any): ItemLine[] =>
  arr(firstDefined(r.items, r.lines, r.itemLines)).map(normalizeItem);

export const normalizeUnsettledLine = (raw: any): UnsettledLine => {
  const r = raw || {};
  const c = r.consignor || {};
  const items = itemsOf(r);
  const gross = toNum(firstDefined(r.gross, r.totalSales, r.grossSales, r.sales));
  const derived = deriveRate(items);
  const rate = toNumOrNull(firstDefined(r.commissionRate, c.commissionRate, r.rate, derived.rate));
  const emailRaw = firstDefined(r.email, c.email);
  return {
    consignorId: String(firstDefined(r.consignorId, c.id, r.id, '')),
    name: String(firstDefined(r.name, r.consignorName, c.name, 'Consignor')),
    email: toStr(emailRaw),
    emailKnown: hasAnyKey(r, ['email', 'hasEmail']) || hasAnyKey(c, ['email']),
    preferredPayoutMethod: asPaymentMethod(firstDefined(r.preferredPayoutMethod, c.preferredPayoutMethod)),
    commissionRate: rate,
    tiered: Boolean(firstDefined(r.tiered, r.useTieredCommission, c.useTieredCommission)) || derived.tiered,
    itemCount: toNum(firstDefined(r.itemCount, r.itemsCount)) || items.length,
    gross: gross || items.reduce((s, i) => s + i.salePrice, 0),
    net: toNum(firstDefined(r.net, r.netPayout, r.owed, r.owedAmount, r.amountOwed)),
    items,
  };
};

export const normalizeRun = (raw: any): RunSummary => {
  const r = raw || {};
  return {
    id: String(firstDefined(r.batchId, r.id, '')),
    payoutId: toStr(r.payoutId),
    status: String(firstDefined(r.status, '')),
    createdAt: toStr(firstDefined(r.createdAt, r.created)),
    totalNet: toNum(firstDefined(r.totalNet, r.totalConsignorPayouts, r.totalOwed, r.total)),
    payoutCount: toNum(firstDefined(r.payoutCount, r.consignorCount)) || arr(r.payouts).length,
  };
};

export const normalizePreview = (raw: any): SettlementPreview => {
  const r = raw || {};
  const unsettled = arr(firstDefined(r.unsettled, r.consignors, r.lines)).map(normalizeUnsettledLine);
  const allRuns = arr(firstDefined(r.priorRuns, r.runs, r.batches)).map(normalizeRun);
  const priorRuns = allRuns.filter((x) => !!x.id && !x.payoutId);
  const hasOpenPayout = allRuns.some((x) => !!x.payoutId && (x.status === 'PENDING' || x.status === 'ON_HOLD'));
  const explicitOpen = firstDefined(r.openBatch, r.existingBatch, r.currentBatch, r.openRun);
  let openBatchId: string | null = null;
  if (explicitOpen && explicitOpen.id && OPEN_BATCH_STATUSES.indexOf(String(explicitOpen.status)) !== -1) {
    openBatchId = String(explicitOpen.id);
  } else if (typeof r.openBatchId === 'string') {
    openBatchId = r.openBatchId;
  } else {
    const open = priorRuns.filter((x) => OPEN_BATCH_STATUSES.indexOf(x.status) !== -1);
    if (open.length > 0) {
      open.sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
      openBatchId = open[0].id;
    }
  }
  return {
    mode: toStr(r.mode),
    saleTitle: toStr(firstDefined(r.saleTitle, r.sale && r.sale.title)),
    unsettled,
    priorRuns,
    openBatchId,
    hasOpenPayout,
  };
};

export const normalizePayout = (raw: any): BatchPayout => {
  const r = raw || {};
  const c = r.consignor || {};
  const status = String(firstDefined(r.status, 'PENDING'));
  const emailRaw = firstDefined(r.email, c.email, r.consignorEmail);
  const gross = toNum(firstDefined(r.totalSales, r.gross, r.grossSales));
  const commission = toNum(r.commissionAmount);
  const items = itemsOf(r);
  const derived = deriveRate(items);
  return {
    id: String(firstDefined(r.id, '')),
    consignorId: String(firstDefined(r.consignorId, c.id, '')),
    status,
    // Old Stripe test-mode payouts arrive as SIMULATED (or VOID with rawStatus SIMULATED).
    simulated:
      status === 'SIMULATED' || r.rawStatus === 'SIMULATED' || r.simulated === true || r.isSimulated === true,
    legacy: r.legacy === true,
    netPayout: toNum(firstDefined(r.netPayout, r.net, r.amount)),
    gross,
    commissionAmount: commission,
    commissionRate: toNumOrNull(firstDefined(r.commissionRate, c.commissionRate, derived.rate)),
    tiered: Boolean(firstDefined(r.tiered, r.useTieredCommission, c.useTieredCommission)) || derived.tiered,
    method: toStr(r.method),
    paidAt: toStr(r.paidAt),
    // paidReference is the organizer's own note (check number). `reference` is the statement code.
    reference: toStr(firstDefined(r.paidReference, r.paymentReference)),
    note: toStr(firstDefined(r.note, r.notes)),
    statementSentAt: toStr(firstDefined(r.statementSentAt, r.statementEmailedAt)),
    name: toStr(firstDefined(r.consignorName, c.name, r.name)),
    email: toStr(emailRaw),
    emailKnown: hasAnyKey(r, ['email', 'consignorEmail', 'hasEmail']) || hasAnyKey(c, ['email']),
    preferredPayoutMethod: asPaymentMethod(firstDefined(r.preferredPayoutMethod, c.preferredPayoutMethod)),
    items,
  };
};

export const normalizeBatch = (raw: any): Batch => {
  const src = (raw && raw.batch && raw.batch.id) ? raw.batch : (raw || {});
  const payoutsRaw = arr(firstDefined(src.payouts, raw && raw.payouts));
  const payouts = payoutsRaw.map(normalizePayout);
  return {
    id: String(firstDefined(src.id, '')),
    status: String(firstDefined(src.status, 'DRAFT')),
    legacy: src.legacy === true,
    saleId: toStr(src.saleId),
    saleTitle: toStr(firstDefined(src.saleTitle, src.sale && src.sale.title)),
    createdAt: toStr(src.createdAt),
    approvedAt: toStr(firstDefined(src.approvedAt, src.statementsApprovedAt)),
    totalGross: toNum(firstDefined(src.totalGross, src.gross)),
    totalNet: toNum(firstDefined(src.totalConsignorPayouts, src.totalNet, src.total)),
    payouts,
  };
};

/** Rows for a run that exists. Consignor details are matched to payouts by consignorId. */
export const buildBatchRows = (batch: Batch, lines: UnsettledLine[]): PayoutRow[] => {
  const byId: Record<string, UnsettledLine> = {};
  lines.forEach((l) => {
    if (l.consignorId) byId[l.consignorId] = l;
  });
  return batch.payouts.map((p) => {
    const l = p.consignorId ? byId[p.consignorId] : undefined;
    const email = p.emailKnown ? p.email : l ? l.email : null;
    return {
      key: p.id || 'c-' + p.consignorId,
      payoutId: p.id || null,
      consignorId: p.consignorId,
      name: p.name || (l ? l.name : 'Consignor'),
      email,
      emailKnown: p.emailKnown || (l ? l.emailKnown : false),
      preferredPayoutMethod: p.preferredPayoutMethod || (l ? l.preferredPayoutMethod : null),
      itemCount: p.items.length || (l ? l.itemCount : 0),
      gross: p.gross || p.items.reduce((s, i) => s + i.salePrice, 0),
      rate: p.commissionRate !== null ? p.commissionRate : l ? l.commissionRate : null,
      tiered: p.tiered || (l ? l.tiered : false),
      net: p.netPayout,
      status: p.status,
      simulated: p.simulated,
      legacy: p.legacy,
      method: p.method,
      paidAt: p.paidAt,
      reference: p.reference,
      statementSentAt: p.statementSentAt,
      items: p.items.length ? p.items : l ? l.items : [],
    };
  });
};

/** Rows before any run exists (everything is simply owed). */
export const buildPreviewRows = (lines: UnsettledLine[]): PayoutRow[] =>
  lines.map((l) => ({
    key: 'c-' + l.consignorId,
    payoutId: null,
    consignorId: l.consignorId,
    name: l.name,
    email: l.email,
    emailKnown: l.emailKnown,
    preferredPayoutMethod: l.preferredPayoutMethod,
    itemCount: l.itemCount,
    gross: l.gross,
    rate: l.commissionRate,
    tiered: l.tiered,
    net: l.net,
    status: 'PENDING',
    simulated: false,
    legacy: false,
    method: null,
    paidAt: null,
    reference: null,
    statementSentAt: null,
    items: l.items,
  }));

export interface SaleSummary {
  saleId: string;
  unsettledCount: number;
  unsettledAmount: number;
}

export const normalizeSalesSummary = (raw: any): Record<string, SaleSummary> => {
  const list = Array.isArray(raw) ? raw : arr(firstDefined(raw && raw.sales, raw && raw.summary, raw && raw.items));
  const out: Record<string, SaleSummary> = {};
  list.forEach((r: any) => {
    if (!r || !r.saleId) return;
    out[String(r.saleId)] = {
      saleId: String(r.saleId),
      unsettledCount: toNum(r.unsettledCount),
      unsettledAmount: toNum(r.unsettledAmount),
    };
  });
  return out;
};

// ---------------------------------------------------------------------------
// Statement (JSON from GET /payouts/:id/statement)
// ---------------------------------------------------------------------------

export interface StatementView {
  payoutId: string;
  consignorName: string;
  consignorEmail: string | null;
  businessName: string | null;
  saleTitle: string | null;
  issuedOn: string | null;
  status: string | null;
  items: ItemLine[];
  gross: number;
  commission: number;
  net: number;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
}

export const normalizeStatement = (raw: any, payoutId: string): StatementView => {
  const s = (raw && raw.statement) || raw || {};
  const c = s.consignor || {};
  const o = s.organizer || {};
  const t = s.totals || {};
  const payout = s.payout || {};
  const items = itemsOf(s);
  const gross = toNum(firstDefined(t.gross, s.gross, s.totalSales, payout.totalSales)) ||
    items.reduce((sum, i) => sum + i.salePrice, 0);
  const net = toNum(firstDefined(t.net, s.netPayout, s.net, payout.netPayout));
  const commissionRaw = firstDefined(t.commission, s.commissionAmount, payout.commissionAmount);
  const commission = commissionRaw !== undefined ? toNum(commissionRaw) : Math.max(0, gross - net);
  return {
    payoutId,
    consignorName: String(firstDefined(c.name, s.consignorName, 'Consignor')),
    consignorEmail: toStr(firstDefined(c.email, s.consignorEmail)),
    businessName: toStr(firstDefined(o.businessName, o.name, s.businessName, s.organizerName)),
    saleTitle: toStr(firstDefined(s.saleTitle, s.sale && s.sale.title)),
    issuedOn: toStr(firstDefined(s.issuedOn, s.generatedAt, s.createdAt)),
    status: toStr(firstDefined(s.status, payout.status)),
    items,
    gross,
    commission,
    net,
    paidAt: toStr(firstDefined(s.paidAt, payout.paidAt)),
    method: toStr(firstDefined(s.method, payout.method)),
    reference: toStr(firstDefined(s.reference, payout.reference)),
  };
};
