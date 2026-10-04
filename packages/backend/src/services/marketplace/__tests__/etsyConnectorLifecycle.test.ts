/**
 * ADR-135 batch E-B3, acceptance 3 (publish), 6 (withdraw and end) and 8 (inventory push), plus the
 * serializer, the status read and the small exported helpers. Notes (e) and (f): publishing needs
 * confirm and an attestation; the push switch blocks publish but never withdraw, end or inventory.
 * Fake database and fake Etsy, no network.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  ETSY_FAILED_STEP_MESSAGES,
  ETSY_LISTING_MESSAGES,
  ETSY_LISTING_STATUS_LABELS,
  ETSY_MAX_IMAGES,
  ETSY_PUBLISHING_STALE_MS,
  ETSY_WITHDRAWABLE_STATES,
  buildEtsyInventoryPutBody,
  collectUsableEtsyPhotoUrls,
  describeEtsyThrown,
  endEtsyListing,
  getEtsyListingStatus,
  loadOwnedEtsyItem,
  publishEtsyListing,
  serializeEtsyListing,
  updateEtsyListingInventory,
  withdrawEtsyListingIfExists,
} from '../etsyConnector';
import { EtsyError } from '../etsyBudget';
import { etsyResp } from './etsyFakeDb';
import { seedListing } from './etsyListingFakeDb';
import { INVENTORY_BODY, makeWorld } from './etsyListingHarness';

async function rejectsWith(p: Promise<any>, code: string, status?: number): Promise<any> {
  const err: any = await p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e) => e
  );
  expect(err.code).toBe(code);
  if (status !== undefined) expect(err.httpStatus ?? err.status).toBe(status);
  return err;
}

const publishArgs = (over: Record<string, any> = {}) => ({ organizerId: 'org_1', itemId: 'item_1', confirm: true, ...over });
const readyRow = (over: Record<string, any> = {}) => ({ state: 'DRAFT_READY', etsyListingId: '9001', imagesUploaded: 3, ...over });

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => logSpy.mockRestore());

// ---------------------------------------------------------------------------------------------
// Publish (acceptance 3)
// ---------------------------------------------------------------------------------------------

describe('publishEtsyListing: the happy path', () => {
  it('sends state=active for this organizer\'s listing and records ACTIVE with a four-month expiry', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    const out = await publishEtsyListing(publishArgs(), w.deps);
    expect(out.alreadyActive).toBe(false);
    const patches = w.etsy.where('PATCH', /.*/);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ organizerId: 'org_1', path: '/v3/application/shops/555/listings/9001', priority: 'INTERACTIVE', form: { state: 'active' } });
    expect(w.etsy.calls).toHaveLength(1);
    expect(out.listing).toMatchObject({ state: 'ACTIVE', failedStep: null, lastErrorMessage: null });
    expect(out.listing.publishedAt).toEqual(new Date('2026-10-03T12:00:00.000Z'));
    expect(out.listing.expiresAt).toEqual(new Date('2027-02-03T12:00:00.000Z'));
  });

  it('returns an ACTIVE listing without calling Etsy again', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    const out = await publishEtsyListing(publishArgs(), w.deps);
    expect(out.alreadyActive).toBe(true);
    expect(w.etsy.calls).toHaveLength(0);
  });
});

