/**
 * itemKitService.ts -- kits / bundles, Phase 1 (2026-10-16): create, edit, read and archive a kit.
 *
 * A kit is a real Item (listingType 'KIT') built from existing items of the SAME organizer: "one of each coin tube for $X".
 * Selling one kit takes `quantity` units from every component (see itemKitStock.ts for the stock math and the sale hooks).
 * ItemBundle (display-only family bundle pricing) is unrelated and untouched.
 *
 * Rules enforced here (v1):
 *  - The organizer id always comes from the logged-in account. Another organizer's item looks exactly like a missing one (404).
 *  - Components must be plain AVAILABLE items: not consigned, not a bulk lot, not an auction, not a kit, not a consignor price tag,
 *    and not in ANOTHER vendor's booth. An item in the organizer's OWN booth (CONFIRMED, not deleted, booth.userId is the organizer's
 *    user id, or the hub-owner house booth of a hub the organizer owns) is allowed. (Nested kits and consigned / bulk-lot components
 *    are Phase 2 or later.)
 *  - 1 to 25 components, each once, quantity 1 to 1000.
 *  - Components cannot be changed once the kit has sold (a later refund restocks the CURRENT components, so the recipe must not move).
 *    Title, description and price can always be edited.
 *  - Kits are excluded from markdown automation and are never listed on eBay in Phase 1 (ebayShippingOverride DONT_LIST).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { KIT_LISTING_TYPE, computeKitAvailability, recomputeKitStock } from './itemKitStock';

export const KIT_LIMITS = { maxComponents: 25, maxQuantity: 1000, maxTitle: 200, maxDescription: 5000, maxPrice: 1_000_000 } as const;

export class KitError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra?: Record<string, unknown>;
  constructor(code: string, status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'KitError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
export const isKitError = (e: unknown): e is KitError => e instanceof KitError;

export interface KitComponentInput {
  itemId: string;
  quantity: number;
}
export interface KitCreateInput {
  title: string;
  description: string | null;
  price: number;
  saleId: string | null;
  components: KitComponentInput[];
}
export interface KitUpdateInput {
  title?: string;
  description?: string | null;
  price?: number;
  components?: KitComponentInput[];
}

export interface KitComponentView {
  itemId: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  status: string;
  quantity: number;
  remaining: number;
}
export interface KitView {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  saleId: string | null;
  status: string;
  stockSold: number;
  stockTotal: number;
  available: number;
  components: KitComponentView[];
}

// ---------------------------------------------------------------------------
// Pure validation (exported for tests)
// ---------------------------------------------------------------------------

export function parseKitComponents(raw: unknown): KitComponentInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new KitError('KIT_COMPONENTS_REQUIRED', 400, 'Pick at least one item for the kit.');
  }
  if (raw.length > KIT_LIMITS.maxComponents) {
    throw new KitError('KIT_TOO_MANY_COMPONENTS', 400, `A kit can have at most ${KIT_LIMITS.maxComponents} different items.`);
  }
  const seen = new Set<string>();
  const out: KitComponentInput[] = [];
  for (const entry of raw) {
    const itemId = entry && typeof (entry as { itemId?: unknown }).itemId === 'string' ? (entry as { itemId: string }).itemId : '';
    const quantity = entry ? Number((entry as { quantity?: unknown }).quantity) : NaN;
    if (!itemId || itemId.length > 64) throw new KitError('KIT_COMPONENT_INVALID', 400, 'Each kit item needs an item id.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > KIT_LIMITS.maxQuantity) {
      throw new KitError('KIT_QUANTITY_INVALID', 400, `Quantity must be a whole number from 1 to ${KIT_LIMITS.maxQuantity}.`);
    }
    if (seen.has(itemId)) throw new KitError('KIT_COMPONENT_DUPLICATE', 400, 'Each item can be added to a kit only once. Raise its quantity instead.');
    seen.add(itemId);
    out.push({ itemId, quantity });
  }
  return out;
}

function parseTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (!title) throw new KitError('KIT_TITLE_REQUIRED', 400, 'Give the kit a name.');
  if (title.length > KIT_LIMITS.maxTitle) throw new KitError('KIT_TITLE_TOO_LONG', 400, `The name can be at most ${KIT_LIMITS.maxTitle} characters.`);
  return title;
}
function parseDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new KitError('KIT_DESCRIPTION_INVALID', 400, 'The description must be text.');
  const text = raw.trim();
  if (text.length > KIT_LIMITS.maxDescription) throw new KitError('KIT_DESCRIPTION_TOO_LONG', 400, `The description can be at most ${KIT_LIMITS.maxDescription} characters.`);
  return text === '' ? null : text;
}
/** Whole cents only; the stored price is dollars. */
function parsePrice(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > KIT_LIMITS.maxPrice) throw new KitError('KIT_PRICE_INVALID', 400, 'Enter a kit price greater than zero.');
  return Math.round(n * 100) / 100;
}

