/**
 * verifyBulkLotEbayBundle.test.ts: proves the bulk lot bundle eBay verification script (ADR-136 Addendum C) is read-only,
 * makes exactly the 5 calls it documents, prints no token, and that its two comparison helpers report what they should.
 * No network, no database, no eBay call: fetch and the token helper are mocked. The script is never run live by a test.
 */

import fs from 'fs';
import path from 'path';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => decodeURIComponent(p),
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  getEbayAccessToken: async () => 'SECRET-TOKEN-123',
}));

const fetchCalls: Array<{ url: string; method: string | undefined }> = [];
let failAspects = false;

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (global as any).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    fetchCalls.push({ url: u, method: init?.method });
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
    if (u.includes('get_default_category_tree_id')) return ok({ categoryTreeId: '0', categoryTreeVersion: '131' });
    if (u.includes('get_item_aspects_for_category')) {
      if (failAspects) {
        const text = 'denied for Bearer SECRET-TOKEN-123 on token SECRET-TOKEN-123';
        return { ok: false, status: 403, text: async () => text, json: async () => ({}) };
      }
      return ok({
        aspects: [
          { localizedAspectName: 'Game', aspectConstraint: { aspectRequired: true, aspectMode: 'SELECTION_ONLY', itemToAspectCardinality: 'SINGLE' }, aspectValues: [{ localizedValue: 'Magic: The Gathering' }] },
          { localizedAspectName: 'Language', aspectConstraint: { aspectRequired: false, aspectMode: 'FREE_TEXT' }, aspectValues: [] },
          { localizedAspectName: 'Number of Cards', aspectConstraint: { aspectRequired: false, aspectMode: 'FREE_TEXT', itemToAspectCardinality: 'SINGLE' }, aspectValues: [] },
          {
            localizedAspectName: 'Card Condition',
            aspectConstraint: { aspectRequired: false, aspectMode: 'FREE_TEXT', itemToAspectCardinality: 'SINGLE' },
            aspectValues: ['Excellent', 'Lightly Played (Excellent)', 'Moderately Played (Very Good)', 'Heavily Played (Poor)', 'Damaged'].map((v) => ({ localizedValue: v })),
          },
        ],
      });
    }
    if (u.includes('get_item_condition_policies')) {
      return ok({ itemConditionPolicies: [{ categoryId: '183455', itemConditions: [{ conditionId: '1000', conditionDescription: 'New' }, { conditionId: '3000', conditionDescription: 'Used' }] }] });
    }
    const catId = /category_id=(\d+)/.exec(u)?.[1] ?? '0';
    return ok({ categorySubtreeNode: { categoryTreeNodeLevel: 3, category: { categoryId: catId, categoryName: 'Test Category' }, leafCategoryTreeNode: true } });
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('verifyBulkLotEbayBundle script is read-only', () => {
  const scriptPath = path.join(process.cwd(), 'src/scripts/verifyBulkLotEbayBundle.ts');
  const src = fs.readFileSync(scriptPath, 'utf8');

  it('the source contains no write verb and every request method is GET', () => {
    expect(src).not.toMatch(/\b(POST|PUT|DELETE|PATCH)\b/);
    const methods = Array.from(src.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g)).map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === 'GET')).toBe(true);
    expect(src).not.toMatch(/from\s+['"][^'"]*lib\/prisma['"]/);
  });

  describe('runtime behavior with a mocked eBay', () => {
    let out: string[] = [];
    let err: string[] = [];
    beforeEach(() => {
      failAspects = false;
      fetchCalls.length = 0;
      out = [];
      err = [];
      jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
      jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { err.push(a.join(' ')); });
    });
    afterEach(() => {
      (console.log as jest.Mock).mockRestore();
      (console.error as jest.Mock).mockRestore();
      process.exitCode = undefined;
    });

    it('makes exactly 5 GET calls, prints a JSON report and no token', async () => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../scripts/verifyBulkLotEbayBundle') as typeof import('../scripts/verifyBulkLotEbayBundle');
      await mod.runVerification();
      expect(fetchCalls).toHaveLength(5);
      expect(fetchCalls.every((c) => c.method === 'GET')).toBe(true);
      const report = JSON.parse(out.join('\n'));
      expect(report.callFailures).toBe(0);
      expect(report.categoryId).toBe('183455');
      expect(report.v1_subtree.leafCategoryTreeNode).toBe(true);
      expect(report.v2_aspectCheck.sentAspectsMissing).toStrictEqual([]);
      expect(report.v2_aspectCheck.requiredAspectsNotSent).toStrictEqual([]);
      expect(report.v2_aspectCheck.sent).toStrictEqual({ Game: 'Magic: The Gathering', Language: 'English', 'Number of Cards': '1000', 'Card Condition': 'Used' });
      expect(report.v2_aspectCheck.sentValueNotListed).toStrictEqual([]);
      // "Used" is not one of the listed Card Condition values, but the aspect is FREE_TEXT, so it is informational only.
      expect(report.v2_aspectCheck.freeTextValueNotListed).toHaveLength(1);
      expect(report.v2_aspectCheck.freeTextValueNotListed[0]).toMatchObject({ aspect: 'Card Condition', sent: 'Used', mode: 'FREE_TEXT' });
      expect(report.v3_conditionCheck.newListed).toBe(true);
      expect(report.v3_conditionCheck.usedListed).toBe(true);
      expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('SECRET-TOKEN-123');
      expect(process.exitCode).toBe(0);
    });

    it('redacts a token echoed back in an eBay error body and exits 1', async () => {
      failAspects = true;
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../scripts/verifyBulkLotEbayBundle') as typeof import('../scripts/verifyBulkLotEbayBundle');
      await mod.runVerification();
      const all = `${out.join('\n')}\n${err.join('\n')}`;
      expect(all).not.toContain('SECRET-TOKEN-123');
      expect(all).toContain('[redacted]');
      expect(JSON.parse(out.join('\n')).callFailures).toBe(1);
      expect(process.exitCode).toBe(1);
    });
  });
});

