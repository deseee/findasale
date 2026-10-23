/**
 * Onboarding email content checks (2026-10-12): every CTA points at a page that exists
 * (/organizer/create-sale, /organizer/add-items/<id>, /organizer/edit-sale/<id>?publish=1),
 * never the dead /organizer/sales/new, and the copy follows the brand rules
 * (no "estate sale", no "AI", no em dashes, no unsourced statistics).
 * Nothing is sent: the mail rail, suppression and unsubscribe links are mocked.
 */
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: jest.fn(async () => ({})) } } }));
// Activation nudges use the transactional (Resend) rail since 2026-10-23.
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn(async () => ({ sent: true })) } },
}));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn(async () => false) } }));
jest.mock('../controllers/unsubscribeController', () => ({
  buildUnsubscribeLinks: jest.fn(async () => ({ webUrl: 'https://finda.sale/unsubscribe?token=t', listUnsubscribeHeader: '<x>' })),
}));

import { emailService } from '../lib/emailService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from '../services/suppressionService';
import {
  sendOnboardingEmail5a,
  sendOnboardingEmail5b,
  sendOnboardingEmail5c,
  sendEmptySaleNudge,
  sendDraftReadyNudge,
  sendStaleDatesNudge,
} from '../services/onboardingEmailService';

const gmailSend = (emailService as any).emails.send as jest.Mock;
const resendSend = (transactionalEmailService as any).emails.send as jest.Mock;
let send: jest.Mock = gmailSend;
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
  gmailSend.mockClear();
  resendSend.mockClear();
  resendSend.mockResolvedValue({ sent: true });
  send = gmailSend;
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
  beforeEach(() => {
    send = resendSend;
  });

  it('go out on the Resend rail from support@ with one-click unsubscribe headers, never the Gmail rail', async () => {
    expect(await sendEmptySaleNudge({ ...base, saleId: 's1', saleTitle: 'T' })).toBe('sent');
    expect(gmailSend).not.toHaveBeenCalled();
    const call = resendSend.mock.calls[0][0];
    expect(call.from).toContain('support@finda.sale');
    expect(call.headers['List-Unsubscribe']).toContain('https://finda.sale/unsubscribe?token=t');
    expect(call.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('report failed (retry) when the rail throws, suppressed when the rail blocks the address', async () => {
    resendSend.mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendDraftReadyNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 1 })).toBe('failed');
    resendSend.mockResolvedValueOnce({ sent: false, reason: 'suppressed' });
    expect(await sendDraftReadyNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 1 })).toBe('suppressed');
    resendSend.mockResolvedValueOnce({ sent: false, reason: 'not_configured' });
    expect(await sendDraftReadyNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 1 })).toBe('failed');
  });

  it('stale-dates nudge links to the one-click re-date prompt and mentions saved items', async () => {
    await sendStaleDatesNudge({ ...base, saleId: 'sale_3', saleTitle: 'Boutique', itemCount: 14, saleStatus: 'DRAFT' });
    const { subject, html } = lastSent();
    expect(html).toContain('/organizer/edit-sale/sale_3?redate=1');
    expect(subject + html).toContain('14 items');
    expectCopyRules(subject + html);
    await sendStaleDatesNudge({ ...base, saleId: 'sale_4', saleTitle: 'Yard', itemCount: 0, saleStatus: 'PUBLISHED' });
    expectCopyRules(lastSent().subject + lastSent().html);
    await sendStaleDatesNudge({ ...base, saleId: 'sale_5', saleTitle: 'Yard', itemCount: 0, saleStatus: 'DRAFT' });
    expectCopyRules(lastSent().subject + lastSent().html);
  });

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
    expect(await sendEmptySaleNudge({ ...base, saleId: 's', saleTitle: 't' })).toBe('suppressed');
    expect(await sendDraftReadyNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 1 })).toBe('suppressed');
    expect(await sendStaleDatesNudge({ ...base, saleId: 's', saleTitle: 't', itemCount: 0, saleStatus: 'DRAFT' })).toBe('suppressed');
    expect(resendSend).not.toHaveBeenCalled();
    expect(gmailSend).not.toHaveBeenCalled();
  });
});
