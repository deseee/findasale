/**
 * ADR-134 batch B5 (#643): eBay card verification and publishing.
 *
 * Maps to the B5 acceptance list:
 *   (1) PSA 10 -> 2750 + 27501=275010 + 27502=275020 + 27503 cert        "graded card resolves"
 *   (2) graded card that cannot be mapped is unresolved, publish refused  "never ungraded", "refused"
 *   (3) ungraded per-category value ids; DMG on 183454 unresolved         "ungraded card"
 *   (4) coin output unchanged (see also ebayCoinConditionSnapshot.test.ts) "coin parity"
 *   (5) price-revision path does not emit d.values[0] for a card          "legacy revise XML"
 *   (6) aspects filled from the card, organizer tags win                  "card aspects"
 *   (7) verification script is read-only                                  "verification script"
 *   (8) verification script prints no token                               "verification script"
 *
 * Policy fixtures are written from eBay's published descriptor table
 * (https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html,
 * fetched 2026-10-03), transcribed independently of config/cardEbayCategories.ts so the table is not
 * checked against itself. No network, no database, no eBay call: fetch and the leaf modules are mocked.
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

type PolicyVariant = 'full' | 'noPsa' | 'broken';
let policyVariant: PolicyVariant = 'full';
const fetchCalls: Array<{ url: string; method: string | undefined }> = [];
let failAspectsFor: string | null = null;

const val = (id: string, name: string) => ({ conditionDescriptorValueId: id, conditionDescriptorValueName: name });
const desc = (id: string, name: string, usage: string, values: Array<ReturnType<typeof val>>) => ({
  conditionDescriptorId: id,
  conditionDescriptorName: name,
  conditionDescriptorConstraint: { usage },
  conditionDescriptorValues: values,
});

// eBay doc, descriptor 27501. [name, id, categories]
const ALL3 = ['183050', '183454', '261328'];
const GRADER_ROWS: Array<[string, string, string[]]> = [
  ['Professional Sports Authenticator (PSA)', '275010', ALL3],
  ['Beckett Collectors Club Grading (BCCG)', '275011', ALL3],
  ['Beckett Vintage Grading (BVG)', '275012', ALL3],
  ['Beckett Grading Services (BGS)', '275013', ALL3],
  ['Certified Sports Guaranty (CSG)', '275014', ['261328']],
  ['Certified Guaranty Company (CGC)', '275015', ALL3],
  ['Sportscard Guaranty Corporation (SGC)', '275016', ALL3],
  ['K Sportscard Authentication (KSA)', '275017', ALL3],
  ['Gem Mint Authentication (GMA)', '275018', ALL3],
  ['Hybrid Grading Approach (HGA)', '275019', ALL3],
  ['International Sports Authentication (ISA)', '2750110', ALL3],
  ['Professional Card Authenticator (PCA)', '2750111', ['183454']],
  ['Gold Standard Grading (GSG)', '2750112', ALL3],
  ['Platin Grading Service (PGS)', '2750113', ALL3],
  ['MNT Grading (MNT)', '2750114', ALL3],
  ['Technical Authentication & Grading (TAG)', '2750115', ALL3],
  ['Rare Edition (Rare)', '2750116', ALL3],
  ['Revolution Card Grading (RCG)', '2750117', ALL3],
  ['Premier Card Grading (PCG)', '2750118', ['183454']],
  ['Ace Grading (Ace)', '2750119', ['183454']],
  ['Card Grading Australia (CGA)', '2750120', ALL3],
  ['Trading Card Grading (TCG)', '2750121', ['183454']],
  ['ARK Grading (ARK)', '2750122', ['183454']],
  ['Other', '2750123', ALL3],
];

// eBay doc, descriptor 27502 (same in all three categories).
const GRADE_ROWS: Array<[string, string]> = [
  ['10', '275020'], ['9.5', '275021'], ['9', '275022'], ['8.5', '275023'], ['8', '275024'],
  ['7.5', '275025'], ['7', '275026'], ['6.5', '275027'], ['6', '275028'], ['5.5', '275029'],
  ['5', '2750210'], ['4.5', '2750211'], ['4', '2750212'], ['3.5', '2750213'], ['3', '2750214'],
  ['2.5', '2750215'], ['2', '2750216'], ['1.5', '2750217'], ['1', '2750218'],
  ['Authentic', '2750219'], ['Authentic Altered', '2750220'], ['Authentic - Trimmed', '2750221'],
  ['Authentic - Coloured', '2750222'],
];

// eBay doc, descriptor 40001.
const UNGRADED_183454 = [
  ['Near Mint or Better', '400010'], ['Lightly Played (Excellent)', '400015'],
  ['Moderately Played (Very Good)', '400016'], ['Heavily Played (Poor)', '400017'],
];
const UNGRADED_OTHER = [
  ['Near Mint or Better', '400010'], ['Excellent', '400011'], ['Very Good', '400012'], ['Poor', '400013'],
];

function cardPolicy(categoryId: string) {
  const graders = GRADER_ROWS
    .filter(([name, id, cats]) => cats.includes(categoryId) && !(policyVariant === 'noPsa' && id === '275010' && name.includes('PSA')))
    .map(([name, id]) => val(id, name));
  const ungraded = (categoryId === '183454' ? UNGRADED_183454 : UNGRADED_OTHER).map(([n, i]) => val(i, n));
  return {
    itemConditionPolicies: [
      {
        categoryId,
        itemConditions: [
          {
            conditionId: '2750',
            conditionDescriptors: [
              desc('27501', 'Professional Grader', 'REQUIRED', graders),
              desc('27502', 'Grade', 'REQUIRED', GRADE_ROWS.map(([n, i]) => val(i, n))),
              desc('27503', 'Certification Number', 'OPTIONAL', []),
            ],
          },
          { conditionId: '4000', conditionDescriptors: [desc('40001', 'Card Condition', 'REQUIRED', ungraded)] },
        ],
      },
    ],
  };
}

// Synthetic coin policy (same shape as ebayCoinConditionSnapshot.test.ts) for the parity cases.
function coinPolicy(categoryId: string) {
  return {
    itemConditionPolicies: [
      {
        categoryId,
        itemConditions: [
          {
            conditionId: '4000',
            conditionDescriptors: [
              desc('2', 'Coin Condition', 'REQUIRED', [
                val('7', 'Uncirculated'),
                val('8', 'Extremely Fine to About Uncirculated'),
                val('9', 'Fine to Very Fine'),
                val('10', 'Below Fine'),
              ]),
            ],
          },
        ],
      },
    ],
  };
}

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (global as any).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    fetchCalls.push({ url: u, method: init?.method });
    const policyId = /%7B(\d+)%7D/.exec(u)?.[1];
    if (policyId) {
      if (policyVariant === 'broken') return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
      const body = policyId === '11981' ? coinPolicy(policyId) : cardPolicy(policyId);
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    const catId = /category_id=(\d+)/.exec(u)?.[1] ?? '0';
    if (u.includes('get_item_aspects_for_category')) {
      if (failAspectsFor === catId) {
        const text = 'denied for Bearer SECRET-TOKEN-123 on token SECRET-TOKEN-123';
        return { ok: false, status: 403, text: async () => text, json: async () => ({}) };
      }
      const body = {
        aspects: [
          {
            localizedAspectName: 'Game',
            aspectConstraint: { aspectRequired: true, aspectMode: 'SELECTION_ONLY', itemToAspectCardinality: 'SINGLE' },
            aspectValues: [{ localizedValue: 'Magic: The Gathering' }],
          },
        ],
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    const body = {
      categorySubtreeNode: {
        categoryTreeNodeLevel: 3,
        category: { categoryId: catId, categoryName: 'Test Category' },
        leafCategoryTreeNode: true,
      },
    };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

/** Fresh module registry per scenario: the service caches policies per category at module scope. */
function loadService(variant: PolicyVariant = 'full') {
  policyVariant = variant;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../services/ebayPublishService') as typeof import('../services/ebayPublishService');
}

