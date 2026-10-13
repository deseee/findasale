/**
 * Price locks and the hand edit rule (ADR-140 sections 3, 6.8 and 10). A pin is a lock the shop sets on one item: the price
 * book never changes that price, in a run or a single suggestion, until the shop unpins it (or the pin expires).
 *
 * Tenant rule: the book is found from ctx.organizerId, an item must belong to that organizer (a foreign or unknown item id
 * behaves as missing), every lock query carries bookId, and every lock write goes through create, updateMany or deleteMany
 * with bookId in the where clause. Locks never bump the book version (bookService).
 */
import { chunk, dollarsToCents, isUniqueViolation, notFoundError, validationError } from './db';
import type { ItemRow, LockRow, PriceBookTx, ServiceCtx } from './db';
import { ensureBook, findBook } from './bookService';
import type { LockKind } from './types';
import { DAY_MS } from './vocabulary';

export const DEFAULT_LOCK_LIST_LIMIT = 100;
export const MAX_LOCK_LIST_LIMIT = 500;
/** A price edit this close before a run write still counts as the run's own write (ADR-140 section 6.8). */
export const RUN_WRITE_GRACE_MS = 5000;

export interface LockView {
  itemId: string;
  title: string | null;
  price: number | null;
  reason: string;
  priceCentsAtLock: number | null;
  lockedUntil: string | null;
  createdAt: string;
}

export interface SetLockResult {
  locked: boolean;
  lock: LockView | null;
}

function parseUntil(raw: unknown, now: Date): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null;
  if (d === null || Number.isNaN(d.getTime())) throw validationError('The date is not valid.', { field: 'until' });
  if (d.getTime() <= now.getTime()) throw validationError('The date must be in the future.', { field: 'until' });
  return d;
}

function toLockView(row: LockRow, item: Pick<ItemRow, 'title' | 'price'> | null): LockView {
  return {
    itemId: row.itemId,
    title: item ? item.title : null,
    price: item ? item.price : null,
    reason: row.reason,
    priceCentsAtLock: row.priceCentsAtLock,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The organizer's own item, or a not found error (a foreign item id is indistinguishable from a missing one). */
async function requireOwnItem(ctx: ServiceCtx, itemId: unknown): Promise<ItemRow> {
  if (typeof itemId !== 'string' || itemId.trim() === '' || itemId.length > 100) throw notFoundError('Item not found.');
  const item = await ctx.db.item.findFirst({ where: { id: itemId, organizerId: ctx.organizerId, deletedAt: null } });
  if (!item) throw notFoundError('Item not found.');
  return item;
}

/**
 * Pins (locked true) or unpins (locked false) the price of one item. Pinning twice updates the same lock; unpinning an item
 * that is not pinned is not an error. until is optional and must be in the future; without it the pin lasts until unpinned.
 */
export async function setLock(ctx: ServiceCtx, itemId: unknown, args: { locked: boolean; until?: unknown }): Promise<SetLockResult> {
  if (typeof args.locked !== 'boolean') throw validationError('locked must be true or false.', { field: 'locked' });
  const item = await requireOwnItem(ctx, itemId);

  if (!args.locked) {
    const book = await findBook(ctx.db, ctx.organizerId);
    if (book) await ctx.db.priceBookLock.deleteMany({ where: { bookId: book.id, itemId: item.id } });
    return { locked: false, lock: null };
  }

  const until = parseUntil(args.until, ctx.now);
  const book = await ensureBook(ctx);
  const data = {
    reason: 'PIN',
    priceCentsAtLock: dollarsToCents(item.price),
    lockedUntil: until,
    createdByUserId: ctx.userId ?? null,
  };
  const existing = await ctx.db.priceBookLock.findFirst({ where: { bookId: book.id, itemId: item.id } });
  if (existing) {
    await ctx.db.priceBookLock.updateMany({ where: { id: existing.id, bookId: book.id }, data });
  } else {
    try {
      await ctx.db.priceBookLock.create({ data: { bookId: book.id, itemId: item.id, ...data } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      await ctx.db.priceBookLock.updateMany({ where: { bookId: book.id, itemId: item.id }, data });
    }
  }
  const fresh = await ctx.db.priceBookLock.findFirst({ where: { bookId: book.id, itemId: item.id } });
  if (!fresh) throw notFoundError('Item not found.');
  return { locked: true, lock: toLockView(fresh, item) };
}

export function isLockActive(lock: Pick<LockRow, 'lockedUntil'>, now: Date): boolean {
  return lock.lockedUntil === null || lock.lockedUntil.getTime() > now.getTime();
}

/** The pinned items of this organizer's book, newest first. Expired pins are left out. */
export async function listLocks(ctx: ServiceCtx, limitRaw?: unknown): Promise<LockView[]> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) return [];
  let limit = DEFAULT_LOCK_LIST_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) throw validationError('limit must be a whole number from 1 to ' + MAX_LOCK_LIST_LIMIT + '.', { field: 'limit' });
    limit = Math.min(n, MAX_LOCK_LIST_LIMIT);
  }
  const rows = await ctx.db.priceBookLock.findMany({ where: { bookId: book.id }, orderBy: { createdAt: 'desc' }, take: 2000 });
  const active = rows.filter((r) => isLockActive(r, ctx.now)).slice(0, limit);
  const items = new Map<string, ItemRow>();
  for (const ids of chunk(active.map((r) => r.itemId), 1000)) {
    for (const it of await ctx.db.item.findMany({ where: { id: { in: ids }, organizerId: ctx.organizerId } })) items.set(it.id, it);
  }
  // A lock whose item is no longer this organizer's (deleted, moved) is not shown.
  return active.filter((r) => items.has(r.itemId)).map((r) => toLockView(r, items.get(r.itemId) ?? null));
}