describe('publishEtsyListing: refusals call nothing on Etsy', () => {
  it.each([[undefined], [false], ['true'], [1], [null]])('needs confirm === true (got %p)', async (confirm) => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    const err = await rejectsWith(publishEtsyListing(publishArgs({ confirm }), w.deps), 'ETSY_CONFIRM_REQUIRED', 400);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.confirmRequired);
    expect(err.message).toContain('$0.20');
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0].state).toBe('DRAFT_READY');
  });

  it('is blocked when the connector is off (ETSY_DISABLED) or pushing is off (503)', async () => {
    const off = makeWorld({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    seedListing(off.db, readyRow());
    await rejectsWith(publishEtsyListing(publishArgs(), off.deps), 'ETSY_DISABLED');
    const noPush = makeWorld({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(noPush.db, readyRow());
    await rejectsWith(publishEtsyListing(publishArgs(), noPush.deps), 'ETSY_PUSH_DISABLED', 503);
    expect(noPush.etsy.calls).toHaveLength(0);
  });

  it('refuses an organizer who is not on the allowlist', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    await rejectsWith(publishEtsyListing(publishArgs({ organizerId: 'org_9' }), w.deps), 'ETSY_NOT_ALLOWED');
  });

  it('answers 404 for another organizer\'s item and for an item with no listing', async () => {
    const other = makeWorld({ itemOver: { organizerId: 'org_2' } });
    seedListing(other.db, readyRow({ organizerId: 'org_2' }));
    await rejectsWith(publishEtsyListing(publishArgs(), other.deps), 'ETSY_ITEM_NOT_FOUND', 404);
    const none = makeWorld();
    await rejectsWith(publishEtsyListing(publishArgs(), none.deps), 'ETSY_LISTING_NOT_FOUND', 404);
    expect(other.etsy.calls).toHaveLength(0);
  });

  it('refuses every state that is not DRAFT_READY', async () => {
    const pending = makeWorld();
    seedListing(pending.db, readyRow({ state: 'DRAFT_PENDING' }));
    const err = await rejectsWith(publishEtsyListing(publishArgs(), pending.deps), 'ETSY_NOT_DRAFT_READY', 409);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.draftPending);
    for (const state of ['FAILED', 'ENDED', 'SOLD', 'ORPHANED', 'PREPARING']) {
      const w = makeWorld();
      seedListing(w.db, readyRow({ state }));
      await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_NOT_DRAFT_READY', 409);
      expect(w.etsy.calls).toHaveLength(0);
    }
  });

  it('needs a stored attestation and an Etsy draft id', async () => {
    const a = makeWorld();
    seedListing(a.db, readyRow({ attestedAt: null }));
    await rejectsWith(publishEtsyListing(publishArgs(), a.deps), 'ETSY_NOT_ATTESTED', 409);
    const b = makeWorld();
    seedListing(b.db, readyRow({ etsyListingId: null }));
    await rejectsWith(publishEtsyListing(publishArgs(), b.deps), 'ETSY_NOT_DRAFT_READY', 409);
    expect(a.etsy.calls.length + b.etsy.calls.length).toBe(0);
  });

  it('refuses an item that sold since the draft was made', async () => {
    const w = makeWorld({ itemOver: { status: 'SOLD' } });
    seedListing(w.db, readyRow());
    await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_ITEM_UNAVAILABLE', 409);
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('re-checks eligibility at publish time, with the stored era and the card year', async () => {
    const w = makeWorld({ itemOver: { card: { releaseYear: 2015 } } });
    seedListing(w.db, readyRow());
    const err = await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_NOT_ELIGIBLE', 422);
    expect(err.details.eligibilityCode).toBe('CARD_YEAR_TOO_RECENT');
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0].state).toBe('DRAFT_READY');
    const recent = makeWorld();
    seedListing(recent.db, readyRow({ whenMade: '2020_2026' }));
    await rejectsWith(publishEtsyListing(publishArgs(), recent.deps), 'ETSY_NOT_ELIGIBLE', 422);
  });
});

describe('publishEtsyListing: Etsy says no', () => {
  it('maps a 4xx to ETSY_PUBLISH_BLOCKED (422) with Etsy\'s reason, and returns the row to DRAFT_READY', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push((c) => (c.method === 'PATCH' ? etsyResp(400, { error: 'Shop is not ready to publish' }) : undefined));
    const err = await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_PUBLISH_BLOCKED', 422);
    expect(err.message).toBe(`${ETSY_LISTING_MESSAGES.publishBlockedPrefix}Shop is not ready to publish.`);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', lastErrorMessage: err.message });
    expect(w.db.store.listings[0].publishedAt).toBeNull();
  });

  it('uses fixed text when Etsy gives no reason', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push((c) => (c.method === 'PATCH' ? etsyResp(403, null) : undefined));
    const err = await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_PUBLISH_BLOCKED', 422);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.publishBlocked);
  });

  it('answers 502 for an Etsy 5xx and keeps the draft', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push((c) => (c.method === 'PATCH' ? etsyResp(503, null) : undefined));
    const err = await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_PUBLISH_BLOCKED', 502);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.etsyTrouble);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', etsyListingId: '9001' });
  });

  it('forgets a draft that is gone on Etsy (404) and marks the row FAILED at the publish step', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push((c) => (c.method === 'PATCH' ? etsyResp(404, { error: 'gone' }) : undefined));
    const err = await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_PUBLISH_BLOCKED', 422);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.draftGone);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'PUBLISH', etsyListingId: null, imagesUploaded: 0 });
  });

  it('returns the row to DRAFT_READY and rethrows when Etsy cannot be reached', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push(() => {
      throw new EtsyError('ETSY_BUDGET', 'budget used up');
    });
    await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_BUDGET');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', lastErrorMessage: ETSY_LISTING_MESSAGES.busy });
  });
});

