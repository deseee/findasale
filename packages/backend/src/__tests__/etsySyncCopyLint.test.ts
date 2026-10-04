/**
 * ADR-135 batch E-B4 copy lint. Organizer-facing strings of the sold-sync batch must not say "AI" or
 * "estate sale", must not contain an em dash, and must not be placeholders. Covers the notification
 * copy (every kind, odd titles, singular and plural units) and the source files of this batch.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import * as fs from 'fs';
import * as path from 'path';
import { ETSY_SOLD_MESSAGES } from '../services/marketplace/etsySoldService';

const EM_DASH = '—';
const EN_DASH = '–';
const PLACEHOLDER = /\bTODO\b|\bTBD\b|\bFIXME\b|lorem|ipsum|\{\{|\}\}|\[(?:name|date|link|todo)\]|undefined|\bnull\b|NaN/i;

function lint(text: string): string[] {
  const problems: string[] = [];
  if (/\bAI\b/.test(text)) problems.push('says "AI"');
  if (/estate\s+sale/i.test(text)) problems.push('says "estate sale"');
  if (text.includes(EM_DASH)) problems.push('has an em dash');
  if (PLACEHOLDER.test(text)) problems.push('looks like a placeholder');
  if (!text.trim()) problems.push('is empty');
  return problems;
}

function expectClean(label: string, strings: string[]) {
  const bad = strings.map((s) => ({ s, p: lint(s) })).filter((x) => x.p.length > 0);
  expect({ label, bad }).toEqual({ label, bad: [] });
}

const TITLES = ['Vintage Brass Candlestick', '', '   ', 'A <b>bold</b> title', 'x'.repeat(400), 'Tom & Jerry "Cup"'];

describe('ETSY_SOLD_MESSAGES', () => {
  it('the title is clean and short', () => {
    expectClean('title', [ETSY_SOLD_MESSAGES.title]);
    expect(ETSY_SOLD_MESSAGES.title.length).toBeLessThan(60);
  });

  it('every body is clean for every title shape, unit count and remaining count', () => {
    const bodies: string[] = [];
    for (const t of TITLES) {
      bodies.push(ETSY_SOLD_MESSAGES.soldOut(t), ETSY_SOLD_MESSAGES.oversold(t));
      for (const [u, r] of [[1, 4], [2, 3], [10, 0]]) bodies.push(ETSY_SOLD_MESSAGES.partial(t, u, r));
    }
    expectClean('bodies', bodies);
    for (const b of bodies) expect(b).toMatch(/[.!?]$/);
  });

  it('no body carries markup from the item title and long titles are capped', () => {
    const b = ETSY_SOLD_MESSAGES.soldOut('A <b>bold</b> title');
    expect(b).not.toMatch(/[<>]/);
    expect(ETSY_SOLD_MESSAGES.soldOut('x'.repeat(400)).length).toBeLessThan(300);
  });

  it('uses the singular for one unit and the plural otherwise', () => {
    expect(ETSY_SOLD_MESSAGES.partial('Cup', 1, 4)).toContain('One unit');
    expect(ETSY_SOLD_MESSAGES.partial('Cup', 2, 3)).toContain('2 units');
  });

  it('says what happens next and what to do, in plain words', () => {
    expect(ETSY_SOLD_MESSAGES.soldOut('Cup')).toContain('removed from your other marketplaces');
    expect(ETSY_SOLD_MESSAGES.oversold('Cup')).toContain('cancel or refund');
  });
});

describe('source files of this batch', () => {
  const root = path.resolve(__dirname, '..');
  const files = [
    'services/marketplace/etsyReceipts.ts',
    'services/marketplace/etsySoldService.ts',
    'services/marketplace/etsyDraftSweep.ts',
    'controllers/etsyWebhookController.ts',
    'routes/etsyWebhook.ts',
    'jobs/etsySoldSyncCron.ts',
  ];
  it.each(files)('%s has no em dash or en dash', (rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(text.includes(EM_DASH)).toBe(false);
    expect(text.includes(EN_DASH)).toBe(false);
  });
  it.each(files)('%s is UTF-8 with LF endings and no NUL bytes', (rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(text.includes('\r')).toBe(false);
    expect(text.includes('\u0000')).toBe(false);
  });
  it.each(files)('%s never says "estate sale"', (rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(/estate\s+sale/i.test(text)).toBe(false);
  });
});
