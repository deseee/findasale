/**
 * Shared harness for the Etsy B3 connector tests (test helper, not a test). Builds a world with a fake
 * database, a scripted fake Etsy (every call recorded), a fake photo fetcher and a movable clock.
 * No network, no real Prisma, no real tokens.
 */

import { etsyResp, fakeTokenCrypto } from './etsyFakeDb';
import { makeEtsyListingFakeDb, seedEtsyConnection, seedItem, seedTaxonomy } from './etsyListingFakeDb';
import type { EtsyConnectorDeps } from '../etsyConnector';

export const ENV_ON: Record<string, string> = {
  ETSY_CONNECTOR_ENABLED: 'true',
  ETSY_PUSH_ENABLED: 'true',
  ETSY_ALLOWED_ORGANIZER_IDS: 'org_1,org_2',
};
export const NOW = new Date('2026-10-03T12:00:00.000Z');

export interface RecordedEtsyCall {
  organizerId: string;
  method: string;
  path: string;
  priority?: string;
  form?: Record<string, string>;
  body?: any;
  multipart?: any[];
  query?: any;
  endpoint?: string;
}

export type EtsyHandler = (call: RecordedEtsyCall) => any | Promise<any> | undefined;

export const INVENTORY_BODY = {
  listing_id: 9001,
  products: [
    {
      product_id: 1,
      sku: 'SKU-1',
      is_deleted: false,
      offerings: [{ offering_id: 2, price: { amount: 2500, divisor: 100, currency_code: 'USD' }, quantity: 1, is_enabled: true, is_deleted: false }],
      property_values: [],
    },
  ],
  price_on_property: [],
  quantity_on_property: [],
  sku_on_property: [],
};

/** A scripted Etsy. Handlers run first (first one returning a response wins); then the default routes. */
export function makeFakeEtsy() {
  const calls: RecordedEtsyCall[] = [];
  const handlers: EtsyHandler[] = [];
  let images = 0;
  const defaults = (c: RecordedEtsyCall) => {
    const p = c.path;
    if (c.method === 'POST' && /\/shops\/\d+\/listings$/.test(p)) return etsyResp(201, { listing_id: 9001 });
    if (c.method === 'POST' && /\/images$/.test(p)) return etsyResp(201, { listing_image_id: 7000 + ++images });
    if (c.method === 'GET' && /\/listings\/\d+\/images$/.test(p)) return etsyResp(200, { count: 0, results: [] });
    if (c.method === 'PATCH' && /\/shops\/\d+\/listings\/\d+$/.test(p)) return etsyResp(200, { state: 'active' });
    if (c.method === 'DELETE' && /\/listings\/\d+$/.test(p)) return etsyResp(204);
    if (c.method === 'GET' && /\/inventory$/.test(p)) return etsyResp(200, JSON.parse(JSON.stringify(INVENTORY_BODY)));
    if (c.method === 'PUT' && /\/inventory$/.test(p)) return etsyResp(200, {});
    return etsyResp(404, { error: 'not found' });
  };
  const authedRequest = async (organizerId: string, opts: any) => {
    const call: RecordedEtsyCall = { organizerId, ...opts };
    calls.push(call);
    for (const h of handlers) {
      const r = await h(call);
      if (r !== undefined) return r;
    }
    return defaults(call);
  };
  const where = (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path));
  return { calls, handlers, authedRequest, where };
}

export interface WorldOptions {
  /** false: do not seed the item. */
  item?: boolean;
  itemOver?: Record<string, any>;
  /** false: no Etsy account or shop settings. */
  connection?: boolean;
  settingsOver?: Record<string, any>;
  accountOver?: Record<string, any>;
  /** false: leave the category cache empty. */
  taxonomy?: boolean;
  env?: Record<string, string | undefined>;
}

export function makeWorld(o: WorldOptions = {}) {
  const clock = { now: new Date(NOW) };
  const db = makeEtsyListingFakeDb({ clock: () => new Date(clock.now) });
  if (o.item !== false) seedItem(db, o.itemOver);
  if (o.connection !== false) seedEtsyConnection(db, { account: o.accountOver, settings: o.settingsOver });
  if (o.taxonomy !== false) seedTaxonomy(db);
  const etsy = makeFakeEtsy();
  const fetched: string[] = [];
  const fetchImage = jest.fn(async (url: string) => {
    fetched.push(url);
    return { data: Buffer.from('image-bytes'), contentType: 'image/jpeg', filename: 'photo.jpg' };
  });
  const world: {
    clock: { now: Date };
    db: any;
    etsy: ReturnType<typeof makeFakeEtsy>;
    fetched: string[];
    fetchImage: typeof fetchImage;
    requestImpl: (opts: any) => Promise<any>;
    deps: EtsyConnectorDeps;
  } = {
    clock,
    db,
    etsy,
    fetched,
    fetchImage,
    requestImpl: async () => etsyResp(503, null),
    deps: {} as EtsyConnectorDeps,
  };
  world.deps = {
    db,
    env: { ...ENV_ON, ...(o.env ?? {}) } as any,
    now: () => new Date(clock.now),
    crypto: fakeTokenCrypto,
    authedRequest: etsy.authedRequest as any,
    fetchImage: fetchImage as any,
    request: (opts: any) => world.requestImpl(opts),
    asOfYear: 2026,
  };
  return world;
}

/** The three shop-setup list endpoints, for the "organizer picked other profiles" path. */
export function setupListRoutes(ids: { shipping?: number[]; returns?: number[]; processing?: number[] } = {}) {
  const shipping = ids.shipping ?? [11, 12];
  const returns = ids.returns ?? [22];
  const processing = ids.processing ?? [33, 34];
  return async (opts: any) => {
    if (/shipping-profiles$/.test(opts.path)) return etsyResp(200, { results: shipping.map((id) => ({ shipping_profile_id: id, title: `Ship ${id}` })) });
    if (/policies\/return$/.test(opts.path)) return etsyResp(200, { results: returns.map((id) => ({ return_policy_id: id, accepts_returns: true, return_deadline: 14 })) });
    if (/readiness-state-definitions$/.test(opts.path)) return etsyResp(200, { results: processing.map((id) => ({ readiness_state_id: id, readiness_state: 'made_to_order', processing_days_display_label: `Ready ${id}` })) });
    return etsyResp(503, null);
  };
}

/** Everything a valid draft request needs besides the ids it is told about. */
export function draftArgs(over: Record<string, any> = {}) {
  return { organizerId: 'org_1', userId: 'user_1', itemId: 'item_1', whenMade: '1970s', isSupply: false, taxonomyId: 1234, attest: true, ...over };
}
