/**
 * ADR-135 batch E-B3, acceptance 4 (ownership and client-supplied fields) and the HTTP contract of
 * controllers/etsyListingController.ts: eligibility 422 Discogs shape, draft 202 plus one worker start,
 * publish needs confirm, suggest 503 when the category cache is not ready, generic errors for
 * unexpected failures. Handlers are built with injected deps (fake database, fake Etsy), no network.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import { ETSY_LISTING_CONTROLLER_MESSAGES, makeEtsyListingHandlers } from '../etsyListingController';
import { ETSY_LISTING_MESSAGES } from '../../services/marketplace/etsyConnector';
import { EtsyError } from '../../services/marketplace/etsyBudget';
import { resetEtsyTaxonomyLoadForTests } from '../../services/marketplace/etsyTaxonomy';
import { etsyResp } from '../../services/marketplace/__tests__/etsyFakeDb';
import { seedListing } from '../../services/marketplace/__tests__/etsyListingFakeDb';
import { makeWorld } from '../../services/marketplace/__tests__/etsyListingHarness';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  return res;
}
const mkReq = (over: Record<string, any> = {}): any => ({ user: { id: 'user_1' }, params: { id: 'item_1' }, query: {}, body: {}, ...over });

function setup(opts: Parameters<typeof makeWorld>[0] = {}, organizerId: string | null = 'org_1') {
  const w = makeWorld(opts);
  const startDraftWorker = jest.fn();
  const handlers = makeEtsyListingHandlers({ ...w.deps, resolveOrganizerId: async () => organizerId, startDraftWorker });
  return { w, handlers, startDraftWorker };
}
const run = async (handler: (req: any, res: any) => Promise<void>, req: any) => {
  const res = mockRes();
  await handler(req, res);
  return res;
};
const draftBody = (over: Record<string, any> = {}) => ({ whenMade: '1970s', isSupply: false, taxonomyId: 1234, attest: true, ...over });
const readyRow = (over: Record<string, any> = {}) => ({ state: 'DRAFT_READY', etsyListingId: '9001', imagesUploaded: 3, ...over });

beforeEach(() => resetEtsyTaxonomyLoadForTests());

describe('identity and ownership (acceptance 4)', () => {
  it('answers 401 with no user and 404 when the user has no organizer profile', async () => {
    const { handlers } = setup();
    const res = await run(handlers.getListing, mkReq({ user: undefined }));
    expect(res.statusCode).toBe(401);
    const noOrg = setup({}, null);
    const res2 = await run(noOrg.handlers.getListing, mkReq());
    expect(res2.statusCode).toBe(404);
    expect(res2.body.message).toBe(ETSY_LISTING_CONTROLLER_MESSAGES.organizerMissing);
  });

  it('answers 404 ETSY_ITEM_NOT_FOUND on every item route for another organizer\'s item', async () => {
    const { w, handlers, startDraftWorker } = setup({ itemOver: { organizerId: 'org_2' } });
    seedListing(w.db, { ...readyRow(), organizerId: 'org_2' });
    const results = [
      await run(handlers.getEligibility, mkReq()),
      await run(handlers.getListing, mkReq()),
      await run(handlers.createDraft, mkReq({ body: draftBody() })),
      await run(handlers.publish, mkReq({ body: { confirm: true } })),
      await run(handlers.suggestTaxonomy, mkReq({ params: {}, query: { itemId: 'item_1' } })),
    ];
    for (const r of results) {
      expect(r.statusCode).toBe(404);
      expect(r.body.code).toBe('ETSY_ITEM_NOT_FOUND');
      expect(JSON.stringify(r.body)).not.toContain('org_2');
    }
    const end = await run(handlers.endListing, mkReq());
    expect(end.statusCode).toBe(404);
    expect(startDraftWorker).not.toHaveBeenCalled();
    expect(w.etsy.calls).toHaveLength(0);
    expect(w.db.store.listings[0]).toMatchObject({ organizerId: 'org_2', state: 'DRAFT_READY' });
  });

  it('ignores an etsyListingId, shopId, organizerId, userId or price in the draft body', async () => {
    const { w, handlers, startDraftWorker } = setup();
    const res = await run(
      handlers.createDraft,
      mkReq({ body: draftBody({ etsyListingId: '1', shopId: '999', organizerId: 'org_2', userId: 'user_evil', price: 0.01, state: 'ACTIVE', imagesUploaded: 20 }) })
    );
    expect(res.statusCode).toBe(202);
    expect(w.db.store.listings).toHaveLength(1);
    expect(w.db.store.listings[0]).toMatchObject({ organizerId: 'org_1', shopId: '555', etsyListingId: null, attestedByUserId: 'user_1', state: 'DRAFT_PENDING', imagesUploaded: 0 });
    expect(startDraftWorker).toHaveBeenCalledTimes(1);
  });

  it('ignores an etsyListingId and shopId in the publish body', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow());
    const res = await run(handlers.publish, mkReq({ body: { confirm: true, etsyListingId: '123', shopId: '777' } }));
    expect(res.statusCode).toBe(200);
    expect(w.etsy.where('PATCH', /.*/)[0].path).toBe('/v3/application/shops/555/listings/9001');
  });

  it('survives a missing or non-object body', async () => {
    const { handlers } = setup();
    const a = await run(handlers.createDraft, mkReq({ body: undefined }));
    expect(a.statusCode).toBe(400);
    expect(a.body.code).toBe('ETSY_ATTESTATION_REQUIRED');
    const b = await run(handlers.publish, mkReq({ body: 'confirm=true' }));
    expect(b.statusCode).toBe(400);
    expect(b.body.code).toBe('ETSY_CONFIRM_REQUIRED');
  });
});

