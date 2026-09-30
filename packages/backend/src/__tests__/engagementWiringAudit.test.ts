/**
 * Wiring audit (2026-09-29, engagement follow-up): every code path that turns a shopper payment into a PAID
 * Purchase row must reach services/squarePurchaseEngagementService (fireSquarePurchaseEngagement) exactly once,
 * via the shared idempotent service, or be an explicitly documented exemption. This is a static guard so a new
 * settlement path (or a refactor that drops a call) cannot silently stop awarding purchase XP / passport stamps.
 *
 * It reads source text only: no database, no network.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');
const countCalls = (text: string): number => (text.match(/fireSquarePurchaseEngagement\(/g) || []).length;

describe('purchase engagement wiring', () => {
  const WIRED: Array<{ file: string; min: number; why: string }> = [
    { file: 'controllers/squarePaymentController.ts', min: 2, why: 'single-item and cart checkout' },
    { file: 'controllers/squareWebhookController.ts', min: 2, why: 'payment link settlement and Square hold invoice' },
    { file: 'controllers/bountyController.ts', min: 1, why: 'Square bounty purchase' },
    { file: 'controllers/stripeController.ts', min: 1, why: 'Stripe bounty branch' },
    { file: 'services/holdInvoicePaymentRecorder.ts', min: 1, why: 'hold invoice paid online' },
    { file: 'jobs/purchaseExpiryJob.ts', min: 1, why: 'stranded PAID reclaim' },
    { file: 'jobs/auctionJob.ts', min: 1, why: 'auction win created PAID' },
  ];

  it.each(WIRED)('$file calls fireSquarePurchaseEngagement ($why)', ({ file, min }) => {
    expect(countCalls(read(file))).toBeGreaterThanOrEqual(min);
  });

  // Exemptions: these create PAID rows but have no verified shopper identity, or are organizer-recorded.
  it('walk-up and organizer-recorded settlement paths are documented exemptions (no shopper-linked card payment)', () => {
    // POS payment link recorder writes rows with no userId (walk-up QR buyer): nothing to award.
    const link = read('services/posPaymentLinkRecorder.ts');
    const createBlocks = link.split('tx.purchase.create(').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('});')));
    expect(createBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of createBlocks) expect(block).not.toMatch(/\buserId\b/);
    // Cash POS and booth cart rows are userId: null walk-ins.
    const cash = read('controllers/cashPaymentController.ts');
    const cashBlocks = cash.split('prisma.purchase.create(').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('});')));
    expect(cashBlocks.length).toBeGreaterThanOrEqual(1);
    for (const block of cashBlocks) expect(block).not.toMatch(/\buserId\b/);
    expect(read('controllers/vendorBoothCartController.ts')).toMatch(/userId:\s*null/);
  });

  it('the shared service only rewards a POS row that is a verified shopper card payment', () => {
    const svc = read('services/squarePurchaseEngagementService.ts');
    expect(svc).toContain('isVerifiedShopperCardPosRow');
    expect(svc).toMatch(/cash_\|sq_test_\|pos_/);
  });
});
