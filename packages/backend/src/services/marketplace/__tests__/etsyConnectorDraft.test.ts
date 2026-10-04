/**
 * ADR-135 batch E-B3, acceptance 1 and 2 plus the draft request rules (orchestrator notes a, b, d, e, f):
 * requestEtsyDraft (every refusal, the atomic claim, the state matrix) and runEtsyDraftWorker (create,
 * persist the id first, photos in rank order, failures with the right step, discard mid-run, resume).
 * Fake database and fake Etsy, no network.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import * as Sentry from '@sentry/node';
import {
  ETSY_DRAFT_IDLE_MS,
  ETSY_LISTING_MESSAGES,
  ETSY_MAX_IMAGES,
  etsyCurrencyUnsupportedMessage,
  requestEtsyDraft,
  runEtsyDraftWorker,
} from '../etsyConnector';
import { EtsyError } from '../etsyBudget';
import { EtsyImageFetchError } from '../etsyImageFetch';
import { resetEtsyTaxonomyLoadForTests } from '../etsyTaxonomy';
import { etsyResp } from './etsyFakeDb';
import { seedListing } from './etsyListingFakeDb';
import { draftArgs, makeWorld, setupListRoutes } from './etsyListingHarness';

const NESTED_TREE = {
  results: [
    { id: 1, name: 'Home & Living', parent_id: null, children: [{ id: 10, name: 'Home Decor', parent_id: 1, children: [{ id: 1234, name: 'Candle Holders', parent_id: 10 }] }] },
  ],
};

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

const minutesAgo = (n: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, 0) - n * 60 * 1000);

beforeEach(() => {
  resetEtsyTaxonomyLoadForTests();
  (Sentry.captureMessage as jest.Mock).mockClear();
});

describe('requestEtsyDraft: the happy path and its row', () => {
  it('claims a DRAFT_PENDING row from the organizer\'s own item and calls nothing on Etsy', async () => {
    const w = makeWorld();
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.started).toBe(true);
    expect(out.listing).toMatchObject({
      itemId: 'item_1',
      organizerId: 'org_1',
      shopId: '555',
      state: 'DRAFT_PENDING',
      whenMade: '1970s',
      whoMade: 'someone_else',
      isSupply: false,
      taxonomyId: 1234,
      shippingProfileId: '11',
      returnPolicyId: '22',
      readinessStateId: '33',
      attestedByUserId: 'user_1',
      imagesUploaded: 0,
      etsyListingId: null,
    });
    expect(out.listing.attestedAt).toEqual(new Date('2026-10-03T12:00:00.000Z'));
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings).toHaveLength(1);
  });

  it('finds an item through its sale when the item has no organizerId of its own', async () => {
    const w = makeWorld({ itemOver: { organizerId: null, sale: { organizerId: 'org_1' } } });
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.started).toBe(true);
  });

  it('accepts a numeric-string taxonomy id and a craft supply with an organizer-chosen era', async () => {
    const w = makeWorld();
    const out = await requestEtsyDraft(draftArgs({ taxonomyId: '1234', isSupply: true, whenMade: '2020_2026' }), w.deps);
    expect(out.listing).toMatchObject({ isSupply: true, whenMade: '2020_2026', taxonomyId: 1234 });
  });

  it('keeps no return policy when the shop has none (only shipping and processing are required)', async () => {
    const w = makeWorld({ settingsOver: { defaultReturnPolicyId: null } });
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.listing.returnPolicyId).toBeNull();
  });
});

describe('requestEtsyDraft: switches, attestation and request shape', () => {
  it('throws ETSY_DISABLED when the connector is off', async () => {
    const w = makeWorld({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_DISABLED');
    expect(w.db.store.listings).toHaveLength(0);
  });

  it('answers 503 ETSY_PUSH_DISABLED when pushing is off', async () => {
    const w = makeWorld({ env: { ETSY_PUSH_ENABLED: 'false' } });
    const err = await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_PUSH_DISABLED', 503);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.pushDisabled);
  });

  it.each([[undefined], [false], ['true'], [1], [null]])('needs attest === true (got %p)', async (attest) => {
    const w = makeWorld();
    await rejectsWith(requestEtsyDraft(draftArgs({ attest }), w.deps), 'ETSY_ATTESTATION_REQUIRED', 400);
    expect(w.db.store.listings).toHaveLength(0);
  });

  it('refuses an organizer who is not on the allowlist', async () => {
    const w = makeWorld();
    await rejectsWith(requestEtsyDraft(draftArgs({ organizerId: 'org_9' }), w.deps), 'ETSY_NOT_ALLOWED');
  });

  it('rejects era and supply values of the wrong type', async () => {
    const w = makeWorld();
    await rejectsWith(requestEtsyDraft(draftArgs({ whenMade: 1970 }), w.deps), 'ETSY_BAD_REQUEST', 400);
    await rejectsWith(requestEtsyDraft(draftArgs({ isSupply: 'yes' }), w.deps), 'ETSY_BAD_REQUEST', 400);
  });

  it.each([[undefined], [null], ['abc'], [0], [-3], [2147483648], ['1e3'], [1.5]])('rejects taxonomy id %p as a missing category', async (taxonomyId) => {
    const w = makeWorld();
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ taxonomyId }), w.deps), 'ETSY_PAYLOAD_INVALID', 400);
    expect(err.details.problems[0].code).toBe('TAXONOMY_MISSING');
  });
});

describe('requestEtsyDraft: scoping by organizer (note d)', () => {
  it('answers 404 for another organizer\'s item, never revealing it exists', async () => {
    const w = makeWorld({ itemOver: { organizerId: 'org_2' } });
    const err = await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_ITEM_NOT_FOUND', 404);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.itemNotFound);
    expect(w.db.store.listings).toHaveLength(0);
  });

  it('answers 404 for a deleted item and for an unknown id', async () => {
    const deleted = makeWorld({ itemOver: { deletedAt: new Date('2026-10-01T00:00:00Z') } });
    await rejectsWith(requestEtsyDraft(draftArgs(), deleted.deps), 'ETSY_ITEM_NOT_FOUND', 404);
    const w = makeWorld();
    await rejectsWith(requestEtsyDraft(draftArgs({ itemId: 'nope' }), w.deps), 'ETSY_ITEM_NOT_FOUND', 404);
  });

  it('refuses a listing row that belongs to another organizer for the same item id', async () => {
    const w = makeWorld();
    seedListing(w.db, { organizerId: 'org_2', state: 'FAILED' });
    await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_ITEM_NOT_FOUND', 404);
    expect(w.db.store.listings[0].organizerId).toBe('org_2');
    expect(w.db.store.listings[0].state).toBe('FAILED');
  });

  it.each(['SOLD', 'DONATED', 'AUCTION_ENDED', 'INVOICE_ISSUED'])('answers 409 for an item that is %s', async (status) => {
    const w = makeWorld({ itemOver: { status } });
    await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_ITEM_UNAVAILABLE', 409);
  });
});

describe('requestEtsyDraft: account, scopes and shop currency', () => {
  it('needs a connected account and shop', async () => {
    const none = makeWorld({ connection: false });
    await rejectsWith(requestEtsyDraft(draftArgs(), none.deps), 'ETSY_NOT_CONNECTED');
    const noSettings = makeWorld();
    noSettings.db.store.settings.length = 0;
    await rejectsWith(requestEtsyDraft(draftArgs(), noSettings.deps), 'ETSY_NOT_CONNECTED');
  });

  it('asks for a reconnect when the account is not ACTIVE or a scope is missing', async () => {
    const reauth = makeWorld({ accountOver: { status: 'NEEDS_REAUTH' } });
    await rejectsWith(requestEtsyDraft(draftArgs(), reauth.deps), 'ETSY_NEEDS_REAUTH');
    const scopes = makeWorld({ accountOver: { grantedScopes: 'listings_r shops_r' } });
    await rejectsWith(requestEtsyDraft(draftArgs(), scopes.deps), 'ETSY_NEEDS_REAUTH');
  });

  it('answers 422 for a shop that is not USD and names the currency', async () => {
    const w = makeWorld({ settingsOver: { shopCurrency: 'EUR' } });
    const err = await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_CURRENCY_UNSUPPORTED', 422);
    expect(err.message).toBe(etsyCurrencyUnsupportedMessage('EUR'));
  });

  it('allows a shop whose currency is not yet known', async () => {
    const w = makeWorld({ settingsOver: { shopCurrency: null } });
    await expect(requestEtsyDraft(draftArgs(), w.deps)).resolves.toMatchObject({ started: true });
  });
});

describe('requestEtsyDraft: the server-side eligibility re-check (note a), with no override', () => {
  it('rejects an era that is too recent with the 422 Discogs-style details', async () => {
    const w = makeWorld();
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ whenMade: '2020_2026' }), w.deps), 'ETSY_NOT_ELIGIBLE', 422);
    expect(err.details).toMatchObject({ eligible: false, eligibilityCode: 'ERA_TOO_RECENT' });
    expect(typeof err.details.reason).toBe('string');
    expect(err.message).toBe(err.details.reason);
    expect(w.db.store.listings).toHaveLength(0);
  });

  it('rejects no era at all (not a supply) with the no-era message', async () => {
    const w = makeWorld();
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ whenMade: undefined }), w.deps), 'ETSY_NOT_ELIGIBLE', 422);
    expect(err.details.eligibilityCode).toBe('NO_ERA');
  });

  it('rejects an invalid era string as no data', async () => {
    const w = makeWorld();
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ whenMade: 'last_week' }), w.deps), 'ETSY_NOT_ELIGIBLE', 422);
    expect(err.details.eligibilityCode).toBe('NO_ERA');
  });

  it('loads the card release year from the item and lets it decide (too recent even with an old era)', async () => {
    const w = makeWorld({ itemOver: { card: { releaseYear: 2015 } } });
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ whenMade: '1970s' }), w.deps), 'ETSY_NOT_ELIGIBLE', 422);
    expect(err.details.eligibilityCode).toBe('CARD_YEAR_TOO_RECENT');
    const supply = makeWorld({ itemOver: { card: { releaseYear: 2015 } } });
    await rejectsWith(requestEtsyDraft(draftArgs({ isSupply: true }), supply.deps), 'ETSY_NOT_ELIGIBLE', 422);
  });

  it('accepts an old card with an era the organizer chose', async () => {
    const w = makeWorld({ itemOver: { card: { releaseYear: 1995 } } });
    await expect(requestEtsyDraft(draftArgs({ whenMade: '1990s' }), w.deps)).resolves.toMatchObject({ started: true });
  });

  it('is eligible but needs a valid era for a craft supply with no era: WHEN_MADE_INVALID, a clear 400 (note b)', async () => {
    const w = makeWorld();
    const err = await rejectsWith(requestEtsyDraft(draftArgs({ isSupply: true, whenMade: undefined }), w.deps), 'ETSY_PAYLOAD_INVALID', 400);
    expect(err.details.problems[0]).toMatchObject({ code: 'WHEN_MADE_INVALID' });
    expect(err.message).toMatch(/when this item was made/i);
    expect(w.db.store.listings).toHaveLength(0);
  });

  it('accepts any era from the full enum for a craft supply, including made_to_order', async () => {
    const w = makeWorld();
    const out = await requestEtsyDraft(draftArgs({ isSupply: true, whenMade: 'made_to_order' }), w.deps);
    expect(out.listing.whenMade).toBe('made_to_order');
  });
});

describe('requestEtsyDraft: shop setup', () => {
  it('answers 409 when there is no shipping or processing profile', async () => {
    const ship = makeWorld({ settingsOver: { defaultShippingProfileId: null } });
    await rejectsWith(requestEtsyDraft(draftArgs(), ship.deps), 'ETSY_SETUP_INCOMPLETE', 409);
    const proc = makeWorld({ settingsOver: { defaultReadinessStateId: null } });
    await rejectsWith(requestEtsyDraft(draftArgs(), proc.deps), 'ETSY_SETUP_INCOMPLETE', 409);
  });

  it('rejects a picked profile id that is not numeric', async () => {
    const w = makeWorld();
    await rejectsWith(requestEtsyDraft(draftArgs({ shippingProfileId: 'abc' }), w.deps), 'ETSY_SETUP_INVALID', 400);
    await rejectsWith(requestEtsyDraft(draftArgs({ readinessStateId: '12; DROP' }), w.deps), 'ETSY_SETUP_INVALID', 400);
  });

  it('does not ask Etsy when the picked profiles equal the saved defaults', async () => {
    const w = makeWorld();
    const request = jest.fn(w.requestImpl);
    w.requestImpl = request as any;
    await requestEtsyDraft(draftArgs({ shippingProfileId: '11', readinessStateId: 33, returnPolicyId: '22' }), w.deps);
    expect(request).not.toHaveBeenCalled();
  });

  it('validates different picked profiles against the organizer\'s own Etsy lists and stores them', async () => {
    const w = makeWorld();
    w.requestImpl = setupListRoutes({ shipping: [11, 12], returns: [22, 23], processing: [33, 34] });
    const out = await requestEtsyDraft(draftArgs({ shippingProfileId: '12', returnPolicyId: '23', readinessStateId: '34' }), w.deps);
    expect(out.listing).toMatchObject({ shippingProfileId: '12', returnPolicyId: '23', readinessStateId: '34' });
  });

  it('rejects picked profiles that are not in the shop\'s lists, naming the field', async () => {
    const w = makeWorld();
    w.requestImpl = setupListRoutes({ shipping: [11], returns: [22], processing: [33] });
    const bad = await rejectsWith(requestEtsyDraft(draftArgs({ shippingProfileId: '99' }), w.deps), 'ETSY_SETUP_INVALID', 400);
    expect(bad.details.field).toBe('shippingProfileId');
    const badProc = await rejectsWith(requestEtsyDraft(draftArgs({ readinessStateId: '98' }), w.deps), 'ETSY_SETUP_INVALID', 400);
    expect(badProc.details.field).toBe('readinessStateId');
    const badRet = await rejectsWith(requestEtsyDraft(draftArgs({ returnPolicyId: '97' }), w.deps), 'ETSY_SETUP_INVALID', 400);
    expect(badRet.details.field).toBe('returnPolicyId');
    expect(w.db.store.listings).toHaveLength(0);
  });
});

describe('requestEtsyDraft: the draft payload and the category', () => {
  it('rejects an item with no price or no title or nothing left to sell', async () => {
    const price = makeWorld({ itemOver: { price: null } });
    expect((await rejectsWith(requestEtsyDraft(draftArgs(), price.deps), 'ETSY_PAYLOAD_INVALID', 400)).details.problems[0].code).toBe('PRICE_MISSING');
    const title = makeWorld({ itemOver: { title: '   ' } });
    expect((await rejectsWith(requestEtsyDraft(draftArgs(), title.deps), 'ETSY_PAYLOAD_INVALID', 400)).details.problems[0].code).toBe('TITLE_EMPTY');
    const sold = makeWorld({ itemOver: { stockTotal: 3, stockSold: 3 } });
    expect((await rejectsWith(requestEtsyDraft(draftArgs(), sold.deps), 'ETSY_PAYLOAD_INVALID', 400)).details.problems[0].code).toBe('QUANTITY_ZERO');
  });

  it('rejects a category that is not in the cache, and one that is not a leaf', async () => {
    const w = makeWorld();
    const missing = await rejectsWith(requestEtsyDraft(draftArgs({ taxonomyId: 99999 }), w.deps), 'ETSY_TAXONOMY_INVALID', 400);
    expect(missing.message).toBe(ETSY_LISTING_MESSAGES.taxonomyInvalid);
    const notLeaf = await rejectsWith(requestEtsyDraft(draftArgs({ taxonomyId: 10 }), w.deps), 'ETSY_TAXONOMY_INVALID', 400);
    expect(notLeaf.message).toBe(ETSY_LISTING_MESSAGES.taxonomyNotLeaf);
    expect(notLeaf.details.reason).toBe('NOT_LEAF');
  });

  it('answers 503 when the category list is empty and Etsy cannot supply it', async () => {
    const w = makeWorld({ taxonomy: false });
    const err = await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), 'ETSY_TAXONOMY_UNAVAILABLE', 503);
    expect(err.message).toBe(ETSY_LISTING_MESSAGES.taxonomyUnavailable);
  });

  it('loads the category list on first use when it is empty', async () => {
    const w = makeWorld({ taxonomy: false });
    w.requestImpl = async () => etsyResp(200, NESTED_TREE);
    await expect(requestEtsyDraft(draftArgs(), w.deps)).resolves.toMatchObject({ started: true });
  });
});

describe('requestEtsyDraft: what an existing row means', () => {
  it.each([
    ['ACTIVE', 'ETSY_ALREADY_LISTED'],
    ['PUBLISHING', 'ETSY_LISTING_BUSY'],
    ['SOLD', 'ETSY_ITEM_UNAVAILABLE'],
    ['DRAFT_READY', 'ETSY_DRAFT_EXISTS'],
    ['ORPHANED', 'ETSY_LISTING_ORPHANED'],
  ])('answers 409 %s -> %s and leaves the row alone', async (state, code) => {
    const w = makeWorld();
    seedListing(w.db, { state, etsyListingId: '9001' });
    await rejectsWith(requestEtsyDraft(draftArgs(), w.deps), code, 409);
    expect(w.db.store.listings[0].state).toBe(state);
  });

  it('returns a fresh DRAFT_PENDING row without starting a second worker', async () => {
    const w = makeWorld();
    const row = seedListing(w.db, { state: 'DRAFT_PENDING', updatedAt: new Date(w.clock.now.getTime() - 30 * 1000) });
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.started).toBe(false);
    expect(out.listing.id).toBe(row.id);
  });

  it('reclaims a stale DRAFT_PENDING row and keeps the Etsy draft and the values it was created from', async () => {
    const w = makeWorld();
    seedListing(w.db, {
      state: 'DRAFT_PENDING',
      etsyListingId: '9001',
      imagesUploaded: 2,
      whenMade: '1960s',
      attestedByUserId: 'user_old',
      updatedAt: new Date(w.clock.now.getTime() - ETSY_DRAFT_IDLE_MS - 1000),
    });
    const out = await requestEtsyDraft(draftArgs({ whenMade: '1980s' }), w.deps);
    expect(out.started).toBe(true);
    expect(out.listing).toMatchObject({ state: 'DRAFT_PENDING', etsyListingId: '9001', imagesUploaded: 2, whenMade: '1960s', attestedByUserId: 'user_1' });
  });

  it('retries a FAILED row with no Etsy draft from scratch with the new values', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'FAILED', failedStep: 'CREATE', lastErrorMessage: 'x', whenMade: '1960s' });
    const out = await requestEtsyDraft(draftArgs({ whenMade: '1980s' }), w.deps);
    expect(out.started).toBe(true);
    expect(out.listing).toMatchObject({ state: 'DRAFT_PENDING', whenMade: '1980s', failedStep: null, lastErrorMessage: null, etsyListingId: null });
  });

  it('retries a FAILED row that already has an Etsy draft as a resume', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'FAILED', failedStep: 'IMAGES', etsyListingId: '9001', imagesUploaded: 1 });
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.started).toBe(true);
    expect(out.listing).toMatchObject({ state: 'DRAFT_PENDING', etsyListingId: '9001', imagesUploaded: 1, failedStep: null });
  });

  it('starts over from an ENDED row, forgetting the old Etsy id', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'ENDED', etsyListingId: '9001', imagesUploaded: 3, endedAt: new Date('2026-10-02T00:00:00Z'), publishedAt: new Date('2026-09-30T00:00:00Z') });
    const out = await requestEtsyDraft(draftArgs(), w.deps);
    expect(out.listing).toMatchObject({ state: 'DRAFT_PENDING', etsyListingId: null, imagesUploaded: 0, endedAt: null, publishedAt: null });
  });

  it('claims a PREPARING row', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'PREPARING' });
    await expect(requestEtsyDraft(draftArgs(), w.deps)).resolves.toMatchObject({ started: true });
  });

  it('lets exactly one of two simultaneous first requests start the worker, with one row', async () => {
    const w = makeWorld();
    const results = await Promise.all([requestEtsyDraft(draftArgs(), w.deps), requestEtsyDraft(draftArgs(), w.deps)]);
    expect(results.filter((r) => r.started)).toHaveLength(1);
    expect(w.db.store.listings).toHaveLength(1);
  });

  it('lets exactly one of two simultaneous requests reclaim a stale row', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'DRAFT_PENDING', updatedAt: minutesAgo(10) });
    const results = await Promise.all([requestEtsyDraft(draftArgs(), w.deps), requestEtsyDraft(draftArgs(), w.deps), requestEtsyDraft(draftArgs(), w.deps)]);
    expect(results.filter((r) => r.started)).toHaveLength(1);
  });

  it('lets exactly one of two simultaneous requests retry a FAILED row', async () => {
    const w = makeWorld();
    seedListing(w.db, { state: 'FAILED', failedStep: 'CREATE' });
    const results = await Promise.all([requestEtsyDraft(draftArgs(), w.deps), requestEtsyDraft(draftArgs(), w.deps)]);
    expect(results.filter((r) => r.started)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------------------------

async function pendingWorld(opts: Parameters<typeof makeWorld>[0] = {}, rowOver: Record<string, any> = {}) {
  const w = makeWorld(opts);
  const row = seedListing(w.db, { state: 'DRAFT_PENDING', ...rowOver });
  return { w, row };
}
const photos = (n: number) => Array.from({ length: n }, (_, i) => `https://res.cloudinary.com/demo/image/upload/v1/p${i + 1}.jpg`);

describe('runEtsyDraftWorker: create, images in rank order, ready (acceptance 1)', () => {
  it('creates the draft with urlencoded form fields from the item and the stored attestation', async () => {
    const { w, row } = await pendingWorld();
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    const create = w.etsy.where('POST', /\/shops\/555\/listings$/);
    expect(create).toHaveLength(1);
    expect(create[0]).toMatchObject({ organizerId: 'org_1', priority: 'INTERACTIVE', path: '/v3/application/shops/555/listings' });
    expect(create[0].form).toMatchObject({
      title: 'Vintage Brass Candlestick',
      price: '25.00',
      quantity: '1',
      who_made: 'someone_else',
      when_made: '1970s',
      is_supply: 'false',
      taxonomy_id: '1234',
      type: 'physical',
      should_auto_renew: 'false',
      shipping_profile_id: '11',
      return_policy_id: '22',
      readiness_state_id: '33',
      tags: 'brass,candlestick',
      materials: 'Brass',
    });
    expect(create[0].body).toBeUndefined();
    expect(create[0].multipart).toBeUndefined();
    for (const v of Object.values(create[0].form as Record<string, unknown>)) expect(typeof v).toBe('string');
  });

  it('saves the Etsy listing id before the first image goes up, then uploads photos 1..N with ranks', async () => {
    const { w, row } = await pendingWorld();
    const seenAtFirstImage: any[] = [];
    w.etsy.handlers.push((c) => {
      if (c.method === 'POST' && /\/images$/.test(c.path)) seenAtFirstImage.push({ id: w.db.store.listings[0].etsyListingId, uploaded: w.db.store.listings[0].imagesUploaded });
      return undefined;
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(seenAtFirstImage[0]).toEqual({ id: '9001', uploaded: 0 });
    const uploads = w.etsy.where('POST', /\/images$/);
    expect(uploads.map((u) => u.path)).toEqual(Array(3).fill('/v3/application/shops/555/listings/9001/images'));
    expect(uploads.map((u) => u.multipart!.find((p: any) => p.name === 'rank').value)).toEqual(['1', '2', '3']);
    expect(uploads[0].multipart![0]).toMatchObject({ name: 'image', filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(w.fetched).toEqual(photos(3).map((_, i) => `https://res.cloudinary.com/demo/image/upload/v1/a${i + 1}.jpg`));
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', etsyListingId: '9001', imagesUploaded: 3, syncedQuantity: 1, syncedPrice: 25, failedStep: null });
  });

  it('sends at most ETSY_MAX_IMAGES photos', async () => {
    const { w, row } = await pendingWorld({ itemOver: { photoUrls: photos(25) } });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(ETSY_MAX_IMAGES);
    expect(w.db.store.listings[0].imagesUploaded).toBe(ETSY_MAX_IMAGES);
  });

  it('skips photos whose host is not allowed or that are not https, without fetching them, and keeps ranks consecutive', async () => {
    const urls = ['http://res.cloudinary.com/demo/a.jpg', 'https://evil.example.com/b.jpg', ...photos(2)];
    const { w, row } = await pendingWorld({ itemOver: { photoUrls: urls } });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(w.fetched).toEqual(photos(2));
    expect(w.etsy.where('POST', /\/images$/).map((u) => u.multipart!.find((p: any) => p.name === 'rank').value)).toEqual(['1', '2']);
  });

  it('skips a photo the fetcher rejects as not an image and carries on', async () => {
    const { w, row } = await pendingWorld({ itemOver: { photoUrls: photos(3) } });
    w.fetchImage.mockImplementationOnce(async () => {
      throw new EtsyImageFetchError('NOT_IMAGE', 'nope');
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(2);
    expect(w.db.store.listings[0].imagesUploaded).toBe(2);
  });

  it('fails IMAGES with the no-photos message when none can be used, keeping the Etsy draft id', async () => {
    const { w, row } = await pendingWorld({ itemOver: { photoUrls: ['https://evil.example.com/x.jpg'] } });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: ETSY_LISTING_MESSAGES.noPhotos, etsyListingId: '9001' });
  });

  it('fails IMAGES with a try-again message on a transient photo host error, and does not skip the photo', async () => {
    const { w, row } = await pendingWorld();
    w.fetchImage.mockImplementationOnce(async () => {
      throw new EtsyImageFetchError('TIMEOUT', 'slow');
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: ETSY_LISTING_MESSAGES.photoHostTrouble, etsyListingId: '9001', imagesUploaded: 0 });
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(0);
  });
});

describe('runEtsyDraftWorker: failures and their steps', () => {
  it('is skipped (row untouched) when the connector or pushing is switched off', async () => {
    for (const env of [{ ETSY_CONNECTOR_ENABLED: undefined }, { ETSY_PUSH_ENABLED: undefined }]) {
      const { w, row } = await pendingWorld({ env });
      await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('skipped');
      expect(w.db.store.listings[0].state).toBe('DRAFT_PENDING');
      expect(w.etsy.calls).toHaveLength(0);
    }
  });

  it('is skipped for a missing row and for a row that is not DRAFT_PENDING', async () => {
    const w = makeWorld();
    await expect(runEtsyDraftWorker('nope', w.deps)).resolves.toBe('skipped');
    const row = seedListing(w.db, { state: 'DRAFT_READY' });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('skipped');
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('fails CREATE with fixed text on an Etsy 4xx, and says Etsy is having trouble on a 5xx', async () => {
    const a = await pendingWorld();
    a.w.etsy.handlers.push((c) => (c.method === 'POST' && /\/listings$/.test(c.path) ? etsyResp(400, { error: 'bad title' }) : undefined));
    await expect(runEtsyDraftWorker(a.row.id, a.w.deps)).resolves.toBe('failed');
    expect(a.w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'CREATE', lastErrorMessage: ETSY_LISTING_MESSAGES.generic, etsyListingId: null });
    expect(a.w.etsy.where('POST', /\/images$/)).toHaveLength(0);

    const b = await pendingWorld();
    b.w.etsy.handlers.push((c) => (c.method === 'POST' && /\/listings$/.test(c.path) ? etsyResp(503, null) : undefined));
    await expect(runEtsyDraftWorker(b.row.id, b.w.deps)).resolves.toBe('failed');
    expect(b.w.db.store.listings[0].lastErrorMessage).toBe(ETSY_LISTING_MESSAGES.etsyTrouble);
  });

  it('flags a 400 that mentions when_made to Sentry as possible era-list drift', async () => {
    const { w, row } = await pendingWorld();
    w.etsy.handlers.push((c) => (c.method === 'POST' && /\/listings$/.test(c.path) ? etsyResp(400, { error: 'Invalid when_made value' }) : undefined));
    await runEtsyDraftWorker(row.id, w.deps);
    const calls = (Sentry.captureMessage as jest.Mock).mock.calls;
    expect(calls.some(([msg, ctx]) => /when_made/.test(msg) && ctx.level === 'error' && ctx.tags.step === 'when-made-drift')).toBe(true);
  });

  it('fails CREATE when Etsy answers without a usable listing id', async () => {
    for (const data of [{}, { listing_id: 'abc' }, { listing_id: 0 }, null]) {
      const { w, row } = await pendingWorld();
      w.etsy.handlers.push((c) => (c.method === 'POST' && /\/listings$/.test(c.path) ? etsyResp(201, data) : undefined));
      await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
      expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'CREATE', etsyListingId: null });
    }
  });

  it('fails IMAGES on an upload 5xx, and forgets the draft on an upload 404', async () => {
    const a = await pendingWorld();
    a.w.etsy.handlers.push((c) => (/\/images$/.test(c.path) && c.method === 'POST' ? etsyResp(500, null) : undefined));
    await expect(runEtsyDraftWorker(a.row.id, a.w.deps)).resolves.toBe('failed');
    expect(a.w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: ETSY_LISTING_MESSAGES.etsyTrouble, etsyListingId: '9001' });

    const b = await pendingWorld();
    b.w.etsy.handlers.push((c) => (/\/images$/.test(c.path) && c.method === 'POST' ? etsyResp(404, { error: 'gone' }) : undefined));
    await expect(runEtsyDraftWorker(b.row.id, b.w.deps)).resolves.toBe('failed');
    expect(b.w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: ETSY_LISTING_MESSAGES.draftGone, etsyListingId: null, imagesUploaded: 0 });
  });

  it('turns a thrown Etsy error into an organizer sentence on a FAILED row', async () => {
    const { w, row } = await pendingWorld();
    w.etsy.handlers.push(() => {
      throw new EtsyError('ETSY_NEEDS_REAUTH', 'token revoked');
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'CREATE', lastErrorMessage: ETSY_LISTING_MESSAGES.needsReauth });
  });

  it('never stores raw internal error text from an unexpected throw', async () => {
    const { w, row } = await pendingWorld();
    w.etsy.handlers.push(() => {
      throw new Error('secret connection string ' + 'post' + 'gres://user:pw@host');
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0].lastErrorMessage).toBe(ETSY_LISTING_MESSAGES.generic);
  });

  it('fails CREATE without calling Etsy when the item sold or was deleted since the request', async () => {
    const sold = await pendingWorld({ itemOver: { status: 'SOLD' } });
    await expect(runEtsyDraftWorker(sold.row.id, sold.w.deps)).resolves.toBe('failed');
    expect(sold.w.db.store.listings[0]).toMatchObject({ failedStep: 'CREATE', lastErrorMessage: ETSY_LISTING_MESSAGES.itemUnavailable });
    expect(sold.w.etsy.calls).toHaveLength(0);
    const gone = await pendingWorld({ itemOver: { deletedAt: new Date('2026-10-03T11:59:00Z') } });
    await expect(runEtsyDraftWorker(gone.row.id, gone.w.deps)).resolves.toBe('failed');
    expect(gone.w.etsy.calls).toHaveLength(0);
  });

  it('re-checks eligibility inside the worker and never creates a listing for an ineligible item', async () => {
    const { w, row } = await pendingWorld({ itemOver: { card: { releaseYear: 2015 } } });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'CREATE' });
    expect(w.db.store.listings[0].lastErrorMessage).toMatch(/2015/);
  });

  it('never throws, even when the database does', async () => {
    const { w, row } = await pendingWorld();
    w.db.etsyListing.findUnique = async () => {
      throw new Error('db down');
    };
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
  });
});

describe('runEtsyDraftWorker: a discard while it runs stops it', () => {
  it('cancels after create, deletes the draft it just made on Etsy, and leaves the row ENDED', async () => {
    const { w, row } = await pendingWorld();
    w.etsy.handlers.push((c) => {
      if (c.method === 'POST' && /\/listings$/.test(c.path)) w.db.store.listings[0].state = 'ENDED';
      return undefined;
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('cancelled');
    expect(w.etsy.where('DELETE', /\/listings\/9001$/)).toHaveLength(1);
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(0);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'ENDED', etsyListingId: null });
  });

  it('stops uploading photos once the row is no longer pending', async () => {
    const { w, row } = await pendingWorld();
    let uploads = 0;
    w.etsy.handlers.push((c) => {
      if (c.method === 'POST' && /\/images$/.test(c.path) && ++uploads === 2) w.db.store.listings[0].state = 'ENDED';
      return undefined;
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('cancelled');
    expect(uploads).toBe(2);
    expect(w.db.store.listings[0].state).toBe('ENDED');
  });
});

describe('runEtsyDraftWorker: resume (acceptance 2)', () => {
  const imagesResponse = (n: number) => etsyResp(200, { count: n, results: Array.from({ length: n }, (_, i) => ({ listing_image_id: 100 + i, rank: i + 1 })) });

  it('asks Etsy once for the image count, does not create again, and uploads only the rest', async () => {
    const { w, row } = await pendingWorld({}, { etsyListingId: '9001', imagesUploaded: 2 });
    w.etsy.handlers.push((c) => (c.method === 'GET' && /\/images$/.test(c.path) ? imagesResponse(2) : undefined));
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(w.etsy.where('GET', /\/listings\/9001\/images$/)).toHaveLength(1);
    expect(w.etsy.where('POST', /\/shops\/555\/listings$/)).toHaveLength(0);
    const uploads = w.etsy.where('POST', /\/images$/);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].multipart!.find((p: any) => p.name === 'rank').value).toBe('3');
    expect(w.fetched).toEqual(['https://res.cloudinary.com/demo/image/upload/v1/a3.jpg']);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', imagesUploaded: 3, etsyListingId: '9001' });
  });

  it('trusts Etsy\'s count over the stored one', async () => {
    const { w, row } = await pendingWorld({}, { etsyListingId: '9001', imagesUploaded: 0 });
    w.etsy.handlers.push((c) => (c.method === 'GET' && /\/images$/.test(c.path) ? imagesResponse(2) : undefined));
    await runEtsyDraftWorker(row.id, w.deps);
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(1);
  });

  it('uploads nothing when Etsy already has every photo, and still finishes', async () => {
    const { w, row } = await pendingWorld({}, { etsyListingId: '9001', imagesUploaded: 1 });
    w.etsy.handlers.push((c) => (c.method === 'GET' && /\/images$/.test(c.path) ? imagesResponse(3) : undefined));
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('ready');
    expect(w.etsy.where('POST', /\/images$/)).toHaveLength(0);
    expect(w.fetchImage).not.toHaveBeenCalled();
  });

  it('forgets the Etsy id when the draft no longer exists there (404)', async () => {
    const { w, row } = await pendingWorld({}, { etsyListingId: '9001', imagesUploaded: 2 });
    w.etsy.handlers.push((c) => (c.method === 'GET' && /\/images$/.test(c.path) ? etsyResp(404, { error: 'gone' }) : undefined));
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', lastErrorMessage: ETSY_LISTING_MESSAGES.draftGone, etsyListingId: null, imagesUploaded: 0 });
  });

  it('fails IMAGES, keeping the draft, when the image list call fails', async () => {
    const { w, row } = await pendingWorld({}, { etsyListingId: '9001', imagesUploaded: 2 });
    w.etsy.handlers.push((c) => (c.method === 'GET' && /\/images$/.test(c.path) ? etsyResp(500, null) : undefined));
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    expect(w.db.store.listings[0]).toMatchObject({ state: 'FAILED', failedStep: 'IMAGES', etsyListingId: '9001' });
  });

  it('survives the full cycle: a failed upload, a retry request, and a resumed worker create no second draft', async () => {
    const { w, row } = await pendingWorld();
    let failNext = true;
    w.etsy.handlers.push((c) => {
      if (c.method === 'POST' && /\/images$/.test(c.path) && w.etsy.where('POST', /\/images$/).length === 2 && failNext) {
        failNext = false;
        return etsyResp(500, null);
      }
      if (c.method === 'GET' && /\/images$/.test(c.path)) return imagesResponse(1);
      return undefined;
    });
    await expect(runEtsyDraftWorker(row.id, w.deps)).resolves.toBe('failed');
    const retry = await requestEtsyDraft(draftArgs(), w.deps);
    expect(retry.started).toBe(true);
    await expect(runEtsyDraftWorker(retry.listing.id, w.deps)).resolves.toBe('ready');
    expect(w.etsy.where('POST', /\/shops\/555\/listings$/)).toHaveLength(1);
    expect(w.db.store.listings[0]).toMatchObject({ state: 'DRAFT_READY', imagesUploaded: 3 });
  });
});