describe('GET /items/:id/eligibility', () => {
  it('answers 200 { eligible: true, reason: null } for an old era, with the era list', async () => {
    const { handlers } = setup();
    const res = await run(handlers.getEligibility, mkReq({ query: { whenMade: '1970s' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ eligible: true, reason: null, code: 'OK', cardReleaseYear: null, minAgeYears: 20 });
    expect(res.body.eras).toHaveLength(19);
    const byValue = Object.fromEntries(res.body.eras.map((e: any) => [e.value, e]));
    expect(byValue['1970s']).toMatchObject({ vintage: true, label: expect.any(String) });
    expect(byValue['2010_2019'].vintage).toBe(false);
    expect(byValue['made_to_order'].vintage).toBe(false);
  });

  it('answers the 422 Discogs shape { eligible: false, reason, message } for a recent era', async () => {
    const { handlers } = setup();
    const res = await run(handlers.getEligibility, mkReq({ query: { whenMade: '2020_2026' } }));
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ eligible: false, code: 'ERA_TOO_RECENT' });
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.message).toBe(res.body.reason);
  });

  it('answers 422 for no era, and 200 for a craft supply with no era', async () => {
    const { handlers } = setup();
    const none = await run(handlers.getEligibility, mkReq());
    expect(none.statusCode).toBe(422);
    expect(none.body.code).toBe('NO_ERA');
    const supply = await run(handlers.getEligibility, mkReq({ query: { isSupply: 'true' } }));
    expect(supply.statusCode).toBe(200);
  });

  it('uses the item\'s card release year and reports it', async () => {
    const { handlers } = setup({ itemOver: { card: { releaseYear: 2015 } } });
    const res = await run(handlers.getEligibility, mkReq({ query: { whenMade: '1970s' } }));
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ code: 'CARD_YEAR_TOO_RECENT', cardReleaseYear: 2015 });
  });

  it('falls back to the era saved on the draft when the query has none', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow({ whenMade: '2020_2026' }));
    const res = await run(handlers.getEligibility, mkReq());
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('ERA_TOO_RECENT');
  });

  it('never calls Etsy', async () => {
    const { w, handlers } = setup();
    await run(handlers.getEligibility, mkReq({ query: { whenMade: '1970s' } }));
    expect(w.etsy.calls).toHaveLength(0);
  });
});

