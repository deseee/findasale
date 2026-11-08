/**
 * Unique-constraint (Prisma P2002) helpers for idempotent writers (2026-11-05, schema review #2/#9).
 *
 * Purchase rows are protected by partial unique indexes created in raw SQL (Prisma 5 cannot declare a partial index):
 *   Purchase_stripePaymentIntentId_itemId_unique  (stripePaymentIntentId, itemId) WHERE stripePaymentIntentId IS NOT NULL
 *   Purchase_squarePaymentId_itemId_unique         (squarePaymentId, itemId)       WHERE squarePaymentId IS NOT NULL
 *   Purchase_clientTransactionId_itemId_unique     (clientTransactionId, itemId)   WHERE clientTransactionId IS NOT NULL
 * A P2002 from one of them means "this payment line is already recorded", never a reason to answer 500.
 *
 * IMPORTANT inside an interactive $transaction: a unique violation aborts the Postgres transaction, so it can NOT be
 * caught and skipped inside the callback (every later statement fails with 25P02). Let it escape the transaction and
 * handle it in the caller's catch around $transaction.
 */

const PURCHASE_KEY_COLUMNS = ['stripePaymentIntentId', 'squarePaymentId', 'clientTransactionId'];

function p2002Meta(err: unknown): { modelName?: string; targetText: string } | null {
  if (!err || typeof err !== 'object' || (err as { code?: unknown }).code !== 'P2002') return null;
  const meta = (err as { meta?: { modelName?: unknown; target?: unknown } }).meta;
  const target = meta?.target;
  const targetText = Array.isArray(target) ? target.map(String).join(',') : typeof target === 'string' ? target : '';
  return { modelName: typeof meta?.modelName === 'string' ? meta.modelName : undefined, targetText };
}

/**
 * True for a Prisma unique-constraint violation (P2002). With `columns`, it must also name at least one of them
 * (as a field in meta.target, or inside the index name Prisma reports when it cannot map the fields).
 */
export function isUniqueViolation(err: unknown, columns?: string[]): boolean {
  const info = p2002Meta(err);
  if (!info) return false;
  if (!columns || columns.length === 0) return true;
  return columns.some((c) => info.targetText.includes(c));
}

/**
 * True when a P2002 came from one of Purchase's idempotency keys (see header). Use it where the failing statement
 * may not be the Purchase insert (e.g. the catch around a $transaction that also writes other tables).
 */
export function isPurchaseKeyViolation(err: unknown): boolean {
  const info = p2002Meta(err);
  if (!info) return false;
  if (info.modelName && info.modelName !== 'Purchase') return false;
  if (info.modelName === 'Purchase') return true;
  return PURCHASE_KEY_COLUMNS.some((c) => info.targetText.includes(c));
}

/**
 * Runs `create`; on a unique violation re-reads the row that won with `findExisting` and returns it with
 * created=false. Any other error, or a violation whose winning row cannot be found, is re-thrown.
 * Only for a create that runs OUTSIDE an interactive transaction (see header).
 */
export async function createOrFindExisting<T>(
  create: () => Promise<T>,
  findExisting: () => Promise<T | null>,
  columns?: string[]
): Promise<{ row: T; created: boolean }> {
  try {
    return { row: await create(), created: true };
  } catch (err) {
    if (!isUniqueViolation(err, columns)) throw err;
    const existing = await findExisting();
    if (!existing) throw err;
    return { row: existing, created: false };
  }
}
