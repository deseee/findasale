/**
 * Review page draft autosave (Wave 3 round 2, F3): debounce, serialization, retry, hold, payload.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAutosaveController,
  buildAutosavePayload,
  autosaveStatusText,
  isAutosaveField,
  AUTOSAVE_FIELDS,
  AUTOSAVE_FORBIDDEN_KEYS,
  type AutosaveStatus,
  type TimerApi,
} from '../reviewAutosave';

/** Fake clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: TimerApi = {
    setTimeout(fn, ms) {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(h) {
      pending.delete(h as number);
    },
  };
  return {
    timers,
    pendingCount: () => pending.size,
    /** Advance and run due timers in time order; awaits microtasks between them so async saves settle. */
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = Array.from(pending.entries())
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await settle();
      }
      now = target;
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A save function whose calls the test completes by hand. */
function manualSave() {
  const calls: Array<{ id: string; keys: string[]; resolve: () => void; reject: () => void }> = [];
  const save = (id: string, keys: string[]) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ id, keys, resolve: () => resolve(), reject: () => reject(new Error('boom')) });
    });
  return { calls, save };
}

function setup(over: Partial<Parameters<typeof createAutosaveController>[0]> = {}) {
  const clock = fakeClock();
  const m = manualSave();
  const statuses: Array<[string, AutosaveStatus]> = [];
  const ctl = createAutosaveController({
    save: m.save,
    onStatus: (id, s) => statuses.push([id, s]),
    timers: clock.timers,
    ...over,
  });
  return { clock, m, statuses, ctl };
}

test('debounce: nothing is saved until 800 ms after the last change', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(799);
  assert.equal(m.calls.length, 0);
  ctl.touch('a', 'description'); // restarts the wait
  await clock.advance(799);
  assert.equal(m.calls.length, 0);
  await clock.advance(1);
  assert.equal(m.calls.length, 1);
  assert.deepEqual(m.calls[0].keys.sort(), ['description', 'title']);
});

test('status goes saving, saved, then saved earlier', async () => {
  const { clock, m, ctl, statuses } = setup();
  ctl.touch('a', 'title');
  assert.equal(ctl.status('a'), 'saving');
  await clock.advance(800);
  m.calls[0].resolve();
  await settle();
  assert.equal(ctl.status('a'), 'saved');
  await clock.advance(10000);
  assert.equal(ctl.status('a'), 'savedEarlier');
  assert.deepEqual(statuses.map((s) => s[1]), ['saving', 'saved', 'savedEarlier']);
  assert.equal(ctl.hasUnsaved('a'), false);
});

test('serialization: edits during a save wait for it, then save after a fresh debounce', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800);
  assert.equal(m.calls.length, 1);
  ctl.touch('a', 'tags'); // while the first save is in flight
  await clock.advance(800); // debounce fires but must not start a parallel save
  assert.equal(m.calls.length, 1);
  m.calls[0].resolve();
  await settle();
  assert.equal(ctl.status('a'), 'saving'); // tags still waiting
  await clock.advance(800);
  assert.equal(m.calls.length, 2);
  assert.deepEqual(m.calls[1].keys, ['tags']);
  m.calls[1].resolve();
  await settle();
  assert.equal(ctl.status('a'), 'saved');
});

test('items are independent: two items save in parallel, one at a time each', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  ctl.touch('b', 'title');
  await clock.advance(800);
  assert.deepEqual(m.calls.map((c) => c.id).sort(), ['a', 'b']);
});

test('failure: one retry after 5 s, then stop until the next edit', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800);
  m.calls[0].reject();
  await settle();
  assert.equal(ctl.status('a'), 'retrying');
  assert.equal(ctl.hasUnsaved('a'), true);
  await clock.advance(4999);
  assert.equal(m.calls.length, 1);
  await clock.advance(1);
  assert.equal(m.calls.length, 2);
  assert.deepEqual(m.calls[1].keys, ['title']);
  m.calls[1].reject();
  await settle();
  assert.equal(ctl.status('a'), 'failed');
  await clock.advance(60000);
  assert.equal(m.calls.length, 2); // stopped
  assert.equal(ctl.hasUnsaved('a'), true);
  // The next edit starts over and carries the failed key too.
  ctl.touch('a', 'description');
  await clock.advance(800);
  assert.equal(m.calls.length, 3);
  assert.deepEqual(m.calls[2].keys.sort(), ['description', 'title']);
});

