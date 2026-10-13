/**
 * ADR-139 recruit channel: consent rule, transport isolation checks, confirm / auto-approve,
 * interest-form non-enumeration, zod strictness. Prisma and the Resend SDK are jest mocks:
 * no email is sent, no network, no DB.
 */

const mockPrisma: any = {
  featureFlag: { findUnique: jest.fn(), updateMany: jest.fn() },
  recruitChannelEvent: { create: jest.fn(), findFirst: jest.fn() },
  recruitSend: { count: jest.fn(), create: jest.fn() },
  recruitLead: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  user: { findMany: jest.fn(), findFirst: jest.fn() },
  organizer: { findUnique: jest.fn() },
  directoryClaimEmail: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockIsSuppressed = jest.fn();
const mockOptOut = jest.fn();
jest.mock('../services/suppressionService', () => ({
  suppressionService: {
    isSuppressed: (...a: unknown[]) => mockIsSuppressed(...a),
    processOptOut: (...a: unknown[]) => mockOptOut(...a),
    addSuppression: jest.fn(),
  },
}));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../lib/mxValidator', () => ({ domainCanReceiveMail: jest.fn().mockResolvedValue({ ok: true }) }));

const mockResendSend = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })) }));

import { getRecruitConfig } from '../services/recruit/recruitConfig';
import { checkTransportReady, sendRecruitEmail } from '../services/recruit/recruitTransport';
import { signRecruitToken } from '../services/recruit/recruitTokens';
import { confirmLead, sendNextStepForLead, submitInterest, unsubscribeLead } from '../services/recruit/recruitLeadService';
import { interestSchema, batchSchema, manualSchema, testSendSchema } from '../services/recruit/recruitSchemas';
import { renderConfirmEmail, renderSequenceEmail } from '../services/recruit/recruitTemplates';

