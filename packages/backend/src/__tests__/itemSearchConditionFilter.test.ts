/**
 * Items search (GET /api/items/search service): the shopper condition filter matches canonical AND legacy stored
 * values, the SQL stays parameterized, and the condition facet is folded onto the canonical four.
 * Prisma is a jest stand-in (no database).
 */
const mockPrisma: any = {
  $queryRawUnsafe: jest.fn(),
  item: { groupBy: jest.fn(), aggregate: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));

import { searchItems } from '../services/itemSearchService';

const sqlOf = (call: any[]) => String(call[0]);
const paramsOf = (call: any[]) => call.slice(1);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string) => (/COUNT\(\*\)/.test(sql) ? [{ count: 1 }] : []));
  mockPrisma.item.groupBy.mockImplementation(async (args: any) =>
    args.by[0] === 'condition'
      ? [
          { condition: 'USED', _count: { id: 10 } },
          { condition: 'GOOD', _count: { id: 3 } },
          { condition: 'LIKE_NEW', _count: { id: 2 } },
          { condition: 'NEW', _count: { id: 4 } },
          { condition: 'POOR', _count: { id: 1 } },
        ]
      : [],
  );
  mockPrisma.item.aggregate.mockResolvedValue({ _min: { price: null }, _max: { price: null } });
});

describe('searchItems condition filter', () => {
  it('filteredSearch (no q): USED matches USED and the legacy used words with bound parameters', async () => {
    await searchItems({ condition: 'USED' });
    const call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    const sql = sqlOf(call);
    expect(sql).toMatch(/AND UPPER\(i\.condition\) IN \(\$1(, \$\d+)+\)/);
    expect(sql).not.toMatch(/i\.condition ILIKE/);
    const params = paramsOf(call);
    for (const stored of ['USED', 'LIKE_NEW', 'GOOD', 'FAIR', 'EXCELLENT']) expect(params).toContain(stored);
    expect(params).not.toContain('NEW');
    // The user value is never interpolated into the SQL text.
    expect(sql).not.toContain('LIKE_NEW');
  });

  it('a legacy bookmarked value resolves to the canonical condition (excellent -> USED, poor -> PARTS_OR_REPAIR)', async () => {
    await searchItems({ condition: 'excellent' });
    let call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    expect(paramsOf(call)).toEqual(expect.arrayContaining(['USED', 'LIKE_NEW']));

    mockPrisma.$queryRawUnsafe.mockClear();
    await searchItems({ condition: 'Poor' });
    call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    expect(paramsOf(call)).toEqual(expect.arrayContaining(['PARTS_OR_REPAIR', 'POOR']));
    expect(paramsOf(call)).not.toContain('USED');
  });

  it('placeholder numbering stays consistent when other filters come before and after the condition', async () => {
    await searchItems({ condition: 'NEW', category: 'Furniture', priceMin: 5, limit: 10, offset: 0 });
    const call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    const sql = sqlOf(call);
    const params = paramsOf(call);
    expect(sql).toContain('AND i.category ILIKE $1');
    expect(sql).toContain('AND UPPER(i.condition) IN ($2)');
    expect(sql).toContain('AND i.price >= $3');
    expect(sql).toContain('LIMIT $4 OFFSET $5');
    expect(params).toEqual(['Furniture', 'NEW', 5, 10, 0]);
  });

  it('text search (ftsSearch) applies the same condition clause', async () => {
    await searchItems({ q: 'chair', condition: 'REFURBISHED' });
    const call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    expect(sqlOf(call)).toMatch(/UPPER\(i\.condition\) IN \(/);
    expect(paramsOf(call)).toEqual(expect.arrayContaining(['REFURBISHED', 'SELLER_REFURBISHED']));
    const count = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => /COUNT\(\*\)/.test(sqlOf(c)))!;
    expect(sqlOf(count)).toMatch(/UPPER\(i\.condition\) IN \(/);
  });

  it('no condition adds no condition clause', async () => {
    await searchItems({});
    for (const call of mockPrisma.$queryRawUnsafe.mock.calls) expect(sqlOf(call)).not.toMatch(/i\.condition (ILIKE|IN)|UPPER\(i\.condition\)/);
  });

  it('selects and returns the grade string for used goods', async () => {
    mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      /COUNT\(\*\)/.test(sql)
        ? [{ count: 1 }]
        : [{ id: 'i1', title: 'Chair', price: '12', photoUrls: [], category: null, condition: 'USED', conditionGrade: 'B', saleId: 's1', organizerId: 'o1', businessName: 'B', relevanceScore: null }],
    );
    const res = await searchItems({});
    const call = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => !/COUNT\(\*\)/.test(sqlOf(c)))!;
    expect(sqlOf(call)).toContain('i."conditionGrade"');
    expect(res.data[0]).toMatchObject({ condition: 'USED', conditionGrade: 'B' });
  });

  it('facets fold legacy condition counts onto the canonical conditions', async () => {
    const res = await searchItems({});
    expect(res.facets.conditions).toEqual([
      { name: 'NEW', count: 4 },
      { name: 'USED', count: 15 },
      { name: 'PARTS_OR_REPAIR', count: 1 },
    ]);
  });
});
