/**
 * Card payment gate (2026-11-06): DB re-read, stale reclassification, organizer suspension, mixed split, 99-cent rule,
 * cross-organizer items, audit rows. The database is faked at the raw-SQL boundary (RawSqlClient), so these tests assert
 * exactly what the gate reads and writes.
 */
jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import { assertCardAllowedForItems, cardGateResponseBody, decideCardSplit, type AuditRow, type GateDeps } from '../cardPaymentGate';
import { RESTRICTED_CLASSIFIER_VERSION } from '../restrictedItemClassifier';
import type { ItemClassificationRow } from '../restrictedClassStore';

const ORG = 'org-1';

function row(over: Partial<ItemClassificationRow> & { id: string }): ItemClassificationRow {
  return {
    organizerId: ORG,
    saleOrganizerId: ORG,
    title: 'Lamp',
    description: null,
    category: null,
    ebayCategoryName: null,
    tags: [],
    brand: null,
    restrictedClass: 'NONE',
    restrictedClassOverride: null,
    restrictedClassifiedAt: new Date('2026-11-06T00:00:00Z'),
    restrictedClassifierVersion: RESTRICTED_CLASSIFIER_VERSION,
    ...over,
  };
}

function fakeDeps(rows: ItemClassificationRow[], opts: { suspended?: boolean; organizerExists?: boolean } = {}) {
  const audits: AuditRow[] = [];
  const executed: unknown[][] = [];
  const queried: unknown[][] = [];
  const deps: GateDeps = {
    db: {
      $queryRaw: (async (_q: TemplateStringsArray, ...values: any[]) => {
        queried.push(values);
        const ids: string[] = values[0];
        return rows.filter((r) => ids.includes(r.id));
      }) as any,
      $executeRaw: (async (_q: TemplateStringsArray, ...values: any[]) => {
        executed.push(values);
        return 1;
      }) as any,
    },
    audit: async (r) => {
      audits.push(r);
    },
    readSuspension: async () => ({
      exists: opts.organizerExists !== false,
      suspendedAt: opts.suspended ? new Date() : null,
    }),
  };
  return { deps, audits, executed, queried };
}

const ctx = { path: 'test.path', buyerUserId: 'buyer-1', sessionRef: 'cart-1' };