const SLAB = (over: Record<string, unknown> = {}) => ({
  game: 'POKEMON',
  productType: 'SINGLE',
  conditionCode: null,
  grader: 'PSA',
  grade: '10',
  certNumber: null,
  ...over,
});
const RAW = (over: Record<string, unknown> = {}) => ({
  game: 'MTG',
  productType: 'SINGLE',
  conditionCode: 'NM',
  grader: null,
  grade: null,
  certNumber: null,
  ...over,
});
const TEXT = { title: 'Charizard', description: null, tags: [] as string[] };

describe('(1) graded card resolves as eBay publishes it', () => {
  it('PSA 10 with a cert: LIKE_NEW, 27501=275010, 27502=275020, cert kept apart then appended as 27503 additionalInfo', async () => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB({ certNumber: '12345678' }) });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'LIKE_NEW',
      conditionDescriptors: [
        { name: '27501', values: ['275010'] },
        { name: '27502', values: ['275020'] },
      ],
      certificationNumber: '12345678',
    });
    if (r.status !== 'resolved') throw new Error('unreachable');
    expect(svc.toConditionDescriptorPayload(r)).toStrictEqual([
      { name: '27501', values: ['275010'] },
      { name: '27502', values: ['275020'] },
      { name: '27503', additionalInfo: '12345678' },
    ]);
  });

  it('no cert number means no certificationNumber key and no 27503 entry', async () => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB() });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'LIKE_NEW',
      conditionDescriptors: [
        { name: '27501', values: ['275010'] },
        { name: '27502', values: ['275020'] },
      ],
    });
  });

  it('"10.0" and lowercase grader codes map like "10" and "PSA"; BGS 9.5 maps to 275013 / 275021', async () => {
    const svc = loadService();
    const a = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB({ grader: 'psa', grade: '10.0' }) });
    expect(a.status === 'resolved' && a.conditionDescriptors).toStrictEqual([
      { name: '27501', values: ['275010'] },
      { name: '27502', values: ['275020'] },
    ]);
    const b = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB({ grader: 'BGS', grade: '9.5' }) });
    expect(b.status === 'resolved' && b.conditionDescriptors).toStrictEqual([
      { name: '27501', values: ['275013'] },
      { name: '27502', values: ['275021'] },
    ]);
  });

  it('a cert longer than 30 characters is omitted, never truncated', async () => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB({ certNumber: 'X'.repeat(31) }) });
    expect(r.status).toBe('resolved');
    expect(r.status === 'resolved' && 'certificationNumber' in r).toBe(false);
  });
});