describe('verifyBulkLotEbayBundle comparison helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const load = () => require('../scripts/verifyBulkLotEbayBundle') as typeof import('../scripts/verifyBulkLotEbayBundle');
  const aspect = (name: string, required: boolean, mode: string, values: string[]) => ({ name, required, mode, values, valueCount: values.length });

  it('redact removes the token and any Bearer text', () => {
    expect(load().redact('abc SECRET def Bearer xyz.123', 'SECRET')).toBe('abc [redacted] def Bearer [redacted]');
    expect(load().redact('no token here', null)).toBe('no token here');
  });

  it('buildAspectCheck reports a sent aspect the category does not list', () => {
    const r = load().buildAspectCheck({ aspects: [aspect('Game', false, 'FREE_TEXT', [])] }) as any;
    expect(r.sentAspectsMissing).toStrictEqual(['Language', 'Number of Cards', 'Card Condition']);
  });

  it('SENT_ASPECT_NAMES lists the four aspect names a USED bundle sends', () => {
    expect(load().SENT_ASPECT_NAMES).toStrictEqual(['Game', 'Language', 'Number of Cards', 'Card Condition']);
  });

  it('buildAspectCheck for a NEW bundle does not send Card Condition and reports no missing aspect for it', () => {
    const r = load().buildAspectCheck({ aspects: [aspect('Game', false, 'FREE_TEXT', []), aspect('Language', false, 'FREE_TEXT', []), aspect('Number of Cards', false, 'FREE_TEXT', [])] }, 'MTG', 'English', 1000, 'NEW') as any;
    expect(r.sent).toStrictEqual({ Game: 'Magic: The Gathering', Language: 'English', 'Number of Cards': '1000' });
    expect(r.sentAspectsMissing).toStrictEqual([]);
  });

  it('buildAspectCheck treats a sent value missing from a FREE_TEXT list as informational, not as a failure', () => {
    const r = load().buildAspectCheck({
      aspects: [
        aspect('Game', false, 'FREE_TEXT', []),
        aspect('Language', false, 'FREE_TEXT', []),
        aspect('Number of Cards', false, 'FREE_TEXT', []),
        aspect('Card Condition', false, 'FREE_TEXT', ['Excellent', 'Damaged']),
      ],
    }) as any;
    expect(r.sentValueNotListed).toStrictEqual([]);
    expect(r.freeTextValueNotListed).toHaveLength(1);
    expect(r.freeTextValueNotListed[0]).toMatchObject({ aspect: 'Card Condition', sent: 'Used' });
    expect(r.freeTextValueNotListed[0].note).toMatch(/informational/);
  });

  it('buildAspectCheck still reports a SELECTION_ONLY Card Condition that does not list the sent value', () => {
    const r = load().buildAspectCheck({
      aspects: [
        aspect('Game', false, 'FREE_TEXT', []),
        aspect('Language', false, 'FREE_TEXT', []),
        aspect('Number of Cards', false, 'FREE_TEXT', []),
        aspect('Card Condition', false, 'SELECTION_ONLY', ['Excellent', 'Damaged']),
      ],
    }) as any;
    expect(r.sentValueNotListed).toStrictEqual([{ aspect: 'Card Condition', sent: 'Used', mode: 'SELECTION_ONLY' }]);
    expect(r.freeTextValueNotListed).toStrictEqual([]);
  });

  it('buildAspectCheck reports a sent value that a selection-only aspect does not list', () => {
    const r = load().buildAspectCheck({
      aspects: [aspect('Game', false, 'SELECTION_ONLY', ['Pokémon TCG']), aspect('Language', false, 'FREE_TEXT', [])],
    }) as any;
    expect(r.sentValueNotListed).toHaveLength(1);
    expect(r.sentValueNotListed[0].aspect).toBe('Game');
  });

  it('buildAspectCheck reports required aspects the listing does not send', () => {
    const r = load().buildAspectCheck({
      aspects: [
        aspect('Game', true, 'FREE_TEXT', []),
        aspect('Language', true, 'FREE_TEXT', []),
        aspect('Number of Cards', false, 'FREE_TEXT', []),
        aspect('Card Condition', false, 'FREE_TEXT', []),
        aspect('Set', true, 'FREE_TEXT', []),
      ],
    }) as any;
    expect(r.requiredAspectsNotSent).toStrictEqual(['Set']);
    expect(r.sentAspectsMissing).toStrictEqual([]);
  });

  it('buildConditionCheck says which of NEW and USED are listed', () => {
    const both = load().buildConditionCheck({ conditions: [{ conditionId: '1000', conditionDescription: 'New' }, { conditionId: '3000', conditionDescription: 'Used' }] }) as any;
    expect(both.newListed).toBe(true);
    expect(both.usedListed).toBe(true);
    const onlyNew = load().buildConditionCheck({ conditions: [{ conditionId: '1000', conditionDescription: 'New' }] }) as any;
    expect(onlyNew.usedListed).toBe(false);
    expect(onlyNew.listedConditionIds).toStrictEqual(['1000']);
  });
});
