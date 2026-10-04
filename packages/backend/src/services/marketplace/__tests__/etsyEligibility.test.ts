/**
 * ADR-135 batch E-B2, acceptance 3: checkEtsyEligibility returns the three exact messages from
 * D4.3, and a copy-lint finds no em dash, no standalone "AI" and no "estate sale" in any message
 * constant or generated message.
 */

// The registry imports ebayRateEstimateService, which imports the prisma client.
jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import {
  checkEtsyEligibility,
  etsyMsgCardYearTooRecent,
  etsyMsgEraTooRecent,
  ETSY_MSG_NO_ERA,
} from '../etsyEligibility';
import { ETSY_WHEN_MADE } from '../../../config/etsyWhenMade';

const asOfYear = 2026;

const MSG_NO_ERA =
  'To list this item on Etsy, tell us when it was made. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.';
const MSG_ERA_2010 =
  'This item is marked as made in 2010 to 2019. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies, so it cannot be listed on Etsy.';
const MSG_CARD_2015 =
  'This card was released in 2015. Etsy only accepts items that are 20 or more years old, so it cannot be listed on Etsy.';

describe('checkEtsyEligibility messages (ADR-135 D4.3)', () => {
  it('message 1, no era given', () => {
    const r = checkEtsyEligibility({}, { asOfYear });
    expect(r).toEqual({ eligible: false, reason: MSG_NO_ERA, code: 'NO_ERA' });
    expect(ETSY_MSG_NO_ERA).toBe(MSG_NO_ERA);
  });

  it('message 1 also covers a value that is not a real Etsy era', () => {
    const r = checkEtsyEligibility({}, { whenMade: 'sometime', asOfYear });
    expect(r.reason).toBe(MSG_NO_ERA);
    expect(r.code).toBe('NO_ERA');
  });

  it('message 2, era too recent, uses the era label', () => {
    const r = checkEtsyEligibility({}, { whenMade: '2010_2019', asOfYear });
    expect(r).toEqual({ eligible: false, reason: MSG_ERA_2010, code: 'ERA_TOO_RECENT' });
  });

  it('message 3, card year too recent, uses the year', () => {
    const r = checkEtsyEligibility({ releaseYear: 2015 }, { asOfYear });
    expect(r).toEqual({ eligible: false, reason: MSG_CARD_2015, code: 'CARD_YEAR_TOO_RECENT' });
  });

  it('message 3 also wins when the organizer ticked craft supply (it cannot rescue a card year)', () => {
    const r = checkEtsyEligibility({ releaseYear: 2015 }, { isSupply: true, whenMade: '1980s', asOfYear });
    expect(r.reason).toBe(MSG_CARD_2015);
    expect(r.code).toBe('CARD_YEAR_TOO_RECENT');
  });

  it('reads the release year from the loaded card relation', () => {
    const r = checkEtsyEligibility({ card: { releaseYear: 2015 } }, { asOfYear });
    expect(r.reason).toBe(MSG_CARD_2015);
    expect(checkEtsyEligibility({ card: { releaseYear: 1999 } }, { asOfYear }).eligible).toBe(true);
  });

  it('a card with no release year and no attestation gets message 1', () => {
    const r = checkEtsyEligibility({ card: { releaseYear: null } }, { asOfYear });
    expect(r.reason).toBe(MSG_NO_ERA);
  });

  it('eligible results carry a null reason and code OK', () => {
    expect(checkEtsyEligibility({}, { whenMade: '1970s', asOfYear })).toEqual({ eligible: true, reason: null, code: 'OK' });
    expect(checkEtsyEligibility({}, { isSupply: true, asOfYear })).toEqual({ eligible: true, reason: null, code: 'OK' });
    expect(checkEtsyEligibility({ releaseYear: 2006 }, { asOfYear })).toEqual({ eligible: true, reason: null, code: 'OK' });
  });

  it('has no override: nothing but era, supply tick or release year changes the outcome', () => {
    const r = checkEtsyEligibility({}, { whenMade: '2020_2026', isSupply: false, asOfYear });
    expect(r.eligible).toBe(false);
  });
});

describe('Etsy eligibility copy lint', () => {
  const messages: string[] = [
    ETSY_MSG_NO_ERA,
    etsyMsgCardYearTooRecent(2015),
    ...ETSY_WHEN_MADE.map((e) => etsyMsgEraTooRecent(e.label)),
  ];

  it('scans a non-trivial set of messages', () => {
    expect(messages.length).toBeGreaterThan(20);
  });

  it.each(messages.map((m, i) => [i, m] as [number, string]))('message %i has no banned copy', (_i, message) => {
    expect(message).not.toMatch(/—/);
    expect(message).not.toMatch(/\bAI\b/);
    expect(message).not.toMatch(/estate sale/i);
    expect(message).not.toMatch(/founder/i);
  });
});