describe('(2) a graded card that cannot be mapped is unresolved and never ungraded', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['unknown grader', { grader: 'ZZZ' }, 'ZZZ'],
    ['grader recorded, no grade', { grade: null }, 'no grade'],
    ['grade with no eBay value', { grade: 'Gem Mint' }, 'Gem Mint'],
    ['grade recorded, no grader', { grader: null }, 'no professional grader'],
    ['grader not offered in this category (CSG is sports only)', { grader: 'CSG' }, 'not offered'],
  ];
  it.each(cases)('%s', async (_label, over, reasonPart) => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', {
      ...TEXT,
      // Wording that the old coin and ungraded logic could have matched, to prove it is never consulted.
      title: 'psa 10 near mint extremely fine',
      card: SLAB(over),
    });
    expect(r.status).toBe('unresolved');
    expect((r as { reason: string }).reason).toContain(reasonPart);
  });

  it('a grader id missing from the LIVE policy is unresolved', async () => {
    const svc = loadService('noPsa');
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB() });
    expect(r.status).toBe('unresolved');
    expect((r as { reason: string }).reason).toContain('275010');
  });

  it('an unreadable live policy is unresolved with a retry message', async () => {
    const svc = loadService('broken');
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB() });
    expect(r.status).toBe('unresolved');
    expect((r as { reason: string }).reason).toContain('Try again');
  });

  it('the push path refuses an unresolved card before anything is sent (source order check)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf8');
    const resolveAt = src.indexOf("resolveCoinConditionOverride(categoryId ?? '99'");
    const refuseAt = src.indexOf("code: 'CARD_CONDITION_UNRESOLVED'");
    const validateAt = src.indexOf('validateItemForEbayPublish({', resolveAt);
    expect(resolveAt).toBeGreaterThan(0);
    expect(refuseAt).toBeGreaterThan(resolveAt);
    expect(refuseAt).toBeLessThan(validateAt);
    const block = src.slice(refuseAt, refuseAt + 400);
    expect(block).toContain('continue;');
    expect(src.slice(resolveAt, refuseAt)).toContain('isPinnedCardCategoryId(categoryId)');
    expect(src).toContain('card: item.card,\n        });'); // resolver call
  });
});

