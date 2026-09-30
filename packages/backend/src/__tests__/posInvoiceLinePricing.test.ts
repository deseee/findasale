/**
 * services/posInvoiceLinePricing: the shared line-pricing rules behind sendHoldInvoice and
 * createPaymentLink (money review P1-6/8, 2026-09-29). resolvePosDiscount is REAL; the workspace
 * permission service and Prisma are mocked.
 */

var mockCheckPermission = jest.fn();
jest.mock('../services/workspacePermissionService', () => ({
  checkPermission: (...args: any[]) => mockCheckPermission(...args),
}));
var mockPrisma: any = { workspaceSettings: { findUnique: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
  normalizeMiscLines,
  dollarsToWholeCents,
  evaluateInvoicePricing,
  authorizeDiscountAndCheckFloor,
  catalogFloorCents,
  MAX_MISC_LINES,
} from '../services/posInvoiceLinePricing';
import { MAX_POS_AMOUNT_CENTS } from '../services/cashFeeService';

const organizer: any = { id: 'org-1', actorKind: 'ORGANIZER' };
const member: any = { id: 'org-1', actorKind: 'TEAM_MEMBER', workspaceId: 'ws-1', workspaceRole: 'CASHIER' };

beforeEach(() => {
  mockCheckPermission.mockReset();
  mockCheckPermission.mockResolvedValue(true);
  mockPrisma.workspaceSettings.findUnique.mockReset();
  mockPrisma.workspaceSettings.findUnique.mockResolvedValue(null);
});

describe('dollarsToWholeCents', () => {
  it.each([
    [12.5, 1250],
    [0.1 + 0.2, 30], // binary float noise is fine, it is still whole cents
    [-3, -300],
    [0, 0],
  ])('%p -> %p', (input, expected) => {
    expect(dollarsToWholeCents(input)).toBe(expected);
  });
  it.each([1.005, 0.001, Number.NaN, Infinity, '5', null, undefined])('%p is not whole cents', (input) => {
    expect(dollarsToWholeCents(input as any)).toBeNull();
  });
});

describe('normalizeMiscLines', () => {
  it('no lines is fine', () => {
    expect(normalizeMiscLines(undefined)).toEqual({ ok: true, lines: [] });
    expect(normalizeMiscLines(null)).toEqual({ ok: true, lines: [] });
  });
  it('normalizes titles and cents, item lines carry their itemId', () => {
    const r = normalizeMiscLines([
      { id: 'a', itemId: 'i2', title: '  Lamp  ', amount: 20 },
      { id: 'b', title: '', amount: -3.5 },
    ]);
    expect(r).toEqual({
      ok: true,
      lines: [
        { itemId: 'i2', title: 'Lamp', amountCents: 2000 },
        { itemId: null, title: 'Custom item', amountCents: -350 },
      ],
    });
  });
  it('rejects a non-array, too many lines, non-objects', () => {
    expect(normalizeMiscLines('x' as any).ok).toBe(false);
    expect(normalizeMiscLines(new Array(MAX_MISC_LINES + 1).fill({ title: 'x', amount: 1 })).ok).toBe(false);
    expect(normalizeMiscLines([null] as any).ok).toBe(false);
  });
  it('rejects fractional cents, non-finite and out-of-range amounts', () => {
    for (const amount of [1.005, Number.NaN, Infinity, (MAX_POS_AMOUNT_CENTS + 100) / 100, -(MAX_POS_AMOUNT_CENTS + 100) / 100, '5' as any]) {
      const r = normalizeMiscLines([{ title: 'x', amount }]);
      expect(r.ok).toBe(false);
    }
  });
  it('rejects a duplicate itemId, a negative item line and a bad itemId', () => {
    expect(normalizeMiscLines([{ itemId: 'i2', title: 'a', amount: 1 }, { itemId: 'i2', title: 'b', amount: 1 }]).ok).toBe(false);
    expect(normalizeMiscLines([{ itemId: 'i2', title: 'a', amount: -1 }]).ok).toBe(false);
    expect(normalizeMiscLines([{ itemId: 5 as any, title: 'a', amount: 1 }]).ok).toBe(false);
    expect(normalizeMiscLines([{ itemId: '  ', title: 'a', amount: 1 }]).ok).toBe(false);
  });
  it('rejects a title that is not text', () => {
    expect(normalizeMiscLines([{ title: { $x: 1 } as any, amount: 1 }]).ok).toBe(false);
  });
});

describe('catalogFloorCents / authorizeDiscountAndCheckFloor', () => {
  it('floor is subtotal - discount - 1', () => {
    expect(catalogFloorCents(10000, 0)).toBe(9999);
    expect(catalogFloorCents(10000, 2500)).toBe(7499);
  });
  it('passes at or above the floor and fails below it', async () => {
    const ok = await authorizeDiscountAndCheckFloor({ actor: organizer, catalogSubtotalCents: 10000, totalCents: 9999, discount: {} });
    expect(ok.ok).toBe(true);
    const bad = await authorizeDiscountAndCheckFloor({ actor: organizer, catalogSubtotalCents: 10000, totalCents: 9998, discount: {} });
    expect(bad).toMatchObject({ ok: false, status: 400, code: 'TOTAL_BELOW_CATALOG_FLOOR' });
  });
  it('an authorized percent discount lowers the floor', async () => {
    const r = await authorizeDiscountAndCheckFloor({
      actor: organizer,
      catalogSubtotalCents: 10000,
      totalCents: 7500,
      discount: { discountType: 'PERCENT', discountValue: 25 },
    });
    expect(r).toEqual({ ok: true, discountAmountCents: 2500 });
  });
  it('a team member without the permission is a 403', async () => {
    mockCheckPermission.mockResolvedValue(false);
    const r = await authorizeDiscountAndCheckFloor({
      actor: member,
      catalogSubtotalCents: 10000,
      totalCents: 7500,
      discount: { discountType: 'PERCENT', discountValue: 25 },
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
  it('a discount larger than the subtotal is refused', async () => {
    const r = await authorizeDiscountAndCheckFloor({
      actor: organizer,
      catalogSubtotalCents: 1000,
      totalCents: 0,
      discount: { discountType: 'FIXED', discountValue: 50 },
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe('evaluateInvoicePricing', () => {
  const base = { actor: organizer, heldItemCents: 10000, mergedListCents: new Map<string, number>([['i2', 8000]]) };
  const lines = (r: ReturnType<typeof normalizeMiscLines>) => (r.ok ? r.lines : []);

  it('held item alone', async () => {
    const r = await evaluateInvoicePricing({ ...base, lines: [] });
    expect(r).toEqual({ ok: true, grandTotalCents: 10000, miscTotalCents: 0, discountCents: 0, catalogSubtotalCents: 10000 });
  });

  it('extras (an ad hoc positive line, a merged item above list) add freely and need no permission', async () => {
    mockCheckPermission.mockResolvedValue(false);
    const r = await evaluateInvoicePricing({
      ...base,
      actor: member,
      lines: lines(normalizeMiscLines([{ title: 'Delivery', amount: 25 }, { itemId: 'i2', title: 'Lamp', amount: 90 }])),
    });
    expect(r).toMatchObject({ ok: true, grandTotalCents: 10000 + 2500 + 9000, discountCents: 0, catalogSubtotalCents: 18000 });
  });

  it('a merged item at list price is not a discount', async () => {
    const r = await evaluateInvoicePricing({ ...base, lines: lines(normalizeMiscLines([{ itemId: 'i2', title: 'Lamp', amount: 80 }])) });
    expect(r).toMatchObject({ ok: true, grandTotalCents: 18000, discountCents: 0 });
  });

  it('a merged item below list is a discount that needs the permission', async () => {
    const l = lines(normalizeMiscLines([{ itemId: 'i2', title: 'Lamp', amount: 50 }]));
    const allowed = await evaluateInvoicePricing({ ...base, lines: l });
    expect(allowed).toMatchObject({ ok: true, grandTotalCents: 15000, discountCents: 3000 });
    mockCheckPermission.mockResolvedValue(false);
    const refused = await evaluateInvoicePricing({ ...base, actor: member, lines: l });
    expect(refused).toMatchObject({ ok: false, status: 403 });
  });

  it('a negative ad hoc line is a discount that needs the permission', async () => {
    const l = lines(normalizeMiscLines([{ title: 'Discount', amount: -30 }]));
    const allowed = await evaluateInvoicePricing({ ...base, lines: l });
    expect(allowed).toMatchObject({ ok: true, grandTotalCents: 7000, discountCents: 3000 });
    mockCheckPermission.mockResolvedValue(false);
    expect(await evaluateInvoicePricing({ ...base, actor: member, lines: l })).toMatchObject({ ok: false, status: 403 });
  });

  it('respects the workspace discount cap for a team member', async () => {
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ staffDiscountCapType: 'FIXED', staffDiscountCapValue: 10 });
    const r = await evaluateInvoicePricing({ ...base, actor: member, lines: lines(normalizeMiscLines([{ title: 'Discount', amount: -30 }])) });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a total of zero or less', async () => {
    const zero = await evaluateInvoicePricing({ ...base, lines: lines(normalizeMiscLines([{ title: 'Discount', amount: -100 }])) });
    expect(zero).toMatchObject({ ok: false, status: 400, code: 'INVOICE_TOTAL_INVALID' });
    const negative = await evaluateInvoicePricing({ ...base, heldItemCents: 0, lines: lines(normalizeMiscLines([{ title: 'Discount', amount: -5 }])) });
    expect(negative).toMatchObject({ ok: false, code: 'INVOICE_TOTAL_INVALID' });
  });

  it('a free held item with no lines is not an invoice', async () => {
    const r = await evaluateInvoicePricing({ ...base, heldItemCents: 0, lines: [] });
    expect(r).toMatchObject({ ok: false, code: 'INVOICE_TOTAL_INVALID' });
  });

  it('a discount bigger than the catalog subtotal is refused even when the total stays positive', async () => {
    const r = await evaluateInvoicePricing({
      ...base,
      lines: lines(normalizeMiscLines([{ title: 'Big discount', amount: -150 }, { title: 'Fee', amount: 300 }])),
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('an item line with no verified list price is a 404 (caller must scope first)', async () => {
    const r = await evaluateInvoicePricing({ ...base, lines: lines(normalizeMiscLines([{ itemId: 'i7', title: 'Ghost', amount: 5 }])) });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('rejects a total above the POS maximum', async () => {
    const r = await evaluateInvoicePricing({ ...base, heldItemCents: MAX_POS_AMOUNT_CENTS, lines: lines(normalizeMiscLines([{ title: 'Fee', amount: 5 }])) });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
  });
});
