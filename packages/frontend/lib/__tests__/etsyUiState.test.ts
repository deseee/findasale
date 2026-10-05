/**
 * Tests for lib/etsyUiState.ts (ADR-135 D8, batch E-B5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * "All D8 states render with mocked responses": each state is produced here from a mocked server
 * response and checked through the same functions the components use:
 *   not connected, connecting, connected, setup empty, needs reconnect, disabled, busy (panel);
 *   ineligible, draft pending, draft ready, live, failed (per-item section and modal).
 * The pixel checks (375, 768, 1280 px, no horizontal scroll) are outside this runner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as ui from '../etsyUiState';
import {
  ETSY_FAILED_STEP_MESSAGES,
  ETSY_PANEL_COPY,
  ETSY_PROBLEM_MESSAGES,
  ETSY_SECTION_COPY,
  ETSY_STATUS_LABELS,
} from '../etsyCopy';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
const BACKEND_MKT = path.resolve(HERE, '..', '..', '..', 'backend', 'src', 'services', 'marketplace');

// ---- mocked server responses (shapes from etsyAuth.getEtsyConnectionStatus / fetchEtsyShopSetupOptions) ----
const CONNECTED = {
  enabled: true, pushEnabled: true, allowed: true, connected: true, status: 'ACTIVE', needsReauth: false, missingScopes: [],
  refreshExpiresSoon: false, shopId: '555', shopName: 'Maple Lake Finds', shopCurrency: 'USD', currencySupported: true,
  setupComplete: true, defaultShippingProfileId: '11', defaultReturnPolicyId: '22', defaultReadinessStateId: '33',
  connectedAt: '2026-10-01T12:00:00.000Z', lastRefreshedAt: null, lastError: null, etsyBusy: false, retryAt: null,
  attribution: 'x',
};
const conn = (over: Record<string, unknown> = {}) => ui.normalizeEtsyConnection({ ...CONNECTED, ...over });

const SETUP = {
  shippingProfiles: [{ id: '11', title: 'Standard shipping' }, { id: '12', title: 'Heavy items' }],
  returnPolicies: [{ id: '22', label: 'Returns accepted within 30 days' }],
  processingProfiles: [{ id: '33', label: '1 to 3 business days' }],
  selected: { defaultShippingProfileId: '11', defaultReturnPolicyId: null, defaultReadinessStateId: null },
  needsEtsySideSetup: false,
  emptyMessage: null,
};

const panel = (over: Partial<Parameters<typeof ui.deriveEtsyPanelState>[0]> = {}) =>
  ui.deriveEtsyPanelState({ isLoading: false, isError: false, connection: conn(), isStartingConnect: false, ...over });

// ------------------------------------------------------------------------------------------------
// Panel states
// ------------------------------------------------------------------------------------------------

test('panel: loading, then error when the status call failed', () => {
  assert.equal(panel({ isLoading: true, connection: undefined }).kind, 'loading');
  assert.equal(panel({ connection: undefined }).kind, 'loading');
  assert.equal(panel({ connection: undefined, isError: true }).kind, 'error');
});

test('panel: disabled when the server says the connector is off (503 ETSY_DISABLED)', () => {
  const err = { response: { status: 503, data: { code: 'ETSY_DISABLED', enabled: false, message: 'Etsy is not available right now.' } } };
  assert.equal(ui.isEtsyDisabledError(err), true);
  assert.equal(ui.isEtsyDisabledError({ response: { status: 503, data: { code: 'ETSY_BUSY' } } }), false);
  assert.equal(ui.isEtsyDisabledError({ response: { status: 500, data: { code: 'ETSY_DISABLED' } } }), false);
  assert.equal(panel({ connection: ui.ETSY_DISABLED_CONNECTION }).kind, 'disabled');
  assert.equal(ui.normalizeEtsyConnection({ enabled: false }).enabled, false);
});

test('panel: not allowed, not connected, connecting', () => {
  assert.equal(panel({ connection: conn({ allowed: false, connected: false, status: null }) }).kind, 'not_allowed');
  assert.equal(panel({ connection: conn({ connected: false, status: null }) }).kind, 'not_connected');
  assert.equal(panel({ connection: conn({ connected: false, status: null }), isStartingConnect: true }).kind, 'connecting');
});

test('panel: connected, with busy, currency, setup empty and expires-soon flags', () => {
  const ok = panel();
  assert.equal(ok.kind, 'connected');
  assert.equal(ok.busy, false);
  assert.equal(ok.setupComplete, true);
  assert.equal(panel({ connection: conn({ etsyBusy: true, retryAt: '2026-10-03T12:00:00Z' }) }).busy, true);
  const eur = panel({ connection: conn({ shopCurrency: 'EUR', currencySupported: false }) });
  assert.equal(eur.kind, 'connected');
  assert.equal(eur.currencyUnsupported, true);
  assert.equal(conn({ shopCurrency: 'EUR', currencySupported: false }).currencyMessage, 'Your Etsy shop uses EUR. Etsy listings from FindA.Sale currently need a USD shop.');
  assert.equal(panel({ connection: conn({ refreshExpiresSoon: true }) }).refreshExpiresSoon, true);
  const empty = panel({ connection: conn({ setupComplete: false }), setup: ui.normalizeEtsySetup({ ...SETUP, shippingProfiles: [], needsEtsySideSetup: true, emptyMessage: ETSY_PANEL_COPY.setupEmpty }) });
  assert.equal(empty.kind, 'connected');
  assert.equal(empty.setupEmpty, true);
  assert.equal(empty.setupComplete, false);
});

test('panel: needs reconnect for NEEDS_REAUTH, REVOKED and missing scopes (account exists, not healthy)', () => {
  assert.equal(panel({ connection: conn({ connected: false, status: 'NEEDS_REAUTH', needsReauth: true }) }).kind, 'needs_reconnect');
  assert.equal(panel({ connection: conn({ connected: false, status: 'REVOKED', needsReauth: true }) }).kind, 'needs_reconnect');
  assert.equal(panel({ connection: conn({ missingScopes: ['listings_d'] }) }).kind, 'needs_reconnect');
  // reconnecting shows the connecting state while the browser leaves for Etsy
  assert.equal(panel({ connection: conn({ connected: false, status: 'NEEDS_REAUTH', needsReauth: true }), isStartingConnect: true }).kind, 'connecting');
});

test('normalizeEtsyConnection tolerates junk', () => {
  for (const junk of [null, undefined, 'x', 5, [], {}]) {
    const c = ui.normalizeEtsyConnection(junk);
    assert.equal(c.connected, false);
    assert.equal(c.hasAccount, false);
    assert.deepEqual(c.missingScopes, []);
  }
});

test('shop setup: normalised lists, empty detection, junk rows dropped', () => {
  const s = ui.normalizeEtsySetup(SETUP);
  assert.equal(s.shippingProfiles.length, 2);
  assert.equal(s.shippingProfiles[0].label, 'Standard shipping');
  assert.equal(s.selected.shipping, '11');
  assert.equal(s.selected.processing, null);
  assert.equal(s.needsEtsySideSetup, false);
  const none = ui.normalizeEtsySetup({ ...SETUP, processingProfiles: [], needsEtsySideSetup: true, emptyMessage: ETSY_PANEL_COPY.setupEmpty });
  assert.equal(none.needsEtsySideSetup, true);
  assert.equal(none.emptyMessage, ETSY_PANEL_COPY.setupEmpty);
  const junk = ui.normalizeEtsySetup({ shippingProfiles: [{ id: 'abc', title: 'x' }, null, { id: 5, title: 'Five' }], processingProfiles: [{ id: '1', label: 'a' }] });
  assert.deepEqual(junk.shippingProfiles, [{ id: '5', label: 'Five' }]);
});

test('authorize address: only Etsy sign-in over https is followed', () => {
  assert.equal(ui.isSafeEtsyAuthorizeUrl('https://www.etsy.com/oauth/connect?response_type=code&state=abc'), true);
  assert.equal(ui.isSafeEtsyAuthorizeUrl('https://etsy.com/oauth/connect?x=1'), true);
  for (const bad of [
    'http://www.etsy.com/oauth/connect',
    'https://www.etsy.com.evil.example/oauth/connect',
    'https://evil.example/oauth/connect',
    'https://www.etsy.com@evil.example/oauth/connect',
    'https://www.etsy.com:8443/oauth/connect',
    'https://www.etsy.com/other',
    'javascript:alert(1)',
    '//www.etsy.com/oauth/connect',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(ui.isSafeEtsyAuthorizeUrl(bad), false, String(bad));
  }
});

test('banner keys: whitelist only, never text from the address bar', () => {
  assert.equal(ui.resolveEtsyBannerKey('connected', undefined), 'connected');
  assert.equal(ui.resolveEtsyBannerKey(['connected'], undefined), 'connected');
  assert.equal(ui.resolveEtsyBannerKey('error', 'denied'), 'denied');
  assert.equal(ui.resolveEtsyBannerKey('error', 'ETSY_NO_SHOP'), 'ETSY_NO_SHOP');
  assert.equal(ui.resolveEtsyBannerKey('error', '<script>alert(1)</script>'), 'generic');
  assert.equal(ui.resolveEtsyBannerKey('error', 'connected'), 'generic');
  assert.equal(ui.resolveEtsyBannerKey('error', 'constructor'), 'generic');
  assert.equal(ui.resolveEtsyBannerKey('error', undefined), 'generic');
  assert.equal(ui.resolveEtsyBannerKey(undefined, undefined), null);
  assert.equal(ui.resolveEtsyBannerKey('nonsense', 'denied'), null);
  assert.equal(ui.isEtsyErrorBanner('connected'), false);
  assert.equal(ui.isEtsyErrorBanner('denied'), true);
});

// ------------------------------------------------------------------------------------------------
// Listing states (draft pending, draft ready, live, failed ...)
// ------------------------------------------------------------------------------------------------

const row = (state: string, over: Record<string, unknown> = {}) => ui.normalizeEtsyListing({ state, etsyListingId: '9001', whenMade: '1980s', isSupply: false, taxonomyId: 1234, ...over });

test('listing: bare row, { listing }, null and unknown states', () => {
  assert.equal(ui.normalizeEtsyListing(null), null);
  assert.equal(ui.normalizeEtsyListing({ listing: null }), null);
  assert.equal(ui.normalizeEtsyListing({ state: 'BANANA' }), null);
  assert.equal(ui.normalizeEtsyListing('x'), null);
  assert.equal(ui.normalizeEtsyListing({ listing: { state: 'ACTIVE' } })?.state, 'ACTIVE');
  assert.equal(ui.normalizeEtsyListing({ state: 'DRAFT_READY', imagesUploaded: 3 })?.imagesUploaded, 3);
});

test('listing view: none and PREPARING show the form', () => {
  const none = ui.deriveEtsyListingView(null);
  assert.equal(none.mode, 'form');
  assert.equal(none.chip, null);
  assert.equal(none.polling, false);
  const prep = ui.deriveEtsyListingView(row('PREPARING'));
  assert.equal(prep.mode, 'form');
  assert.equal(prep.chip?.label, ETSY_STATUS_LABELS.PREPARING);
});

test('listing view: draft pending polls and shows "Creating draft"', () => {
  const v = ui.deriveEtsyListingView(row('DRAFT_PENDING', { imagesUploaded: 2 }));
  assert.equal(v.mode, 'pending');
  assert.equal(v.polling, true);
  assert.equal(v.chip?.label, 'Creating draft');
  assert.equal(v.chip?.tone, 'info');
});

test('listing view: draft ready needs confirmation and does not poll', () => {
  const v = ui.deriveEtsyListingView(row('DRAFT_READY', { attestedAt: '2026-10-03T10:00:00Z' }));
  assert.equal(v.mode, 'ready');
  assert.equal(v.polling, false);
  assert.equal(v.chip?.label, 'Draft ready');
  assert.equal(v.chip?.tone, 'warning');
  assert.ok(/confirmation/.test(v.chip?.detail ?? ''));
});

test('listing view: publishing polls, live shows "Live on Etsy"', () => {
  const p = ui.deriveEtsyListingView(row('PUBLISHING'));
  assert.equal(p.mode, 'publishing');
  assert.equal(p.polling, true);
  const live = ui.deriveEtsyListingView(row('ACTIVE', { publishedAt: '2026-10-03T10:00:00Z', expiresAt: '2027-02-03T10:00:00Z' }));
  assert.equal(live.mode, 'live');
  assert.equal(live.chip?.label, 'Live on Etsy');
  assert.equal(live.chip?.tone, 'success');
  assert.equal(live.polling, false);
});

test('listing view: ended returns to the form, sold and orphaned are final', () => {
  assert.equal(ui.deriveEtsyListingView(row('ENDED')).mode, 'form');
  assert.equal(ui.deriveEtsyListingView(row('ENDED')).chip?.label, 'Ended on Etsy');
  assert.equal(ui.deriveEtsyListingView(row('SOLD')).mode, 'sold');
  assert.equal(ui.deriveEtsyListingView(row('SOLD')).chip?.label, 'Sold on Etsy');
  assert.equal(ui.deriveEtsyListingView(row('ORPHANED')).mode, 'orphaned');
});

test('listing view: failed maps each step to a fixed sentence and the right retry', () => {
  const f = (step: string | null, over: Record<string, unknown> = {}) => ui.deriveEtsyListingView(row('FAILED', { failedStep: step, ...over }));
  assert.equal(f('CREATE').retry, 'draft');
  assert.equal(f('CREATE').failureMessage, ETSY_FAILED_STEP_MESSAGES.CREATE);
  assert.equal(f('IMAGES').retry, 'draft');
  assert.equal(f('PUBLISH').retry, 'publish');
  assert.equal(f('PUBLISH', { etsyListingId: null }).retry, 'draft');
  assert.equal(f('DELETE').retry, 'remove');
  assert.equal(f('UPDATE').retry, 'none');
  assert.equal(f(null).failureMessage, ETSY_FAILED_STEP_MESSAGES.UNKNOWN);
  assert.equal(f('CREATE').chip?.label, 'Needs attention');
  assert.equal(f('CREATE').chip?.tone, 'danger');
  assert.equal(f('CREATE').mode, 'failed');
});

test('listing view: the server detail is shown only when it is short plain text', () => {
  assert.equal(ui.deriveEtsyListingView(row('FAILED', { failedStep: 'CREATE', lastErrorMessage: 'Etsy said no.' })).failureDetail, 'Etsy said no.');
  assert.equal(ui.deriveEtsyListingView(row('FAILED', { failedStep: 'CREATE', lastErrorMessage: 'x'.repeat(301) })).failureDetail, null);
  assert.equal(ui.deriveEtsyListingView(row('FAILED', { failedStep: 'CREATE', lastErrorMessage: 42 })).failureDetail, null);
});

test('polling: only in-flight states, and only for 5 minutes', () => {
  assert.equal(ui.shouldPollEtsyListing('DRAFT_PENDING', 0), true);
  assert.equal(ui.shouldPollEtsyListing('PUBLISHING', 1000), true);
  assert.equal(ui.shouldPollEtsyListing('DRAFT_PENDING', ui.ETSY_POLL_MAX_MS), false);
  assert.equal(ui.shouldPollEtsyListing('DRAFT_READY', 0), false);
  assert.equal(ui.shouldPollEtsyListing('ACTIVE', 0), false);
  assert.equal(ui.shouldPollEtsyListing(null, 0), false);
  assert.equal(ui.ETSY_POLL_INTERVAL_MS, 2000);
});

// ------------------------------------------------------------------------------------------------
// Local eligibility (mirror of backend checkEtsyEligibility)
// ------------------------------------------------------------------------------------------------

test('eligibility matrix, 2026 (cutoff 2006)', () => {
  const e = (x: Parameters<typeof ui.checkEtsyEligibilityLocal>[0], y = 2026) => ui.checkEtsyEligibilityLocal(x, y);
  assert.equal(e({ releaseYear: 2006 }).eligible, true);
  assert.equal(e({ releaseYear: 2007 }).eligible, false);
  assert.equal(e({ releaseYear: 2007 }).code, 'CARD_YEAR_TOO_RECENT');
  for (const v of ['before_2007', '2000_2006', '1990s']) assert.equal(e({ whenMade: v }).eligible, true, v);
  for (const v of ['2007_2009', '2010_2019', '2020_2026', 'made_to_order']) {
    const r = e({ whenMade: v });
    assert.equal(r.eligible, false, v);
    assert.equal(r.code, 'ERA_TOO_RECENT');
  }
  assert.equal(e({ isSupply: true }).eligible, true);
  assert.equal(e({ isSupply: true, releaseYear: 2015 }).eligible, false);
  assert.equal(e({ isSupply: true, releaseYear: 2015 }).code, 'CARD_YEAR_TOO_RECENT');
  assert.equal(e({}).code, 'NO_ERA');
  assert.equal(e({ whenMade: 'nonsense' }).code, 'NO_ERA');
  assert.equal(e({ whenMade: '2007_2009' }, 2027).eligible, false);
  assert.equal(e({ releaseYear: 2007 }, 2027).eligible, true);
});

test('eligibility messages match the backend wrapper text (ADR-135 D4.3)', { skip: !fs.existsSync(path.join(BACKEND_MKT, 'etsyEligibility.ts')) }, () => {
  const src = fs.readFileSync(path.join(BACKEND_MKT, 'etsyEligibility.ts'), 'utf8');
  assert.ok(src.includes(ui.ETSY_MSG_NO_ERA), 'no-era message differs');
  assert.ok(src.includes(ui.etsyMsgEraTooRecent('{era}')), 'era-too-recent template differs');
  assert.ok(src.includes(ui.etsyMsgCardYearTooRecent(0).replace('0', '{year}')), 'card-year template differs');
});

test('condition and grade labels in the preview match the backend mapper', { skip: !fs.existsSync(path.join(BACKEND_MKT, 'etsyMapping.ts')) }, () => {
  const src = fs.readFileSync(path.join(BACKEND_MKT, 'etsyMapping.ts'), 'utf8');
  for (const needle of ["USED: 'Pre-owned'", "REFURBISHED: 'Refurbished'", "PARTS_OR_REPAIR: 'For parts or repair'", "NEW: 'New'", "S: 'Excellent'", "A: 'Excellent'", "B: 'Very good'", "C: 'Good'", "D: 'Acceptable'"]) {
    assert.ok(src.includes(needle), needle);
  }
  const p = ui.buildEtsyPreview({ id: 'i', description: 'Nice.', condition: 'USED', conditionGrade: 'A' });
  assert.equal(p.description, 'Nice.\n\nCondition: Pre-owned. Grade: A (Excellent).');
});

test('preview condition line reads legacy condition values through the canonical model, like the backend', () => {
  const line = (condition: string | null) => ui.buildEtsyPreview({ id: 'i', description: 'Nice.', condition }).description;
  assert.equal(line('LIKE_NEW'), 'Nice.\n\nCondition: Pre-owned.');
  assert.equal(line('good'), 'Nice.\n\nCondition: Pre-owned.');
  assert.equal(line('POOR'), 'Nice.\n\nCondition: For parts or repair.');
  assert.equal(line('NEW'), 'Nice.\n\nCondition: New.');
  assert.equal(line('nonsense'), 'Nice.');
});

test('eligibility response: 200 and the 422 Discogs shape', () => {
  assert.deepEqual(ui.normalizeEtsyEligibility(200, { eligible: true, reason: null }), { eligible: true, reason: null, code: null });
  const r = ui.normalizeEtsyEligibility(422, { eligible: false, reason: ui.etsyMsgCardYearTooRecent(2015), code: 'CARD_YEAR_TOO_RECENT' });
  assert.equal(r.eligible, false);
  assert.equal(r.code, 'CARD_YEAR_TOO_RECENT');
  assert.equal(ui.normalizeEtsyEligibility(422, { eligible: false, reason: 'x'.repeat(400) }).reason, null);
  assert.equal(ui.normalizeEtsyEligibility(422, { eligible: false, code: 'SOMETHING' }).code, null);
  assert.equal(ui.isNoEraEligibility(ui.normalizeEtsyEligibility(422, { eligible: false, reason: ui.ETSY_MSG_NO_ERA })), true);
  assert.equal(ui.isNoEraEligibility({ eligible: false, reason: 'anything', code: 'NO_ERA' }), true);
  assert.equal(ui.isNoEraEligibility({ eligible: false, reason: ui.etsyMsgCardYearTooRecent(2015), code: 'CARD_YEAR_TOO_RECENT' }), false);
  assert.equal(ui.isNoEraEligibility({ eligible: true, reason: null, code: null }), false);
});

// ------------------------------------------------------------------------------------------------
// Per-item section (ineligible, prepare, status)
// ------------------------------------------------------------------------------------------------

const labels = {
  prepare: ETSY_SECTION_COPY.prepare,
  seeProgress: ETSY_SECTION_COPY.seeProgress,
  reviewAndPublish: ETSY_SECTION_COPY.reviewAndPublish,
  viewDetails: ETSY_SECTION_COPY.viewDetails,
  fixAndRetry: ETSY_SECTION_COPY.fixAndRetry,
  pushPaused: ETSY_SECTION_COPY.pushPaused,
};
const section = (over: Partial<Parameters<typeof ui.deriveEtsySection>[0]> = {}) =>
  ui.deriveEtsySection({ connection: conn(), eligibility: null, listing: null, labels, ...over });

test('section: hidden when the connector is off, not connected or not allowed', () => {
  assert.equal(section({ connection: undefined }).kind, 'hidden');
  assert.equal(section({ connection: ui.ETSY_DISABLED_CONNECTION }).kind, 'hidden');
  assert.equal(section({ connection: conn({ connected: false, status: null }) }).kind, 'hidden');
  assert.equal(section({ connection: conn({ allowed: false }) }).kind, 'hidden');
});

test('section: needs reconnect, currency blocked and push paused', () => {
  assert.equal(section({ connection: conn({ connected: false, status: 'NEEDS_REAUTH', needsReauth: true }) }).kind, 'reconnect');
  const eur = section({ connection: conn({ shopCurrency: 'EUR', currencySupported: false }) });
  assert.equal(eur.kind, 'blocked');
  assert.ok(/EUR/.test(eur.message ?? ''));
  const paused = section({ connection: conn({ pushEnabled: false }) });
  assert.equal(paused.kind, 'blocked');
  assert.equal(paused.message, ETSY_SECTION_COPY.pushPaused);
});

test('section: ineligible shows the message and no button; no-era still offers the button with a hint', () => {
  const card = section({ eligibility: { eligible: false, reason: ui.etsyMsgCardYearTooRecent(2015), code: 'CARD_YEAR_TOO_RECENT' } });
  assert.equal(card.kind, 'ineligible');
  assert.equal(card.buttonLabel, null);
  assert.equal(card.message, ui.etsyMsgCardYearTooRecent(2015));
  const noEra = section({ eligibility: { eligible: false, reason: ui.ETSY_MSG_NO_ERA, code: 'NO_ERA' } });
  assert.equal(noEra.kind, 'prepare');
  assert.equal(noEra.buttonLabel, 'Prepare for Etsy');
  assert.equal(noEra.hint, ui.ETSY_MSG_NO_ERA);
  const fine = section({ eligibility: { eligible: true, reason: null, code: null } });
  assert.equal(fine.kind, 'prepare');
  assert.equal(fine.hint, null);
  assert.equal(section().kind, 'prepare');
});

test('section: draft pending, draft ready, live, failed and sold show a status with the right button', () => {
  assert.deepEqual([section({ listing: row('DRAFT_PENDING') }).kind, section({ listing: row('DRAFT_PENDING') }).buttonLabel], ['status', 'See progress']);
  assert.equal(section({ listing: row('DRAFT_READY') }).buttonLabel, 'Review and publish');
  assert.equal(section({ listing: row('PUBLISHING') }).buttonLabel, 'See progress');
  assert.equal(section({ listing: row('ACTIVE') }).buttonLabel, 'View details');
  assert.equal(section({ listing: row('FAILED', { failedStep: 'CREATE' }) }).buttonLabel, 'Fix and try again');
  assert.equal(section({ listing: row('SOLD') }).buttonLabel, null);
  assert.equal(section({ listing: row('SOLD') }).kind, 'status');
  // a live listing keeps its status even when the item is no longer eligible or the push is paused
  assert.equal(section({ listing: row('ACTIVE'), connection: conn({ pushEnabled: false }) }).kind, 'status');
  // an ended listing can be prepared again
  assert.equal(section({ listing: row('ENDED') }).kind, 'prepare');
});

// ------------------------------------------------------------------------------------------------
// Draft modal: problems, missing fields, request body, preview
// ------------------------------------------------------------------------------------------------

const ITEM: ui.EtsyItemInput = {
  id: 'item1', title: 'Vintage brass candlestick', description: 'Heavy brass.\nSee https://example.com or mail me@example.com', price: '24.5',
  tags: ['brass', 'Brass', 'candle'], condition: 'USED', conditionGrade: 'B', photoUrls: ['https://res.cloudinary.com/x/1.jpg', 'http://insecure.example/2.jpg'],
  stockTotal: 1, stockSold: 0,
};
const FORM: ui.EtsyDraftFormValues = {
  whenMade: '1970s', isSupply: false, taxonomyId: 1234, shippingProfileId: '11', returnPolicyId: '22', readinessStateId: '33', attested: true,
};
const problems = (over: Partial<Parameters<typeof ui.getEtsyDraftProblems>[0]> = {}) =>
  ui.getEtsyDraftProblems({ item: ITEM, connection: conn(), form: FORM, asOfYear: 2026, ...over });

test('modal: a complete, eligible form can be submitted', () => {
  const p = problems();
  assert.deepEqual(p.blocking, []);
  assert.deepEqual(p.missing, []);
  assert.equal(p.canSubmit, true);
});

test('modal: the attestation is required before a draft can be saved', () => {
  const p = problems({ form: { ...FORM, attested: false } });
  assert.equal(p.canSubmit, false);
  assert.deepEqual(p.missing, ['confirmation box']);
  assert.equal(ui.buildEtsyDraftRequest({ ...FORM, attested: false }), null);
});

test('modal: missing era, category and profiles are listed in plain words', () => {
  const p = problems({ form: { ...FORM, whenMade: '', taxonomyId: null, shippingProfileId: '', readinessStateId: '' } });
  assert.deepEqual(p.missing, ['time period', 'Etsy category', 'shipping profile', 'processing profile']);
  assert.equal(p.canSubmit, false);
  // no era yet is not an eligibility problem, it is just a question the form asks
  assert.deepEqual(p.blocking, []);
});

test('modal: an era that is too recent explains why, in the backend wording', () => {
  const p = problems({ form: { ...FORM, whenMade: '2010_2019' } });
  assert.equal(p.canSubmit, false);
  assert.equal(p.blocking.length >= 1, true);
  assert.equal(p.blocking[0], ui.etsyMsgEraTooRecent('2010 to 2019'));
  assert.ok(p.missing.includes('time period'), 'a value the list does not offer counts as not chosen');
});

test('modal: craft supplies can use any era, so the full list is valid for them', () => {
  const p = problems({ form: { ...FORM, whenMade: '2020_2026', isSupply: true } });
  assert.deepEqual(p.blocking, []);
  assert.deepEqual(p.missing, []);
  assert.equal(p.canSubmit, true);
});

test('modal: a card released too recently blocks, even for a craft supply', () => {
  const p = problems({ item: { ...ITEM, releaseYear: 2015 }, form: { ...FORM, isSupply: true } });
  assert.equal(p.canSubmit, false);
  assert.equal(p.blocking[0], ui.etsyMsgCardYearTooRecent(2015));
  const old = problems({ item: { ...ITEM, releaseYear: 1993 } });
  assert.equal(old.canSubmit, true);
});

test('modal: connection problems are plain sentences', () => {
  assert.deepEqual(problems({ connection: undefined }).blocking.slice(0, 1), [ETSY_PROBLEM_MESSAGES.disabled]);
  assert.ok(problems({ connection: conn({ connected: false, status: null }) }).blocking.includes(ETSY_PROBLEM_MESSAGES.notConnected));
  assert.ok(problems({ connection: conn({ connected: false, status: 'NEEDS_REAUTH', needsReauth: true }) }).blocking.includes(ETSY_PROBLEM_MESSAGES.needsReconnect));
  assert.ok(problems({ connection: conn({ pushEnabled: false }) }).blocking.includes(ETSY_PROBLEM_MESSAGES.pushPaused));
  assert.ok(problems({ connection: conn({ allowed: false }) }).blocking.includes(ETSY_PROBLEM_MESSAGES.notAllowed));
  const eur = problems({ connection: conn({ shopCurrency: 'EUR', currencySupported: false }) });
  assert.ok(eur.blocking.some((m) => m.includes('EUR')));
  assert.equal(eur.canSubmit, false);
});

test('modal: item problems (title, price, photos, sold out)', () => {
  assert.ok(problems({ item: { ...ITEM, title: '  ' } }).blocking.includes(ETSY_PROBLEM_MESSAGES.titleMissing));
  assert.ok(problems({ item: { ...ITEM, price: null } }).blocking.includes(ETSY_PROBLEM_MESSAGES.priceMissing));
  assert.ok(problems({ item: { ...ITEM, price: 0 } }).blocking.includes(ETSY_PROBLEM_MESSAGES.priceMissing));
  assert.ok(problems({ item: { ...ITEM, photoUrls: [] } }).blocking.includes(ETSY_PROBLEM_MESSAGES.noPhotos));
  assert.ok(problems({ item: { ...ITEM, stockTotal: 3, stockSold: 3 } }).blocking.includes(ETSY_PROBLEM_MESSAGES.soldOut));
});

test('draft request body: only the fields the server accepts, no title, price or listing ids', () => {
  const body = ui.buildEtsyDraftRequest(FORM);
  assert.deepEqual(body, {
    whenMade: '1970s', isSupply: false, taxonomyId: 1234, shippingProfileId: '11', returnPolicyId: '22', readinessStateId: '33', attest: true,
  });
  const noReturn = ui.buildEtsyDraftRequest({ ...FORM, returnPolicyId: '' });
  assert.ok(noReturn && !('returnPolicyId' in noReturn));
  assert.equal(ui.buildEtsyDraftRequest({ ...FORM, taxonomyId: null }), null);
  assert.equal(ui.buildEtsyDraftRequest({ ...FORM, whenMade: '' }), null);
  for (const key of Object.keys(body as object)) assert.ok(!/title|price|listing|shopId|organizer/i.test(key), key);
});

test('initial form: from a saved listing, else shop defaults; the attestation is never pre-ticked', () => {
  const fromDefaults = ui.initialEtsyDraftForm(null, conn());
  assert.equal(fromDefaults.shippingProfileId, '11');
  assert.equal(fromDefaults.readinessStateId, '33');
  assert.equal(fromDefaults.whenMade, '');
  assert.equal(fromDefaults.attested, false);
  const fromListing = ui.initialEtsyDraftForm(row('FAILED', { failedStep: 'CREATE', shippingProfileId: '12', attestedAt: '2026-10-01T00:00:00Z' }), conn());
  assert.equal(fromListing.shippingProfileId, '12');
  assert.equal(fromListing.whenMade, '1980s');
  assert.equal(fromListing.taxonomyId, 1234);
  assert.equal(fromListing.attested, false);
});

test('preview: links and emails removed, condition line added, tags de-duplicated, https photos only, 20 max', () => {
  const p = ui.buildEtsyPreview(ITEM);
  assert.equal(p.title, 'Vintage brass candlestick');
  assert.equal(p.priceText, '$24.50');
  assert.equal(p.quantity, 1);
  assert.deepEqual(p.tags, ['brass', 'candle']);
  assert.ok(!/https?:|example\.com|@/.test(p.description), p.description);
  assert.ok(p.description.endsWith('Condition: Pre-owned. Grade: B (Very good).'));
  assert.deepEqual(p.photoUrls, ['https://res.cloudinary.com/x/1.jpg']);
  const many = ui.buildEtsyPreview({ id: 'x', photoUrls: Array.from({ length: 25 }, (_, i) => `https://res.cloudinary.com/x/${i}.jpg`) });
  assert.equal(many.photoUrls.length, 20);
  assert.equal(many.photoCount, 25);
  assert.equal(ui.buildEtsyPreview({ id: 'x', title: 'a'.repeat(200) }).title.length, 140);
});

test('preview quantity follows stockTotal minus stockSold (never Item.quantity)', () => {
  assert.equal(ui.etsyPreviewQuantity({ stockTotal: null, stockSold: null }), 1);
  assert.equal(ui.etsyPreviewQuantity({ stockTotal: 1, stockSold: 0 }), 1);
  assert.equal(ui.etsyPreviewQuantity({ stockTotal: 5, stockSold: 2 }), 3);
  assert.equal(ui.etsyPreviewQuantity({ stockTotal: 5, stockSold: 5 }), 0);
});

test('price text', () => {
  assert.equal(ui.formatEtsyPrice(12), '$12.00');
  assert.equal(ui.formatEtsyPrice('7.499'), '$7.50');
  assert.equal(ui.formatEtsyPrice(null), null);
  assert.equal(ui.formatEtsyPrice(-1), null);
  assert.equal(ui.formatEtsyPrice('abc'), null);
});

// ------------------------------------------------------------------------------------------------
// Categories
// ------------------------------------------------------------------------------------------------

test('categories: leaf nodes only, suggested first, tolerant of shape', () => {
  const data = {
    suggested: { id: 11, name: 'Candle Holders', fullPath: 'Home & Living > Decor > Candle Holders' },
    nodes: [
      { id: 10, name: 'Decor', fullPath: 'Home & Living > Decor', isLeaf: false },
      { id: 11, name: 'Candle Holders', fullPath: 'Home & Living > Decor > Candle Holders', isLeaf: true },
      { taxonomyId: '12', name: 'Vases', path: 'Home & Living > Decor > Vases' },
      { id: 13 },
      { id: 'x', name: 'Bad' },
      { id: 2147483648, name: 'Too big' },
      { id: 12, name: 'Vases again', fullPath: 'dupe' },
    ],
  };
  const c = ui.normalizeEtsyCategories(data);
  assert.deepEqual(c.leaves.map((n) => n.id), [11, 12]);
  assert.equal(c.suggested?.id, 11);
  assert.equal(c.leaves[1].fullPath, 'Home & Living > Decor > Vases');
  assert.deepEqual(ui.normalizeEtsyCategories(null), { suggested: null, leaves: [] });
  assert.deepEqual(ui.normalizeEtsyCategories([{ id: 5, name: 'A' }]).leaves.map((n) => n.id), [5]);
  const onlySuggested = ui.normalizeEtsyCategories({ suggested: { id: 7, name: 'Solo' }, nodes: [] });
  assert.deepEqual(onlySuggested.leaves.map((n) => n.id), [7]);
  const byId = ui.normalizeEtsyCategories({ suggested: 12, leaves: [{ id: 12, name: 'Vases' }] });
  assert.equal(byId.suggested?.id, 12);
});

test('category search: every word must match; the suggested one stays first', () => {
  const c = ui.normalizeEtsyCategories({
    suggested: { id: 3, name: 'Candle Holders', fullPath: 'Home > Candle Holders' },
    nodes: [
      { id: 1, name: 'Vases', fullPath: 'Home > Vases' },
      { id: 2, name: 'Holders', fullPath: 'Kitchen > Holders' },
      { id: 3, name: 'Candle Holders', fullPath: 'Home > Candle Holders' },
    ],
  });
  assert.deepEqual(ui.filterEtsyCategories(c, '', 50).map((n) => n.id), [3, 1, 2]);
  assert.deepEqual(ui.filterEtsyCategories(c, 'holders', 50).map((n) => n.id), [3, 2]);
  assert.deepEqual(ui.filterEtsyCategories(c, 'home holders', 50).map((n) => n.id), [3]);
  assert.deepEqual(ui.filterEtsyCategories(c, 'zzz', 50), []);
  assert.equal(ui.filterEtsyCategories(c, '', 1).length, 1);
});

// ------------------------------------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------------------------------------

const httpErr = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

test('errors: known codes map to fixed copy and never echo server text', () => {
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_NEEDS_REAUTH', message: 'raw server text' })), ETSY_PANEL_COPY.needsReconnect);
  assert.equal(ui.etsyErrorMessage(httpErr(503, { code: 'ETSY_BUSY', message: 'raw server text' })), 'Etsy is busy. Try again in a moment.');
  assert.equal(ui.etsyErrorMessage(httpErr(502, { code: 'ETSY_ERROR', message: 'Bearer abc123 leaked' })), 'Etsy could not complete this step. Try again, or contact support.');
  assert.equal(ui.etsyErrorMessage(httpErr(500, { message: 'stack trace here' })), 'Etsy could not complete this step. Try again, or contact support.');
  assert.equal(ui.etsyErrorMessage(null), 'Etsy could not complete this step. Try again, or contact support.');
  assert.equal(ui.etsyErrorMessage(new Error('boom'), 'fallback sentence'), 'fallback sentence');
  assert.equal(ui.etsyErrorMessage(httpErr(429, {})), 'Etsy is busy. Try again in a moment.');
});

test('errors: the two cases that show server text (publish blocked, 422 reason) are length limited', () => {
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_PUBLISH_BLOCKED', message: 'Add a shipping profile on Etsy.' })), 'Add a shipping profile on Etsy.');
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_PUBLISH_BLOCKED', message: 'x'.repeat(301) })), 'Etsy could not complete this step. Try again, or contact support.');
  assert.equal(ui.etsyErrorMessage(httpErr(422, { eligible: false, reason: ui.etsyMsgCardYearTooRecent(2015) })), ui.etsyMsgCardYearTooRecent(2015));
  assert.equal(ui.etsyErrorStatus(httpErr(404, {})), 404);
  assert.equal(ui.etsyErrorCode(httpErr(404, { code: 'X' })), 'X');
  assert.equal(ui.etsyErrorCode('nope'), null);
});

test('date and photo helpers', () => {
  assert.equal(ui.formatEtsyDate('2027-02-03T12:00:00Z'), 'February 3, 2027');
  assert.equal(ui.formatEtsyDate('not a date'), null);
  assert.equal(ui.formatEtsyDate(null), null);
  assert.equal(ui.isSafePhotoUrl('https://a.example/x.jpg'), true);
  assert.equal(ui.isSafePhotoUrl('javascript:alert(1)'), false);
  assert.equal(ui.isSafePhotoUrl('http://a.example/x.jpg'), false);
});

// ---- reconciliation with the B3 listing routes (controllers/etsyListingController.ts) ----
test('B3 listing shape: { listing: null } and the listing row with `message` and `statusLabel`', () => {
  assert.equal(ui.normalizeEtsyListing({ listing: null }), null);
  const failed = ui.normalizeEtsyListing({
    listing: { id: 'l1', itemId: 'i1', state: 'FAILED', statusLabel: 'Failed', failedStep: 'IMAGES', message: 'Etsy could not take the photos. Try again.', imagesUploaded: 1, imagesTotal: 3, canRetry: true },
  });
  assert.ok(failed);
  assert.equal(failed!.failedStep, 'IMAGES');
  // The server's fixed per-step fallback is not shown as a "detail": the panel has its own sentence.
  assert.equal(failed!.lastErrorMessage, null);
  const detailed = ui.normalizeEtsyListing({ listing: { state: 'FAILED', failedStep: 'CREATE', message: 'Etsy said the title is too long.' } });
  assert.equal(detailed!.lastErrorMessage, 'Etsy said the title is too long.');
  assert.equal(ui.deriveEtsyListingView(detailed).failureDetail, 'Etsy said the title is too long.');
});

test('B3: a refused publish leaves the draft ready and the reason is surfaced', () => {
  const ready = ui.normalizeEtsyListing({ listing: { state: 'DRAFT_READY', attestedAt: '2026-10-03T00:00:00Z', message: 'Etsy could not publish this listing: Add a return policy.' } });
  const v = ui.deriveEtsyListingView(ready);
  assert.equal(v.mode, 'ready');
  assert.equal(v.failureDetail, 'Etsy could not publish this listing: Add a return policy.');
  assert.equal(ui.deriveEtsyListingView(ui.normalizeEtsyListing({ listing: { state: 'DRAFT_READY' } })).failureDetail, null);
});

test('B3 taxonomy shape: suggested and results are both lists of leaf suggestions', () => {
  const c = ui.normalizeEtsyCategories({
    ready: true,
    suggestedLabel: 'Suggested',
    suggested: [{ id: 11, name: 'Casserole Dishes', fullPath: 'Home > Casserole Dishes', suggested: true }],
    results: [{ id: 11, name: 'Casserole Dishes', fullPath: 'Home > Casserole Dishes', suggested: false }, { id: 12, name: 'Bowls', fullPath: 'Home > Bowls', suggested: false }],
    message: null,
  });
  assert.equal(c.suggested?.id, 11);
  assert.deepEqual(c.leaves.map((n) => n.id), [11, 12]);
});

test('B3 error codes: fixed server sentences are shown, unknown codes stay generic', () => {
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_DRAFT_EXISTS', message: 'An Etsy draft already exists for this item. Publish it or discard it first.' })), 'An Etsy draft already exists for this item. Publish it or discard it first.');
  assert.equal(ui.etsyErrorMessage(httpErr(422, { code: 'ETSY_NOT_ELIGIBLE', reason: 'Tell us when it was made.', message: 'other' })), 'Tell us when it was made.');
  assert.equal(ui.etsyErrorMessage(httpErr(503, { code: 'ETSY_PUSH_DISABLED', message: 'Listing on Etsy is paused right now. Try again later.' })), 'Listing on Etsy is paused right now. Try again later.');
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_DRAFT_EXISTS', message: 'y'.repeat(301) })), 'Etsy could not complete this step. Try again, or contact support.');
  assert.equal(ui.etsyErrorMessage(httpErr(409, { code: 'ETSY_SOMETHING_NEW', message: 'raw text' })), 'Etsy could not complete this step. Try again, or contact support.');
});

test('B3 drift: the server step fallbacks dropped by the listing normalizer match etsyConnector.ts', () => {
  const file = path.join(BACKEND_MKT, 'etsyConnector.ts');
  if (!fs.existsSync(file)) return; // backend not checked out beside the frontend
  const src = fs.readFileSync(file, 'utf8');
  for (const s of [
    'Etsy could not create the draft. Try again.',
    'Etsy could not take the photos. Try again.',
    'Etsy could not publish the listing. Try again.',
    'Etsy could not update the listing. Try again.',
    'Etsy could not end the listing. Try again.',
    'Etsy could not complete this step. Try again, or contact support.',
  ]) assert.ok(src.indexOf(s) !== -1, `backend no longer contains: ${s}`);
});