describe('POST /items/:id/draft', () => {
  it('answers 202 with the serialized draft and starts the worker exactly once', async () => {
    const { handlers, startDraftWorker, w } = setup();
    const res = await run(handlers.createDraft, mkReq({ body: draftBody() }));
    expect(res.statusCode).toBe(202);
    expect(res.body.started).toBe(true);
    expect(res.body.listing).toMatchObject({ state: 'DRAFT_PENDING', statusLabel: 'Creating draft', whenMade: '1970s', taxonomyId: 1234 });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('org_1');
    expect(text).not.toContain('"shopId"');
    expect(text).not.toContain('"etsyListingId"');
    expect(startDraftWorker).toHaveBeenCalledTimes(1);
    expect(startDraftWorker).toHaveBeenCalledWith(w.db.store.listings[0].id);
  });

  it('does not start a second worker for a draft that is already being built', async () => {
    const { handlers, startDraftWorker } = setup();
    await run(handlers.createDraft, mkReq({ body: draftBody() }));
    const again = await run(handlers.createDraft, mkReq({ body: draftBody() }));
    expect(again.statusCode).toBe(202);
    expect(again.body.started).toBe(false);
    expect(startDraftWorker).toHaveBeenCalledTimes(1);
  });

  it('by default runs the real worker in the background until the draft is ready', async () => {
    const w = makeWorld();
    const handlers = makeEtsyListingHandlers({ ...w.deps, resolveOrganizerId: async () => 'org_1' });
    const res = await run(handlers.createDraft, mkReq({ body: draftBody() }));
    expect(res.statusCode).toBe(202);
    for (let i = 0; i < 200 && w.db.store.listings[0].state === 'DRAFT_PENDING'; i++) await new Promise((r) => setImmediate(r));
    expect(w.db.store.listings[0].state).toBe('DRAFT_READY');
  });

  it('answers 400 ETSY_ATTESTATION_REQUIRED without the attestation, creating nothing', async () => {
    const { w, handlers, startDraftWorker } = setup();
    const res = await run(handlers.createDraft, mkReq({ body: draftBody({ attest: 'yes' }) }));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'ETSY_ATTESTATION_REQUIRED', message: ETSY_LISTING_MESSAGES.attestationRequired });
    expect(w.db.store.listings).toHaveLength(0);
    expect(startDraftWorker).not.toHaveBeenCalled();
  });

  it('answers 503 ETSY_PUSH_DISABLED when pushing is off', async () => {
    const { handlers, startDraftWorker } = setup({ env: { ETSY_PUSH_ENABLED: undefined } });
    const res = await run(handlers.createDraft, mkReq({ body: draftBody() }));
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('ETSY_PUSH_DISABLED');
    expect(startDraftWorker).not.toHaveBeenCalled();
  });

  it('answers 422 with the eligibility details for an ineligible item (no override exists)', async () => {
    const { handlers, startDraftWorker } = setup();
    const res = await run(handlers.createDraft, mkReq({ body: draftBody({ whenMade: '2020_2026', override: true, force: true, eligible: true }) }));
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ code: 'ETSY_NOT_ELIGIBLE', eligible: false, eligibilityCode: 'ERA_TOO_RECENT' });
    expect(res.body.message).toBe(res.body.reason);
    expect(startDraftWorker).not.toHaveBeenCalled();
  });

  it('answers a craft supply with no era with a clear 400 WHEN_MADE_INVALID', async () => {
    const { handlers } = setup();
    const res = await run(handlers.createDraft, mkReq({ body: draftBody({ isSupply: true, whenMade: undefined }) }));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ETSY_PAYLOAD_INVALID');
    expect(res.body.problems[0].code).toBe('WHEN_MADE_INVALID');
  });

  it('maps Etsy-level errors (not connected, needs reconnect, disabled) to their statuses', async () => {
    const none = setup({ connection: false });
    const r1 = await run(none.handlers.createDraft, mkReq({ body: draftBody() }));
    expect(r1.statusCode).toBe(404);
    expect(r1.body.code).toBe('ETSY_NOT_CONNECTED');
    const reauth = setup({ accountOver: { status: 'NEEDS_REAUTH' } });
    const r2 = await run(reauth.handlers.createDraft, mkReq({ body: draftBody() }));
    expect(r2.statusCode).toBe(409);
    expect(r2.body.code).toBe('ETSY_NEEDS_REAUTH');
    const off = setup({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    const r3 = await run(off.handlers.createDraft, mkReq({ body: draftBody() }));
    expect(r3.statusCode).toBe(503);
    expect(r3.body).toMatchObject({ code: 'ETSY_DISABLED', enabled: false });
  });
});

