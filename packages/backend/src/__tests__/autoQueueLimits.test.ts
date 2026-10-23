/** Auto queue test limits (2026-10-23): pure helpers in services/autoQueueSettings.ts. Synthetic data. */
import {
  toAutoQueueLimits,
  parseAutoQueueLimitsPatch,
  applyAutoQueueLimits,
  hasAutoQueueLimits,
  isMissingTableError,
} from '../services/autoQueueSettings';

const q = (...ids: string[]) => ids.map((id) => ({ id }));

describe('toAutoQueueLimits', () => {
  it('no row means no limits', () => {
    expect(toAutoQueueLimits(null)).toEqual({ maxNewPerRun: null, onlyItemIds: [] });
    expect(hasAutoQueueLimits(toAutoQueueLimits(null))).toBe(false);
  });
  it('drops malformed stored values instead of trusting them', () => {
    expect(toAutoQueueLimits({ maxNewPerRun: 0, onlyItemIds: ['ok_item_id_1', 'x', 5] as any })).toEqual({ maxNewPerRun: null, onlyItemIds: ['ok_item_id_1'] });
  });
});

describe('parseAutoQueueLimitsPatch', () => {
  it('accepts a cap, an id list, and null / [] to turn them off', () => {
    expect(parseAutoQueueLimitsPatch({ maxNewPerRun: 3 })).toEqual({ ok: true, data: { maxNewPerRun: 3 } });
    expect(parseAutoQueueLimitsPatch({ maxNewPerRun: null, onlyItemIds: [] })).toEqual({ ok: true, data: { maxNewPerRun: null, onlyItemIds: [] } });
    expect(parseAutoQueueLimitsPatch({ onlyItemIds: [' cmur2km2002dfno33bc4ii06r ', 'cmur2km2002dfno33bc4ii06r'] })).toEqual({ ok: true, data: { onlyItemIds: ['cmur2km2002dfno33bc4ii06r'] } });
  });
  it('rejects unknown keys, bad numbers, bad ids and too many ids', () => {
    expect(parseAutoQueueLimitsPatch({ organizerId: 'x' }).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch({ maxNewPerRun: '3' }).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch({ maxNewPerRun: 501 }).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch({ onlyItemIds: ['a b c d e f g h'] }).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch({ onlyItemIds: Array.from({ length: 51 }, (_, i) => 'item_id_' + String(i).padStart(4, '0')) }).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch({}).ok).toBe(false);
    expect(parseAutoQueueLimitsPatch(null).ok).toBe(false);
  });
});

describe('applyAutoQueueLimits', () => {
  const queues = { MERCARI: q('a1aaaaaaaa', 'b2bbbbbbbb', 'c3cccccccc'), POSHMARK: q('a1aaaaaaaa', 'd4dddddddd'), CRAIGSLIST: [] as { id: string }[] };
  it('no limits returns everything unchanged (and does not mutate the input)', () => {
    const out = applyAutoQueueLimits(queues, null);
    expect(out).toEqual(queues);
    expect(out.MERCARI).not.toBe(queues.MERCARI);
  });
  it('caps the TOTAL new listings across platforms, in the given platform order', () => {
    const out = applyAutoQueueLimits(queues, { maxNewPerRun: 3, onlyItemIds: [] }, ['MERCARI', 'POSHMARK', 'CRAIGSLIST']);
    expect(out.MERCARI.map((x) => x.id)).toEqual(['a1aaaaaaaa', 'b2bbbbbbbb', 'c3cccccccc']);
    expect(out.POSHMARK).toEqual([]);
    const out2 = applyAutoQueueLimits(queues, { maxNewPerRun: 4, onlyItemIds: [] }, ['POSHMARK', 'MERCARI']);
    expect(out2.POSHMARK.length + out2.MERCARI.length).toBe(4);
  });
  it('only these items filters every platform, then the cap applies', () => {
    const out = applyAutoQueueLimits(queues, { maxNewPerRun: 2, onlyItemIds: ['a1aaaaaaaa', 'd4dddddddd'] }, ['MERCARI', 'POSHMARK']);
    expect(out.MERCARI.map((x) => x.id)).toEqual(['a1aaaaaaaa']);
    expect(out.POSHMARK.map((x) => x.id)).toEqual(['a1aaaaaaaa']);
  });
});

describe('isMissingTableError', () => {
  it('recognizes Prisma P2021 only', () => {
    expect(isMissingTableError({ code: 'P2021' })).toBe(true);
    expect(isMissingTableError(new Error('connection refused'))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
