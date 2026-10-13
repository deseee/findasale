/**
 * Onboarding email content checks (2026-10-12): every CTA points at a page that exists
 * (/organizer/create-sale, /organizer/add-items/<id>, /organizer/edit-sale/<id>?publish=1),
 * never the dead /organizer/sales/new, and the copy follows the brand rules
 * (no "estate sale", no "AI", no em dashes, no unsourced statistics).
 * Nothing is sent: the mail rail, suppression and unsubscribe links are mocked.
 */
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn(async () => ({})) } } }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn(async () => false) } }));
jest.mock('../controllers/unsubscribeController', () => ({
  buildUnsubscribeLinks: jest.fn(async () => ({ webUrl: 'https://finda.sale/unsubscribe?token=t', listUnsubscribeHeader: '<x>' })),
}));

import { emailService } from '../lib/emailService';
import { suppressionService } from '../services/suppressionService';
import {
  sendOnboardingEmail5a,
  sendOnboardingEmail5b,
  sendOnboardingEmail5c,
  sendEmptySaleNudge,
  sendDraftReadyNudge,
} from '../services/onboardingEmailService';

const send = (emailService as any).emails.send as jest.Mock;
const isSuppressed = (suppressionService as any).isSuppressed as jest.Mock;

const base = { email: 'o@example.com', firstName: 'Pat', userId: 'u1' };

function lastSent(): { subject: string; html: string } {
  const call = send.mock.calls[send.mock.calls.length - 1][0];
  return { subject: call.subject, html: call.html };
}

function expectCopyRules(text: string) {
  expect(text).not.toMatch(/estate sale/i);
  expect(text).not.toMatch(/\bAI\b/);
  expect(text).not.toMatch(/—|&mdash;/);
  expect(text).not.toContain('/organizer/sales/new');
}

beforeEach(() => {
  send.mockClear();
  isSuppressed.mockResolvedValue(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('onboarding emails 5a/5b/5c', () => {
  it.each([
    ['5a', sendOnboardingEmail5a],
    ['5b', sendOnboardingEmail5b],
    ['5c', sendOnboardingEmail5c],
  ])('%s links to /organizer/create-sale and follows the copy rules', async (_n, fn) => {
    await fn(base);
    const { subject, html } = lastSent();
    expect(html).toContain('/organizer/create-sale');
    expectCopyRules(subject + html);
  });

  it('5a and 5c quote no statistics', async () => {
    await sendOnboardingEmail5a(base);
    expect(lastSent().html).not.toMatch(/4&times;|under 7 minutes/);
    await sendOnboardingEmail5c(base);
    expect(lastSent().html).not.toMatch(/34 views/);
  });
});

describe('activation nudges', () => {
  it('empty-sale nudge links to add-items for that sale and escapes the title', async () => {
    await sendEmptySaleNudge({ ...base, saleId: 'sale_1', saleTitle: 'Table <b>' });
    const { subject, html } = lastSent();
    expect(html).toContain('/organizer/add-items/sale_1');
    expect(html).toContain('Table &lt;b&gt;');
    expectCopyRules(subject + html);
  });

  it('draft-ready nudge links to edit-sale with publish=1 and shows the item count', async () => {
    await sendDraftReadyNudge({ ...base, saleId: 'sale_2', saleTitle: 'Boutique', itemCount: 14 });
    const { subject, html } = lastSent();
    expect(html).toContain('/organizer/edit-sale/sale_2?publish=1');
    expect(html).toContain('14 items');
    expectCopyRules(subject + html);
  });

  it('suppressed recipients get nothing', async () => {
    isSuppressed.mockResolvedValue(true);
    await sendEmptySaleNudge({ ...base, saleId: 's', saleTitle: 't' });
    await sendDraftReadyNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
