/**
 * itemKitListing.ts -- what a marketplace listing of a KIT needs (2026-10-13, kits listable on every marketplace).
 *
 * A kit is a real Item (listingType 'KIT') with its own title, price, photos and ONE platform-owned stock number
 * (stockTotal - stockSold, kept current by itemKitStock.ts). It lists on every market like any item. The only difference a
 * marketplace sees is the description: a buyer must be told what is in the box, so every listing text built for a kit ends
 * with an "Includes:" list of its components. The list is built at listing time from the ItemKitComponent rows and is NEVER
 * written back to Item.description (so editing a component or the recipe cannot leave stale text stored on the item).
 *
 * Pure helpers (no database) are exported separately from the loaders so they can be tested directly.
 */
import { prisma } from '../lib/prisma';
import { inStockOf } from './inventoryStockMath';
import { KIT_LISTING_TYPE } from './itemKitStock';

export interface KitComponentLine {
  title: string;
  quantity: number;
}

export const KIT_INCLUDES_HEADER = 'Includes:';

export const isKitListingType = (listingType: unknown): boolean => listingType === KIT_LISTING_TYPE;

/** max(COALESCE(stockTotal, 1) - stockSold, 0): the one in-stock number every market is given. */
export function stockRemainingOf(item: { stockTotal?: number | null; stockSold?: number | null }): number {
  return inStockOf({ stockTotal: item.stockTotal ?? null, stockSold: item.stockSold ?? 0 });
}

/** "Includes:\n- 2 x Title" -- empty string when there are no components. */
export function buildKitIncludesBlock(lines: KitComponentLine[]): string {
  const clean = (lines || []).filter((l) => l && String(l.title ?? '').trim().length > 0);
  if (clean.length === 0) return '';
  return `${KIT_INCLUDES_HEADER}\n${clean.map((l) => `- ${Math.max(1, Math.floor(Number(l.quantity) || 1))} x ${String(l.title).trim()}`).join('\n')}`;
}

/** The kit's own description with the Includes list appended (idempotent: an already-present identical block is not repeated). */
export function withKitIncludes(description: string | null | undefined, lines: KitComponentLine[]): string {
  const base = String(description ?? '').trim();
  const block = buildKitIncludesBlock(lines);
  if (!block) return base;
  if (base.includes(block)) return base;
  return base ? `${base}\n\n${block}` : block;
}

type Db = Pick<typeof prisma, 'item' | 'itemKitComponent'>;

