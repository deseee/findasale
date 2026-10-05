/**
 * ADR-136 Addendum C (roadmap #659): Etsy refuses a bulk lot with a plain message on every item route, before anything
 * else runs (no draft worker, no Etsy call, no row written). Minimal injected deps, no network, no real database.
 * (The Etsy test world in services/marketplace/__tests__ is not needed: the refusal sits right after the ownership check.)
 */
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import { makeEtsyListingHandlers } from '../controllers/etsyListingController';

const mockRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
};
const mkReq = (over: Record<string, any> = {}): any => ({ user: { id: 'user_1' }, params: { id: 'item_1' }, query: {}, body: {}, ...over });

function setup(lotIds: string[], opts: { failLookup?: boolean; flag?: boolean } = {}) {
  const startDraftWorker = jest.fn();
  const authedRequest = jest.fn();
  const db: any = {
    item: { findFirst: async () => ({ id: 'item_1', organizerId: 'org_1', title: 'Bulk commons' }) },
    itemBulkLot: {
      findMany: async (args: any) => {
        if (opts.failLookup) throw new Error('down');
        return lotIds.filter((id) => args.where.itemId.in.includes(id)).map((itemId) => ({ itemId }));
      },
    },
    etsyListing: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const handlers = makeEtsyListingHandlers({
    db,
    env: { ETSY_CONNECTOR_ENABLED: 'true', ...(opts.flag === false ? {} : { CARD_BULK_LOTS_ENABLED: 'true' }) } as any,
    resolveOrganizerId: async () => 'org_1',
    startDraftWorker,
    authedRequest,
  } as any);
  return { handlers, db, startDraftWorker, authedRequest };
}

const MESSAGE = 'Bulk lots cannot be listed on Etsy. They are sold by the card at your counter and on your storefront, and by the bundle on eBay.';

describe('Etsy and bulk lots', () => {
  it('answers 409 BULK_LOT_NOT_SUPPORTED on eligibility, draft, publish and end, and starts and calls nothing', async () => {
    const { handlers, db, startDraftWorker, authedRequest } = setup(['item_1']);
    const runs: Array<[string, any]> = [
      ['eligibility', mkReq({ query: { whenMade: '1970s' } })],
      ['draft', mkReq({ body: { whenMade: '1970s', isSupply: false, taxonomyId: 1234, attest: true } })],
      ['publish', mkReq({ body: { confirm: true } })],
      ['end', mkReq()],
    ];
    const fns: Record<string, (req: any, res: any) => Promise<void>> = {
      eligibility: handlers.getEligibility,
      draft: handlers.createDraft,
      publish: handlers.publish,
      end: handlers.endListing,
    };
    for (const [name, req] of runs) {
      const res = mockRes();
      await fns[name](req, res);
      expect(res.body).toEqual({ code: 'BULK_LOT_NOT_SUPPORTED', message: MESSAGE });
      expect(res.statusCode).toBe(409);
    }
    expect(startDraftWorker).not.toHaveBeenCalled();
    expect(authedRequest).not.toHaveBeenCalled();
    expect(db.etsyListing.create).not.toHaveBeenCalled();
    expect(db.etsyListing.update).not.toHaveBeenCalled();
  });

  it('with the lot flag on and a failed lookup it refuses (503) rather than let a lot through', async () => {
    const { handlers, startDraftWorker } = setup([], { failLookup: true });
    const res = mockRes();
    await handlers.createDraft(mkReq({ body: { whenMade: '1970s', isSupply: false, taxonomyId: 1234, attest: true } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('BULK_CHECK_FAILED');
    expect(startDraftWorker).not.toHaveBeenCalled();
  });

  it('the refusal text follows the copy rules', () => {
    expect(MESSAGE).not.toMatch(/[–—]/);
    expect(MESSAGE).not.toMatch(/\bAI\b/);
  });
});
