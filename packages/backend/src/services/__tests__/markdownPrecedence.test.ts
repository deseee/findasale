/**
 * Markdown precedence helpers (2026-11-04). The default FIRST_WINS fragments must be exactly the 2026-10-30 filters.
 */
import {
  CYCLE_UNTOUCHED_GUARD,
  DEFAULT_MARKDOWN_PRECEDENCE,
  MARKDOWN_PRECEDENCE_VALUES,
  cycleItemSelection,
  cycleWriteLock,
  effectiveMarkdownPrecedence,
  isCycleClaim,
  isMarkdownPrecedence,
  loadMarkdownPrecedences,
  saleTierSelection,
  saleTierTakeover,
} from '../markdownPrecedence';

describe('markdown precedence values', () => {
  it('has exactly three values and FIRST_WINS is the default', () => {
    expect(MARKDOWN_PRECEDENCE_VALUES).toEqual(['FIRST_WINS', 'SALE_TIERS_WIN', 'CYCLES_WIN']);
    expect(DEFAULT_MARKDOWN_PRECEDENCE).toBe('FIRST_WINS');
  });

  it.each([['FIRST_WINS'], ['SALE_TIERS_WIN'], ['CYCLES_WIN']])('accepts %s', (v) => {
    expect(isMarkdownPrecedence(v)).toBe(true);
  });

  it.each([[undefined], [null], [''], ['first_wins'], ['CYCLE_WINS'], [1], [{}], [['CYCLES_WIN']]])('rejects %p', (v) => {
    expect(isMarkdownPrecedence(v)).toBe(false);
  });

  it('only PRO/TEAMS get a non-default effective mode', () => {
    expect(effectiveMarkdownPrecedence('CYCLES_WIN', 'PRO')).toBe('CYCLES_WIN');
    expect(effectiveMarkdownPrecedence('SALE_TIERS_WIN', 'TEAMS')).toBe('SALE_TIERS_WIN');
    expect(effectiveMarkdownPrecedence('CYCLES_WIN', 'SIMPLE')).toBe('FIRST_WINS');
    expect(effectiveMarkdownPrecedence('CYCLES_WIN', null)).toBe('FIRST_WINS');
    expect(effectiveMarkdownPrecedence('BOGUS', 'PRO')).toBe('FIRST_WINS');
    expect(effectiveMarkdownPrecedence(undefined, 'PRO')).toBe('FIRST_WINS');
  });
});

describe('sale Day-2/Day-3 selection (markdownCron)', () => {
  const sale = { id: 'sale_1', organizerId: 'org_1' };

  it('FIRST_WINS is exactly the 2026-10-30 guard, with or without running cycles', () => {
    const expected = { skipSale: false, where: { OR: [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }] } };
    expect(saleTierSelection('FIRST_WINS', sale)).toEqual(expected);
    expect(saleTierSelection('FIRST_WINS', sale, [{ organizerId: 'org_1', saleId: null }, { organizerId: 'org_1', saleId: 'sale_1' }])).toEqual(expected);
    expect(saleTierTakeover('FIRST_WINS', { markdownStepIndexApplied: 2 })).toEqual({ where: {}, data: {} });
  });

  it('SALE_TIERS_WIN drops the cycle guard and a takeover clears the step pointer under a pinned lock', () => {
    expect(saleTierSelection('SALE_TIERS_WIN', sale, [{ organizerId: 'org_1', saleId: 'sale_1' }])).toEqual({ skipSale: false, where: {} });
    expect(saleTierTakeover('SALE_TIERS_WIN', { markdownStepIndexApplied: 2 })).toEqual({
      where: { markdownStepIndexApplied: 2 },
      data: { markdownStepIndexApplied: null },
    });
    // Untouched by a cycle: pinned to null, nothing to clear.
    expect(saleTierTakeover('SALE_TIERS_WIN', { markdownStepIndexApplied: null })).toEqual({ where: { markdownStepIndexApplied: null }, data: {} });
    expect(saleTierTakeover('SALE_TIERS_WIN', { markdownStepIndexApplied: 0 })).toEqual({ where: { markdownStepIndexApplied: 0 }, data: {} });
  });

  it('CYCLES_WIN skips a sale with its own running sale-scoped cycle', () => {
    expect(saleTierSelection('CYCLES_WIN', sale, [{ organizerId: 'org_1', saleId: 'sale_1' }]).skipSale).toBe(true);
  });

  it('CYCLES_WIN excludes the organizer-wide scope (items of this organizer) but keeps null-organizer items', () => {
    const sel = saleTierSelection('CYCLES_WIN', sale, [{ organizerId: 'org_1', saleId: null }]);
    expect(sel.skipSale).toBe(false);
    expect(sel.where).toEqual({
      OR: CYCLE_UNTOUCHED_GUARD,
      AND: [{ OR: [{ organizerId: null }, { organizerId: { not: 'org_1' } }] }],
    });
  });

  it('CYCLES_WIN with no running cycle in scope behaves like FIRST_WINS', () => {
    const sel = saleTierSelection('CYCLES_WIN', sale, [
      { organizerId: 'org_1', saleId: 'other_sale' },
      { organizerId: 'org_2', saleId: null },
    ]);
    expect(sel).toEqual(saleTierSelection('FIRST_WINS', sale));
  });
});

