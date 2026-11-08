/**
 * The ONLY writers of Item.restrictedClass* (2026-11-06). Raw SQL on purpose: lib/prisma.ts strips these columns from
 * every Prisma write (itemWriteHooks.ts), so no request handler can set them, even by accident.
 *
 * Every classification write is COMPARE-AND-SET on the classifier inputs: it only lands when title / description /
 * category / ebayCategoryName / tags / brand are still exactly what was classified. A concurrent edit therefore never
 * gets a stale class stamped as fresh; the edit's own trigger already marked the row stale and it is reclassified again.
 *
 * Audit: the database trigger "Item_restricted_class_audit" writes a RestrictedItemAuditLog row for every change of
 * restrictedClass or restrictedClassOverride, in the same transaction. Admin overrides additionally write an
 * ADMIN_OVERRIDE row here with the reason.
 */
import {
  applyAutoRatchet,
  classifyRestrictedItem,
  effectiveRestrictedClass,
  isRestrictedItemClassName,
  RESTRICTED_CLASSIFIER_VERSION,
  type RestrictedItemClassName,
} from './restrictedItemClassifier';

/** Minimal client shape: the base PrismaClient, the extended one, or a transaction client. */
export interface RawSqlClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<number>;
}

export interface ItemClassificationRow {
  id: string;
  organizerId: string | null;
  saleOrganizerId: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  ebayCategoryName: string | null;
  tags: string[] | null;
  brand: string | null;
  restrictedClass: string | null;
  restrictedClassOverride: string | null;
  restrictedClassifiedAt: Date | null;
  restrictedClassifierVersion: string | null;
}

/** Reads the classification state of up to 500 items straight from the database (no cache, no client data). */
export async function readItemClassificationRows(db: RawSqlClient, itemIds: readonly string[]): Promise<ItemClassificationRow[]> {
  const ids = Array.from(new Set(itemIds.filter((id) => typeof id === 'string' && id.length > 0))).slice(0, 500);
  if (ids.length === 0) return [];
  return db.$queryRaw<ItemClassificationRow[]>`
    SELECT i."id", i."organizerId", s."organizerId" AS "saleOrganizerId",
           i."title", i."description", i."category", i."ebayCategoryName", i."tags", i."brand",
           i."restrictedClass"::text AS "restrictedClass",
           i."restrictedClassOverride"::text AS "restrictedClassOverride",
           i."restrictedClassifiedAt", i."restrictedClassifierVersion"
    FROM "Item" i
    LEFT JOIN "Sale" s ON s."id" = i."saleId"
    WHERE i."id" = ANY(${ids}::text[])
  `;
}

export function isStale(row: Pick<ItemClassificationRow, 'restrictedClassifiedAt' | 'restrictedClassifierVersion'>): boolean {
  return !row.restrictedClassifiedAt || row.restrictedClassifierVersion !== RESTRICTED_CLASSIFIER_VERSION;
}

export interface ReclassifyOutcome {
  itemId: string;
  /** The ratcheted stored class after this pass (what the gate must use when no override is set). */
  storedClass: RestrictedItemClassName;
  effectiveClass: RestrictedItemClassName;
  persisted: boolean;
}

/**
 * Classifies one row in memory and persists it compare-and-set. Returns the class to use NOW even when the CAS lost (a
 * concurrent edit): the in-memory result from the inputs just read, ratcheted against the stored class.
 */