/** kitItemId -> its component lines, in the order the components were added. One query for any number of kits. */
export async function loadKitComponentLines(kitItemIds: string[], db: Db = prisma): Promise<Map<string, KitComponentLine[]>> {
  const out = new Map<string, KitComponentLine[]>();
  const ids = Array.from(new Set(kitItemIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const rows = await db.itemKitComponent.findMany({
    where: { kitItemId: { in: ids } },
    select: { kitItemId: true, quantity: true, componentItem: { select: { title: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const r of rows as Array<{ kitItemId: string; quantity: number; componentItem: { title: string | null } | null }>) {
    const list = out.get(r.kitItemId) ?? [];
    list.push({ title: r.componentItem?.title ?? '', quantity: r.quantity });
    out.set(r.kitItemId, list);
  }
  return out;
}

export interface ListingExtras {
  /** max(COALESCE(stockTotal,1) - stockSold, 0). */
  stockRemaining: number;
  isKit: boolean;
  kitComponents?: KitComponentLine[];
  /** Kits only: the description with the Includes list appended. */
  description?: string;
}

/**
 * itemId -> the extra fields every extension queue entry carries: the one stock number, and for kits the component list and a
 * marketplace-ready description. Reads current rows from the database (never trusts the caller's copy). Never mutates anything.
 */
export async function loadListingExtras(itemIds: string[], db: Db = prisma): Promise<Map<string, ListingExtras>> {
  const out = new Map<string, ListingExtras>();
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const rows = (await db.item.findMany({
    where: { id: { in: ids } },
    select: { id: true, listingType: true, stockTotal: true, stockSold: true, description: true },
  })) as Array<{ id: string; listingType: string | null; stockTotal: number | null; stockSold: number; description: string | null }>;
  const kitIds = rows.filter((r) => isKitListingType(r.listingType)).map((r) => r.id);
  const lines = await loadKitComponentLines(kitIds, db);
  for (const r of rows) {
    const extras: ListingExtras = { stockRemaining: stockRemainingOf(r), isKit: isKitListingType(r.listingType) };
    if (extras.isKit) {
      const comps = lines.get(r.id) ?? [];
      extras.kitComponents = comps;
      extras.description = withKitIncludes(r.description, comps);
    }
    out.set(r.id, extras);
  }
  return out;
}

/**
 * Spread-ready fields for one shaped queue entry (always the stock number; kit fields only for kits). `keepDescription: false` leaves the
 * kit's marketplace-ready description out (for entries that already built their own description fields from it).
 */
export function listingExtraFields(extras: ListingExtras | undefined, opts: { keepDescription?: boolean } = {}): Record<string, unknown> {
  if (!extras) return {};
  const base: Record<string, unknown> = { stockRemaining: extras.stockRemaining };
  if (!extras.isKit) return base;
  const out: Record<string, unknown> = { ...base, isKit: true, kitComponents: extras.kitComponents ?? [] };
  if (opts.keepDescription !== false) out.description = extras.description ?? '';
  return out;
}

/**
 * Title / description / quantity a marketplace publish endpoint must send for `itemId`. For an ordinary item the description is
 * returned unchanged; for a kit the Includes list is appended. `quantity` is always the one stock number (at least 1 so a publish
 * of a sold-out item is not asked to create a zero-quantity listing; callers refuse sold-out items before this).
 */
export async function loadPublishText(
  item: { id: string; listingType?: string | null; title?: string | null; description?: string | null; stockTotal?: number | null; stockSold?: number | null },
  db: Db = prisma,
): Promise<{ title: string; description: string; isKit: boolean; quantity: number; kitComponents: KitComponentLine[] }> {
  const isKit = isKitListingType(item.listingType);
  const kitComponents = isKit ? (await loadKitComponentLines([item.id], db)).get(item.id) ?? [] : [];
  return {
    title: String(item.title ?? ''),
    description: isKit ? withKitIncludes(item.description, kitComponents) : String(item.description ?? ''),
    isKit,
    quantity: Math.max(stockRemainingOf(item), 1),
    kitComponents,
  };
}

/**
 * The item with a kit's description replaced by the listing text (Includes list appended); any other item comes back untouched.
 * For the per-item publish paths that pass an Item row to a connector (Reverb, Discogs). The returned copy is for building the
 * listing only; it is never written back.
 */
export async function withKitListingText<T extends { id: string; listingType?: string | null; description?: string | null }>(item: T, db: Db = prisma): Promise<T> {
  if (!isKitListingType(item.listingType)) return item;
  const lines = (await loadKitComponentLines([item.id], db)).get(item.id) ?? [];
  return { ...item, description: withKitIncludes(item.description, lines) };
}

/**
 * Batch form of withKitListingText for export feeds: the same items with every kit's description replaced by the listing text.
 * One query for all kits; other items are returned as they are. Never writes anything.
 */
export async function applyKitIncludes<T extends { id: string; listingType?: string | null; description?: string | null }>(items: T[], db: Db = prisma): Promise<T[]> {
  const kitIds = items.filter((i) => isKitListingType(i.listingType)).map((i) => i.id);
  if (kitIds.length === 0) return items;
  const lines = await loadKitComponentLines(kitIds, db);
  return items.map((i) => (isKitListingType(i.listingType) ? { ...i, description: withKitIncludes(i.description, lines.get(i.id) ?? []) } : i));
}

/** Where-clause fragment: the organizer's sale items plus the organizer's saleless KITS (a kit may live outside any sale). */
export function organizerListableScope(organizerId: string) {
  return [
    { sale: { organizerId, deletedAt: null } },
    { saleId: null, organizerId, listingType: KIT_LISTING_TYPE },
  ];
}