export interface ResolvedLock {
  kind: LockKind;
  /** Null for a pin without an end; the end of the hand edit window for RECENT_EDIT. */
  until: Date | null;
}

export interface LockScope {
  organizerId: string;
  bookId: string;
  manualLockDays: number;
  now: Date;
}

/**
 * Resolves the lock of each item for the engine (section 6.8): PIN from a PriceBookLock that has not expired, otherwise
 * RECENT_EDIT when Item.priceUpdatedAt is within manualLockDays and no price book write (an applied or undone run item)
 * happened at or after priceUpdatedAt minus 5 seconds. Items that are not this organizer's get no entry at all.
 * A markdown job stamps priceUpdatedAt too, so a marked down card also reads as recently edited; the run service checks the
 * explicit markdown reason first.
 */
export async function resolveLocks(db: PriceBookTx, scope: LockScope, itemIds: readonly string[]): Promise<Map<string, ResolvedLock | null>> {
  const out = new Map<string, ResolvedLock | null>();
  const ids = Array.from(new Set(itemIds));
  if (ids.length === 0) return out;

  const items = new Map<string, ItemRow>();
  for (const part of chunk(ids, 1000)) {
    for (const it of await db.item.findMany({ where: { id: { in: part }, organizerId: scope.organizerId } })) items.set(it.id, it);
  }
  const pins = new Map<string, LockRow>();
  for (const part of chunk(Array.from(items.keys()), 1000)) {
    for (const l of await db.priceBookLock.findMany({ where: { bookId: scope.bookId, itemId: { in: part } } })) pins.set(l.itemId, l);
  }

  // Run writes, only for items that could be in the hand edit window.
  const windowMs = scope.manualLockDays > 0 ? scope.manualLockDays * DAY_MS : 0;
  const nowMs = scope.now.getTime();
  const maybeRecent = Array.from(items.values()).filter(
    (it) => !pins.has(it.id) && it.priceUpdatedAt !== null && windowMs > 0 && nowMs - it.priceUpdatedAt.getTime() <= windowMs,
  );
  const writes = await priceBookWrites(db, scope.bookId, maybeRecent.map((i) => i.id));

  for (const it of items.values()) {
    const pin = pins.get(it.id);
    if (pin && isLockActive(pin, scope.now)) {
      out.set(it.id, { kind: 'PIN', until: pin.lockedUntil });
      continue;
    }
    let lock: ResolvedLock | null = null;
    if (it.priceUpdatedAt !== null && windowMs > 0 && nowMs - it.priceUpdatedAt.getTime() <= windowMs) {
      const edited = it.priceUpdatedAt.getTime();
      const byBook = (writes.get(it.id) ?? []).some((t) => t >= edited - RUN_WRITE_GRACE_MS);
      if (!byBook) lock = { kind: 'RECENT_EDIT', until: new Date(edited + windowMs) };
    }
    out.set(it.id, lock);
  }
  return out;
}

/** Times at which a run of this book wrote (applied or undid) each item's price. Only runs of this book count. */
async function priceBookWrites(db: PriceBookTx, bookId: string, itemIds: readonly string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const part of chunk(Array.from(itemIds), 1000)) {
    const rows = await db.priceBookRunItem.findMany({ where: { itemId: { in: part }, state: { in: ['APPLIED', 'UNDONE'] } } });
    if (rows.length === 0) continue;
    const runs = await ownRunIds(db, bookId, rows.map((r) => r.runId));
    for (const r of rows) {
      if (!runs.has(r.runId)) continue;
      const list = out.get(r.itemId) ?? [];
      if (r.appliedAt) list.push(r.appliedAt.getTime());
      if (r.undoneAt) list.push(r.undoneAt.getTime());
      out.set(r.itemId, list);
    }
  }
  return out;
}

async function ownRunIds(db: PriceBookTx, bookId: string, runIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(Array.from(new Set(runIds)), 1000)) {
    for (const run of await db.priceBookRun.findMany({ where: { bookId, id: { in: part } } })) out.add(run.id);
  }
  return out;
}

/**
 * The reference the last applied run of this book used for each item (cents), for the REFERENCE_MOVED review reason.
 * Items without an applied run get no entry.
 */
export async function lastAppliedReferences(db: PriceBookTx, bookId: string, itemIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunk(Array.from(new Set(itemIds)), 1000)) {
    const rows = await db.priceBookRunItem.findMany({ where: { itemId: { in: part }, state: 'APPLIED' }, orderBy: { appliedAt: 'desc' } });
    if (rows.length === 0) continue;
    const runs = await ownRunIds(db, bookId, rows.map((r) => r.runId));
    for (const r of rows) {
      if (out.has(r.itemId) || !runs.has(r.runId) || r.referenceCents === null || r.referenceCents < 1) continue;
      out.set(r.itemId, r.referenceCents);
    }
  }
  return out;
}