describe('cycle selection (markdownCycleCron)', () => {
  it('FIRST_WINS and SALE_TIERS_WIN keep markdownTierApplied = 0 in the query and the lock', () => {
    for (const mode of ['FIRST_WINS', 'SALE_TIERS_WIN'] as const) {
      expect(cycleItemSelection(mode)).toEqual({ markdownTierApplied: 0 });
      expect(cycleWriteLock(mode, { markdownTierApplied: 2 })).toEqual({ markdownTierApplied: 0 });
      expect(isCycleClaim(mode, { markdownTierApplied: 2 })).toBe(false);
    }
  });

  it('CYCLES_WIN drops the tier filter, pins the tier read, and flags a claim only for tiered items', () => {
    expect(cycleItemSelection('CYCLES_WIN')).toEqual({});
    expect(cycleWriteLock('CYCLES_WIN', { markdownTierApplied: 2 })).toEqual({ markdownTierApplied: 2 });
    expect(cycleWriteLock('CYCLES_WIN', { markdownTierApplied: 0 })).toEqual({ markdownTierApplied: 0 });
    expect(isCycleClaim('CYCLES_WIN', { markdownTierApplied: 1 })).toBe(true);
    expect(isCycleClaim('CYCLES_WIN', { markdownTierApplied: 0 })).toBe(false);
  });
});

describe('loadMarkdownPrecedences', () => {
  const client = (rows: any[], orgs: any[] = []) => ({
    organizerMarkdownPrecedence: { findMany: jest.fn().mockResolvedValue(rows) },
    organizer: { findMany: jest.fn().mockResolvedValue(orgs) },
  });

  it('makes no query when there are no organizer ids', async () => {
    const c = client([]);
    expect((await loadMarkdownPrecedences(c, [null, undefined, ''])).size).toBe(0);
    expect(c.organizerMarkdownPrecedence.findMany).not.toHaveBeenCalled();
  });

  it('returns only effective non-default modes (tier checked)', async () => {
    const c = client(
      [
        { organizerId: 'o_pro', precedence: 'CYCLES_WIN' },
        { organizerId: 'o_simple', precedence: 'SALE_TIERS_WIN' },
        { organizerId: 'o_bad', precedence: 'BOGUS' },
      ],
      [{ id: 'o_pro', subscriptionTier: 'PRO' }, { id: 'o_simple', subscriptionTier: 'SIMPLE' }]
    );
    const map = await loadMarkdownPrecedences(c, ['o_pro', 'o_simple', 'o_bad', 'o_pro']);
    expect(Array.from(map.entries())).toEqual([['o_pro', 'CYCLES_WIN']]);
    expect(c.organizerMarkdownPrecedence.findMany.mock.calls[0][0].where.organizerId.in.sort()).toEqual(['o_bad', 'o_pro', 'o_simple']);
  });

  it('a missing table means FIRST_WINS for everyone, silently', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = client([]);
    c.organizerMarkdownPrecedence.findMany.mockRejectedValue(Object.assign(new Error('table does not exist'), { code: 'P2021' }));
    expect((await loadMarkdownPrecedences(c, ['o1'])).size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('any other read error means FIRST_WINS for everyone, with a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = client([]);
    c.organizerMarkdownPrecedence.findMany.mockRejectedValue(new Error('connection reset'));
    expect((await loadMarkdownPrecedences(c, ['o1'])).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