describe('GET /items/:id/listing', () => {
  it('answers { listing: null } when there is none, and the serialized listing when there is', async () => {
    const { w, handlers } = setup();
    const none = await run(handlers.getListing, mkReq());
    expect(none.statusCode).toBe(200);
    expect(none.body).toEqual({ listing: null });
    seedListing(w.db, readyRow());
    const res = await run(handlers.getListing, mkReq());
    expect(res.body.listing).toMatchObject({ state: 'DRAFT_READY', canPublish: true, imagesTotal: 3, taxonomyPath: 'Home & Living > Home Decor > Candle Holders' });
    expect(JSON.stringify(res.body)).not.toContain('9001');
    expect(w.etsy.calls).toHaveLength(0);
  });
});

describe('POST /items/:id/publish', () => {
  it('needs confirm: true', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow());
    const res = await run(handlers.publish, mkReq({ body: {} }));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ETSY_CONFIRM_REQUIRED');
    expect(res.body.message).toContain('$0.20');
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('publishes a ready draft and answers alreadyActive on a repeat', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow());
    const res = await run(handlers.publish, mkReq({ body: { confirm: true } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ alreadyActive: false, listing: { state: 'ACTIVE', statusLabel: 'Live on Etsy', canEnd: true } });
    const again = await run(handlers.publish, mkReq({ body: { confirm: true } }));
    expect(again.body.alreadyActive).toBe(true);
    expect(w.etsy.where('PATCH', /.*/)).toHaveLength(1);
  });

  it('answers 503 ETSY_PUSH_DISABLED when pushing is off, and 422 when Etsy refuses', async () => {
    const off = setup({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(off.w.db, readyRow());
    const r1 = await run(off.handlers.publish, mkReq({ body: { confirm: true } }));
    expect(r1.statusCode).toBe(503);
    expect(r1.body.code).toBe('ETSY_PUSH_DISABLED');
    const refused = setup();
    seedListing(refused.w.db, readyRow());
    refused.w.etsy.handlers.push((c) => (c.method === 'PATCH' ? etsyResp(400, { error: 'Missing something' }) : undefined));
    const r2 = await run(refused.handlers.publish, mkReq({ body: { confirm: true } }));
    expect(r2.statusCode).toBe(422);
    expect(r2.body.code).toBe('ETSY_PUBLISH_BLOCKED');
  });

  it('answers 404 when there is no listing and 409 when it is not a ready draft', async () => {
    const { w, handlers } = setup();
    const none = await run(handlers.publish, mkReq({ body: { confirm: true } }));
    expect(none.statusCode).toBe(404);
    expect(none.body.code).toBe('ETSY_LISTING_NOT_FOUND');
    seedListing(w.db, readyRow({ state: 'DRAFT_PENDING' }));
    const pending = await run(handlers.publish, mkReq({ body: { confirm: true } }));
    expect(pending.statusCode).toBe(409);
    expect(pending.body.code).toBe('ETSY_NOT_DRAFT_READY');
  });
});

describe('DELETE /items/:id/listing', () => {
  it('ends a live listing', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    const res = await run(handlers.endListing, mkReq());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, outcome: 'withdrawn', message: ETSY_LISTING_CONTROLLER_MESSAGES.ended, listing: { state: 'ENDED' } });
  });

  it('discards a draft that never reached Etsy with its own message, and works with pushing off', async () => {
    const { w, handlers } = setup({ env: { ETSY_PUSH_ENABLED: undefined } });
    seedListing(w.db, { state: 'FAILED', failedStep: 'CREATE', etsyListingId: null });
    const res = await run(handlers.endListing, mkReq());
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(ETSY_LISTING_CONTROLLER_MESSAGES.discarded);
    expect(w.etsy.calls).toHaveLength(0);
  });

  it('answers 404 for no listing, 502 when Etsy will not delete it, 503 when the connector is off', async () => {
    const { w, handlers } = setup();
    expect((await run(handlers.endListing, mkReq())).statusCode).toBe(404);
    seedListing(w.db, readyRow({ state: 'ACTIVE' }));
    w.etsy.handlers.push((c) => (c.method === 'DELETE' ? etsyResp(500, null) : undefined));
    const failed = await run(handlers.endListing, mkReq());
    expect(failed.statusCode).toBe(502);
    expect(failed.body.code).toBe('ETSY_END_FAILED');
    const off = setup({ env: { ETSY_CONNECTOR_ENABLED: undefined } });
    seedListing(off.w.db, readyRow({ state: 'ACTIVE' }));
    const disabled = await run(off.handlers.endListing, mkReq());
    expect(disabled.statusCode).toBe(503);
    expect(disabled.body.code).toBe('ETSY_DISABLED');
  });
});

