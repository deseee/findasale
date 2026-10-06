/**
 * Static guards for bulk lot packs (ADR-136 Addendum E, roadmap #659). Reads source text and migration folders only: no database,
 * no network, nothing is executed.
 *
 * WHAT THIS PROVES
 *   - the pack purchase path that writes a PAID Purchase for a logged in buyer reaches fireSquarePurchaseEngagement (the existing
 *     engagement wiring audit only watches the older files), and squarePaymentController keeps its own two calls
 *   - createSquarePayment hands a pack lot to the pack handler only with the feature flag on, and BEFORE the old bulk lot refusal,
 *     while the refusal itself is still there for every lot with no pack size
 *   - the cart checkout still refuses lots (it gets the pack aware message, never a pack sale)
 *   - the pack controller never reads a price, an amount or a card count from the request body: the charge is the server plan
 *   - the new migration is additive and idempotent, and sorts after every migration folder that creates or alters "ItemBulkLot"
 *   - no em dash, no exclamation mark and none of the banned words in the shopper and vendor facing pack source files
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const REPO = path.resolve(SRC, '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');
const countCalls = (text: string): number => (text.match(/fireSquarePurchaseEngagement\(/g) || []).length;

describe('engagement and routing wiring', () => {
  it('the pack controller fires purchase engagement for a logged in buyer only', () => {
    const src = read('controllers/bulkLotPackPaymentController.ts');
    expect(countCalls(src)).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/if \(req\.user\) fireSquarePurchaseEngagement\(purchase\.id\)/);
  });

  it('squarePaymentController keeps its own engagement calls', () => {
    expect(countCalls(read('controllers/squarePaymentController.ts'))).toBeGreaterThanOrEqual(2);
  });

  it('createSquarePayment delegates a pack lot behind the flag and before the old refusal', () => {
    const src = read('controllers/squarePaymentController.ts');
    const single = src.slice(src.indexOf('export const createSquarePayment'), src.indexOf('export const createSquareCartPayment'));
    const hook = single.indexOf('tryHandleBulkPackPayment(req, res)');
    const refusal = single.indexOf('bulkChannelRefusal(');
    expect(hook).toBeGreaterThan(0);
    expect(refusal).toBeGreaterThan(hook);
    expect(single.slice(Math.max(0, hook - 80), hook)).toContain('isBulkLotsEnabled()');
  });

  it('the cart checkout still refuses a lot and never sells a pack', () => {
    const src = read('controllers/squarePaymentController.ts');
    const cart = src.slice(src.indexOf('export const createSquareCartPayment'));
    expect(cart).toContain('bulkChannelRefusal(');
    expect(cart).toContain('BULK_PACK_CART_UNSUPPORTED');
    expect(cart).not.toContain('tryHandleBulkPackPayment');
  });

  it('the pack controller prices from the server plan, not from the request body', () => {
    const src = read('controllers/bulkLotPackPaymentController.ts');
    expect(src).not.toMatch(/body\.(price|amount|amountCents|cents|cards|totalCents)\b/);
    expect(src).not.toMatch(/req\.body\??\.(price|amount|amountCents|cents|cards|totalCents)\b/);
    // the only client number that is read is the total the page DISPLAYED, and it is only compared
    expect(src).toContain('planPackLine(item, packSize, packsRaw, expectedAmount)');
    expect(src).toMatch(/amountCents: plan\.cents|cents: plan\.cents/);
  });

  it('the pack controller does not ship, discount or add a buyer premium', () => {
    const src = read('controllers/bulkLotPackPaymentController.ts');
    expect(src).toContain('assertPackSellableOnline');
    expect(src).not.toContain('repriceNativeShippingForDestination');
    expect(src).not.toContain('prisma.coupon');
  });

  it('hub cart pack lines go through the planner, and free quantity on a pack lot is refused', () => {
    const src = read('controllers/vendorBoothCartController.ts');
    expect(src).toContain('toCartLotRequests(');
    expect(src).toContain('assertLotLinesMatchPacks(');
    expect(src).toContain('packLines');
  });
});

describe('the pack size migration', () => {
  const MIGRATIONS = path.join(REPO, 'packages', 'database', 'prisma', 'migrations');
  const NAME = '20261008000000_bulk_lot_pack_size';
  const sql = fs.readFileSync(path.join(MIGRATIONS, NAME, 'migration.sql'), 'utf8');
  const folders = fs.readdirSync(MIGRATIONS).filter((f) => fs.statSync(path.join(MIGRATIONS, f)).isDirectory()).sort();

  it('is additive and idempotent', () => {
    const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(body).toContain('ADD COLUMN IF NOT EXISTS "packSize" INTEGER');
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bTRUNCATE\b/i);
    expect(body).not.toMatch(/NOT NULL/i);
    expect(body).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/);
    expect(body).toContain('"packSize" >= 100 AND "packSize" <= 5000');
    expect(sql).toContain('ROLLBACK');
  });

  it('sorts after every folder that creates or alters ItemBulkLot, and after the one that creates it', () => {
    const mine = folders.indexOf(NAME);
    expect(mine).toBeGreaterThan(-1);
    let createdAt = -1;
    folders.forEach((f, i) => {
      if (f === NAME) return;
      const text = fs.readFileSync(path.join(MIGRATIONS, f, 'migration.sql'), 'utf8');
      const code = text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      if (/CREATE TABLE (IF NOT EXISTS )?"ItemBulkLot"\s*\(/.test(code)) createdAt = i;
      if (/ALTER TABLE "ItemBulkLot"\s/.test(code)) expect(i).toBeLessThan(mine);
    });
    expect(createdAt).toBeGreaterThan(-1);
    expect(createdAt).toBeLessThan(mine);
  });

  it('the schema declares the column the migration adds', () => {
    const schema = fs.readFileSync(path.join(REPO, 'packages', 'database', 'prisma', 'schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model ItemBulkLot {'), schema.indexOf('}', schema.indexOf('model ItemBulkLot {')));
    expect(model).toMatch(/packSize\s+Int\?/);
  });
});

describe('copy in the pack source files', () => {
  const FILES = ['services/bulkLot/bulkLotPacks.ts', 'services/bulkLot/bulkLotPackService.ts', 'services/bulkLot/bulkLotPackCheckout.ts', 'controllers/bulkLotPackPaymentController.ts'];
  it.each(FILES)('%s has no em dash, no banned word', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/[—–]/);
    expect(src).not.toMatch(/\bAI\b/);
    expect(src.toLowerCase()).not.toContain('estate sale');
  });

  it('the shopper facing strings in the pack controller have no exclamation mark', () => {
    const src = read('controllers/bulkLotPackPaymentController.ts');
    const strings = src.match(/(['`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || [];
    for (const s of strings) expect(s).not.toMatch(/!(?!=)/);
  });
});