export function parseKitCreate(raw: unknown): KitCreateInput {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const saleId = typeof b.saleId === 'string' && b.saleId !== '' ? b.saleId : null;
  return {
    title: parseTitle(b.title),
    description: parseDescription(b.description),
    price: parsePrice(b.price),
    saleId,
    components: parseKitComponents(b.components),
  };
}

export function parseKitUpdate(raw: unknown): KitUpdateInput {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: KitUpdateInput = {};
  if (b.title !== undefined) out.title = parseTitle(b.title);
  if (b.description !== undefined) out.description = parseDescription(b.description);
  if (b.price !== undefined) out.price = parsePrice(b.price);
  if (b.components !== undefined) out.components = parseKitComponents(b.components);
  if (Object.keys(out).length === 0) throw new KitError('KIT_NOTHING_TO_UPDATE', 400, 'Nothing to change.');
  return out;
}

export interface KitComponentCandidate {
  id: string;
  organizerId: string | null;
  status: string;
  listingType: string | null;
  deletedAt: Date | null;
  consignorId: string | null;
  vendorBoothId: string | null;
  /** Loaded only when vendorBoothId is set. A missing booth row for a set vendorBoothId fails closed (rejected). */
  vendorBooth?: KitComponentBooth | null;
  bulkLot: { id: string } | null;
}

export interface KitComponentBooth {
  userId: string | null;
  status: string;
  deletedAt: Date | null;
  isHubOwnerBooth: boolean;
  hub: { organizerId: string } | null;
}

/** True when the booth is the organizer's own: confirmed, not deleted, and either operated by the organizer's user or the house booth of the organizer's hub. */
export function isOwnBooth(booth: KitComponentBooth | null | undefined, organizerId: string, organizerUserId: string | null | undefined): boolean {
  if (!booth || booth.deletedAt || booth.status !== 'CONFIRMED') return false;
  if (organizerUserId && booth.userId === organizerUserId) return true;
  return booth.isHubOwnerBooth === true && booth.hub?.organizerId === organizerId;
}

