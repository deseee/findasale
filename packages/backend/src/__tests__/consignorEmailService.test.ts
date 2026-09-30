/**
 * Consignor statement and payment-recorded emails (organizer-settles model, 2026-09-29):
 * services/consignorEmailService.ts sendConsignorStatement and sendConsignorPaymentRecorded.
 *
 * NOT EXECUTED when written (no jest or tsc in the build sandbox). Run
 * `pnpm --filter backend test consignorEmailService` before merging.
 *
 * The Resend rail (transactionalEmailService) and the hard-suppression lookup are jest mocks, so no
 * real email is sent. isEmailDomainBlocked is the real implementation (pure function). The result
 * contract under test: { sent: true } or { sent: false, reason } where reason is NO_EMAIL,
 * BLOCKED_DOMAIN, SUPPRESSED or ERROR, so callers only stamp statementSentAt when mail really went out.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn() } },
}));
jest.mock('../services/suppressionService', () => {
  const actual = jest.requireActual('../services/suppressionService');
  return { ...actual, suppressionService: { isHardSuppressed: jest.fn() } };
});
jest.mock('../services/emailTemplateService', () => ({
  buildEmail: (o: any) => `HEADLINE:${o.headline}\nPREHEADER:${o.preheader}\n${o.body}`,
}));

import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from '../services/suppressionService';
import { sendConsignorStatement, sendConsignorPaymentRecorded } from '../services/consignorEmailService';
import { STATEMENT_FOOTER } from '../services/consignorLedgerService';

const send = (transactionalEmailService as any).emails.send as jest.Mock;
const isHardSuppressed = (suppressionService as any).isHardSuppressed as jest.Mock;

const GOOD = 'pat@maplemail.net';

function makeStatement(over: any = {}): any {
  return {
    reference: 'ABCD1234',
    payoutId: 'payout_abcd1234',
    organizerName: 'Maple Estate Co',
    consignor: { id: 'c1', name: 'Pat Maker', email: GOOD },
    periodLabel: 'Spring Sale',
    saleId: 's1',
    saleTitle: 'Spring Sale',
    status: 'PENDING',
    statusLabel: 'Approved, payment pending',
    payoutStatus: 'PENDING',
    batchStatus: 'APPROVED',
    method: null,
    methodLabel: null,
    paidAt: null,
    paidReference: null,
    legacy: false,
    lines: [
      { title: 'Marked down lamp', soldAt: '2026-09-02T00:00:00.000Z', listPrice: '20.00', priceBeforeMarkdown: '30.00', markedDown: true, ratePct: '50.00', consignorShare: '10.00' },
      { title: 'Chair', soldAt: '2026-09-03T00:00:00.000Z', listPrice: '30.00', priceBeforeMarkdown: null, markedDown: false, ratePct: '50.00', consignorShare: '15.00' },
    ],
    totals: { itemCount: 2, gross: '50.00', consignorShare: '25.00' },
    footer: STATEMENT_FOOTER,
    generatedAt: '2026-09-29T00:00:00.000Z',
    ...over,
  };
}

const recordedParams = (over: any = {}) => ({
  consignorName: 'Pat Maker',
  consignorEmail: GOOD,
  organizerName: 'Maple Estate Co',
  periodLabel: 'Spring Sale',
  amount: '25.00',
  method: 'CHECK',
  methodLabel: 'Check',
  paidAt: new Date('2026-09-10T00:00:00Z'),
  reference: 'ABCD1234',
  paymentReference: '1042',
  ...over,
});

beforeEach(() => {
  send.mockReset().mockResolvedValue({ sent: true });
  isHardSuppressed.mockReset().mockResolvedValue(false);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

type Sender = [string, (to: string | null | undefined) => Promise<{ sent: boolean; reason?: string }>];
const senders: Sender[] = [
  ['sendConsignorStatement', (to) => sendConsignorStatement({ statement: makeStatement(), toEmail: to })],
  ['sendConsignorPaymentRecorded', (to) => sendConsignorPaymentRecorded(recordedParams({ consignorEmail: to }))],
];

describe.each(senders)('%s result contract', (_name, run) => {
  it.each([[null], [undefined], [''], ['   ']])('NO_EMAIL for %p, and nothing is sent', async (to) => {
    expect(await run(to as any)).toEqual({ sent: false, reason: 'NO_EMAIL' });
    expect(send).not.toHaveBeenCalled();
    expect(isHardSuppressed).not.toHaveBeenCalled();
  });

  it.each([['x@finda.sale'], ['x@mail.finda.sale'], ['x@example.com'], ['x@localhost'], ['x@yourdomain.com']])(
    'BLOCKED_DOMAIN for %s, checked before any lookup or send',
    async (to) => {
      expect(await run(to)).toEqual({ sent: false, reason: 'BLOCKED_DOMAIN' });
      expect(send).not.toHaveBeenCalled();
      expect(isHardSuppressed).not.toHaveBeenCalled();
    }
  );

  it('SUPPRESSED when the address is hard suppressed, and nothing is sent', async () => {
    isHardSuppressed.mockResolvedValue(true);
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'SUPPRESSED' });
    expect(isHardSuppressed).toHaveBeenCalledWith(GOOD);
    expect(send).not.toHaveBeenCalled();
  });

  it('SUPPRESSED when the Resend rail itself reports the address suppressed', async () => {
    send.mockResolvedValue({ sent: false, reason: 'suppressed' });
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'SUPPRESSED' });
  });

  it('ERROR when the rail refuses, throws, or the suppression lookup throws; never throws itself', async () => {
    send.mockResolvedValueOnce({ sent: false, reason: 'rate limited' });
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'ERROR' });
    send.mockRejectedValueOnce(new Error('network'));
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'ERROR' });
    send.mockResolvedValueOnce(undefined);
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'ERROR' });
    isHardSuppressed.mockRejectedValueOnce(new Error('db down'));
    expect(await run(GOOD)).toEqual({ sent: false, reason: 'ERROR' });
  });

  it('sent: true only after the rail accepts, with one send call to the trimmed address', async () => {
    expect(await run(`  ${GOOD}  `)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(GOOD);
    expect(typeof send.mock.calls[0][0].subject).toBe('string');
    expect(typeof send.mock.calls[0][0].html).toBe('string');
    expect(typeof send.mock.calls[0][0].text).toBe('string');
  });
});

describe('sendConsignorStatement content', () => {
  it('names the organizer and reference in the subject, lists lines with was-prices, and carries the footer in html and text', async () => {
    await sendConsignorStatement({ statement: makeStatement(), toEmail: GOOD });
    const m = send.mock.calls[0][0];
    expect(m.subject).toBe('Consignment statement from Maple Estate Co (ABCD1234)');
    expect(m.html).toContain('Your consignment statement');
    expect(m.html).toContain('Maple Estate Co');
    expect(m.html).toContain('Spring Sale');
    expect(m.html).toContain('Marked down lamp');
    expect(m.html).toContain('$20.00 (was $30.00)');
    expect(m.html).toContain('$25.00');
    expect(m.html).toContain('Approved, payment pending');
    expect(m.html).toContain(STATEMENT_FOOTER);
    expect(m.text).toContain(STATEMENT_FOOTER);
    expect(m.text).toContain('Reference: ABCD1234');
    expect(m.text).toContain('- Chair: $30.00 at 50.00% = $15.00');
  });

  it('escapes HTML in consignor, organizer, period and item names', async () => {
    const st = makeStatement({
      organizerName: 'Maple <b>Co</b>',
      periodLabel: '<img src=x onerror=alert(1)>',
      consignor: { id: 'c1', name: '<script>alert(1)</script>', email: GOOD },
      lines: [{ title: '"><svg onload=x>', soldAt: null, listPrice: '1.00', priceBeforeMarkdown: null, markedDown: false, ratePct: '50.00', consignorShare: '0.50' }],
    });
    await sendConsignorStatement({ statement: st, toEmail: GOOD });
    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('<b>Co</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('a subject can never carry a line break, even if the organizer name does', async () => {
    await sendConsignorStatement({ statement: makeStatement({ organizerName: 'Maple\r\nBcc: evil@x.com' }), toEmail: GOOD });
    expect(send.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });

  it('long statements are capped at 100 lines with an honest "more items" note', async () => {
    const line = (i: number) => ({ title: `Item ${i}`, soldAt: null, listPrice: '1.00', priceBeforeMarkdown: null, markedDown: false, ratePct: '50.00', consignorShare: '0.50' });
    await sendConsignorStatement({ statement: makeStatement({ lines: Array.from({ length: 105 }, (_, i) => line(i)) }), toEmail: GOOD });
    let html = send.mock.calls[0][0].html;
    expect(html).toContain('Item 99');
    expect(html).not.toContain('Item 100<');
    expect(html).toContain('5 more items not shown here');
    send.mockClear();
    await sendConsignorStatement({ statement: makeStatement({ lines: Array.from({ length: 101 }, (_, i) => line(i)) }), toEmail: GOOD });
    html = send.mock.calls[0][0].html;
    expect(html).toContain('1 more item not shown here');
  });

  it('a legacy statement with no lines still sends, without an empty table', async () => {
    await sendConsignorStatement({ statement: makeStatement({ lines: [], legacy: true, totals: { itemCount: 0, gross: '100.00', consignorShare: '60.00' } }), toEmail: GOOD });
    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain('<table');
    expect(html).toContain('$60.00');
  });

  it('copy rules: no em dash, no "estate sale", no standalone AI', async () => {
    await sendConsignorStatement({ statement: makeStatement(), toEmail: GOOD });
    const m = send.mock.calls[0][0];
    for (const part of [m.subject, m.html, m.text]) {
      expect(part).not.toContain('\u2014');
      expect(part).not.toMatch(/estate sale/i);
      expect(part).not.toMatch(/\bAI\b/);
    }
  });
});

describe('sendConsignorPaymentRecorded content', () => {
  it('says a payment was RECORDED by the organizer, never "Payout received", and states FindA.Sale does not hold funds', async () => {
    await sendConsignorPaymentRecorded(recordedParams());
    const m = send.mock.calls[0][0];
    expect(m.subject).toBe('Maple Estate Co recorded a payment of $25.00');
    expect(m.html).toContain('A payment was recorded');
    expect(m.html).toContain('Spring Sale');
    expect(m.html).toContain('$25.00');
    expect(m.html).toContain('Sep 10, 2026');
    expect(m.html).toContain('Check');
    expect(m.html).toContain('Payment reference: <strong>1042</strong>');
    expect(m.html).toContain('Statement reference: <strong>ABCD1234</strong>');
    expect(m.text).toContain('does not hold or send consignor payments');
    for (const part of [m.subject, m.html, m.text]) {
      expect(part).not.toMatch(/payout received/i);
      expect(part).not.toContain('\u2014');
      expect(part).not.toMatch(/estate sale/i);
    }
  });

  it('omits optional lines cleanly and formats numeric amounts', async () => {
    await sendConsignorPaymentRecorded(recordedParams({ amount: 7.5, method: null, methodLabel: null, paidAt: null, paymentReference: null }));
    const m = send.mock.calls[0][0];
    expect(m.subject).toBe('Maple Estate Co recorded a payment of $7.50');
    expect(m.html).not.toContain('Method:');
    expect(m.html).not.toContain('Date:');
    expect(m.html).not.toContain('Payment reference:');
    expect(m.html).toContain('Statement reference:');
  });

  it('falls back to the raw method when there is no label, and escapes HTML', async () => {
    await sendConsignorPaymentRecorded(recordedParams({ methodLabel: null, method: 'CASH', consignorName: '<i>Pat</i>', periodLabel: '<u>x</u>', paymentReference: '<b>1</b>' }));
    const html = send.mock.calls[0][0].html;
    expect(html).toContain('CASH');
    expect(html).not.toContain('<i>Pat</i>');
    expect(html).not.toContain('<u>x</u>');
    expect(html).not.toContain('<b>1</b>');
  });

  it('a subject can never carry a line break', async () => {
    await sendConsignorPaymentRecorded(recordedParams({ organizerName: 'Maple\nBcc: evil@x.com' }));
    expect(send.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });
});
