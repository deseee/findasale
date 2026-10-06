/**
 * Consignor welcome invite (2026-10-06): services/consignorEmailService.ts sendConsignorWelcomeInvite,
 * sendConsignorSquareConnectedNotice, sendOrganizerConsignorSquareConnectedNotice, and
 * services/consignorInviteService.ts (account link lookup + send-and-stamp).
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorWelcomeInvite` before merging.
 *
 * The Resend rail and suppression lookup are mocks, so nothing is sent. isEmailDomainBlocked is real.
 */
jest.mock('../lib/prisma', () => ({ prisma: { consignor: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() } } }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn() } },
}));
jest.mock('../services/suppressionService', () => {
  const actual = jest.requireActual('../services/suppressionService');
  return { ...actual, suppressionService: { isHardSuppressed: jest.fn() } };
});
jest.mock('../services/emailTemplateService', () => ({
  buildEmail: (o: any) => `HEADLINE:${o.headline}\nPREHEADER:${o.preheader}\nCTA:${o.ctaText}|${o.ctaUrl}\n${o.body}`,
}));
jest.mock('../services/commissionCalcService', () => ({
  getConsignorMarkdownPolicyNotice: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from '../services/suppressionService';
import { getConsignorMarkdownPolicyNotice } from '../services/commissionCalcService';
import {
  sendConsignorWelcomeInvite,
  sendConsignorSquareConnectedNotice,
  sendOrganizerConsignorSquareConnectedNotice,
  consignorPortalUrl,
} from '../services/consignorEmailService';
import {
  findLinkableUserId,
  normalizeConsignorEmail,
  sendWelcomeInviteForConsignor,
  sendWelcomeInviteNonBlocking,
} from '../services/consignorInviteService';

const send = (transactionalEmailService as any).emails.send as jest.Mock;
const isHardSuppressed = (suppressionService as any).isHardSuppressed as jest.Mock;
const db: any = prisma;
const markdown = getConsignorMarkdownPolicyNotice as jest.Mock;

const GOOD = 'lucy@maplemail.net';

const inviteParams = (over: any = {}) => ({
  consignorName: 'Lucy Tran',
  consignorEmail: GOOD,
  organizerName: 'Maple Lake Consignments',
  portalToken: 'tok_abc123',
  linkedExistingAccount: false,
  markdownNotice: 'After 14 days unsold, items are automatically marked down 25%.',
  ...over,
});

beforeEach(() => {
  send.mockReset().mockResolvedValue({ sent: true });
  isHardSuppressed.mockReset().mockResolvedValue(false);
  db.consignor.findUnique.mockReset();
  db.consignor.update.mockReset().mockResolvedValue({});
  db.consignor.count.mockReset().mockResolvedValue(0);
  markdown.mockReset().mockResolvedValue({ configured: false, summary: 'No automatic markdown schedule is currently set up for this organizer.' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const BANNED = [/—/, /–/, /\bAI\b/, /estate sale/i, /founder/i, /Patrick/];

describe('sendConsignorWelcomeInvite', () => {
  it('sends once with the portal button, the Square section link, and the required copy', async () => {
    expect(await sendConsignorWelcomeInvite(inviteParams())).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe(GOOD);
    expect(msg.subject).toBe('Maple Lake Consignments added you as a consignor on FindA.Sale');
    const portal = consignorPortalUrl('tok_abc123');
    expect(msg.html).toContain(`CTA:Open my portal|${portal}`);
    expect(msg.html).toContain(`${portal}#square-payouts`);
    expect(msg.html).toContain('Already have a Square account? Sign in with it.');
    expect(msg.html).toContain('New to Square?');
    expect(msg.html).toContain('Nothing changes for you.');
    expect(msg.html).toContain('After 14 days unsold, items are automatically marked down 25%.');
    expect(msg.html).toContain('No FindA.Sale account is needed');
    expect(msg.html).not.toContain('existing FindA.Sale account');
    expect(msg.text).toContain(`${portal}#square-payouts`);
    for (const re of BANNED) {
      expect(msg.html).not.toMatch(re);
      expect(msg.text).not.toMatch(re);
      expect(msg.subject).not.toMatch(re);
    }
  });

  it('existing-account variant mentions the account but no account details', async () => {
    await sendConsignorWelcomeInvite(inviteParams({ linkedExistingAccount: true }));
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain('We found an existing FindA.Sale account with this email address');
    expect(msg.text).toContain('We found an existing FindA.Sale account with this email address');
  });

  it('NO_EMAIL without sending', async () => {
    for (const e of [null, undefined, '', '   ']) {
      expect(await sendConsignorWelcomeInvite(inviteParams({ consignorEmail: e }))).toEqual({ sent: false, reason: 'NO_EMAIL' });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('SUPPRESSED without sending', async () => {
    isHardSuppressed.mockResolvedValue(true);
    expect(await sendConsignorWelcomeInvite(inviteParams())).toEqual({ sent: false, reason: 'SUPPRESSED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('BLOCKED_DOMAIN for our own domain zone', async () => {
    expect(await sendConsignorWelcomeInvite(inviteParams({ consignorEmail: 'x@finda.sale' }))).toEqual({ sent: false, reason: 'BLOCKED_DOMAIN' });
    expect(send).not.toHaveBeenCalled();
  });

  it('ERROR when the rail throws; never throws itself', async () => {
    send.mockRejectedValueOnce(new Error('network'));
    expect(await sendConsignorWelcomeInvite(inviteParams())).toEqual({ sent: false, reason: 'ERROR' });
  });

  it('escapes HTML in every interpolated name and keeps the subject on one line', async () => {
    await sendConsignorWelcomeInvite(
      inviteParams({ consignorName: '<img src=x onerror=alert(1)>', organizerName: 'Evil\r\nBcc: a@b.c <b>Co</b>' })
    );
    const msg = send.mock.calls[0][0];
    expect(msg.html).not.toContain('<img src=x');
    expect(msg.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(msg.html).not.toContain('<b>Co</b>');
    expect(msg.subject).not.toMatch(/[\r\n]/);
  });

  it('URL-encodes the portal token in links', () => {
    expect(consignorPortalUrl('a b/"c')).toMatch(/\/consignor\/portal\/a%20b%2F%22c$/);
  });
});

describe('Square connected notices', () => {
  it('consignor notice: sent, escaped, needs-activation wording when not active', async () => {
    expect(
      await sendConsignorSquareConnectedNotice({
        consignorName: '<x>',
        consignorEmail: GOOD,
        organizerName: 'Maple',
        active: false,
        connectedAt: new Date('2026-10-06T00:00:00Z'),
      })
    ).toEqual({ sent: true });
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain('&lt;x&gt;');
    expect(msg.html).toContain('not fully activated');
    for (const re of BANNED) expect(msg.html).not.toMatch(re);
  });

  it('organizer notice goes to the organizer address and reports NO_EMAIL when there is none', async () => {
    const base = { organizerName: 'Maple', consignorName: 'Lucy', active: true, connectedAt: new Date() };
    expect(await sendOrganizerConsignorSquareConnectedNotice({ ...base, organizerEmail: 'owner@maplemail.net' })).toEqual({ sent: true });
    expect(send.mock.calls[0][0].to).toBe('owner@maplemail.net');
    expect(await sendOrganizerConsignorSquareConnectedNotice({ ...base, organizerEmail: null })).toEqual({ sent: false, reason: 'NO_EMAIL' });
  });
});

describe('existing-user linking (findLinkableUserId)', () => {
  const client = (rows: any[]) => ({ user: { findMany: jest.fn().mockResolvedValue(rows) } }) as any;

  it('normalizes case and whitespace and matches case-insensitively among live users', async () => {
    const c = client([{ id: 'u1' }]);
    expect(await findLinkableUserId(c, '  LucyTL060@Gmail.com ')).toBe('u1');
    expect(c.user.findMany).toHaveBeenCalledWith({
      where: { email: { equals: 'lucytl060@gmail.com', mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
      take: 2,
    });
  });

  it('no email, blank, or not an address: no lookup, no link', async () => {
    for (const e of [null, undefined, '', '   ', 'not-an-email', 42]) {
      const c = client([{ id: 'u1' }]);
      expect(await findLinkableUserId(c, e)).toBeNull();
      expect(c.user.findMany).not.toHaveBeenCalled();
    }
  });

  it('no match: null', async () => {
    expect(await findLinkableUserId(client([]), GOOD)).toBeNull();
  });

  it('ambiguous (two accounts differing only by case): links nothing', async () => {
    expect(await findLinkableUserId(client([{ id: 'u1' }, { id: 'u2' }]), GOOD)).toBeNull();
  });

  it('normalizeConsignorEmail', () => {
    expect(normalizeConsignorEmail(' A@B.Co ')).toBe('a@b.co');
    expect(normalizeConsignorEmail('  ')).toBeNull();
    expect(normalizeConsignorEmail(undefined)).toBeNull();
  });
});

describe('sendWelcomeInviteForConsignor (send and stamp)', () => {
  const row = (over: any = {}) => ({
    id: 'c1',
    name: 'Lucy',
    email: GOOD,
    portalToken: 'tok_1',
    userId: null,
    workspaceId: 'ws1',
    workspace: { name: 'Maple', ownerId: 'org1' },
    ...over,
  });

  it('stamps inviteEmailSentAt only after a successful send', async () => {
    db.consignor.findUnique.mockResolvedValue(row());
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: true });
    expect(db.consignor.update).toHaveBeenCalledTimes(1);
    const arg = db.consignor.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'c1' });
    expect(arg.data.inviteEmailSentAt).toBeInstanceOf(Date);
    expect(markdown).toHaveBeenCalledWith('org1');
  });

  it('does not stamp on NO_EMAIL, SUPPRESSED or ERROR', async () => {
    db.consignor.findUnique.mockResolvedValue(row({ email: null }));
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: false, reason: 'NO_EMAIL' });
    db.consignor.findUnique.mockResolvedValue(row());
    isHardSuppressed.mockResolvedValue(true);
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: false, reason: 'SUPPRESSED' });
    isHardSuppressed.mockResolvedValue(false);
    send.mockRejectedValueOnce(new Error('down'));
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: false, reason: 'ERROR' });
    expect(db.consignor.update).not.toHaveBeenCalled();
  });

  it('uses the existing-account wording when the consignor is linked', async () => {
    db.consignor.findUnique.mockResolvedValue(row({ userId: 'u9' }));
    await sendWelcomeInviteForConsignor('c1');
    expect(send.mock.calls[0][0].html).toContain('existing FindA.Sale account');
  });

  it('still sends when the markdown lookup fails', async () => {
    db.consignor.findUnique.mockResolvedValue(row());
    markdown.mockRejectedValue(new Error('db'));
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: true });
  });

  it('never throws: a database failure is ERROR', async () => {
    db.consignor.findUnique.mockRejectedValue(new Error('db down'));
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: false, reason: 'ERROR' });
  });

  it('automatic invites to one address are capped per workspace per day; manual resend is not', async () => {
    db.consignor.findUnique.mockResolvedValue(row());
    db.consignor.count.mockResolvedValue(3);
    expect(await sendWelcomeInviteForConsignor('c1', { automatic: true })).toEqual({ sent: false, reason: 'RATE_LIMITED' });
    expect(send).not.toHaveBeenCalled();
    const where = db.consignor.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ workspaceId: 'ws1', id: { not: 'c1' }, email: { equals: GOOD, mode: 'insensitive' } });
    expect(await sendWelcomeInviteForConsignor('c1')).toEqual({ sent: true });
  });

  it('non-blocking wrapper reports PENDING after the wait without failing', async () => {
    db.consignor.findUnique.mockResolvedValue(row());
    send.mockImplementation(() => new Promise((r) => setTimeout(() => r({ sent: true }), 200)));
    expect(await sendWelcomeInviteNonBlocking('c1', 10)).toEqual({ sent: false, reason: 'PENDING' });
    await new Promise((r) => setTimeout(r, 300));
    expect(db.consignor.update).toHaveBeenCalledTimes(1); // the send kept going and still stamped
  });
});