describe('publishEtsyListing: one call reaches Etsy', () => {
  it('lets only one of two simultaneous publishes send the activation', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    const results = await Promise.allSettled([publishEtsyListing(publishArgs(), w.deps), publishEtsyListing(publishArgs(), w.deps), publishEtsyListing(publishArgs(), w.deps)]);
    expect(w.etsy.where('PATCH', /.*/)).toHaveLength(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect((r.reason as any).code).toBe('ETSY_LISTING_BUSY');
    expect(w.db.store.listings[0].state).toBe('ACTIVE');
  });

  it('answers busy for a PUBLISHING row that was touched recently', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'PUBLISHING', updatedAt: new Date(w.clock.now.getTime() - 20 * 1000) }));
    await rejectsWith(publishEtsyListing(publishArgs(), w.deps), 'ETSY_LISTING_BUSY', 409);
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('publishes again from a stale PUBLISHING row, once, even with simultaneous callers', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'PUBLISHING', updatedAt: new Date(w.clock.now.getTime() - ETSY_PUBLISHING_STALE_MS - 1000) }));
    const results = await Promise.allSettled([publishEtsyListing(publishArgs(), w.deps), publishEtsyListing(publishArgs(), w.deps)]);
    expect(w.etsy.where('PATCH', /.*/)).toHaveLength(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(w.db.store.listings[0].state).toBe('ACTIVE');
  });
});

// ---------------------------------------------------------------------------------------------
// Withdraw and end (acceptance 6)
// ---------------------------------------------------------------------------------------------

