/**
 * Item write hooks for restricted-item classification (2026-11-06). Installed in lib/prisma.ts's single client
 * extension, so EVERY Prisma write to Item through the shared client passes through here -- all controllers, services,
 * jobs, extension import, bulk import, the tagging pipeline and kit edits (248 call sites at the time of writing; none of
 * them had to change).
 *
 *  1. NO-MASS-ASSIGNMENT: the restricted-class columns (and Organizer.cardPayments* suspension columns) are SERVER-OWNED.
 *     They are stripped from every Prisma create/update/upsert/createMany/updateMany `data`, whatever the caller passes.
 *     The only writers are the raw-SQL functions in this folder (classification, admin override, suspension).
 *  2. CREATE: the classifier runs on the incoming data and its result is injected into the SAME insert (synchronous,
 *     transaction-safe, no extra statement).
 *  3. UPDATE: when the data touches a classifier input (title, description, category, ebayCategoryName, tags, brand),
 *     the touched rows are reclassified right after the write, asynchronously (never inside the caller's transaction:
 *     waiting there could deadlock on the row lock the caller holds). The database trigger
 *     "Item_restricted_class_invalidate" already set restrictedClassifiedAt to NULL in the same statement, so until the
 *     async pass lands the row is stale, and the payment gate (cardPaymentGate.ts) reclassifies stale rows itself before
 *     deciding. Correctness never depends on this async pass.
 *  Raw-SQL Item writers ($executeRaw UPDATE "Item" ...) are covered by the same trigger + gate fallback.
 */
import { classifyRestrictedItem, RESTRICTED_CLASSIFIER_VERSION } from './restrictedItemClassifier';

export const ITEM_PROTECTED_FIELDS: readonly string[] = [
  'restrictedClass',
  'restrictedClassAuto',
  'restrictedClassSource',
  'restrictedClassActorId',
  'restrictedClassifiedAt',
  'restrictedClassifierVersion',
  'restrictedClassOverride',
  'restrictedClassOverrideReason',
  'restrictedClassOverrideById',
  'restrictedClassOverrideAt',
];

export const ORGANIZER_PROTECTED_FIELDS: readonly string[] = [
  'cardPaymentsSuspendedAt',
  'cardPaymentsSuspendedReason',
  'cardPaymentsSuspendedById',
];

export const CLASSIFIER_INPUT_FIELDS: readonly string[] = ['title', 'description', 'category', 'ebayCategoryName', 'tags', 'brand'];

type Data = Record<string, unknown>;

function isPlainObject(v: unknown): v is Data {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** Returns a shallow copy of `data` without any of `fields`. Arrays (createMany) are mapped. */
export function stripFields<T>(data: T, fields: readonly string[]): T {
  if (Array.isArray(data)) return data.map((d) => stripFields(d, fields)) as unknown as T;
  if (!isPlainObject(data)) return data;
  let copy: Data | null = null;
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(data, f)) {
      if (!copy) copy = { ...data };
      delete copy[f];
    }
  }
  return (copy ?? data) as T;
}

function scalarString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (isPlainObject(v) && typeof v.set === 'string') return v.set;
  return null;
}

function stringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (isPlainObject(v) && Array.isArray(v.set)) return (v.set as unknown[]).filter((x): x is string => typeof x === 'string');
  return null;
}

/** The classification columns for a brand-new row, computed from its create data. */
export function classificationColumnsForCreate(data: Data, now: Date = new Date()): Data {
  const result = classifyRestrictedItem({
    title: scalarString(data.title),
    description: scalarString(data.description),
    category: scalarString(data.category),
    ebayCategoryName: scalarString(data.ebayCategoryName),
    tags: stringArray(data.tags),
    brand: scalarString(data.brand),
  });
  return {
    restrictedClass: result.restrictedClass,
    restrictedClassAuto: result.restrictedClass,
    restrictedClassSource: 'CREATE',
    restrictedClassifiedAt: now,
    restrictedClassifierVersion: RESTRICTED_CLASSIFIER_VERSION,
  };
}

function withCreateClassification(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(withCreateClassification);
  if (!isPlainObject(data)) return data;
  const clean = stripFields(data, ITEM_PROTECTED_FIELDS);
  return { ...clean, ...classificationColumnsForCreate(clean) };
}

export function touchesClassifierInputs(data: unknown): boolean {
  if (!isPlainObject(data)) return false;
  return CLASSIFIER_INPUT_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(data, f));
}

export interface PreparedItemWrite {
  args: any;
  /** True when the write may have changed a classifier input on existing rows (reclassify after). */
  reclassifyAfter: boolean;
}

/**
 * Rewrites the args of one Prisma Item write. Pure: no I/O. Unknown operations pass through untouched.
 */
export function prepareItemWrite(operation: string, args: any): PreparedItemWrite {
  if (!args || typeof args !== 'object') return { args, reclassifyAfter: false };
  switch (operation) {
    case 'create':
      return { args: { ...args, data: withCreateClassification(args.data) }, reclassifyAfter: false };
    case 'createMany':
    case 'createManyAndReturn':
      return { args: { ...args, data: withCreateClassification(args.data) }, reclassifyAfter: false };
    case 'update':
    case 'updateMany': {
      const data = stripFields(args.data, ITEM_PROTECTED_FIELDS);
      return { args: { ...args, data }, reclassifyAfter: touchesClassifierInputs(data) };
    }
    case 'upsert': {
      const update = stripFields(args.update, ITEM_PROTECTED_FIELDS);
      return {
        args: { ...args, create: withCreateClassification(args.create), update },
        reclassifyAfter: touchesClassifierInputs(update),
      };
    }
    default:
      return { args, reclassifyAfter: false };
  }
}

/** Organizer writes: only the suspension columns are protected. */
export function prepareOrganizerWrite(operation: string, args: any): any {
  if (!args || typeof args !== 'object') return args;
  switch (operation) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
    case 'update':
    case 'updateMany':
      return { ...args, data: stripFields(args.data, ORGANIZER_PROTECTED_FIELDS) };
    case 'upsert':
      return {
        ...args,
        create: stripFields(args.create, ORGANIZER_PROTECTED_FIELDS),
        update: stripFields(args.update, ORGANIZER_PROTECTED_FIELDS),
      };
    default:
      return args;
  }
}