test('a retry that succeeds ends saved', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800);
  m.calls[0].reject();
  await settle();
  await clock.advance(5000);
  m.calls[1].resolve();
  await settle();
  assert.equal(ctl.status('a'), 'saved');
  assert.equal(ctl.hasUnsaved('a'), false);
});

test('a new edit during the retry wait cancels the retry and saves on its own debounce', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800);
  m.calls[0].reject();
  await settle();
  ctl.touch('a', 'tags');
  await clock.advance(800);
  assert.equal(m.calls.length, 2);
  assert.deepEqual(m.calls[1].keys.sort(), ['tags', 'title']);
});

test('flush waits for an in-flight save and then saves what is pending (Approve cannot race)', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800); // save 1 in flight
  ctl.touch('a', 'brand');
  let done = false;
  const flushed = ctl.flush('a').then((ok) => {
    done = true;
    return ok;
  });
  await settle();
  assert.equal(done, false); // still waiting on save 1
  assert.equal(m.calls.length, 1);
  m.calls[0].resolve();
  await settle();
  assert.equal(m.calls.length, 2); // pending key saved now, without waiting for the debounce
  assert.deepEqual(m.calls[1].keys, ['brand']);
  assert.equal(done, false);
  m.calls[1].resolve();
  assert.equal(await flushed, true);
  assert.equal(clock.pendingCount() <= 1, true); // only the "saved earlier" label timer may remain
});

test('flush with nothing pending resolves true at once', async () => {
  const { ctl } = setup();
  assert.equal(await ctl.flush('zzz'), true);
});

test('flush resolves false when the save fails, and does not try again', async () => {
  const { m, ctl } = setup();
  ctl.touch('a', 'title');
  const p = ctl.flush('a');
  await settle();
  m.calls[0].reject();
  assert.equal(await p, false);
  assert.equal(m.calls.length, 1);
});

test('hold: pending edits are dropped, later edits are ignored, nothing fires after a publish started', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  ctl.hold('a');
  assert.equal(ctl.touch('a', 'description'), false);
  await clock.advance(10000);
  assert.equal(m.calls.length, 0);
  assert.equal(ctl.status('a'), 'idle');
  assert.equal(ctl.hasUnsaved('a'), false);
  ctl.release('a');
  assert.equal(ctl.touch('a', 'title'), true);
  await clock.advance(800);
  assert.equal(m.calls.length, 1);
});

test('hold during an in-flight save: its late result is ignored (no retry, no status flip)', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  await clock.advance(800);
  ctl.hold('a');
  m.calls[0].reject();
  await settle();
  await clock.advance(20000);
  assert.equal(m.calls.length, 1);
  assert.equal(ctl.status('a'), 'idle');
});

test('cancel and cancelAll (unmount): timers cleared, nothing saves, cancelAll emits no status', async () => {
  const { clock, m, ctl, statuses } = setup();
  ctl.touch('a', 'title');
  ctl.touch('b', 'title');
  const before = statuses.length;
  ctl.cancelAll();
  await clock.advance(20000);
  assert.equal(m.calls.length, 0);
  assert.equal(clock.pendingCount(), 0);
  assert.equal(statuses.length, before);
  ctl.touch('c', 'title');
  ctl.cancel('c');
  await clock.advance(20000);
  assert.equal(m.calls.length, 0);
});

test('dirtyKeys covers pending and in-flight fields', async () => {
  const { clock, m, ctl } = setup();
  ctl.touch('a', 'title');
  assert.deepEqual(ctl.dirtyKeys('a'), ['title']);
  await clock.advance(800);
  ctl.touch('a', 'tags');
  assert.deepEqual(ctl.dirtyKeys('a').sort(), ['tags', 'title']);
  m.calls[0].resolve();
  await settle();
  assert.deepEqual(ctl.dirtyKeys('a'), ['tags']);
  assert.deepEqual(ctl.dirtyKeys('unknown'), []);
});

test('custom delays are honored', async () => {
  const { clock, m, ctl } = setup({ debounceMs: 100, retryMs: 200 });
  ctl.touch('a', 'title');
  await clock.advance(100);
  assert.equal(m.calls.length, 1);
  m.calls[0].reject();
  await settle();
  await clock.advance(200);
  assert.equal(m.calls.length, 2);
});

