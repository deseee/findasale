/**
 * itemKitStock.ts -- kits / bundles, Phase 1 (2026-10-16): the stock side.
 *
 * A kit is a real Item with listingType 'KIT' made of existing items (ItemKitComponent rows: componentItemId + quantity).
 * Selling one kit takes `quantity` units from EACH component through the same guarded decrement every other sale uses, in
 * one transaction, so a sale either takes every component or none of them.
 *
 * Stock model (unchanged for ordinary items): remaining = COALESCE(stockTotal, 1) - stockSold. For a kit, remaining is DERIVED:
 *     avail = min over components of floor(componentRemaining / quantity)      (0 for a deleted / sold / donated component)
 * and MATERIALIZED into the kit's own stockTotal as  stockTotal = kit.stockSold + avail,  so the storefront and eBay math
 * (total - sold) stays correct without knowing about kits. The count is recomputed whenever a component's stock changes
 * (itemStockService sell paths, itemSaleGuard.commitItemSale, refund restock) and whenever the components are edited.
 *
 * Decisions (documented, see the Phase 1 report):
 *  - A short component FAILS THE KIT SALE (KitComponentShortError, a subclass of InsufficientStockError) rather than taking a
 *    shortfall like bulkLotEbaySoldService.absorbBundleOrderLine does. The shortfall pattern exists because an eBay order is
 *    already placed and cannot be refused; every FindA.Sale path that reaches here treats InsufficientStockError as a clean abort.
 *  - Components are locked in id order (deadlock avoidance when two kits share components).
 *  - Components are plain items only (no nesting, no consigned / bulk-lot items, no items in another vendor's booth (the organizer's own booth is allowed); enforced in itemKitService).
 *
 * This module takes the database client as an argument (no prisma import) so it works inside a caller's transaction and can be
 * tested with an in-memory fake.
 *
 * Phase 2 hook points (NOT built): after a kit sale / refund / recompute, the components' and the kit's external marketplace
 * listings (eBay quantity revise or withdraw, Vinted, Etsy, Discogs, Reverb) need the same outbox revise/withdraw that
 * marketplaceStockSyncService does for single items. The changed item ids are returned by sellKitComponents / restockKitComponents.
 */
import { Prisma } from '@prisma/client';
import type { prisma } from '../lib/prisma';
import { InsufficientStockError, KitComponentShortError } from './itemStockErrors';
import { scheduleKitRelatedStockSync } from './kitStockSyncTrigger';

export const KIT_LISTING_TYPE = 'KIT';

// Same widening as itemStockService: Prisma v5's $extends-wrapped client's transaction flavor is not assignable to
// Prisma.TransactionClient, so accept either and cast once inside.
export type KitStockClient =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface KitComponentRef {
  componentItemId: string;
  quantity: number;
}

/** Pure: how many whole kits the components can supply. Empty component list = 0 (a kit with no components never sells). */
export function computeKitAvailability(components: Array<{ remaining: number; quantity: number }>): number {
  if (components.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const c of components) {
    if (!Number.isInteger(c.quantity) || c.quantity < 1) return 0;
    const remaining = Math.max(Math.floor(c.remaining), 0);
    min = Math.min(min, Math.floor(remaining / c.quantity));
  }
  return Number.isFinite(min) ? min : 0;
}

/** Pure: the value stored in the kit's stockTotal. */
export function materializedKitStockTotal(kitStockSold: number, availableKits: number): number {
  return Math.max(kitStockSold, 0) + Math.max(availableKits, 0);
}

export interface KitStockDeps {
  loadComponents(client: Prisma.TransactionClient, kitItemId: string): Promise<KitComponentRef[]>;
  /** Guarded decrement of one component. Throws KitComponentShortError when it cannot supply `units`. */
  decrement(client: Prisma.TransactionClient, kitItemId: string, componentItemId: string, units: number): Promise<void>;
  /** Put units back on one component (floored at zero sold). */
  increment(client: Prisma.TransactionClient, componentItemId: string, units: number): Promise<void>;
  recomputeForComponents(client: Prisma.TransactionClient, componentItemIds: string[]): Promise<void>;
}