/** Why an item cannot be a kit component, or null when it can. Messages are shown to the organizer. */
export function componentIneligibleReason(item: KitComponentCandidate, organizerId: string, organizerUserId?: string | null): { code: string; message: string } | null {
  if (item.organizerId !== organizerId || item.deletedAt) return { code: 'KIT_COMPONENT_NOT_FOUND', message: 'One of the items could not be found.' };
  if (item.listingType === KIT_LISTING_TYPE) return { code: 'KIT_COMPONENT_IS_KIT', message: 'A kit cannot contain another kit.' };
  if (item.listingType !== 'FIXED' && item.listingType !== 'POS' && item.listingType !== null) {
    return { code: 'KIT_COMPONENT_TYPE', message: 'Only regular fixed-price items can go in a kit. Auction items cannot.' };
  }
  if (item.consignorId) return { code: 'KIT_COMPONENT_CONSIGNED', message: 'Consigned items cannot go in a kit yet.' };
  if (item.vendorBoothId && !isOwnBooth(item.vendorBooth, organizerId, organizerUserId)) {
    return { code: 'KIT_COMPONENT_VENDOR_BOOTH', message: 'Items in another vendor\'s booth cannot go in a kit yet. Items in your own booth can.' };
  }
  if (item.bulkLot) return { code: 'KIT_COMPONENT_BULK_LOT', message: 'Bulk lots cannot go in a kit yet.' };
  if (item.status !== 'AVAILABLE') return { code: 'KIT_COMPONENT_UNAVAILABLE', message: 'Only items that are available to buy can go in a kit.' };
  return null;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient;

const COMPONENT_ITEM_SELECT = {
  id: true,
  title: true,
  price: true,
  photoUrls: true,
  category: true,
  condition: true,
  organizerId: true,
  status: true,
  listingType: true,
  deletedAt: true,
  consignorId: true,
  vendorBoothId: true,
  vendorBooth: { select: { userId: true, status: true, deletedAt: true, isHubOwnerBooth: true, hub: { select: { organizerId: true } } } },
  stockTotal: true,
  stockSold: true,
  bulkLot: { select: { id: true } },
} as const;

async function loadOrganizerUserId(db: Db, organizerId: string): Promise<string | null> {
  const org = await db.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
  return org?.userId ?? null;
}

async function loadEligibleComponents(db: Db, organizerId: string, inputs: KitComponentInput[]) {
  const items = await db.item.findMany({ where: { id: { in: inputs.map((c) => c.itemId) } }, select: COMPONENT_ITEM_SELECT });
  const organizerUserId = await loadOrganizerUserId(db, organizerId);
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = inputs.map((input) => {
    const item = byId.get(input.itemId);
    if (!item) throw new KitError('KIT_COMPONENT_NOT_FOUND', 404, 'One of the items could not be found.');
    const reason = componentIneligibleReason(item, organizerId, organizerUserId);
    if (reason) throw new KitError(reason.code, reason.code === 'KIT_COMPONENT_NOT_FOUND' ? 404 : 409, reason.message, { itemId: item.id, title: item.title });
    return { item, quantity: input.quantity };
  });
  return rows;
}

function remainingOf(item: { stockTotal: number | null; stockSold: number }): number {
  return Math.max((item.stockTotal ?? 1) - item.stockSold, 0);
}

async function toView(db: Db, kitId: string): Promise<KitView> {
  const kit = await db.item.findUnique({
    where: { id: kitId },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      saleId: true,
      status: true,
      stockSold: true,
      stockTotal: true,
      kitComponents: {
        orderBy: { componentItemId: 'asc' },
        select: {
          quantity: true,
          componentItem: { select: { id: true, title: true, price: true, photoUrls: true, status: true, stockTotal: true, stockSold: true, deletedAt: true } },
        },
      },
    },
  });
  if (!kit) throw new KitError('KIT_NOT_FOUND', 404, 'Kit not found.');
  const components: KitComponentView[] = kit.kitComponents.map((c) => {
    const ci = c.componentItem;
    const unavailable = !!ci.deletedAt || ci.status === 'SOLD' || ci.status === 'DONATED' || ci.status === 'AUCTION_ENDED';
    return {
      itemId: ci.id,
      title: ci.title,
      price: ci.price,
      photoUrl: ci.photoUrls[0] ?? null,
      status: ci.status,
      quantity: c.quantity,
      remaining: unavailable ? 0 : remainingOf(ci),
    };
  });
  return {
    id: kit.id,
    title: kit.title,
    description: kit.description,
    price: kit.price,
    saleId: kit.saleId,
    status: kit.status,
    stockSold: kit.stockSold,
    stockTotal: kit.stockTotal ?? 1,
    available: computeKitAvailability(components.map((c) => ({ remaining: c.remaining, quantity: c.quantity }))),
    components,
  };
}