describe('(3) ungraded card value ids differ between 183454 and the other two categories', () => {
  const run = async (cat: string, code: string | null) => {
    const svc = loadService();
    return svc.resolveCoinConditionOverride(cat, { ...TEXT, card: RAW({ conditionCode: code }) });
  };
  const ok = (valueId: string) => ({
    status: 'resolved',
    condition: 'USED_VERY_GOOD',
    conditionDescriptors: [{ name: '40001', values: [valueId] }],
  });

  it('183454: NM 400010, LP 400015, MP 400016, HP 400017', async () => {
    expect(await run('183454', 'NM')).toStrictEqual(ok('400010'));
    expect(await run('183454', 'LP')).toStrictEqual(ok('400015'));
    expect(await run('183454', 'MP')).toStrictEqual(ok('400016'));
    expect(await run('183454', 'HP')).toStrictEqual(ok('400017'));
  });

  it('183050 and 261328: LP 400011, MP 400012, HP 400013', async () => {
    expect(await run('183050', 'LP')).toStrictEqual(ok('400011'));
    expect(await run('183050', 'MP')).toStrictEqual(ok('400012'));
    expect(await run('261328', 'HP')).toStrictEqual(ok('400013'));
    expect(await run('261328', 'NM')).toStrictEqual(ok('400010'));
  });

  it('DMG is unresolved in 183454 (no Damaged value) and a missing condition is unresolved', async () => {
    const dmg = await run('183454', 'DMG');
    expect(dmg.status).toBe('unresolved');
    expect((dmg as { reason: string }).reason).toContain('no Damaged');
    expect((await run('183454', null)).status).toBe('unresolved');
    expect((await run('183454', 'XX')).status).toBe('unresolved');
  });
});

describe('(4) coin and non-card behavior is unchanged', () => {
  it('a card record in a NON-pinned category takes the coin logic, same as no card', async () => {
    const svc = loadService();
    const without = await svc.resolveCoinConditionOverride('11981', { title: 'morgan dollar uncirculated', description: null, tags: [] });
    const withNull = await svc.resolveCoinConditionOverride('11981', { title: 'morgan dollar uncirculated', description: null, tags: [], card: null });
    const withCard = await svc.resolveCoinConditionOverride('11981', {
      title: 'morgan dollar uncirculated', description: null, tags: [], card: RAW(),
    });
    const expected = { status: 'resolved', condition: 'USED_VERY_GOOD', conditionDescriptors: [{ name: '2', values: ['7'] }] };
    expect(without).toStrictEqual(expected);
    expect(withNull).toStrictEqual(expected);
    expect(withCard).toStrictEqual(expected);
  });

  it('an item with no card record in a card category behaves as before (ADR-134 5.2, unchanged by design)', async () => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT });
    // Old fallback: first value eBay returns for the REQUIRED Card Condition descriptor.
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '40001', values: ['400010'] }],
    });
  });

  it('coin descriptors serialize exactly as before through toConditionDescriptorPayload', () => {
    const svc = loadService();
    const payload = svc.toConditionDescriptorPayload({ conditionDescriptors: [{ name: '2', values: ['9'] }] });
    expect(JSON.stringify(payload)).toBe('[{"name":"2","values":["9"]}]');
  });
});

