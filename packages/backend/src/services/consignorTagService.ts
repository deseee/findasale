/**
 * consignorTagService (2026-10-06): consignor price tags for the POS.
 *
 * A "price-only" label printed from the label composer can carry a consignor. Its QR holds the sale id (in the path),
 * the price, the consignor id, a per-label nonce and a signature. Scanning it at the register credits that consignor.
 *
 * Money model (architect decision, approved): the SERVER mints a real photo-less SOLD Item at the moment the sale is
 * recorded, attached to the consignor, so the existing ledger, commission, payout and refund logic works unchanged.
 * Minting happens inside the same database transaction that writes the Purchase row, never at scan time (an abandoned
 * cart would otherwise leave items behind). A test transaction validates the line but never mints.
 *
 * Nothing in the QR is trusted. Every request re-validates: feature flag, TEAMS tier, sale ownership, signature,
 * consignor workspace membership and price bounds. Tags are EXEMPT from the consignment minimum price floor
 * (Patrick's decision): the floor lives in itemController's intake and is deliberately not applied here.
 *
 * Minted item shape (listingType is only a marker string, there is no Item DDL):
 *   status SOLD, isActive false, draftStatus PUBLISHED (never DRAFT: cleanupStaleDrafts deletes stale DRAFT items),
 *   stockTotal 1 / stockSold 1, excludeFromMarkdown true, listingType CONSIGNOR_TAG, vendorBoothId never set
 *   (an item must not carry both a consignor and a vendor booth).
 */
import crypto from 'crypto';

export const TAG_LISTING_TYPE = 'CONSIGNOR_TAG';
export const TAG_SIGNATURE_VERSION = 'v1';
export const MIN_TAG_PRICE_CENTS = 1;
export const MAX_TAG_PRICE_CENTS = 10_000_000;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type ConsignorTagErrorCode =
  | 'CONSIGNOR_TAGS_DISABLED'
  | 'TAG_SIGNING_NOT_CONFIGURED'
  | 'TEAMS_REQUIRED'
  | 'TAG_INVALID'
  | 'TAG_SIGNATURE_INVALID'
  | 'SALE_NOT_OWNED'
  | 'CONSIGNOR_NOT_FOUND'
  | 'CONSIGNOR_ARCHIVED'
  | 'TAG_DUPLICATE'
  | 'TAG_SKU_CONFLICT'
  | 'TAG_SELLER_NO_BOOTH'
  | 'TAG_LINES_CORRUPT';

export class ConsignorTagError extends Error {
  status: number;
  code: ConsignorTagErrorCode;
  constructor(message: string, status: number, code: ConsignorTagErrorCode) {
    super(message);
    this.name = 'ConsignorTagError';
    this.status = status;
    this.code = code;
  }
}

export function isConsignorTagError(err: unknown): err is ConsignorTagError {
  return err instanceof ConsignorTagError;
}

/** JSON body for a ConsignorTagError, so every route answers in the same shape. */
export function consignorTagErrorBody(err: ConsignorTagError): { message: string; code: ConsignorTagErrorCode } {
  return { message: err.message, code: err.code };
}

// ---------------------------------------------------------------------------
// Feature flag and signing secret
// ---------------------------------------------------------------------------

export type EnvLike = Record<string, string | undefined>;