async function loadOwnedKit(db: Db, organizerId: string, kitId: string) {
  const kit = await db.item.findUnique({
    where: { id: kitId },
    select: { id: true, organizerId: true, listingType: true, deletedAt: true, stockSold: true, kitComponents: { select: { componentItemId: true } } },
  });
  if (!kit || kit.organizerId !== organizerId || kit.listingType !== KIT_LISTING_TYPE || kit.deletedAt) throw new KitError('KIT_NOT_FOUND', 404, 'Kit not found.');
  return kit;
}

/** Clears the server-owned isKitComponent flag on items that are no longer in any kit. */
async function clearComponentFlags(db: Db, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db.$executeRaw`
    UPDATE "Item" SET "isKitComponent" = false
    WHERE "id" IN (${Prisma.join(itemIds)})
      AND NOT EXISTS (SELECT 1 FROM "ItemKitComponent" m WHERE m."componentItemId" = "Item"."id")
  `;
}

export async function createKit(organizerId: string, raw: unknown): Promise<KitView> {
  const input = parseKitCreate(raw);
  return prisma.$transaction(async (txClient) => {
    const db = txClient as unknown as Db;
    if (input.saleId) {
      const sale = await db.sale.findUnique({ where: { id: input.saleId }, select: { id: true, organizerId: true } });
      if (!sale || sale.organizerId !== organizerId) throw new KitError('KIT_SALE_NOT_FOUND', 404, 'Sale not found.');
    }
    const rows = await loadEligibleComponents(db, organizerId, input.components);
    const available = computeKitAvailability(rows.map((r) => ({ remaining: remainingOf(r.item), quantity: r.quantity })));
    if (available < 1) {
      throw new KitError('KIT_NO_STOCK', 409, 'There is not enough stock to make even one kit from these items and quantities.');
    }
    const photos = rows.map((r) => r.item.photoUrls[0]).filter((u): u is string => !!u).slice(0, 5);
    const created = await db.item.create({
      data: {
        saleId: input.saleId,
        organizerId,
        title: input.title,
        description: input.description,
        price: input.price,
        originalPrice: input.price,
        category: rows[0].item.category,
        condition: rows[0].item.condition,
        status: 'AVAILABLE',
        draftStatus: 'PUBLISHED',
        embedding: [],
        photoUrls: photos,
        listingType: KIT_LISTING_TYPE,
        stockTotal: available,
        excludeFromMarkdown: true, // kits are priced by the organizer, never marked down by the markdown crons
        ebayShippingOverride: 'DONT_LIST', // Phase 1: no external marketplace listing for kits
        isKitComponent: false,
        kitComponents: { create: rows.map((r) => ({ componentItemId: r.item.id, quantity: r.quantity })) },
      },
      select: { id: true },
    });
    await db.item.updateMany({ where: { id: { in: rows.map((r) => r.item.id) } }, data: { isKitComponent: true } });
    return toView(db, created.id);
  });
}

export async function updateKit(organizerId: string, kitId: string, raw: unknown): Promise<KitView> {
  const input = parseKitUpdate(raw);
  return prisma.$transaction(async (txClient) => {
    const db = txClient as unknown as Db;
    const kit = await loadOwnedKit(db, organizerId, kitId);
    const data: Prisma.ItemUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.price !== undefined) {
      data.price = input.price;
      data.originalPrice = input.price;
    }
    if (input.components) {
      if (kit.stockSold > 0) {
        throw new KitError('KIT_HAS_SALES', 409, 'This kit has already sold, so its items cannot change. Make a new kit instead. You can still change the name, description and price.');
      }
      const rows = await loadEligibleComponents(db, organizerId, input.components);
      const oldIds = kit.kitComponents.map((c) => c.componentItemId);
      await db.itemKitComponent.deleteMany({ where: { kitItemId: kitId } });
      await db.itemKitComponent.createMany({ data: rows.map((r) => ({ kitItemId: kitId, componentItemId: r.item.id, quantity: r.quantity })) });
      await db.item.updateMany({ where: { id: { in: rows.map((r) => r.item.id) } }, data: { isKitComponent: true } });
      const newIds = new Set(rows.map((r) => r.item.id));
      await clearComponentFlags(db, oldIds.filter((id) => !newIds.has(id)));
    }
    if (Object.keys(data).length > 0) await db.item.update({ where: { id: kitId }, data });
    if (input.components) await recomputeKitStock(db, [kitId]);
    return toView(db, kitId);
  });
}