describe('(5) legacy revise XML (price-revision path)', () => {
  it('coin descriptors produce the exact string the inline builder produced', () => {
    const svc = loadService();
    expect(svc.buildTradingConditionDescriptorsXml([{ name: '2', values: ['9'] }])).toBe(
      '\n    <ConditionDescriptors>' +
        '\n      <ConditionDescriptor>' +
        '\n        <Name>2</Name>' +
        '\n        <Value>9</Value>' +
        '\n      </ConditionDescriptor>' +
        '\n    </ConditionDescriptors>'
    );
    expect(svc.buildTradingConditionDescriptorsXml([])).toBe('');
    expect(svc.buildTradingConditionDescriptorsXml(undefined)).toBe('');
  });

  it('a graded card emits grader, grade and an escaped AdditionalInfo with no Value on the cert entry', async () => {
    const svc = loadService();
    const r = await svc.resolveCoinConditionOverride('183454', { ...TEXT, card: SLAB({ certNumber: 'A&B<1>' }) });
    if (r.status !== 'resolved') throw new Error('expected resolved');
    const xml = svc.buildTradingConditionDescriptorsXml(svc.toConditionDescriptorPayload(r));
    expect(xml).not.toContain('undefined');
    expect(xml).toContain('<Name>27501</Name>\n        <Value>275010</Value>');
    expect(xml).toContain('<Name>27502</Name>\n        <Value>275020</Value>');
    expect(xml).toContain('<AdditionalInfo>A&amp;B&lt;1&gt;</AdditionalInfo>');
    const certBlock = xml.split('<ConditionDescriptor>').pop() as string;
    expect(certBlock).toContain('<Name>27503</Name>');
    expect(certBlock).not.toContain('<Value>');
  });

  it('the revision service no longer reads d.values[0] and loads the card for the item', () => {
    const src = fs.readFileSync(path.join(__dirname, '../services/ebayPriceRevisionService.ts'), 'utf8');
    expect(src).not.toContain('values[0]');
    expect(src).toContain('buildTradingConditionDescriptorsXml(conditionDescriptors)');
    expect(src).toMatch(/card:\s*\{\s*select:/);
  });
});

describe('every self-heal caller that can load the card passes it', () => {
  it('ebayController (push, publish-now) and the stuck-offer cron pass card', () => {
    const ctl = fs.readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf8');
    expect(ctl.split('card: item.card,').length - 1).toBeGreaterThanOrEqual(3); // resolver + two heal inputs
    expect(ctl).toContain('card: { select: EBAY_CARD_SELECT }');
    const cron = fs.readFileSync(path.join(__dirname, '../jobs/ebayStuckOfferRetryCron.ts'), 'utf8');
    expect(cron).toContain('card: item.card,');
    expect(cron).toMatch(/card:\s*\{\s*select:/);
  });
});

describe('pinned category', () => {
  it('MTG, Pokemon, Yu-Gi-Oh, Lorcana and One Piece singles pin 183454; OTHER and SEALED do not', async () => {
    const cfg = await import('../config/cardEbayCategories');
    for (const game of ['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE']) {
      expect(cfg.getPinnedCardCategory({ game, productType: 'SINGLE' })?.id).toBe('183454');
    }
    expect(cfg.getPinnedCardCategory({ game: 'OTHER', productType: 'SINGLE' })).toBeNull();
    expect(cfg.getPinnedCardCategory({ game: 'MTG', productType: 'SEALED' })).toBeNull();
    expect(cfg.getPinnedCardCategory(null)).toBeNull();
    expect(cfg.isPinnedCardCategoryId('183050')).toBe(true);
    expect(cfg.isPinnedCardCategoryId('15687')).toBe(false);
    expect(cfg.CCG_SINGLES.name).toBeNull(); // UNVERIFIED display name, filled from V1 output only
  });
});

describe('(6) card aspects', () => {
  const spec = (over: Array<Record<string, unknown>> = []) => [
    { name: 'Game', required: true, enumValues: ['Magic: The Gathering', 'Pokémon TCG'], cardinality: 'SINGLE', mode: 'SELECTION_ONLY' },
    { name: 'Set', required: false, enumValues: [], cardinality: 'SINGLE', mode: 'FREE_TEXT' },
    { name: 'card name', required: false, enumValues: [], cardinality: 'SINGLE', mode: 'FREE_TEXT' },
    { name: 'Card Number', required: false, enumValues: [], cardinality: 'SINGLE', mode: 'FREE_TEXT' },
    { name: 'Finish', required: false, enumValues: ['Foil', 'Non-Foil'], cardinality: 'SINGLE', mode: 'SELECTION_ONLY' },
    { name: 'Language', required: false, enumValues: ['English', 'Japanese'], cardinality: 'SINGLE', mode: 'SELECTION_ONLY' },
    { name: 'Manufacturer', required: false, enumValues: [], cardinality: 'SINGLE', mode: 'FREE_TEXT' },
    ...over,
  ] as any[];

  const card = {
    game: 'MTG',
    productType: 'SINGLE',
    cardName: 'Lightning Bolt',
    setCode: 'lea',
    setName: 'Limited Edition Alpha',
    collectorNumber: '161',
    language: 'en',
    finish: 'NONFOIL',
    conditionCode: 'NM',
    grader: null,
    grade: null,
    certNumber: null,
  };

  it('fills Game, Set, Card Name, Card Number, Finish, Language and Manufacturer using the spec casing', async () => {
    const { buildCardAspects } = await import('../services/ebayCardAspects');
    expect(buildCardAspects(card, spec())).toStrictEqual({
      Game: ['Magic: The Gathering'],
      Set: ['Limited Edition Alpha'],
      'card name': ['Lightning Bolt'],
      'Card Number': ['161'],
      Finish: ['Non-Foil'],
      Language: ['English'],
      Manufacturer: ['Wizards of the Coast'],
    });
  });

  it('organizer tag aspects win on conflict, case-insensitively', async () => {
    const { buildCardAspects, mergeCardAspects } = await import('../services/ebayCardAspects');
    const merged = mergeCardAspects({ game: ['Custom Game'], Rarity: ['Rare'] }, buildCardAspects(card, spec()));
    expect(merged?.game).toStrictEqual(['Custom Game']);
    expect(merged?.Game).toBeUndefined();
    expect(merged?.Rarity).toStrictEqual(['Rare']);
    expect(merged?.Set).toStrictEqual(['Limited Edition Alpha']);
  });

  it('a SELECTION_ONLY aspect with no matching enum value is omitted, never enumValues[0]', async () => {
    const { buildCardAspects } = await import('../services/ebayCardAspects');
    const out = buildCardAspects({ ...card, game: 'LORCANA', language: 'ko', finish: 'ETCHED' }, spec());
    expect(out.Game).toBeUndefined(); // enum has no Lorcana
    expect(out.Language).toBeUndefined(); // enum has no Korean
    expect(out.Finish).toBeUndefined(); // enum has no etched value
    expect(out.Manufacturer).toStrictEqual(['Ravensburger']); // free text
  });

  it('emits nothing for aspects absent from the live spec, and nothing without a card or spec', async () => {
    const { buildCardAspects, mergeCardAspects } = await import('../services/ebayCardAspects');
    expect(buildCardAspects(card, [{ name: 'Brand', required: true, enumValues: [], cardinality: 'SINGLE', mode: 'FREE_TEXT' }])).toStrictEqual({});
    expect(buildCardAspects(null, spec())).toStrictEqual({});
    expect(buildCardAspects(card, null)).toStrictEqual({});
    expect(mergeCardAspects(undefined, {})).toBeUndefined();
  });

  it('a graded card never gets Graded=No and an ungraded card gets Graded=No only when the aspect exists', async () => {
    const { buildCardAspects } = await import('../services/ebayCardAspects');
    const extra = [{ name: 'Graded', required: false, enumValues: ['No', 'Yes'], cardinality: 'SINGLE', mode: 'SELECTION_ONLY' }];
    expect(buildCardAspects({ ...card, grader: 'PSA', grade: '10' }, spec(extra)).Graded).toStrictEqual(['Yes']);
    expect(buildCardAspects(card, spec(extra)).Graded).toStrictEqual(['No']);
    expect(buildCardAspects(card, spec()).Graded).toBeUndefined();
  });
});

describe('(7) and (8) verification script', () => {
  const scriptPath = path.join(__dirname, '../scripts/verifyCardEbayPolicies.ts');
  const src = fs.readFileSync(scriptPath, 'utf8');

  it('(7) the source contains no write verb and every request method is GET', () => {
    expect(src).not.toMatch(/\b(POST|PUT|DELETE|PATCH)\b/);
    const methods = Array.from(src.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g)).map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === 'GET')).toBe(true);
    // No direct database import either (the token helper it reuses lives in services/ebayHttp).
    expect(src).not.toMatch(/from\s+['"][^'"]*lib\/prisma['"]/);
  });

  describe('(8) runtime behavior with a mocked eBay', () => {
    let out: string[] = [];
    let err: string[] = [];
    beforeEach(() => {
      policyVariant = 'full';
      failAspectsFor = null;
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

    it('makes exactly 9 GET calls and prints a JSON report with no token in stdout or stderr', async () => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../scripts/verifyCardEbayPolicies') as typeof import('../scripts/verifyCardEbayPolicies');
      await mod.runVerification();
      expect(fetchCalls).toHaveLength(9);
      expect(fetchCalls.every((c) => c.method === 'GET')).toBe(true);
      const report = JSON.parse(out.join('\n'));
      expect(report.callFailures).toBe(0);
      expect(Object.keys(report.categories).sort()).toStrictEqual(['183050', '183454', '261328']);
      const tc = report.categories['183454'].v3_tableCheck;
      expect(tc.grader27501.missingFromLive).toStrictEqual([]);
      expect(tc.grade27502.missingFromLive).toStrictEqual([]);
      expect(tc.cardCondition40001.missingFromLive).toStrictEqual([]);
      expect(tc.cardCondition40001.extraInLive).toStrictEqual([]);
      expect(tc.certNumber27503DescriptorListed).toBe(true);
      expect(`${out.join('\n')}\n${err.join('\n')}`).not.toContain('SECRET-TOKEN-123');
      expect(process.exitCode).toBe(0);
    });

    it('redacts a token echoed back in an eBay error body and exits 1', async () => {
      failAspectsFor = '261328';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../scripts/verifyCardEbayPolicies') as typeof import('../scripts/verifyCardEbayPolicies');
      await mod.runVerification();
      const all = `${out.join('\n')}\n${err.join('\n')}`;
      expect(all).not.toContain('SECRET-TOKEN-123');
      expect(all).toContain('[redacted]');
      expect(JSON.parse(out.join('\n')).callFailures).toBe(1);
      expect(process.exitCode).toBe(1);
    });

    it('buildTableCheck reports an id the code would send but eBay no longer lists', async () => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../scripts/verifyCardEbayPolicies') as typeof import('../scripts/verifyCardEbayPolicies');
      policyVariant = 'noPsa';
      const tc = mod.buildTableCheck('183454', cardPolicy('183454')) as any;
      expect(tc.grader27501.missingFromLive).toContain('275010');
      expect(mod.redact('abc SECRET def Bearer xyz.123', 'SECRET')).toBe('abc [redacted] def Bearer [redacted]');
    });
  });
});