/** POS_CONSIGNOR_TAGS_ENABLED defaults to OFF when unset. Read at call time, never at import. */
export function isConsignorTagsEnabled(env: EnvLike = process.env): boolean {
  const raw = (env.POS_CONSIGNOR_TAGS_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

// Outside production only: a random per-process secret, so a local run or a unit test without the env var can still
// sign and verify within one process. It is never written anywhere and never reused across processes.
let ephemeralNonProdSecret: string | null = null;

function getSigningSecret(env: EnvLike = process.env): string | null {
  const configured = (env.POS_TAG_SIGNING_SECRET ?? '').trim();
  if (configured) return configured;
  // Fail closed in production: no secret means no tag can be signed or verified.
  if (env.NODE_ENV === 'production') return null;
  if (!ephemeralNonProdSecret) ephemeralNonProdSecret = crypto.randomBytes(32).toString('hex');
  return ephemeralNonProdSecret;
}

export function isTagSigningConfigured(env: EnvLike = process.env): boolean {
  return getSigningSecret(env) !== null;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface TagSigningFields {
  saleId: string;
  consignorId: string;
  priceCents: number;
  nonce: string;
}

function computeSignature(fields: TagSigningFields, secret: string): string {
  const message = [TAG_SIGNATURE_VERSION, fields.saleId, fields.consignorId, String(fields.priceCents), fields.nonce].join('|');
  return crypto.createHmac('sha256', secret).update(message).digest().subarray(0, 12).toString('base64url');
}

/** HMAC-SHA256 over `v1|saleId|consignorId|priceCents|nonce`, truncated to 12 bytes, base64url. Throws when no secret is set in production. */
export function signTag(fields: TagSigningFields, env: EnvLike = process.env): string {
  const secret = getSigningSecret(env);
  if (!secret) {
    throw new ConsignorTagError('Consignor price tags are not set up on the server yet.', 503, 'TAG_SIGNING_NOT_CONFIGURED');
  }
  return computeSignature(fields, secret);
}

/** Constant-time check. The length is compared first because timingSafeEqual throws on unequal lengths. Fails closed with no secret. */
export function verifyTag(fields: TagSigningFields & { sig: unknown }, env: EnvLike = process.env): boolean {
  const secret = getSigningSecret(env);
  if (!secret) return false;
  if (typeof fields.sig !== 'string' || fields.sig.length === 0) return false;
  const expected = Buffer.from(computeSignature(fields, secret));
  const given = Buffer.from(fields.sig);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

/** The URL a signed tag's QR encodes. All parts are URL-safe characters, so nothing needs escaping. */
export function buildConsignorTagQrUrl(opts: { frontendUrl: string; saleId: string; consignorId: string; priceCents: number; nonce: string; sig: string }): string {
  const price = (opts.priceCents / 100).toFixed(2);
  return `${opts.frontendUrl}/pos/${opts.saleId}?action=add-misc&price=${price}&c=${opts.consignorId}&n=${opts.nonce}&s=${opts.sig}`;
}

// ---------------------------------------------------------------------------
// Validation of tag lines on a sale request
// ---------------------------------------------------------------------------

export interface TagLineInput {
  consignorId?: unknown;
  nonce?: unknown;
  sig?: unknown;
  priceCents?: unknown;
}

export interface ResolvedTagLine {
  consignorId: string;
  consignorName: string;
  nonce: string;
  sig: string;
  priceCents: number;
  workspaceId: string;
}

/** What is stored on POSPaymentRequest.consignorLines, POSPaymentLink.consignorLines and BoothCartTransaction.consignorLines. */
export interface StoredTagLine {
  consignorId: string;
  nonce: string;
  sig: string;
  priceCents: number;
  /** Venue (hub cart) only: the booth whose leg carries this line. It is the booth of the organizer who printed the tag (the hub's house booth when that organizer is the hub owner). */
  vendorBoothId?: string | null;
  /** Venue (hub cart) only: the organizer that owns the tag's sale and consignor. Lines stored before this field existed belonged to the hub owner. */
  organizerId?: string | null;
  /** Venue (hub cart) only: the sale the tag was printed for. A hub cart has no sale of its own, so the line carries it. */
  saleId?: string | null;
}

export function tagLinesTotalCents(lines: Array<{ priceCents: number }>): number {
  return lines.reduce((sum, l) => sum + l.priceCents, 0);
}

export function formatTagTitle(priceCents: number): string {
  return `Consigned tag $${(priceCents / 100).toFixed(2)}`;
}

/** Turn a client line shape ({priceCents} or {amountCents}) into a TagLineInput. */
export function toTagLineInput(raw: unknown): TagLineInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { consignorId: r.consignorId, nonce: r.nonce, sig: r.sig, priceCents: r.priceCents ?? r.amountCents };
}

export function toStoredTagLines(lines: ResolvedTagLine[]): StoredTagLine[] {
  return lines.map((l) => ({ consignorId: l.consignorId, nonce: l.nonce, sig: l.sig, priceCents: l.priceCents }));
}

/** Read a stored Json column back into lines. A damaged value throws: a money line must never be dropped silently. */
export function parseStoredTagLines(raw: unknown): StoredTagLine[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ConsignorTagError('Stored consignor tag lines are damaged.', 500, 'TAG_LINES_CORRUPT');
  return raw.map((entry) => {
    const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    if (
      typeof e.consignorId !== 'string' ||
      typeof e.nonce !== 'string' ||
      typeof e.sig !== 'string' ||
      typeof e.priceCents !== 'number' ||
      !Number.isInteger(e.priceCents) ||
      e.priceCents < MIN_TAG_PRICE_CENTS ||
      e.priceCents > MAX_TAG_PRICE_CENTS
    ) {
      throw new ConsignorTagError('Stored consignor tag lines are damaged.', 500, 'TAG_LINES_CORRUPT');
    }
    const line: StoredTagLine = { consignorId: e.consignorId, nonce: e.nonce, sig: e.sig, priceCents: e.priceCents };
    if (typeof e.vendorBoothId === 'string') line.vendorBoothId = e.vendorBoothId;
    if (typeof e.saleId === 'string') line.saleId = e.saleId;
    if (typeof e.organizerId === 'string') line.organizerId = e.organizerId;
    return line;
  });
}

/**
 * Validate every tag line of one sale request. Throws ConsignorTagError on the first problem.
 *
 * Order matters for privacy: the signature is checked BEFORE the consignor is looked up, so an unsigned or forged
 * consignor id learns nothing about which consignors exist. A signed tag for a consignor that is missing and one for a
 * consignor of another workspace both answer the same 404.
 */
export async function resolveTagLines(
  db: any,
  args: {
    organizer: { id: string; subscriptionTier?: string | null };
    saleId: string;
    lines: TagLineInput[];
    /** Default true: an archived consignor takes no NEW tags. Recording an already-validated sale passes true here to keep the money trail. */
    refuseArchived?: boolean;
  },
  env: EnvLike = process.env
): Promise<ResolvedTagLine[]> {
  const { organizer, saleId, lines } = args;
  const refuseArchived = args.refuseArchived !== false;
  if (!lines || lines.length === 0) return [];

  if (!isConsignorTagsEnabled(env)) {
    throw new ConsignorTagError('Consignor price tags are not turned on for your account.', 403, 'CONSIGNOR_TAGS_DISABLED');
  }
  if (!isTagSigningConfigured(env)) {
    throw new ConsignorTagError('Consignor price tags are not set up on the server yet.', 503, 'TAG_SIGNING_NOT_CONFIGURED');
  }
  if (organizer.subscriptionTier !== 'TEAMS') {
    throw new ConsignorTagError('Consignor price tags need a TEAMS subscription.', 403, 'TEAMS_REQUIRED');
  }

  const seenNonces = new Set<string>();
  const parsed: Array<{ consignorId: string; nonce: string; sig: string; priceCents: number }> = [];
  for (const line of lines) {
    const consignorId = line.consignorId;
    const nonce = line.nonce;
    const sig = line.sig;
    const priceCents = line.priceCents;
    if (
      typeof consignorId !== 'string' || !ID_RE.test(consignorId) ||
      typeof nonce !== 'string' || !NONCE_RE.test(nonce) ||
      typeof sig !== 'string' || sig.length === 0 || sig.length > 64 ||
      typeof priceCents !== 'number' || !Number.isInteger(priceCents) ||
      priceCents < MIN_TAG_PRICE_CENTS || priceCents > MAX_TAG_PRICE_CENTS
    ) {
      throw new ConsignorTagError('This price tag is not valid.', 400, 'TAG_INVALID');
    }
    if (seenNonces.has(nonce)) {
      throw new ConsignorTagError('This tag is already in the cart.', 400, 'TAG_DUPLICATE');
    }
    seenNonces.add(nonce);
    parsed.push({ consignorId, nonce, sig, priceCents });
  }

  // The sale must belong to the organizer the request is acting for (a team member acts for the owning organizer).
  const sale = await db.sale.findUnique({ where: { id: saleId }, select: { id: true, organizerId: true } });
  if (!sale || sale.organizerId !== organizer.id) {
    throw new ConsignorTagError('Sale does not belong to your account', 403, 'SALE_NOT_OWNED');
  }

  for (const p of parsed) {
    if (!verifyTag({ saleId, consignorId: p.consignorId, priceCents: p.priceCents, nonce: p.nonce, sig: p.sig }, env)) {
      throw new ConsignorTagError('This price tag could not be verified. It may be damaged or from a different sale.', 400, 'TAG_SIGNATURE_INVALID');
    }
  }

  const notFound = () => new ConsignorTagError('Consignor not found.', 404, 'CONSIGNOR_NOT_FOUND');
  const workspace = await db.organizerWorkspace.findFirst({ where: { ownerId: organizer.id }, select: { id: true } });
  if (!workspace) throw notFound();
  const ids = Array.from(new Set(parsed.map((p) => p.consignorId)));
  const consignors: Array<{ id: string; name: string; workspaceId: string; archivedAt: Date | null }> = await db.consignor.findMany({
    where: { id: { in: ids }, workspaceId: workspace.id },
    select: { id: true, name: true, workspaceId: true, archivedAt: true },
  });
  const byId = new Map(consignors.map((c) => [c.id, c]));

  return parsed.map((p) => {
    const consignor = byId.get(p.consignorId);
    if (!consignor) throw notFound();
    if (refuseArchived && consignor.archivedAt) {
      throw new ConsignorTagError('This consignor is archived. Unarchive them before taking new price tags for them.', 409, 'CONSIGNOR_ARCHIVED');
    }
    return { ...p, consignorName: consignor.name, workspaceId: consignor.workspaceId };
  });
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

export interface MintTagContext {
  saleId: string;
  organizerId: string;
  consignorId: string;
  priceCents: number;
  nonce: string;
  /** The payment reference the sku is keyed on (cash: clientTransactionId or a generated id; card: Square payment id; hub cart: cart id). */
  paymentRef: string;
  /** Default false. Recording a sale that was already validated passes true so a consignor archived in the meantime still gets the credit. */
  allowArchived?: boolean;
  /**
   * Hub (multi-booth) register only: the confirmed booth of the organizer that owns the tag, stamped on the minted item exactly as reserve-time
   * stamping does for a consigned hub item (it ends up with BOTH consignorId and vendorBoothId). Leave unset (null) for the single-sale POS
   * paths (cash, card, payment link, payment request), where no booth is involved.
   */
  vendorBoothId?: string | null;
}

export function tagSku(paymentRef: string, nonce: string): string {
  return `CTAG-${paymentRef}-${nonce}`;
}

async function lockTagKey(tx: any, key: string): Promise<void> {
  // Serializes two requests that mint the same sku. A transaction client without raw access (a unit test) skips it.
  if (tx && typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

/**
 * Create (or find) the photo-less SOLD Item for one tag line, inside the caller's transaction. Idempotent on
 * {saleId, sku}: a replay returns the item the first run created. Never applies the consignment minimum price floor.
 */
export async function mintTagItemInTx(tx: any, ctx: MintTagContext): Promise<{ itemId: string; created: boolean }> {
  const sku = tagSku(ctx.paymentRef, ctx.nonce);
  await lockTagKey(tx, `ctag:${ctx.saleId}:${sku}`);

  const existing = await tx.item.findFirst({
    where: { saleId: ctx.saleId, sku },
    select: { id: true, consignorId: true, listingType: true },
  });
  if (existing) {
    if (existing.listingType !== TAG_LISTING_TYPE || existing.consignorId !== ctx.consignorId) {
      throw new ConsignorTagError('That tag reference is already in use.', 409, 'TAG_SKU_CONFLICT');
    }
    return { itemId: existing.id, created: false };
  }

  // The consignor must belong to the workspace of the organizer that owns the sale.
  const consignor = await tx.consignor.findFirst({
    where: { id: ctx.consignorId, workspace: { ownerId: ctx.organizerId } },
    select: { id: true, archivedAt: true },
  });
  if (!consignor) throw new ConsignorTagError('Consignor not found.', 404, 'CONSIGNOR_NOT_FOUND');
  if (consignor.archivedAt && !ctx.allowArchived) {
    throw new ConsignorTagError('This consignor is archived. Unarchive them before taking new price tags for them.', 409, 'CONSIGNOR_ARCHIVED');
  }

  const price = ctx.priceCents / 100;
  const item = await tx.item.create({
    data: {
      title: formatTagTitle(ctx.priceCents),
      sku,
      status: 'SOLD',
      isActive: false,
      draftStatus: 'PUBLISHED',
      stockTotal: 1,
      stockSold: 1,
      excludeFromMarkdown: true,
      listingType: TAG_LISTING_TYPE,
      lastSoldVia: 'POS',
      consignorId: ctx.consignorId,
      saleId: ctx.saleId,
      organizerId: ctx.organizerId,
      ...(ctx.vendorBoothId ? { vendorBoothId: ctx.vendorBoothId } : {}),
      price,
      originalPrice: price,
      photoUrls: [],
      // Item.embedding is NOT NULL with no database default (migration add_coupon_model dropped it); every other Item create passes [].
      embedding: [],
    },
    select: { id: true },
  });
  return { itemId: item.id, created: true };
}