function asTx(client: KitStockClient): Prisma.TransactionClient {
  return client as Prisma.TransactionClient;
}

/** The kit's components in id order (the lock order). */
export async function loadKitComponents(client: Prisma.TransactionClient, kitItemId: string): Promise<KitComponentRef[]> {
  const rows = await client.itemKitComponent.findMany({
    where: { kitItemId },
    select: { componentItemId: true, quantity: true },
    orderBy: { componentItemId: 'asc' },
  });
  return rows.map((r) => ({ componentItemId: r.componentItemId, quantity: r.quantity }));
}

async function decrementComponent(client: Prisma.TransactionClient, kitItemId: string, componentItemId: string, units: number): Promise<void> {
  // Same guarded statement as itemStockService.sellItemUnitsInTransaction: guard, increment and status change in ONE UPDATE.
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    UPDATE "Item"
    SET "stockSold" = "stockSold" + ${units},
        "status" = CASE
          WHEN "stockSold" + ${units} >= COALESCE("stockTotal", 1) THEN 'SOLD'
          WHEN "status" IN ('RESERVED', 'INVOICE_ISSUED') THEN 'AVAILABLE'
          ELSE "status"
        END
    WHERE "id" = ${componentItemId}
      AND "deletedAt" IS NULL
      AND "stockSold" + ${units} <= COALESCE("stockTotal", 1)
    RETURNING "id"
  `;
  if (!rows || rows.length === 0) {
    const existing = await client.item.findUnique({
      where: { id: componentItemId },
      select: { stockTotal: true, stockSold: true },
    });
    const remaining = existing ? Math.max((existing.stockTotal ?? 1) - existing.stockSold, 0) : 0;
    throw new KitComponentShortError(kitItemId, componentItemId, units, remaining);
  }
}

async function incrementComponent(client: Prisma.TransactionClient, componentItemId: string, units: number): Promise<void> {
  // A component that sold out (status SOLD) becomes available again once a unit is back; any other status is left alone.
  await client.$executeRaw`
    UPDATE "Item"
    SET "stockSold" = GREATEST("stockSold" - ${units}, 0),
        "status" = CASE
          WHEN "status" = 'SOLD' AND GREATEST("stockSold" - ${units}, 0) < COALESCE("stockTotal", 1) THEN 'AVAILABLE'
          ELSE "status"
        END
    WHERE "id" = ${componentItemId}
  `;
}

/**
 * Recomputes derived stock for the kits selected by `kitFilter` (a SQL predicate on c."kitItemId"). One UPDATE.
 *  - avail = min over components of floor(remaining / quantity); a deleted, SOLD, DONATED or AUCTION_ENDED component counts as 0.
 *  - kit.stockTotal = kit.stockSold + avail.
 *  - avail = 0 and kit AVAILABLE   -> kit status SOLD (no longer publicly purchasable: the public list and checkout read status).
 *  - avail > 0 and kit SOLD and it had no stock left (old remaining <= 0) -> AVAILABLE again. A kit an organizer marked SOLD by
 *    hand while stock remained (old remaining > 0) stays SOLD.
 */
async function recomputeWhere(client: Prisma.TransactionClient, kitFilter: Prisma.Sql): Promise<number> {
  return client.$executeRaw`
    UPDATE "Item" AS k
    SET "stockTotal" = k."stockSold" + a."avail",
        "status" = CASE
          WHEN a."avail" = 0 AND k."status" = 'AVAILABLE' THEN 'SOLD'
          WHEN a."avail" > 0 AND k."status" = 'SOLD' AND COALESCE(k."stockTotal", 1) - k."stockSold" <= 0 THEN 'AVAILABLE'
          ELSE k."status"
        END
    FROM (
      SELECT c."kitItemId" AS "kitId",
             COALESCE(MIN(
               CASE
                 WHEN ci."deletedAt" IS NOT NULL OR ci."status" IN ('SOLD', 'DONATED', 'AUCTION_ENDED') THEN 0
                 ELSE GREATEST(COALESCE(ci."stockTotal", 1) - ci."stockSold", 0) / c."quantity"
               END
             ), 0) AS "avail"
      FROM "ItemKitComponent" c
      JOIN "Item" ci ON ci."id" = c."componentItemId"
      WHERE ${kitFilter}
      GROUP BY c."kitItemId"
    ) a
    WHERE k."id" = a."kitId" AND k."listingType" = 'KIT'
  `;
}

/** Recompute the given kits (used after the components of a kit are edited). */
export async function recomputeKitStock(client: KitStockClient, kitItemIds: string[]): Promise<void> {
  if (kitItemIds.length === 0) return;
  await recomputeWhere(asTx(client), Prisma.sql`c."kitItemId" IN (${Prisma.join(kitItemIds)})`);
}

/** Recompute every kit that contains any of these items (used after a component's stock or status changes). */
export async function recomputeKitsForComponents(client: KitStockClient, componentItemIds: string[]): Promise<void> {
  if (componentItemIds.length === 0) return;
  await recomputeWhere(
    asTx(client),
    Prisma.sql`c."kitItemId" IN (SELECT m."kitItemId" FROM "ItemKitComponent" m WHERE m."componentItemId" IN (${Prisma.join(componentItemIds)}))`
  );
}

export interface StaleKit {
  kitId: string;
  title: string;
  storedStockTotal: number | null;
  expectedStockTotal: number;
  storedAvail: number;
  expectedAvail: number;
}

/**
 * Reconcile sweep: every non-deleted kit whose stored stockTotal does not equal stockSold + the true availability (same
 * availability rule as recomputeWhere). Read-only. Kits with no component rows are not listed (recompute cannot touch them).
 */
export async function findStaleKits(client: KitStockClient): Promise<StaleKit[]> {
  const rows = await asTx(client).$queryRaw<
    Array<{ kitId: string; title: string; storedStockTotal: number | null; stockSold: number; avail: number }>
  >`
    SELECT k."id" AS "kitId", k."title" AS "title", k."stockTotal" AS "storedStockTotal", k."stockSold" AS "stockSold", a."avail"::int AS "avail"
    FROM "Item" k
    JOIN (
      SELECT c."kitItemId" AS "kitId",
             COALESCE(MIN(
               CASE
                 WHEN ci."deletedAt" IS NOT NULL OR ci."status" IN ('SOLD', 'DONATED', 'AUCTION_ENDED') THEN 0
                 ELSE GREATEST(COALESCE(ci."stockTotal", 1) - ci."stockSold", 0) / c."quantity"
               END
             ), 0) AS "avail"
      FROM "ItemKitComponent" c
      JOIN "Item" ci ON ci."id" = c."componentItemId"
      GROUP BY c."kitItemId"
    ) a ON a."kitId" = k."id"
    WHERE k."listingType" = 'KIT'
      AND k."deletedAt" IS NULL
      AND k."stockTotal" IS DISTINCT FROM (k."stockSold" + a."avail")
  `;
  return (rows || []).map((r) => {
    const avail = Number(r.avail);
    const sold = Number(r.stockSold);
    const stored = r.storedStockTotal === null || r.storedStockTotal === undefined ? null : Number(r.storedStockTotal);
    return {
      kitId: r.kitId,
      title: r.title,
      storedStockTotal: stored,
      expectedStockTotal: sold + avail,
      storedAvail: Math.max((stored ?? 1) - sold, 0),
      expectedAvail: avail,
    };
  });
}

/** Recomputes every stale kit (see findStaleKits) and returns how many were changed. Derived totals only; never edits stockSold. */
export async function recomputeAllKitStock(client: KitStockClient): Promise<number> {
  const stale = await findStaleKits(client);
  if (stale.length === 0) return 0;
  await recomputeKitStock(client, stale.map((k) => k.kitId));
  return stale.length;
}

export const defaultKitStockDeps: KitStockDeps = {
  loadComponents: loadKitComponents,
  decrement: decrementComponent,
  increment: incrementComponent,
  recomputeForComponents: (client, ids) => recomputeKitsForComponents(client, ids),
};

/**
 * Takes `kitUnits` kits' worth of stock from every component, all-or-nothing, then recomputes every kit that shares a component
 * (including this one). MUST run inside the caller's transaction: if any component is short this throws KitComponentShortError and
 * the caller's transaction rolls back every earlier component decrement with it. Returns the touched component ids (Phase 2 hook).
 */
export async function sellKitComponents(
  client: KitStockClient,
  kitItemId: string,
  kitUnits: number,
  deps: KitStockDeps = defaultKitStockDeps
): Promise<string[]> {
  if (!Number.isInteger(kitUnits) || kitUnits < 1) {
    throw new Error(`sellKitComponents: kitUnits must be a positive integer, got ${kitUnits}`);
  }
  const tx = asTx(client);
  const components = await deps.loadComponents(tx, kitItemId);
  if (components.length === 0) throw new InsufficientStockError(kitItemId, kitUnits, 0);
  for (const c of components) {
    await deps.decrement(tx, kitItemId, c.componentItemId, c.quantity * kitUnits);
  }
  const ids = components.map((c) => c.componentItemId);
  await deps.recomputeForComponents(tx, ids);
  return ids;
}

/**
 * Manual "mark sold" of a kit (itemSaleGuard.commitItemSale, which never touches stockSold for ordinary items): counts the kit's own
 * sold unit (guarded) and takes the components. Same all-or-nothing contract as sellKitComponents.
 */
export async function commitKitSale(client: KitStockClient, kitItemId: string, deps: KitStockDeps = defaultKitStockDeps): Promise<string[]> {
  const tx = asTx(client);
  const bumped = await tx.$executeRaw`
    UPDATE "Item" SET "stockSold" = "stockSold" + 1
    WHERE "id" = ${kitItemId} AND "stockSold" + 1 <= COALESCE("stockTotal", 1)
  `;
  if (bumped === 0) throw new InsufficientStockError(kitItemId, 1, 0);
  return sellKitComponents(tx, kitItemId, 1, deps);
}

/** Undo for the non-transactional sellItemUnits path when the component step failed after the kit's own counter had committed. */
export async function undoKitCounter(client: KitStockClient, kitItemId: string, kitUnits: number): Promise<void> {
  const tx = asTx(client);
  await tx.$executeRaw`
    UPDATE "Item"
    SET "stockSold" = GREATEST("stockSold" - ${kitUnits}, 0),
        "status" = CASE WHEN "status" = 'SOLD' THEN 'AVAILABLE' ELSE "status" END
    WHERE "id" = ${kitItemId}
  `;
  await recomputeKitStock(tx, [kitItemId]);
}

/**
 * Refund: gives `kitUnits` kits' worth of stock back to every component, then recomputes every kit that shares one (including this
 * one). The kit's OWN stockSold is returned by the existing refund code; this only restocks the components.
 */
export async function restockKitComponents(
  client: KitStockClient,
  kitItemId: string,
  kitUnits: number,
  deps: KitStockDeps = defaultKitStockDeps
): Promise<string[]> {
  if (!Number.isInteger(kitUnits) || kitUnits < 1) {
    throw new Error(`restockKitComponents: kitUnits must be a positive integer, got ${kitUnits}`);
  }
  const tx = asTx(client);
  const components = await deps.loadComponents(tx, kitItemId);
  for (const c of components) {
    await deps.increment(tx, c.componentItemId, c.quantity * kitUnits);
  }
  const ids = components.map((c) => c.componentItemId);
  await deps.recomputeForComponents(tx, ids);
  return ids;
}

/** Refund helper: restocks the components when `itemId` is a kit; a no-op (one cheap read) for every other item. */
export async function restockKitIfKit(client: KitStockClient, itemId: string, kitUnits = 1, deps: KitStockDeps = defaultKitStockDeps): Promise<boolean> {
  // Defensive: a refund-path test double without item.findUnique is "not a kit", never a crash inside a refund transaction.
  if (typeof (client as { item?: { findUnique?: unknown } }).item?.findUnique !== 'function') return false;
  const row = await asTx(client).item.findUnique({ where: { id: itemId }, select: { listingType: true } });
  if (!row || row.listingType !== KIT_LISTING_TYPE) return false;
  await restockKitComponents(client, itemId, kitUnits, deps);
  // 2026-10-13: a refunded kit puts stock back on the kit and its components: re-push both to every market after the refund commits.
  scheduleKitRelatedStockSync(itemId, 'kit', 'kit refund');
  return true;
}