describe('withdrawEtsyListingIfExists (acceptance 6)', () => {
  it('deletes the Etsy listing at URGENT priority and ends the row', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('withdrawn');
    const del = w.etsy.where('DELETE', /.*/);
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ organizerId: 'org_1', path: '/v3/application/listings/9001', priority: 'URGENT' });
    expect(w.db.store.listings[0]).toMatchObject({ state: 'ENDED', lastErrorMessage: null });
    expect(w.db.store.listings[0].endedAt).toEqual(new Date('2026-10-03T12:00:00.000Z'));
  });

  it.each(ETSY_WITHDRAWABLE_STATES as string[])('withdraws from %s', async (state) => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state }));
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('withdrawn');
    expect(w.db.store.listings[0].state).toBe('ENDED');
  });

  it.each(['ENDED', 'SOLD', 'ORPHANED', 'PREPARING'])('skips a row in %s without calling Etsy', async (state) => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state }));
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('skipped');
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0].state).toBe(state);
  });

  it('treats a 404 or 410 as gone and still ends the row', async () => {
    for (const status of [404, 410]) {
      const w = makeWorld();
      seedListing(w.db, readyRow({ state: 'ACTIVE' }));
      w.etsy.handlers.push((c) => (c.method === 'DELETE' ? etsyResp(status, null) : undefined));
      await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('gone');
      expect(w.db.store.listings[0].state).toBe('ENDED');
    }
  });

  it('is skipped when there is no row, no Etsy id, no item id, or the connector is off', async () => {
    const none = makeWorld();
    await expect(withdrawEtsyListingIfExists('item_1', none.deps)).resolves.toBe('skipped');
    await expect(withdrawEtsyListingIfExists('', none.deps)).resolves.toBe('skipped');
    const noId = makeWorld();
    seedListing(noId.db, readyRow({ state: 'DRAFT_PENDING', etsyListingId: null }));
    await expect(withdrawEtsyListingIfExists('item_1', noId.deps)).resolves.toBe('skipped');
    const off = makeWorld({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    seedListing(off.db, readyRow({ state: 'ACTIVE' }));
    await expect(withdrawEtsyListingIfExists('item_1', off.deps)).resolves.toBe('skipped');
    expect(off.etsy.calls).toHaveLength(0);
    expect(off.db.store.listings[0].state).toBe('ACTIVE');
  });

  it('answers failed and leaves the state alone on a 5xx or any other refusal, noting the error', async () => {
    for (const status of [500, 502, 403, 409]) {
      const w = makeWorld();
      seedListing(w.db, readyRow({ state: 'ACTIVE' }));
      w.etsy.handlers.push((c) => (c.method === 'DELETE' ? etsyResp(status, null) : undefined));
      await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('failed');
      expect(w.db.store.listings[0].state).toBe('ACTIVE');
      expect(w.db.store.listings[0].lastErrorMessage).toEqual(expect.any(String));
    }
  });

  it('answers failed (never throws) when the call throws', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    w.etsy.handlers.push(() => {
      throw new EtsyError('ETSY_BLOCKED', 'rate limited');
    });
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0].state).toBe('ACTIVE');
  });

  it('answers failed (never throws) when the database throws', async () => {
    const w = makeWorld();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    w.db.etsyListing.findUnique = async () => {
      throw new Error('db down');
    };
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('failed');
    errSpy.mockRestore();
  });

  it('is never blocked by the push switch (note f)', async () => {
    const w = makeWorld({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    await expect(withdrawEtsyListingIfExists('item_1', w.deps)).resolves.toBe('withdrawn');
  });
});

