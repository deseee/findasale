/**
 * PrunedSaleTombstone.citySlug deploy-order guard (2026-11-19): the code can go live before the migration.
 * The P2022 shape below is what Prisma 5.22 threw live against Postgres 16 with the column dropped.
 */
import {
  isMissingCitySlugColumnError,
  withCitySlugFallback,
  resetCitySlugColumnCache,
  CITY_SLUG_RECHECK_MS,
} from '../tombstoneCitySlugColumn';

const p2022 = (column = 'PrunedSaleTombstone.citySlug') =>
  Object.assign(new Error(`The column \`${column}\` does not exist in the current database.`), {
    code: 'P2022',
    meta: { modelName: 'PrunedSaleTombstone', column },
  });

let now = 1_000_000;
beforeEach(() => {
  resetCitySlugColumnCache();
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('isMissingCitySlugColumnError', () => {
  it('recognises P2022 for citySlug and the raw Postgres 42703 message', () => {
    expect(isMissingCitySlugColumnError(p2022())).toBe(true);
    expect(isMissingCitySlugColumnError(p2022('citySlug'))).toBe(true);
    expect(isMissingCitySlugColumnError({ code: 'P2022' })).toBe(true);
    expect(isMissingCitySlugColumnError({ code: '42703', message: 'column "citySlug" does not exist' })).toBe(true);
    expect(isMissingCitySlugColumnError(new Error('column PrunedSaleTombstone.citySlug does not exist'))).toBe(true);
  });

  it('ignores other errors, including a missing column that is not citySlug', () => {
    expect(isMissingCitySlugColumnError(p2022('Sale.somethingElse'))).toBe(false);
    expect(isMissingCitySlugColumnError(new Error('connection refused'))).toBe(false);
    expect(isMissingCitySlugColumnError({ code: 'P2002' })).toBe(false);
    expect(isMissingCitySlugColumnError(null)).toBe(false);
  });
});

describe('withCitySlugFallback', () => {
  it('uses the citySlug query while the column exists', async () => {
    const withoutSlug = jest.fn(async () => 'without');
    await expect(withCitySlugFallback(async () => 'with', withoutSlug)).resolves.toBe('with');
    expect(withoutSlug).not.toHaveBeenCalled();
  });

  it('falls back on P2022, skips the column for the recheck window, then tries it again without a restart', async () => {
    const withSlug = jest.fn(async () => { throw p2022(); });
    const withoutSlug = jest.fn(async () => 'without');
    await expect(withCitySlugFallback(withSlug, withoutSlug)).resolves.toBe('without');
    expect(withSlug).toHaveBeenCalledTimes(1);

    now += CITY_SLUG_RECHECK_MS - 1;
    await expect(withCitySlugFallback(withSlug, withoutSlug)).resolves.toBe('without');
    expect(withSlug).toHaveBeenCalledTimes(1); // cached: no failing query per request

    now += 2; // window over; migration has landed meanwhile
    withSlug.mockImplementation(async () => 'with' as never);
    await expect(withCitySlugFallback(withSlug, withoutSlug)).resolves.toBe('with');
    expect(withSlug).toHaveBeenCalledTimes(2);
  });

  it('rethrows any other error and does not start the cache', async () => {
    const withoutSlug = jest.fn(async () => 'without');
    await expect(withCitySlugFallback(async () => { throw new Error('boom'); }, withoutSlug)).rejects.toThrow('boom');
    await expect(withCitySlugFallback(async () => 'with', withoutSlug)).resolves.toBe('with');
    expect(withoutSlug).not.toHaveBeenCalled();
  });
});