test('status text: exact strings', () => {
  assert.equal(autosaveStatusText('idle'), '');
  assert.equal(autosaveStatusText('saving'), 'Saving...');
  assert.equal(autosaveStatusText('saved'), 'Saved just now');
  assert.equal(autosaveStatusText('savedEarlier'), 'Saved');
  assert.equal(autosaveStatusText('retrying'), 'Could not save, will retry');
  assert.equal(autosaveStatusText('failed'), 'Could not save. Edit again to retry.');
  for (const s of ['saving', 'saved', 'savedEarlier', 'retrying', 'failed'] as AutosaveStatus[]) {
    const t = autosaveStatusText(s);
    assert.ok(!/[—–]/.test(t) && !/\bAI\b/.test(t), t);
  }
});

// ---- payload -------------------------------------------------------------------------------------------------

const state = {
  title: 'Brass lamp',
  description: 'Works',
  category: 'Home',
  ebayCategoryId: '123',
  ebayCategoryName: 'Lamps',
  condition: 'USED',
  conditionGrade: 'B',
  tags: ['brass'],
  listingType: 'FIXED',
  reverseDailyDrop: 100,
  reverseFloorPrice: 500,
  brand: ' Acme ',
  mpn: '',
  upc: '  ',
  ebayShippingOverride: null,
  packageWeightOz: 16,
  packageLengthIn: 10,
  packageWidthIn: 8,
  packageHeightIn: 4,
};

test('payload: only the dirty keys, built from the current state', () => {
  assert.deepEqual(buildAutosavePayload(state, ['title', 'tags'], false), { title: 'Brass lamp', tags: ['brass'] });
  assert.deepEqual(buildAutosavePayload(state, ['condition', 'conditionGrade'], false), {
    condition: 'USED',
    conditionGrade: 'B',
  });
  assert.deepEqual(buildAutosavePayload(state, ['category', 'ebayCategoryId', 'ebayCategoryName'], false), {
    category: 'Home',
    ebayCategoryId: '123',
    ebayCategoryName: 'Lamps',
  });
});

test('payload: never contains price, draftStatus, status or skipMarketplaceSync, whatever is passed', () => {
  const everything = [...AUTOSAVE_FIELDS, 'price', 'draftStatus', 'status', 'skipMarketplaceSync', 'quantity'];
  const body = buildAutosavePayload({ ...state, price: 99, draftStatus: 'PUBLISHED' } as any, everything, true);
  for (const k of AUTOSAVE_FORBIDDEN_KEYS) assert.ok(!(k in body), k);
  assert.ok(!('quantity' in body));
  assert.equal(isAutosaveField('price'), false);
  assert.equal(isAutosaveField('title'), true);
  assert.ok(!AUTOSAVE_FIELDS.includes('price'));
  assert.deepEqual(buildAutosavePayload(state, ['price'], true), {});
});

test('payload: blank title and blank condition are never sent', () => {
  assert.deepEqual(buildAutosavePayload({ ...state, title: '  ' }, ['title'], false), {});
  assert.deepEqual(buildAutosavePayload({ ...state, condition: '' }, ['condition'], false), {});
  assert.deepEqual(buildAutosavePayload({ ...state, conditionGrade: undefined }, ['conditionGrade'], false), {});
});

test('payload: brand, mpn, upc are trimmed and blank becomes null', () => {
  assert.deepEqual(buildAutosavePayload(state, ['brand', 'mpn', 'upc'], false), { brand: 'Acme', mpn: null, upc: null });
});

test('payload: package fields go together, only when the weight was touched, and confirm the weight', () => {
  assert.deepEqual(buildAutosavePayload(state, ['packageLengthIn'], false), {});
  assert.deepEqual(buildAutosavePayload(state, ['packageWeightOz'], true), {
    packageWeightOz: 16,
    packageLengthIn: 10,
    packageWidthIn: 8,
    packageHeightIn: 4,
    packageConfirmedByOrganizer: true,
    packageEstimateSource: 'ORGANIZER',
  });
  const noWeight = buildAutosavePayload({ ...state, packageWeightOz: undefined }, ['packageWeightOz'], true);
  assert.equal(noWeight.packageWeightOz, null);
  assert.ok(!('packageConfirmedByOrganizer' in noWeight));
});

test('payload: listing type and reverse auction values', () => {
  assert.deepEqual(buildAutosavePayload(state, ['listingType', 'reverseDailyDrop', 'reverseFloorPrice'], false), {
    listingType: 'FIXED',
    reverseDailyDrop: 100,
    reverseFloorPrice: 500,
  });
  assert.deepEqual(buildAutosavePayload({ ...state, ebayShippingOverride: 'LOCAL_PICKUP_ONLY' }, ['ebayShippingOverride'], false), {
    ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
  });
});