describe('GET /taxonomy/suggest', () => {
  it('answers 200 with suggestions from the item title and a searchable leaf list', async () => {
    const { handlers } = setup({ itemOver: { title: 'Brass candle holder' } });
    const res = await run(handlers.suggestTaxonomy, mkReq({ params: {}, query: { itemId: 'item_1', q: 'candle' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.suggestedLabel).toBe('Suggested');
    expect(res.body.results.map((r: any) => r.id)).toContain(1234);
    expect(res.body.suggested.map((r: any) => r.id)).toContain(1234);
    for (const row of [...res.body.results, ...res.body.suggested]) expect(Object.keys(row).sort()).toEqual(['fullPath', 'id', 'name', 'suggested']);
  });

  it('works without an itemId', async () => {
    const { handlers } = setup();
    const res = await run(handlers.suggestTaxonomy, mkReq({ params: {}, query: { q: 'necklaces' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body.results.map((r: any) => r.id)).toEqual([20]);
  });

  it('answers 503 ETSY_TAXONOMY_UNAVAILABLE when the cache is empty and Etsy cannot fill it', async () => {
    const { handlers } = setup({ taxonomy: false });
    const res = await run(handlers.suggestTaxonomy, mkReq({ params: {}, query: { q: 'candle' } }));
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ code: 'ETSY_TAXONOMY_UNAVAILABLE', message: ETSY_LISTING_CONTROLLER_MESSAGES.taxonomyUnavailable, ready: false });
  });

  it('ignores non-string query values and a huge limit', async () => {
    const { handlers } = setup();
    const res = await run(handlers.suggestTaxonomy, mkReq({ params: {}, query: { q: ['a', 'b'], itemId: { $ne: 1 }, limit: '9999999' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(50);
  });
});

describe('unexpected failures', () => {
  it('answers a generic 500 and logs only the error type, never its message', async () => {
    const { w, handlers } = setup();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    w.db.item.findFirst = async () => {
      throw new Error('connection string ' + 'post' + 'gres://user:password@host/db');
    };
    const res = await run(handlers.getListing, mkReq());
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(ETSY_LISTING_MESSAGES.generic);
    expect(JSON.stringify(res.body)).not.toContain('postgres');
    expect(errSpy.mock.calls.flat().join(' ')).not.toContain('password');
    errSpy.mockRestore();
  });

  it('turns a thrown EtsyError into its mapped status', async () => {
    const { w, handlers } = setup();
    seedListing(w.db, readyRow());
    w.etsy.handlers.push(() => {
      throw new EtsyError('ETSY_BUDGET', 'used up');
    });
    const res = await run(handlers.publish, mkReq({ body: { confirm: true } }));
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('ETSY_BUSY');
  });
});