export async function reclassifyRow(db: RawSqlClient, row: ItemClassificationRow, source: string): Promise<ReclassifyOutcome> {
  const auto = classifyRestrictedItem({
    title: row.title,
    description: row.description,
    category: row.category,
    ebayCategoryName: row.ebayCategoryName,
    tags: row.tags,
    brand: row.brand,
  }).restrictedClass;
  const stored = applyAutoRatchet(isRestrictedItemClassName(row.restrictedClass) ? row.restrictedClass : 'NONE', auto);
  const tags = row.tags ?? [];
  const updated = await db.$executeRaw`
    UPDATE "Item" SET
      "restrictedClass" = ${stored}::"RestrictedItemClass",
      "restrictedClassAuto" = ${auto}::"RestrictedItemClass",
      "restrictedClassSource" = ${source},
      "restrictedClassActorId" = NULL,
      "restrictedClassifiedAt" = NOW(),
      "restrictedClassifierVersion" = ${RESTRICTED_CLASSIFIER_VERSION}
    WHERE "id" = ${row.id}
      AND "title" IS NOT DISTINCT FROM ${row.title}
      AND "description" IS NOT DISTINCT FROM ${row.description}
      AND "category" IS NOT DISTINCT FROM ${row.category}
      AND "ebayCategoryName" IS NOT DISTINCT FROM ${row.ebayCategoryName}
      AND "brand" IS NOT DISTINCT FROM ${row.brand}
      AND "tags" IS NOT DISTINCT FROM ${tags}::text[]
  `;
  const override = isRestrictedItemClassName(row.restrictedClassOverride) ? row.restrictedClassOverride : null;
  return { itemId: row.id, storedClass: stored, effectiveClass: effectiveRestrictedClass(stored, override), persisted: updated > 0 };
}

/** Reclassifies the given items (all of them, stale or not). Used after updates and by the backfill script. */
export async function reclassifyItemsById(db: RawSqlClient, itemIds: readonly string[], source: string): Promise<ReclassifyOutcome[]> {
  const out: ReclassifyOutcome[] = [];
  for (let i = 0; i < itemIds.length; i += 500) {
    const rows = await readItemClassificationRows(db, itemIds.slice(i, i + 500));
    for (const row of rows) out.push(await reclassifyRow(db, row, source));
  }
  return out;
}

/** Admin override: may raise a class or clear it to NONE; `null` removes the override. Audited with the reason. */
export async function setRestrictedClassOverride(
  db: RawSqlClient,
  params: { itemId: string; override: RestrictedItemClassName | null; reason: string; adminUserId: string },
): Promise<{ found: boolean; previousEffective: RestrictedItemClassName | null; newEffective: RestrictedItemClassName | null }> {
  const rows = await readItemClassificationRows(db, [params.itemId]);
  const row = rows[0];
  if (!row) return { found: false, previousEffective: null, newEffective: null };
  const stored: RestrictedItemClassName = isRestrictedItemClassName(row.restrictedClass) ? row.restrictedClass : 'NONE';
  const prevOverride = isRestrictedItemClassName(row.restrictedClassOverride) ? row.restrictedClassOverride : null;
  const previousEffective = effectiveRestrictedClass(stored, prevOverride);
  const newEffective = effectiveRestrictedClass(stored, params.override);
  const reason = params.reason.slice(0, 500);
  if (params.override === null) {
    await db.$executeRaw`
      UPDATE "Item" SET "restrictedClassOverride" = NULL, "restrictedClassOverrideReason" = ${reason},
        "restrictedClassOverrideById" = ${params.adminUserId}, "restrictedClassOverrideAt" = NOW(),
        "restrictedClassSource" = 'ADMIN_OVERRIDE', "restrictedClassActorId" = ${params.adminUserId}
      WHERE "id" = ${params.itemId}
    `;
  } else {
    await db.$executeRaw`
      UPDATE "Item" SET "restrictedClassOverride" = ${params.override}::"RestrictedItemClass",
        "restrictedClassOverrideReason" = ${reason}, "restrictedClassOverrideById" = ${params.adminUserId},
        "restrictedClassOverrideAt" = NOW(), "restrictedClassSource" = 'ADMIN_OVERRIDE',
        "restrictedClassActorId" = ${params.adminUserId}
      WHERE "id" = ${params.itemId}
    `;
  }
  await db.$executeRaw`
    INSERT INTO "RestrictedItemAuditLog" ("kind", "itemId", "organizerId", "oldClass", "newClass", "source", "actorUserId", "detail")
    VALUES ('ADMIN_OVERRIDE', ${params.itemId}, ${row.organizerId ?? row.saleOrganizerId}, ${previousEffective}, ${newEffective},
            'ADMIN_OVERRIDE', ${params.adminUserId},
            ${JSON.stringify({ override: params.override, reason })}::jsonb)
  `;
  return { found: true, previousEffective, newEffective };
}