const SECRET = 's'.repeat(40);
// Fake keys, built short so the pre-commit secret scan does not read them as real ones.
const FAKE_RK = 'fake-recruit-key';
const FAKE_TK = 'fake-transactional-key';
const GOOD_ENV = {
  RECRUIT_SEND_ENABLED: 'true',
  RECRUIT_TRANSPORT: 'resend_optin',
  RECRUIT_FROM_EMAIL: 'team@recruit.finda.sale',
  RECRUIT_REPLY_TO: 'support@finda.sale',
  RECRUIT_MAILING_ADDRESS: '123 Test St, Testville, MI 00000',
  RECRUIT_UNSUB_SECRET: SECRET,
  RECRUIT_RESEND_API_KEY: FAKE_RK,
  RESEND_API_KEY: FAKE_TK,
} as NodeJS.ProcessEnv;

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, ...GOOD_ENV };
  mockIsSuppressed.mockResolvedValue(false);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.directoryClaimEmail.findFirst.mockResolvedValue(null);
  mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
  mockPrisma.recruitSend.count.mockResolvedValue(0);
  mockPrisma.recruitLead.update.mockResolvedValue({});
  mockPrisma.recruitSend.create.mockResolvedValue({});
  mockResendSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('transport isolation checks', () => {
  it('passes with a separate key, recruit From domain and a mailing address', () => {
    expect(checkTransportReady(getRecruitConfig(GOOD_ENV), GOOD_ENV)).toEqual({ ok: true });
  });

  it.each([
    ['transport none (default)', { RECRUIT_TRANSPORT: undefined }, 'transport_none'],
    ['gmail_dedicated stub', { RECRUIT_TRANSPORT: 'gmail_dedicated' }, 'transport_not_approved'],
    ['missing mailing address', { RECRUIT_MAILING_ADDRESS: '' }, 'mailing_address_missing'],
    ['shared Resend key', { RECRUIT_RESEND_API_KEY: FAKE_TK }, 'recruit_api_key_shared'],
    ['missing recruit key', { RECRUIT_RESEND_API_KEY: '' }, 'recruit_api_key_missing'],
    ['From on the root domain', { RECRUIT_FROM_EMAIL: 'team@finda.sale' }, 'from_domain_mismatch'],
    ['sending domain set to the root', { RECRUIT_FROM_EMAIL: 'team@finda.sale', RECRUIT_SENDING_DOMAIN: 'finda.sale' }, 'from_domain_forbidden'],
    ['short unsubscribe secret', { RECRUIT_UNSUB_SECRET: 'short' }, 'unsub_secret_missing'],
  ])('refuses: %s', (_label, override, reason) => {
    const env = { ...GOOD_ENV, ...override } as NodeJS.ProcessEnv;
    expect(checkTransportReady(getRecruitConfig(env), env)).toEqual({ ok: false, reason });
  });

  it('resend_optin refuses a recipient without consent before calling the provider', async () => {
    const r = await sendRecruitEmail(
      getRecruitConfig(GOOD_ENV),
      { to: 'x@example.com', subject: 's', html: 'h', text: 't' },
      { hasConsent: false, purpose: 'sequence' },
      GOOD_ENV
    );
    expect(r).toEqual({ ok: false, kind: 'refused', reason: 'no_consent' });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('nothing sends with the default config', async () => {
    const env = { ...GOOD_ENV, RECRUIT_TRANSPORT: undefined } as NodeJS.ProcessEnv;
    const r = await sendRecruitEmail(getRecruitConfig(env), { to: 'x@example.com', subject: 's', html: 'h', text: 't' }, { hasConsent: true, purpose: 'sequence' }, env);
    expect(r.ok).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

describe('consent rule in the send pipeline', () => {
  it('a DIRECTORY lead under resend_optin becomes SKIPPED no_consent and the provider is never called', async () => {
    mockPrisma.recruitLead.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.recruitLead.findUnique.mockResolvedValue({
      id: 'lead1', email: 'org@example.com', source: 'DIRECTORY', consentAt: null, organizerId: null,
      sequenceStep: 0, approvedAt: new Date(), convertedAt: null,
    });
    const out = await sendNextStepForLead('lead1', getRecruitConfig(GOOD_ENV));
    expect(out).toBe('skipped');
    expect(mockPrisma.recruitLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED', skipReason: 'no_consent' }) })
    );
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled(); // no cap slot used
  });

  it('a consented lead sends step 1 with List-Unsubscribe headers and is scheduled for day 3', async () => {
    const consentAt = new Date('2026-10-14T12:00:00Z');
    mockPrisma.recruitLead.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.recruitLead.findUnique.mockResolvedValue({
      id: 'lead2', email: 'me@example.com', source: 'OPT_IN_FORM', consentAt, organizerId: null,
      sequenceStep: 0, approvedAt: consentAt, convertedAt: null,
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
    const out = await sendNextStepForLead('lead2', getRecruitConfig(GOOD_ENV));
    expect(out).toBe('sent');
    const sent = mockResendSend.mock.calls[0][0];
    expect(sent.headers['List-Unsubscribe']).toMatch(/\/api\/recruit\/unsubscribe\/lead2\//);
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.from).toBe('The FindA.Sale Team <team@recruit.finda.sale>');
    const finalUpdate = mockPrisma.recruitLead.update.mock.calls.at(-1)[0].data;
    expect(finalUpdate.sequenceStep).toBe(1);
    expect(finalUpdate.status).toBe('APPROVED');
    expect(finalUpdate.nextSendAt.toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });
});

describe('double opt-in', () => {
  it('confirm sets consent with the wording version and auto-approves an opt-in lead', async () => {
    const sig = signRecruitToken('lead3', 'confirm', SECRET);
    mockPrisma.recruitLead.findUnique.mockResolvedValue({ id: 'lead3', status: 'PENDING_CONFIRM', consentAt: null, source: 'OPT_IN_FORM' });
    mockPrisma.recruitLead.updateMany.mockResolvedValue({ count: 1 });
    expect(await confirmLead('lead3', sig, '203.0.113.9')).toBe(true);
    const data = mockPrisma.recruitLead.updateMany.mock.calls[0][0].data;
    expect(data.consentSource).toBe('interest_form:v1');
    expect(data.status).toBe('APPROVED');
    expect(data.approvedBy).toBe('system:auto-approve');
    expect(data.consentIpHash).not.toContain('203.0.113.9');
  });

  it('a confirm with an unsubscribe signature is rejected', async () => {
    const sig = signRecruitToken('lead3', 'unsub', SECRET);
    expect(await confirmLead('lead3', sig)).toBe(false);
    expect(mockPrisma.recruitLead.updateMany).not.toHaveBeenCalled();
  });

  it('unsubscribe applies the global opt-out', async () => {
    const sig = signRecruitToken('lead4', 'unsub', SECRET);
    mockPrisma.recruitLead.findUnique.mockResolvedValue({ id: 'lead4', email: 'me@example.com' });
    expect(await unsubscribeLead('lead4', sig)).toBe(true);
    expect(mockOptOut).toHaveBeenCalledWith('me@example.com');
  });

  it('the interest form answers the same for a suppressed address and sends nothing', async () => {
    mockIsSuppressed.mockResolvedValue(true);
    expect(await submitInterest({ email: 'Blocked@Example.com', businessName: 'X' })).toBe('accepted');
    expect(mockPrisma.recruitLead.create).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('the interest form is closed (same answer for everyone) while the channel is off', async () => {
    process.env = { ...ORIGINAL_ENV, ...GOOD_ENV, RECRUIT_SEND_ENABLED: undefined } as NodeJS.ProcessEnv;
    expect(await submitInterest({ email: 'a@example.com', businessName: 'X' })).toBe('closed');
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('a confirmation is not re-sent inside 24h / after 3 (atomic claim returns 0)', async () => {
    mockPrisma.recruitLead.findUnique.mockResolvedValue({ id: 'lead5', status: 'PENDING_CONFIRM', consentAt: null, organizerId: null, sourceDetail: null, state: null });
    mockPrisma.recruitLead.update.mockResolvedValue({});
    mockPrisma.recruitLead.updateMany.mockResolvedValue({ count: 0 });
    expect(await submitInterest({ email: 'a@example.com', businessName: 'X' })).toBe('accepted');
    const where = mockPrisma.recruitLead.updateMany.mock.calls[0][0].where;
    expect(where.confirmSentCount).toEqual({ lt: 3 });
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

describe('request schemas are strict (no mass assignment)', () => {
  const okInterest = { email: 'a@example.com', businessName: 'Biz', consent: true };
  it('accepts a normal interest submission', () => {
    expect(interestSchema.safeParse(okInterest).success).toBe(true);
  });
  it.each(['status', 'consentAt', 'transport', 'source'])('rejects an unknown key: %s', (key) => {
    expect(interestSchema.safeParse({ ...okInterest, [key]: 'x' }).success).toBe(false);
    expect(manualSchema.safeParse({ email: 'a@example.com', businessName: 'B', consentNote: 'asked', [key]: 'x' }).success).toBe(false);
    expect(batchSchema.safeParse({ leadIds: ['a'], [key]: 'x' }).success).toBe(false);
  });
  it('requires the consent box', () => {
    expect(interestSchema.safeParse({ ...okInterest, consent: false }).success).toBe(false);
  });
  it('test-send cannot take a recipient', () => {
    expect(testSendSchema.safeParse({ leadId: 'a', to: 'attacker@example.com' }).success).toBe(false);
  });
});

describe('copy rules', () => {
  const banned = [/\bAI\b/, /estate sale/i, /—/];
  it('no banned words or em dashes in any template', () => {
    const all = [1, 2, 3].map((step) =>
      renderSequenceEmail({ step: step as 1 | 2 | 3, source: 'OPT_IN_FORM', unsubscribeUrl: 'u', mailingAddress: 'm', frontendUrl: 'f' })
    );
    all.push(renderConfirmEmail({ confirmUrl: 'c', mailingAddress: 'm' }));
    for (const e of all) {
      for (const re of banned) {
        expect(e.subject + e.html + e.text).not.toMatch(re);
      }
      expect(e.text).toContain('The FindA.Sale Team');
      expect(e.text).toContain('m'); // mailing address present
    }
  });
});
