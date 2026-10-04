/**
 * ADR-135 batch E-B3 copy lint. Organizer-facing strings must not say "AI" or "estate sale", must not
 * contain an em dash, and must not be placeholders. Covers every exported message table of this batch,
 * the messages it borrows from earlier batches, and the text of real controller responses.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import * as fs from 'fs';
import * as path from 'path';
import {
  ETSY_FAILED_STEP_MESSAGES,
  ETSY_LISTING_MESSAGES,
  ETSY_LISTING_STATUS_LABELS,
  etsyCurrencyUnsupportedMessage,
} from '../etsyConnector';
import { ETSY_SUGGESTED_LABEL, ETSY_TAXONOMY_MESSAGES } from '../etsyTaxonomy';
import { ETSY_LISTING_CONTROLLER_MESSAGES, makeEtsyListingHandlers } from '../../../controllers/etsyListingController';
import { ETSY_PAYLOAD_PROBLEM_MESSAGES } from '../etsyMapping';
import { ETSY_MSG_NO_ERA, etsyMsgCardYearTooRecent, etsyMsgEraTooRecent } from '../etsyEligibility';
import { ETSY_WHEN_MADE } from '../../../config/etsyWhenMade';
import { seedListing } from './etsyListingFakeDb';
import { makeWorld } from './etsyListingHarness';

const EM_DASH = '—';
const PLACEHOLDER = /\bTODO\b|\bTBD\b|\bFIXME\b|lorem|ipsum|\{\{|\}\}|<[a-z][^>]*>|\[(?:name|date|link|todo)\]/i;

function lint(text: string): string[] {
  const problems: string[] = [];
  if (/\bAI\b/.test(text)) problems.push('says "AI"');
  if (/estate\s+sale/i.test(text)) problems.push('says "estate sale"');
  if (text.includes(EM_DASH)) problems.push('has an em dash');
  if (PLACEHOLDER.test(text)) problems.push('looks like a placeholder');
  if (!text.trim()) problems.push('is empty');
  return problems;
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value as object).forEach((v) => collectStrings(v, out));
  return out;
}

function expectClean(label: string, strings: string[]) {
  const bad = strings.map((s) => ({ s, p: lint(s) })).filter((x) => x.p.length > 0);
  expect({ label, bad }).toEqual({ label, bad: [] });
}

describe('exported message tables', () => {
  it('ETSY_LISTING_MESSAGES and its generated sentences are clean', () => {
    expectClean('listing messages', [...Object.values(ETSY_LISTING_MESSAGES), etsyCurrencyUnsupportedMessage('EUR'), etsyCurrencyUnsupportedMessage('GBP')]);
  });

  it('status chips and failed-step sentences are clean', () => {
    expectClean('labels', Object.values(ETSY_LISTING_STATUS_LABELS));
    expectClean('failed steps', Object.values(ETSY_FAILED_STEP_MESSAGES));
  });

  it('taxonomy and controller messages are clean', () => {
    expectClean('taxonomy', [...Object.values(ETSY_TAXONOMY_MESSAGES), ETSY_SUGGESTED_LABEL]);
    expectClean('controller', Object.values(ETSY_LISTING_CONTROLLER_MESSAGES));
  });

  it('messages borrowed from earlier batches and the era picker labels are clean', () => {
    expectClean('payload problems', Object.values(ETSY_PAYLOAD_PROBLEM_MESSAGES));
    expectClean('eligibility', [ETSY_MSG_NO_ERA, etsyMsgEraTooRecent('2020 to 2026'), etsyMsgCardYearTooRecent(2015)]);
    expectClean('era labels', ETSY_WHEN_MADE.map((e) => e.label));
  });

  it('every message ends like a sentence or is a short label', () => {
    for (const text of Object.values(ETSY_LISTING_MESSAGES)) {
      if (text === ETSY_LISTING_MESSAGES.itemNotFound || text.endsWith(': ')) continue;
      expect(text).toMatch(/[.!?]$/);
    }
  });

  it('keeps the $0.20 fee in the confirmation text', () => {
    expect(ETSY_LISTING_MESSAGES.confirmRequired).toContain('$0.20');
  });
});

describe('source files', () => {
  const root = path.resolve(__dirname, '../../..');
  const files = [
    'config/etsyCategoryHints.ts',
    'services/marketplace/etsyConnector.ts',
    'services/marketplace/etsyTaxonomy.ts',
    'services/marketplace/etsyImageFetch.ts',
    'controllers/etsyListingController.ts',
    'routes/etsyListings.ts',
  ];
  it.each(files)('%s has no em dash', (rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(text.includes(EM_DASH)).toBe(false);
  });
  it.each(files)('%s is UTF-8 with LF endings and no NUL bytes', (rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(text.includes('\r')).toBe(false);
    expect(text.includes('\u0000')).toBe(false);
  });
});

describe('text of real responses', () => {
  const res = () => {
    const r: any = { statusCode: 200, body: undefined };
    r.status = (c: number) => ((r.statusCode = c), r);
    r.json = (b: any) => ((r.body = b), r);
    return r;
  };
  const req = (over: Record<string, any> = {}): any => ({ user: { id: 'user_1' }, params: { id: 'item_1' }, query: {}, body: {}, ...over });

  it('every string in a sweep of success and error responses is clean', async () => {
    const strings: string[] = [];
    const record = (r: any) => collectStrings(r.body, strings);
    const scenarios: Array<[string, Parameters<typeof makeWorld>[0], (h: ReturnType<typeof makeEtsyListingHandlers>, w: ReturnType<typeof makeWorld>) => Promise<void>]> = [
      ['eligibility ok', {}, async (h) => { const r = res(); await h.getEligibility(req({ query: { whenMade: '1970s' } }), r); record(r); }],
      ['eligibility recent', {}, async (h) => { const r = res(); await h.getEligibility(req({ query: { whenMade: '2020_2026' } }), r); record(r); }],
      ['eligibility card', { itemOver: { card: { releaseYear: 2015 } } }, async (h) => { const r = res(); await h.getEligibility(req(), r); record(r); }],
      ['draft no attest', {}, async (h) => { const r = res(); await h.createDraft(req({ body: { taxonomyId: 1234, whenMade: '1970s' } }), r); record(r); }],
      ['draft no era supply', {}, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, isSupply: true, taxonomyId: 1234 } }), r); record(r); }],
      ['draft bad category', {}, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 10 } }), r); record(r); }],
      ['draft eur', { settingsOver: { shopCurrency: 'EUR' } }, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['draft setup', { settingsOver: { defaultShippingProfileId: null } }, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['draft ok', {}, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['draft push off', { env: { ETSY_PUSH_ENABLED: undefined } }, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['draft not connected', { connection: false }, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['draft other organizer', { itemOver: { organizerId: 'org_2' } }, async (h) => { const r = res(); await h.createDraft(req({ body: { attest: true, whenMade: '1970s', taxonomyId: 1234 } }), r); record(r); }],
      ['publish no confirm', {}, async (h, w) => { seedListing(w.db, { state: 'DRAFT_READY', etsyListingId: '9001' }); const r = res(); await h.publish(req({ body: {} }), r); record(r); }],
      ['publish ok', {}, async (h, w) => { seedListing(w.db, { state: 'DRAFT_READY', etsyListingId: '9001' }); const r = res(); await h.publish(req({ body: { confirm: true } }), r); record(r); const g = res(); await h.getListing(req(), g); record(g); }],
      ['publish pending', {}, async (h, w) => { seedListing(w.db, { state: 'DRAFT_PENDING' }); const r = res(); await h.publish(req({ body: { confirm: true } }), r); record(r); }],
      ['publish none', {}, async (h) => { const r = res(); await h.publish(req({ body: { confirm: true } }), r); record(r); }],
      ['end ok', {}, async (h, w) => { seedListing(w.db, { state: 'ACTIVE', etsyListingId: '9001' }); const r = res(); await h.endListing(req(), r); record(r); }],
      ['discard', {}, async (h, w) => { seedListing(w.db, { state: 'FAILED', failedStep: 'IMAGES', etsyListingId: null }); const r = res(); await h.endListing(req(), r); record(r); const g = res(); await h.getListing(req(), g); record(g); }],
      ['suggest ok', {}, async (h) => { const r = res(); await h.suggestTaxonomy(req({ params: {}, query: { q: 'candle' } }), r); record(r); }],
      ['suggest empty query', {}, async (h) => { const r = res(); await h.suggestTaxonomy(req({ params: {}, query: {} }), r); record(r); }],
      ['suggest not ready', { taxonomy: false }, async (h) => { const r = res(); await h.suggestTaxonomy(req({ params: {}, query: { q: 'candle' } }), r); record(r); }],
    ];
    for (const [, opts, fn] of scenarios) {
      const w = makeWorld(opts);
      const handlers = makeEtsyListingHandlers({ ...w.deps, resolveOrganizerId: async () => 'org_1', startDraftWorker: () => undefined });
      await fn(handlers, w);
    }
    expect(strings.length).toBeGreaterThan(40);
    expectClean('responses', strings);
  });
});
