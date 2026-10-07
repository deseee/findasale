/**
 * Consignor-facing emails never show dead-end account links (2026-10-06): every consignor email in
 * services/consignorEmailService.ts passes hideUnsubscribe and the "added you as a consignor" footer
 * reason, uses the REAL buildEmail, and so renders no /unsubscribe or /settings/notifications link.
 * Also covers the organizer-facing disconnect and data-request notices.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorEmailsFooter` before merging. The Resend rail and the
 * suppression lookup are mocks, so nothing is sent.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn() } },
}));
jest.mock('../services/suppressionService', () => {
  const actual = jest.requireActual('../services/suppressionService');
  return { ...actual, suppressionService: { isHardSuppressed: jest.fn() } };
});

import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from '../services/suppressionService';
import * as svc from '../services/consignorEmailService';
import { STATEMENT_FOOTER } from '../services/consignorLedgerService';

const send = (transactionalEmailService as any).emails.send as jest.Mock;
const isHardSuppressed = (suppressionService as any).isHardSuppressed as jest.Mock;

const GOOD = 'pat@maplemail.net';
const ORG = 'Maple Estate Co';
const FOOTER = `You received this because ${ORG} added you as a consignor on FindA.Sale.`;

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

const statement: any = {
  reference: 'ABCD1234',
  payoutId: 'payout_abcd1234',
  organizerName: ORG,
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
  lines: [],
  totals: { itemCount: 0, gross: '0.00', consignorShare: '0.00' },
  footer: STATEMENT_FOOTER,
  generatedAt: '2026-09-29T00:00:00.000Z',
};

const consignorEmails: Array<[string, () => Promise<unknown>]> = [
  ['sendConsignorStatement', () => svc.sendConsignorStatement({ statement, toEmail: GOOD })],
  [
    'sendConsignorPaymentRecorded',
    () =>
      svc.sendConsignorPaymentRecorded({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        organizerName: ORG,
        periodLabel: 'Spring Sale',
        amount: '25.00',
        reference: 'ABCD1234',
      }),
  ],
  [
    'sendConsignorItemSold',
    () =>
      svc.sendConsignorItemSold({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        itemName: 'Lamp',
        itemPrice: 20,
        consignorPayout: 10,
        organizerName: ORG,
        saleId: 's1',
      }),
  ],
  [
    'sendConsignorPayout',
    () =>
      svc.sendConsignorPayout({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        payoutAmount: 10,
        saleName: 'Spring Sale',
        organizerName: ORG,
      }),
  ],
  [
    'sendConsignorPaymentSetupInvite',
    () =>
      svc.sendConsignorPaymentSetupInvite({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        onboardingUrl: 'https://example.org/start',
        organizerName: ORG,
      }),
  ],
  [
    'sendConsignorExpiryNotice',
    () =>
      svc.sendConsignorExpiryNotice({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        itemName: 'Lamp',
        organizerName: ORG,
        organizerEmail: 'owner@maplemail.net',
        saleId: 's1',
        disposition: 'RETURN',
      }),
  ],
  [
    'sendConsignorPickupWindowReminder',
    () =>
      svc.sendConsignorPickupWindowReminder({
        consignorName: 'Pat Maker',
        consignorEmail: GOOD,
        itemName: 'Lamp',
        organizerName: ORG,
        organizerEmail: 'owner@maplemail.net',
        saleId: 's1',
        reminderNumber: 1,
      }),
  ],
];

describe.each(consignorEmails)('%s footer', (_name, run) => {
  it('has no unsubscribe or notification-preferences link, and states why they received it', async () => {
    await run();
    expect(send).toHaveBeenCalledTimes(1);
    const html = send.mock.calls[0][0].html as string;
    expect(html).not.toContain('/unsubscribe');
    expect(html).not.toContain('/settings/notifications');
    expect(html).toContain(FOOTER);
    expect(html).toContain('219 E Michigan Ave'); // postal address footer is kept
  });
});

describe('organizer notices from the consignor portal', () => {
  it('Square disconnected: wording, kept records, no account links', async () => {
    const r = await svc.sendOrganizerConsignorSquareDisconnectedNotice({
      organizerEmail: 'owner@maplemail.net',
      organizerName: ORG,
      consignorName: 'Pat Maker',
      disconnectedAt: new Date('2026-10-06T00:00:00Z'),
    });
    expect(r).toEqual({ sent: true });
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('owner@maplemail.net');
    expect(msg.html).toContain('Pat Maker');
    expect(msg.html).toContain('disconnected Square. Their records are kept.');
    expect(msg.text).toContain('Pat Maker disconnected Square. Their records are kept.');
    expect(msg.html).not.toContain('/unsubscribe');
    expect(msg.html).not.toContain('/settings/notifications');
    expect(msg.html).not.toMatch(/—|–|\bAI\b|estate sale/i);
  });

  it('consignor gets a confirmation of the disconnect with the on-behalf footer', async () => {
    await svc.sendConsignorSquareDisconnectedNotice({
      consignorName: 'Pat Maker',
      consignorEmail: GOOD,
      organizerName: ORG,
      disconnectedAt: new Date(),
    });
    const html = send.mock.calls[0][0].html as string;
    expect(send.mock.calls[0][0].to).toBe(GOOD);
    expect(html).toContain('Your payout records are kept');
    expect(html).toContain(FOOTER);
    expect(html).not.toContain('/unsubscribe');
  });

  it('data request: says the consignor asked for their data to be removed or reviewed, deletes nothing', async () => {
    const r = await svc.sendOrganizerConsignorDataRemovalRequest({
      organizerEmail: 'owner@maplemail.net',
      organizerName: ORG,
      consignorName: '<b>Pat</b>',
      consignorEmail: GOOD,
      requestedAt: new Date(),
    });
    expect(r).toEqual({ sent: true });
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain('asked for their personal data to be removed or reviewed');
    expect(msg.html).toContain('Nothing has been deleted');
    expect(msg.html).toContain('&lt;b&gt;Pat&lt;/b&gt;'); // escaped
    expect(msg.html).not.toContain('<b>Pat</b>');
    expect(msg.html).not.toContain('/unsubscribe');
    expect(msg.html).not.toMatch(/—|–|\bAI\b|estate sale/i);
    expect(msg.subject).not.toMatch(/[\r\n]/);
  });

  it('notices report NO_EMAIL when the organizer has no address', async () => {
    expect(
      await svc.sendOrganizerConsignorDataRemovalRequest({
        organizerEmail: null,
        organizerName: ORG,
        consignorName: 'Pat',
        requestedAt: new Date(),
      })
    ).toEqual({ sent: false, reason: 'NO_EMAIL' });
    expect(send).not.toHaveBeenCalled();
  });
});