describe('endEtsyListing', () => {
  it('ends an ACTIVE listing at INTERACTIVE priority for the signed-in organizer', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    const out = await endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps);
    expect(out.outcome).toBe('withdrawn');
    expect(out.listing.state).toBe('ENDED');
    expect(w.etsy.where('DELETE', /.*/)[0]).toMatchObject({ priority: 'INTERACTIVE', path: '/v3/application/listings/9001' });
  });

  it('discards a draft on Etsy as well', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    const out = await endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps);
    expect(out.listing.state).toBe('ENDED');
    expect(w.etsy.where('DELETE', /.*/)).toHaveLength(1);
  });

  it('only marks a row ENDED locally when nothing exists on Etsy yet', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'FAILED', failedStep: 'CREATE', etsyListingId: null });
    const out = await endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps);
    expect(out.outcome).toBe('skipped');
    expect(out.listing.state).toBe('ENDED');
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('does nothing for a row that has already ended', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ENDED' }));
    const out = await endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps);
    expect(out.outcome).toBe('skipped');
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('answers 404 for another organizer\'s listing and never calls Etsy', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE', organizerId: 'org_2' }));
    await rejectsWith(endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps), 'ETSY_LISTING_NOT_FOUND', 404);
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0].state).toBe('ACTIVE');
  });

  it('answers 502 ETSY_END_FAILED and keeps the state when Etsy refuses', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    w.etsy.handlers.push((c) => (c.method === 'DELETE' ? etsyResp(500, null) : undefined));
    const err = await rejectsWith(endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps), 'ETSY_END_FAILED', 502);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.endFailed);
    expect(w.db.store.listings[0].state).toBe('ACTIVE');
  });

  it('reports gone when Etsy no longer has the listing', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    w.etsy.handlers.push((c) => (c.method === 'DELETE' ? etsyResp(404, null) : undefined));
    const out = await endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, w.deps);
    expect(out.outcome).toBe('gone');
    expect(out.listing.state).toBe('ENDED');
  });

  it('throws ETSY_DISABLED when the connector is off, but ignores the push switch', async () => {
    const off = makeWorld({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    seedListing(off.db, readyRow({ state: 'ACTIVE' }));
    await rejectsWith(endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, off.deps), 'ETSY_DISABLED');
    const noPush = makeWorld({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(noPush.db, readyRow({ state: 'ACTIVE' }));
    await expect(endEtsyListing({ organizerId: 'org_1', itemId: 'item_1' }, noPush.deps)).resolves.toMatchObject({ outcome: 'withdrawn' });
  });
});

// ---------------------------------------------------------------------------------------------
// Inventory push (acceptance 8)
// ---------------------------------------------------------------------------------------------

describe('updateEtsyListingInventory (acceptance 8)', () => {
  const live = (over: Record<string, any> = {}) => readyRow({ state: 'ACTIVE', syncedQuantity: 1, syncedPrice: 20, ...over });

  it('reads the inventory, then writes it back changing only price and quantity (BACKGROUND)', async () => {
    const w = makeWorld({ itemOver: { price: 25, stockTotal: 5, stockSold: 2 } });
    seedListing(w.db, live());
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toEqual({ ok: true, outcome: 'updated' });
    const [get] = w.etsy.where('GET', /\/inventory$/);
    const [put] = w.etsy.where('PUT', /\/inventory$/);
    expect(get).toMatchObject({ path: '/v3/application/listings/9001/inventory', priority: 'BACKGROUND' });
    expect(put).toMatchObject({ path: '/v3/application/listings/9001/inventory', priority: 'BACKGROUND', organizerId: 'org_1' });
    expect(put.body).toEqual({
      products: [{ sku: 'SKU-1', property_values: [], offerings: [{ price: 25, quantity: 3, is_enabled: true }] }],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    });
    expect(w.db.store.listings[0]).toMatchObject({ syncedQuantity: 3, syncedPrice: 25, lastErrorMessage: null });
  });

  it('also updates a DRAFT_READY listing', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ syncedQuantity: 1, syncedPrice: 20 }));
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toMatchObject({ outcome: 'updated' });
  });

  it('skips with a reason, and never throws, when there is nothing to do', async () => {
    const off = makeWorld({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    seedListing(off.db, live());
    await expect(updateEtsyListingInventory('item_1', off.deps)).resolves.toEqual({ ok: false, outcome: 'skipped', reason: 'disabled' });

    const none = makeWorld();
    await expect(updateEtsyListingInventory('item_1', none.deps)).resolves.toMatchObject({ reason: 'no-listing' });

    for (const over of [{ state: 'ENDED' }, { state: 'FAILED' }, { etsyListingId: null }]) {
      const w = makeWorld();
      seedListing(w.db, live(over));
      await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toMatchObject({ outcome: 'skipped', reason: 'not-live' });
      expect(w.etsy.calls).toHaveLength(0);
    }

    const noItem = makeWorld({ itemOver: { deletedAt: new Date('2026-10-03T00:00:00Z') } });
    seedListing(noItem.db, live());
    await expect(updateEtsyListingInventory('item_1', noItem.deps)).resolves.toMatchObject({ reason: 'no-item' });

    const zero = makeWorld({ itemOver: { stockTotal: 3, stockSold: 3 } });
    seedListing(zero.db, live());
    await expect(updateEtsyListingInventory('item_1', zero.deps)).resolves.toMatchObject({ reason: 'zero-quantity' });

    const noPrice = makeWorld({ itemOver: { price: null } });
    seedListing(noPrice.db, live());
    await expect(updateEtsyListingInventory('item_1', noPrice.deps)).resolves.toMatchObject({ reason: 'no-price' });
    expect(zero.etsy.calls.length + noPrice.etsy.calls.length + noItem.etsy.calls.length).toBe(0);
  });

  it('does nothing when price and quantity already match what was last sent', async () => {
    const w = makeWorld();
    seedListing(w.db, live({ syncedQuantity: 1, syncedPrice: 25 }));
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toEqual({ ok: true, outcome: 'skipped', reason: 'unchanged' });
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('rounds the price to cents', async () => {
    const w = makeWorld({ itemOver: { price: 24.999 } });
    seedListing(w.db, live());
    await updateEtsyListingInventory('item_1', w.deps);
    expect(w.etsy.where('PUT', /.*/)[0].body.products[0].offerings[0].price).toBe(25);
    expect(w.db.store.listings[0].syncedPrice).toBe(25);
  });

  it('does not rewrite a listing with variations (two products or two offerings)', async () => {
    const twoProducts = JSON.parse(JSON.stringify(INVENTORY_BODY));
    twoProducts.products.push({ ...twoProducts.products[0], product_id: 9 });
    const w = makeWorld();
    seedListing(w.db, live());
    w.etsy.handlers.push((c) => (c.method === 'GET' ? etsyResp(200, twoProducts) : undefined));
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toMatchObject({ outcome: 'skipped', reason: 'unsupported-variations' });
    expect(w.etsy.where('PUT', /.*/)).toHaveLength(0);

    const twoOfferings = JSON.parse(JSON.stringify(INVENTORY_BODY));
    twoOfferings.products[0].offerings.push({ offering_id: 3, price: { amount: 100, divisor: 100 }, quantity: 1, is_enabled: true, is_deleted: false });
    const v = makeWorld();
    seedListing(v.db, live());
    v.etsy.handlers.push((c) => (c.method === 'GET' ? etsyResp(200, twoOfferings) : undefined));
    await expect(updateEtsyListingInventory('item_1', v.deps)).resolves.toMatchObject({ reason: 'unsupported-variations' });
  });

  it('records a failed read and does not write', async () => {
    const w = makeWorld();
    seedListing(w.db, live());
    w.etsy.handlers.push((c) => (c.method === 'GET' ? etsyResp(500, null) : undefined));
    const out = await updateEtsyListingInventory('item_1', w.deps);
    expect(out).toMatchObject({ ok: false, outcome: 'failed', reason: 'get-failed', detail: ETSY_LISTING_MESSAGES.etsyTrouble });
    expect(w.etsy.where('PUT', /.*/)).toHaveLength(0);
    expect(w.db.store.listings[0]).toMatchObject({ syncedQuantity: 1, syncedPrice: 20, lastErrorMessage: ETSY_LISTING_MESSAGES.etsyTrouble });
  });

  it('records a failed write and keeps the last synced values', async () => {
    const w = makeWorld();
    seedListing(w.db, live());
    w.etsy.handlers.push((c) => (c.method === 'PUT' ? etsyResp(400, { error: 'bad body' }) : undefined));
    const out = await updateEtsyListingInventory('item_1', w.deps);
    expect(out).toMatchObject({ ok: false, outcome: 'failed', reason: 'put-failed' });
    expect(w.db.store.listings[0]).toMatchObject({ syncedQuantity: 1, syncedPrice: 20 });
  });

  it('never throws: a thrown error becomes a typed result', async () => {
    const w = makeWorld();
    seedListing(w.db, live());
    w.etsy.handlers.push(() => {
      throw new EtsyError('ETSY_NEEDS_REAUTH', 'revoked');
    });
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toEqual({ ok: false, outcome: 'failed', reason: 'threw', detail: ETSY_LISTING_MESSAGES.needsReauth });
  });

  it('is not blocked by the push switch', async () => {
    const w = makeWorld({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(w.db, live());
    await expect(updateEtsyListingInventory('item_1', w.deps)).resolves.toMatchObject({ outcome: 'updated' });
  });
});

describe('buildEtsyInventoryPutBody', () => {
  it('keeps sku, property values and the enabled flag, and changes only price and quantity', () => {
    const inventory = {
      products: [
        {
          product_id: 1,
          sku: 'ABC',
          is_deleted: false,
          property_values: [{ property_id: 200, property_name: 'Color', scale_id: null, value_ids: [1], values: ['Red'], extra: 'dropped' }],
          offerings: [{ offering_id: 2, price: { amount: 1000, divisor: 100 }, quantity: 9, is_enabled: false, is_deleted: false }],
        },
      ],
      price_on_property: [200],
      quantity_on_property: [],
      sku_on_property: [],
    };
    const before = JSON.stringify(inventory);
    expect(buildEtsyInventoryPutBody(inventory, 12.5, 4)).toEqual({
      products: [
        {
          sku: 'ABC',
          property_values: [{ property_id: 200, property_name: 'Color', scale_id: null, value_ids: [1], values: ['Red'] }],
          offerings: [{ price: 12.5, quantity: 4, is_enabled: false }],
        },
      ],
      price_on_property: [200],
      quantity_on_property: [],
      sku_on_property: [],
    });
    expect(JSON.stringify(inventory)).toBe(before);
  });

  it('ignores deleted products and offerings when counting variations, and returns null for empty or odd input', () => {
    const inv: any = JSON.parse(JSON.stringify(INVENTORY_BODY));
    inv.products.push({ product_id: 5, is_deleted: true, offerings: [] });
    inv.products[0].offerings.push({ offering_id: 6, is_deleted: true });
    expect(buildEtsyInventoryPutBody(inv, 1, 1)).not.toBeNull();
    expect(buildEtsyInventoryPutBody({ products: [] }, 1, 1)).toBeNull();
    expect(buildEtsyInventoryPutBody(null, 1, 1)).toBeNull();
    expect(buildEtsyInventoryPutBody({ products: [{ offerings: [] }] }, 1, 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Serializer, status read, helpers
// ---------------------------------------------------------------------------------------------

describe('serializeEtsyListing', () => {
  const fullRow = {
    id: 'listing_1',
    itemId: 'item_1',
    organizerId: 'org_1',
    shopId: '555',
    etsyListingId: '9001',
    attestedByUserId: 'user_secret',
    state: 'DRAFT_READY',
    whenMade: '1970s',
    whoMade: 'someone_else',
    isSupply: false,
    taxonomyId: 1234,
    shippingProfileId: '11',
    returnPolicyId: '22',
    readinessStateId: '33',
    imagesUploaded: 3,
    attestedAt: new Date('2026-10-03T11:00:00Z'),
  };

  it('leaves out the Etsy listing id, shop id, organizer id and the attesting user', () => {
    const view = serializeEtsyListing(fullRow, { taxonomyPath: 'Home & Living', imagesTotal: 3 });
    const text = JSON.stringify(view);
    for (const secret of ['9001', 'user_secret', '"organizerId"', '"shopId"', '"etsyListingId"', '"attestedByUserId"']) expect(text).not.toContain(secret);
    expect(view).toMatchObject({ id: 'listing_1', itemId: 'item_1', state: 'DRAFT_READY', statusLabel: 'Draft ready (needs your confirmation)', taxonomyPath: 'Home & Living', imagesTotal: 3, imagesUploaded: 3 });
  });

  it('derives the action flags from the state', () => {
    const flags = (state: string, over: Record<string, any> = {}) => {
      const v = serializeEtsyListing({ ...fullRow, state, ...over });
      return [v.canPublish, v.canRetry, v.canDiscard, v.canEnd];
    };
    expect(flags('DRAFT_READY')).toEqual([true, false, true, false]);
    expect(flags('DRAFT_READY', { attestedAt: null })).toEqual([false, false, true, false]);
    expect(flags('FAILED')).toEqual([false, true, true, false]);
    expect(flags('ACTIVE')).toEqual([false, false, false, true]);
    expect(flags('DRAFT_PENDING')).toEqual([false, false, true, false]);
    expect(flags('ENDED')).toEqual([false, false, false, false]);
    expect(flags('PUBLISHING')).toEqual([false, false, false, false]);
  });

  it('has a chip label for every state and a fallback sentence for every failed step', () => {
    for (const s of ['PREPARING', 'DRAFT_PENDING', 'DRAFT_READY', 'PUBLISHING', 'ACTIVE', 'ENDED', 'SOLD', 'FAILED', 'ORPHANED']) expect(ETSY_LISTING_STATUS_LABELS[s]).toEqual(expect.any(String));
    for (const step of ['CREATE', 'IMAGES', 'PUBLISH', 'UPDATE', 'DELETE']) {
      expect(serializeEtsyListing({ ...fullRow, state: 'FAILED', failedStep: step, lastErrorMessage: null }).message).toBe(ETSY_FAILED_STEP_MESSAGES[step]);
    }
    expect(serializeEtsyListing({ ...fullRow, state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: 'Stored text.' }).message).toBe('Stored text.');
    expect(serializeEtsyListing({ ...fullRow, state: 'FAILED', failedStep: null, lastErrorMessage: null }).message).toBe(ETSY_LISTING_MESSAGES.generic);
  });
});

describe('getEtsyListingStatus', () => {
  it('returns the organizer\'s own listing with the category path and photo count, calling nothing on Etsy', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow());
    const item = await loadOwnedEtsyItem('org_1', 'item_1', w.deps);
    const view: any = await getEtsyListingStatus({ organizerId: 'org_1', itemId: 'item_1', item }, w.deps);
    expect(view).toMatchObject({ state: 'DRAFT_READY', taxonomyId: 1234, taxonomyPath: 'Home & Living > Home Decor > Candle Holders', imagesTotal: 3 });
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('returns null for another organizer or when there is no listing', async () => {
    const w = makeWorld();
    seedListing(w.db, readyRow({ organizerId: 'org_2' }));
    await expect(getEtsyListingStatus({ organizerId: 'org_1', itemId: 'item_1' }, w.deps)).resolves.toBeNull();
    await expect(getEtsyListingStatus({ organizerId: 'org_1', itemId: 'zzz' }, w.deps)).resolves.toBeNull();
  });
});

describe('helpers', () => {
  it('loadOwnedEtsyItem scopes by organizer and sale, and refuses deleted items and odd ids', async () => {
    const w = makeWorld();
    await expect(loadOwnedEtsyItem('org_1', 'item_1', w.deps)).resolves.toMatchObject({ id: 'item_1' });
    await expect(loadOwnedEtsyItem('org_2', 'item_1', w.deps)).resolves.toBeNull();
    await expect(loadOwnedEtsyItem('org_1', '', w.deps)).resolves.toBeNull();
    await expect(loadOwnedEtsyItem('org_1', 'x'.repeat(101), w.deps)).resolves.toBeNull();
    await expect(loadOwnedEtsyItem('org_1', { $ne: null } as any, w.deps)).resolves.toBeNull();
  });

  it('collectUsableEtsyPhotoUrls checks https and host, caps the count, and honors the env allowlist addition', () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/p${i}.jpg`);
    const out = collectUsableEtsyPhotoUrls([...many, 'http://res.cloudinary.com/x.jpg', 'https://evil.example.com/x.jpg', 42, null]);
    expect(out.urls).toHaveLength(ETSY_MAX_IMAGES);
    expect(out.skipped).toBe(4);
    expect(collectUsableEtsyPhotoUrls('nope')).toEqual({ urls: [], skipped: 0 });
    expect(collectUsableEtsyPhotoUrls(['https://img.example.org/a.jpg'], {}).urls).toHaveLength(0);
    expect(collectUsableEtsyPhotoUrls(['https://img.example.org/a.jpg'], { ETSY_IMAGE_HOST_ALLOWLIST: 'img.example.org' }).urls).toHaveLength(1);
  });

  it('describeEtsyThrown never echoes internal text', () => {
    expect(describeEtsyThrown(new Error('post' + 'gres://u:p@h'))).toBe(ETSY_LISTING_MESSAGES.generic);
    expect(describeEtsyThrown(new EtsyError('ETSY_DISABLED', 'x'))).toBe(ETSY_LISTING_MESSAGES.disabled);
    expect(describeEtsyThrown(new EtsyError('ETSY_NOT_CONNECTED', 'x'))).toBe(ETSY_LISTING_MESSAGES.notConnected);
    expect(describeEtsyThrown(new EtsyError('ETSY_NEEDS_REAUTH', 'x'))).toBe(ETSY_LISTING_MESSAGES.needsReauth);
    expect(describeEtsyThrown(new EtsyError('ETSY_BUDGET', 'x'))).toBe(ETSY_LISTING_MESSAGES.busy);
    expect(describeEtsyThrown('plain string')).toBe(ETSY_LISTING_MESSAGES.generic);
  });
});