describe('assertCardAllowedForItems', () => {
  it('re-reads classes from the database, never from the caller', async () => {
    const { deps, queried } = fakeDeps([row({ id: 'k', restrictedClass: 'KNIFE' })]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'k', amountCents: 2000 }], ORG, ctx, deps);
    expect(queried[0][0]).toEqual(['k']);
    expect(d.allCash).toBe(true);
    expect(d.blocked[0]).toMatchObject({ itemId: 'k', restrictedClass: 'KNIFE', reason: 'RESTRICTED_CLASS' });
  });

  it('Square blocks nothing today: a knife is card-allowed', async () => {
    const { deps, audits } = fakeDeps([row({ id: 'k', restrictedClass: 'KNIFE' })]);
    const d = await assertCardAllowedForItems('SQUARE', [{ itemId: 'k', amountCents: 2000 }], ORG, ctx, deps);
    expect(d.allCardAllowed).toBe(true);
    expect(d.cardAmountCents).toBe(2000);
    expect(audits).toHaveLength(0);
  });

  it('reclassifies a stale row (inputs changed since classification) before deciding, and persists it', async () => {
    const stale = row({ id: 's', title: 'Hunting Knife', restrictedClass: 'NONE', restrictedClassifiedAt: null });
    const { deps, executed } = fakeDeps([stale]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 's', amountCents: 1500 }], ORG, ctx, deps);
    expect(d.blocked[0]).toMatchObject({ restrictedClass: 'KNIFE' });
    expect(executed.length).toBe(1);
    expect(executed[0]).toContain('GATE');
  });

  it('reclassifies a row from an older classifier version', async () => {
    const old = row({ id: 'o', title: 'Pearl Necklace', restrictedClass: 'NONE', restrictedClassifierVersion: 'rk-0' });
    const { deps } = fakeDeps([old]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'o', amountCents: 1500 }], ORG, ctx, deps);
    expect(d.blocked[0].restrictedClass).toBe('JEWELRY');
  });

  it('the ratchet holds at payment time: renaming a knife does not unblock it', async () => {
    const renamed = row({ id: 'r', title: 'Kitchen Tool', restrictedClass: 'KNIFE', restrictedClassifiedAt: null });
    const { deps } = fakeDeps([renamed]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'r', amountCents: 1500 }], ORG, ctx, deps);
    expect(d.blocked[0].restrictedClass).toBe('KNIFE');
  });

  it('an admin override clears the class', async () => {
    const { deps } = fakeDeps([row({ id: 'k', restrictedClass: 'KNIFE', restrictedClassOverride: 'NONE' })]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'k', amountCents: 1500 }], ORG, ctx, deps);
    expect(d.allCardAllowed).toBe(true);
  });

  it('an organizer card suspension blocks every line on every processor, including lines with no item', async () => {
    const { deps, audits } = fakeDeps([row({ id: 'a' })], { suspended: true });
    const d = await assertCardAllowedForItems('SQUARE', [{ itemId: 'a', amountCents: 1000 }, { itemId: null, amountCents: 500 }], ORG, ctx, deps);
    expect(d.organizerCardSuspended).toBe(true);
    expect(d.allCash).toBe(true);
    expect(d.cashAmountCents).toBe(1500);
    expect(d.blocked.map((b) => b.reason)).toEqual(['ORGANIZER_CARD_SUSPENDED', 'ORGANIZER_CARD_SUSPENDED']);
    expect(audits[0].kind).toBe('PAYMENT_BLOCK');
  });

  it('an unknown organizer fails closed', async () => {
    const { deps } = fakeDeps([row({ id: 'a' })], { organizerExists: false });
    const d = await assertCardAllowedForItems('SQUARE', [{ itemId: 'a', amountCents: 1000 }], ORG, ctx, deps);
    expect(d.allCash).toBe(true);
  });

  it('fails closed on a missing item and on another organizer\'s item (cross-tenant)', async () => {
    const { deps } = fakeDeps([row({ id: 'theirs', organizerId: 'org-2', saleOrganizerId: 'org-2' })]);
    const d = await assertCardAllowedForItems(
      'SQUARE',
      [{ itemId: 'theirs', amountCents: 1000 }, { itemId: 'ghost', amountCents: 1000 }],
      ORG,
      ctx,
      deps,
    );
    expect(d.blocked.map((b) => b.reason).sort()).toEqual(['ITEM_NOT_FOUND', 'ITEM_NOT_ORGANIZER']);
  });

  it('the sale organizer wins over a stale denormalized Item.organizerId', async () => {
    const { deps } = fakeDeps([row({ id: 'x', organizerId: ORG, saleOrganizerId: 'org-2' })]);
    const d = await assertCardAllowedForItems('SQUARE', [{ itemId: 'x', amountCents: 1000 }], ORG, ctx, deps);
    expect(d.blocked[0].reason).toBe('ITEM_NOT_ORGANIZER');
  });

  it('mixed cart: card only for allowed items, blocked items as cash, audit PAYMENT_SPLIT without card data', async () => {
    const { deps, audits } = fakeDeps([row({ id: 'lamp' }), row({ id: 'ring', restrictedClass: 'JEWELRY' })]);
    const d = await assertCardAllowedForItems(
      'FINIX',
      [{ itemId: 'lamp', amountCents: 2500 }, { itemId: 'ring', amountCents: 4000 }],
      ORG,
      ctx,
      deps,
    );
    expect(d.allCardAllowed).toBe(false);
    expect(d.allCash).toBe(false);
    expect(d.cardAmountCents).toBe(2500);
    expect(d.cashAmountCents).toBe(4000);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: 'PAYMENT_SPLIT',
      processor: 'FINIX',
      itemIds: ['ring'],
      classes: ['JEWELRY'],
      buyerUserId: 'buyer-1',
      sessionRef: 'cart-1',
      cardAmountCents: 2500,
      cashAmountCents: 4000,
    });
    expect(JSON.stringify(audits[0])).not.toMatch(/cnon|sourceId|token|fingerprint/i);
  });

  it('99-cent rule: a card portion under $0.99 sends the whole cart to cash', async () => {
    const { deps, audits } = fakeDeps([row({ id: 'sticker' }), row({ id: 'coin', restrictedClass: 'COIN_BULLION_PRECIOUS_METAL' })]);
    const d = await assertCardAllowedForItems(
      'FINIX',
      [{ itemId: 'sticker', amountCents: 98 }, { itemId: 'coin', amountCents: 3000 }],
      ORG,
      ctx,
      deps,
    );
    expect(d.allCash).toBe(true);
    expect(d.cardAmountCents).toBe(0);
    expect(d.cashAmountCents).toBe(3098);
    expect(d.blocked.find((b) => b.itemId === 'sticker')?.reason).toBe('CARD_PORTION_BELOW_MINIMUM');
    expect(audits[0].kind).toBe('PAYMENT_BLOCK');
  });

  it('99-cent rule boundary: exactly $0.99 stays on the card', async () => {
    const { deps } = fakeDeps([row({ id: 'a' }), row({ id: 'k', restrictedClass: 'KNIFE' })]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'a', amountCents: 99 }, { itemId: 'k', amountCents: 500 }], ORG, ctx, deps);
    expect(d.cardAmountCents).toBe(99);
    expect(d.cashAmountCents).toBe(500);
  });

  it('a fully allowed small cart is left to the caller\'s own minimum check', () => {
    const d = decideCardSplit({
      processor: 'FINIX',
      organizerId: ORG,
      organizerCardSuspended: false,
      lines: [{ itemId: 'a', amountCents: 50 }],
      classes: new Map([['a', { cls: 'NONE', reason: null }]]),
    });
    expect(d.allCardAllowed).toBe(true);
    expect(d.cardAmountCents).toBe(50);
  });

  it('an audit failure never opens the card path', async () => {
    const { deps } = fakeDeps([row({ id: 'k', restrictedClass: 'KNIFE' })]);
    deps.audit = async () => {
      throw new Error('db down');
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'k', amountCents: 1000 }], ORG, ctx, deps);
    expect(d.allCash).toBe(true);
    spy.mockRestore();
  });

  it('response body: 409-shaped split the frontend can show', async () => {
    const { deps } = fakeDeps([row({ id: 'lamp' }), row({ id: 'gun', restrictedClass: 'FIREARM_RELATED' })]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'lamp', amountCents: 1000 }, { itemId: 'gun', amountCents: 5000 }], ORG, ctx, deps);
    const body = cardGateResponseBody(d);
    expect(body.code).toBe('CARD_PAYMENT_BLOCKED');
    expect(body.split.allowedItems).toEqual([{ itemId: 'lamp', amountCents: 1000 }]);
    expect(body.split.blockedItems).toEqual([{ itemId: 'gun', amountCents: 5000, restrictedClass: 'FIREARM_RELATED', reason: 'RESTRICTED_CLASS' }]);
    expect(body.split.cardAmountCents).toBe(1000);
    expect(body.split.cashAmountCents).toBe(5000);
  });

  it('a client-supplied class or processor has no input: the function takes neither from the request', async () => {
    // The only class source is the DB row. Passing extra junk on a line changes nothing.
    const { deps } = fakeDeps([row({ id: 'k', restrictedClass: 'KNIFE' })]);
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: 'k', amountCents: 1000, restrictedClass: 'NONE' } as any], ORG, ctx, deps);
    expect(d.allCash).toBe(true);
  });
});