export async function getKit(organizerId: string, kitId: string): Promise<KitView> {
  await loadOwnedKit(prisma as unknown as Db, organizerId, kitId);
  return toView(prisma as unknown as Db, kitId);
}

export async function listKits(organizerId: string, saleId: string | null): Promise<KitView[]> {
  const db = prisma as unknown as Db;
  const kits = await db.item.findMany({
    where: { organizerId, listingType: KIT_LISTING_TYPE, deletedAt: null, ...(saleId ? { saleId } : {}) },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return Promise.all(kits.map((k) => toView(db, k.id)));
}

/** Soft delete. The component rows go away (so the components are free again); a kit that already sold keeps its sales history on the Item row. */
export async function archiveKit(organizerId: string, kitId: string): Promise<void> {
  await prisma.$transaction(async (txClient) => {
    const db = txClient as unknown as Db;
    const kit = await loadOwnedKit(db, organizerId, kitId);
    const ids = kit.kitComponents.map((c) => c.componentItemId);
    await db.itemKitComponent.deleteMany({ where: { kitItemId: kitId } });
    await db.item.update({ where: { id: kitId }, data: { deletedAt: new Date(), status: 'SOLD' } });
    await clearComponentFlags(db, ids);
  });
}

export async function refreshKit(organizerId: string, kitId: string): Promise<KitView> {
  const db = prisma as unknown as Db;
  await loadOwnedKit(db, organizerId, kitId);
  await recomputeKitStock(db, [kitId]);
  return toView(db, kitId);
}

export interface KitCandidate {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  remaining: number;
  saleId: string | null;
}

/** Items the organizer can put in a kit (same eligibility as componentIneligibleReason). */
export async function listKitCandidates(organizerId: string, opts: { saleId?: string | null; q?: string | null }): Promise<KitCandidate[]> {
  const db = prisma as unknown as Db;
  const q = (opts.q ?? '').trim().slice(0, 100);
  const organizerUserId = await loadOrganizerUserId(db, organizerId);
  // Same rule as isOwnBooth: no booth, or a confirmed, non-deleted booth that is the organizer's own.
  const ownBoothClauses: Prisma.VendorBoothWhereInput[] = [{ isHubOwnerBooth: true, hub: { organizerId } }];
  if (organizerUserId) ownBoothClauses.push({ userId: organizerUserId });
  const items = await db.item.findMany({
    where: {
      organizerId,
      deletedAt: null,
      status: 'AVAILABLE',
      listingType: { in: ['FIXED', 'POS'] },
      consignorId: null,
      OR: [
        { vendorBoothId: null },
        { vendorBooth: { is: { deletedAt: null, status: 'CONFIRMED', OR: ownBoothClauses } } },
      ],
      bulkLot: { is: null },
      ...(opts.saleId ? { saleId: opts.saleId } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    select: { id: true, title: true, price: true, photoUrls: true, stockTotal: true, stockSold: true, saleId: true },
    orderBy: { title: 'asc' },
    take: 100,
  });
  return items
    .map((i) => ({ id: i.id, title: i.title, price: i.price, photoUrl: i.photoUrls[0] ?? null, remaining: remainingOf(i), saleId: i.saleId }))
    .filter((i) => i.remaining > 0);
}
