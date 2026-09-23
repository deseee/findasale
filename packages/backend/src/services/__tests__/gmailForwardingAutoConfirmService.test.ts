/**
 * gmailForwardingAutoConfirmService.ts — unit tests.
 *
 * MOCKING NOTE (same convention as facebookMarketplaceEmailSoldDetection.test.ts):
 * '../lib/prisma' is mocked to a no-op object so this suite never needs a real database
 * connection (organizerEmailForwardingService.ts's resolveOrganizerIdByForwardingToken
 * pulls in prisma, but every test below supplies its own `resolveOrganizerId` via the
 * `deps` parameter, so the real Prisma-backed implementation is never exercised).
 *
 * The `processGmailForwardingConfirmationEmail` tests below are pure unit tests, same
 * shape as the sibling FB order-email suite: no IMAP, no network, everything injected
 * via `deps`.
 *
 * The `pollGmailForwardingConfirmations` describe block additionally mocks
 * '../services/facebookMarketplaceEmailPollService' (the module this service imports
 * `openImapSession`/`parseImapMessageToInboundEmail` from, per that file's own header
 * comment on why the two poll loops share connection setup) so the poll loop can be
 * exercised end-to-end against a fake IMAP client, with no real imapflow/mailparser
 * network activity. This is new (there is no existing IMAP-poll-layer test in this
 * codebase to mirror), so the fake client below implements just the handful of ImapFlow
 * methods pollGmailForwardingConfirmations actually calls (search / fetchOne /
 * messageFlagsAdd / logout) plus a no-op lock.
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import {
  processGmailForwardingConfirmationEmail,
  InboundGmailForwardingConfirmationEmail,
} from '../gmailForwardingAutoConfirmService';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';

const KNOWN_TOKEN = 'abc123XYZ_-token';
const KNOWN_TARGET_ADDRESS = buildFacebookSoldForwardingAddress(KNOWN_TOKEN);
const CONFIRMATION_URL = 'https://mail-settings.google.com/mail/vf-2-AbCdEfGhIjKlMnOp?ui=2';
// Receiver-stamped (topmost, mx.google.com) Authentication-Results for a genuine Google
// forwarding-confirmation email -- required since the 2026-09-23 security fix.
const PASSING_GOOGLE_AUTH_RESULTS =
  'mx.google.com; dkim=pass header.i=@google.com header.s=20230601 header.b=XyZ; spf=pass (google.com: domain of forwarding-noreply@google.com designates 209.85.220.73 as permitted sender) smtp.mailfrom=forwarding-noreply@google.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=google.com';

function confirmationEmail(
  overrides: Partial<InboundGmailForwardingConfirmationEmail> = {},
): InboundGmailForwardingConfirmationEmail {
  return {
    from: 'forwarding-noreply@google.com',
    subject: `Gmail Forwarding Confirmation - Receive Mail from someorganizer@gmail.com`,
    rawBody: `
      <p>You have requested to have all your incoming mail forwarded to
      ${KNOWN_TARGET_ADDRESS} automatically. To confirm this request, click the link
      below.</p>
      <p><a href="${CONFIRMATION_URL}">Confirm forwarding request</a></p>
    `,
    links: [CONFIRMATION_URL],
    authenticationResults: [PASSING_GOOGLE_AUTH_RESULTS],
    ...overrides,
  };
}

describe('processGmailForwardingConfirmationEmail', () => {
  describe('sender/subject filtering', () => {
    it('ignores an email that is not a forwarding-confirmation email at all', async () => {
      const resolveOrganizerId = jest.fn();
      const confirmForwarding = jest.fn();

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({
          from: 'billing@stripe.com',
          subject: 'Your invoice is ready',
          rawBody: 'Nothing to see here.',
          links: [],
        }),
        { resolveOrganizerId, confirmForwarding },
      );

      expect(result.kind).toBe('ignored');
      expect(resolveOrganizerId).not.toHaveBeenCalled();
      expect(confirmForwarding).not.toHaveBeenCalled();
    });

    it('ignores an email with the right subject but a sender outside google.com', async () => {
      const resolveOrganizerId = jest.fn();
      const confirmForwarding = jest.fn();

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({ from: 'attacker@evil.example.com' }),
        { resolveOrganizerId, confirmForwarding },
      );

      expect(result.kind).toBe('ignored');
      expect(resolveOrganizerId).not.toHaveBeenCalled();
      expect(confirmForwarding).not.toHaveBeenCalled();
    });

    it('ignores a google.com sender whose subject is unrelated to forwarding', async () => {
      const resolveOrganizerId = jest.fn();
      const confirmForwarding = jest.fn();

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({ from: 'no-reply@google.com', subject: 'Security alert for your account' }),
        { resolveOrganizerId, confirmForwarding },
      );

      expect(result.kind).toBe('ignored');
      expect(resolveOrganizerId).not.toHaveBeenCalled();
      expect(confirmForwarding).not.toHaveBeenCalled();
    });

    it('ignores a real-looking forwarding email with no recognizable sold-<token>@domain address in it', async () => {
      const resolveOrganizerId = jest.fn();
      const confirmForwarding = jest.fn();

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({
          rawBody: 'You have requested to forward mail to someone@example.com. Click here to confirm.',
          links: [CONFIRMATION_URL],
        }),
        { resolveOrganizerId, confirmForwarding },
      );

      expect(result.kind).toBe('ignored');
      expect(resolveOrganizerId).not.toHaveBeenCalled();
      expect(confirmForwarding).not.toHaveBeenCalled();
    });
  });

  describe('SECURITY / ABUSE GUARD -- fail closed on an unknown organizer token', () => {
    it('does NOT confirm and logs a structured warning when the token resolves to no organizer', async () => {
      const resolveOrganizerId = jest.fn().mockResolvedValue(null);
      const confirmForwarding = jest.fn();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId,
        confirmForwarding,
      });

      expect(resolveOrganizerId).toHaveBeenCalledWith(KNOWN_TOKEN);
      expect(confirmForwarding).not.toHaveBeenCalled();
      expect(result.kind).toBe('unresolved');
      if (result.kind === 'unresolved') {
        expect(result.organizerId).toBeNull();
        expect(result.forwardingToken).toBe(KNOWN_TOKEN);
      }
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('UNRESOLVED'),
        expect.objectContaining({ forwardingToken: KNOWN_TOKEN }),
      );

      warnSpy.mockRestore();
    });

    it('does NOT confirm when a known organizer resolves but no confirmation link can be extracted', async () => {
      const resolveOrganizerId = jest.fn().mockResolvedValue('organizer_1');
      const confirmForwarding = jest.fn();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({ links: ['https://support.google.com/mail/answer/12345'] }),
        { resolveOrganizerId, confirmForwarding },
      );

      expect(confirmForwarding).not.toHaveBeenCalled();
      expect(result.kind).toBe('unresolved');
      if (result.kind === 'unresolved') {
        expect(result.organizerId).toBe('organizer_1');
      }

      warnSpy.mockRestore();
    });
  });

  describe('on a valid confirmation for a known organizer', () => {
    it('resolves the organizer, fetches the confirmation link, and returns confirmed', async () => {
      const resolveOrganizerId = jest.fn().mockResolvedValue('organizer_42');
      const confirmForwarding = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId,
        confirmForwarding,
      });

      expect(resolveOrganizerId).toHaveBeenCalledWith(KNOWN_TOKEN);
      expect(confirmForwarding).toHaveBeenCalledWith(CONFIRMATION_URL);
      expect(result).toMatchObject({
        kind: 'confirmed',
        organizerId: 'organizer_42',
        forwardingToken: KNOWN_TOKEN,
        confirmationUrl: CONFIRMATION_URL,
      });
    });

    it('returns failed (not confirmed) when the confirmation GET itself fails, without throwing', async () => {
      const resolveOrganizerId = jest.fn().mockResolvedValue('organizer_42');
      const confirmForwarding = jest.fn().mockResolvedValue({ ok: false, error: 'network timeout' });

      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId,
        confirmForwarding,
      });

      expect(result.kind).toBe('failed');
      if (result.kind === 'failed') {
        expect(result.organizerId).toBe('organizer_42');
        expect(result.reason).toContain('network timeout');
      }
    });

    it('extracts the target address case-insensitively from surrounding body text', async () => {
      const resolveOrganizerId = jest.fn().mockResolvedValue('organizer_7');
      const confirmForwarding = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const result = await processGmailForwardingConfirmationEmail(
        confirmationEmail({ rawBody: `Forward mail to ${KNOWN_TARGET_ADDRESS.toUpperCase()} now.` }),
        { resolveOrganizerId, confirmForwarding },
      );

      // The token is extracted verbatim from whatever case the surrounding text happens
      // to have -- extraction itself does not (and cannot) recover the "original" case
      // once the body has re-cased it (here, entirely upper-cased). What actually makes
      // this case-insensitive end to end is resolveOrganizerIdByForwardingToken's
      // case-insensitive DB lookup (mode: 'insensitive'), which this test intentionally
      // bypasses via the injected `resolveOrganizerId` mock -- so the assertion here only
      // checks that SOME casing of the right token was extracted and handed off, not that
      // it matches KNOWN_TOKEN's exact original case.
      expect(resolveOrganizerId).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${KNOWN_TOKEN}$`, 'i')),
      );
      expect(result.kind).toBe('confirmed');
    });
  });
});

describe('SECURITY (2026-09-23) -- DKIM/DMARC for google.com and confirmation-link host allowlist', () => {
  it('ignores (never resolves or fetches) an email with no Authentication-Results headers', async () => {
    const resolveOrganizerId = jest.fn();
    const confirmForwarding = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await processGmailForwardingConfirmationEmail(
      confirmationEmail({ authenticationResults: [], arcAuthenticationResults: [] }),
      { resolveOrganizerId, confirmForwarding },
    );

    expect(result.kind).toBe('ignored');
    expect(resolveOrganizerId).not.toHaveBeenCalled();
    expect(confirmForwarding).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores dkim=pass for the wrong signing domain (header.d=gmail.com)', async () => {
    const resolveOrganizerId = jest.fn();
    const confirmForwarding = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await processGmailForwardingConfirmationEmail(
      confirmationEmail({
        authenticationResults: ['mx.google.com; dkim=pass header.d=gmail.com; dmarc=pass header.from=google.com'],
      }),
      { resolveOrganizerId, confirmForwarding },
    );

    expect(result.kind).toBe('ignored');
    expect(confirmForwarding).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores a look-alike domain (header.d=evilgoogle.com) and a forged pass below a real fail', async () => {
    const confirmForwarding = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const lookalike = await processGmailForwardingConfirmationEmail(
      confirmationEmail({ authenticationResults: ['mx.google.com; dkim=pass header.d=evilgoogle.com; dmarc=pass'] }),
      { resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'), confirmForwarding },
    );
    const forgedBelow = await processGmailForwardingConfirmationEmail(
      confirmationEmail({
        authenticationResults: ['mx.google.com; dkim=none; dmarc=fail header.from=google.com', PASSING_GOOGLE_AUTH_RESULTS],
      }),
      { resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'), confirmForwarding },
    );

    expect(lookalike.kind).toBe('ignored');
    expect(forgedBelow.kind).toBe('ignored');
    expect(confirmForwarding).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it.each([
    ['look-alike host suffix', 'https://mail-settings.google.com.evil.example/mail/vf-2-AbC'],
    ['allowed host only in the query string', 'https://evil.example/mail/vf-2?next=mail-settings.google.com'],
    ['plain http', 'http://mail-settings.google.com/mail/vf-2-AbC'],
    ['embedded credentials', 'https://mail-settings.google.com@evil.example/mail/vf-2-AbC'],
    ['non-allowlisted google host', 'https://evil.google.com/mail/vf-2-AbC'],
    ['explicit port', 'https://mail-settings.google.com:8443/mail/vf-2-AbC'],
  ])('does NOT fetch a spoofed confirmation link (%s)', async (_label, href) => {
    const resolveOrganizerId = jest.fn().mockResolvedValue('organizer_1');
    const confirmForwarding = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await processGmailForwardingConfirmationEmail(confirmationEmail({ links: [href] }), {
      resolveOrganizerId,
      confirmForwarding,
    });

    expect(confirmForwarding).not.toHaveBeenCalled();
    expect(result.kind).toBe('unresolved');
    warnSpy.mockRestore();
  });

  it('accepts the historical https://mail.google.com/mail/vf-... link form', async () => {
    const href = 'https://mail.google.com/mail/vf-%5BANGjdJ9x%5D-AbCdEf';
    const confirmForwarding = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await processGmailForwardingConfirmationEmail(confirmationEmail({ links: [href] }), {
      resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'),
      confirmForwarding,
    });

    expect(confirmForwarding).toHaveBeenCalledWith(href);
    expect(result.kind).toBe('confirmed');
  });

  describe('default confirmForwarding (real fetch, mocked)', () => {
    const realFetch = (global as any).fetch;
    afterEach(() => {
      (global as any).fetch = realFetch;
    });

    function mockFetch(status: number, location?: string) {
      const fn = jest.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location ?? null : null) },
      });
      (global as any).fetch = fn;
      return fn;
    }

    it('uses redirect: "manual" and treats 2xx as confirmed', async () => {
      const fetchMock = mockFetch(200);
      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'),
      });
      expect(fetchMock).toHaveBeenCalledWith(CONFIRMATION_URL, expect.objectContaining({ redirect: 'manual' }));
      expect(result.kind).toBe('confirmed');
    });

    it('treats a 3xx to an https google.com host as confirmed without following it', async () => {
      const fetchMock = mockFetch(302, 'https://accounts.google.com/ServiceLogin?continue=x');
      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.kind).toBe('confirmed');
    });

    it('fails (never follows) a 3xx to a non-google host', async () => {
      const fetchMock = mockFetch(302, 'https://evil.example/landing');
      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.kind).toBe('failed');
    });

    it('fails a 3xx to a look-alike google host (google.com.evil.example)', async () => {
      mockFetch(301, 'https://google.com.evil.example/');
      const result = await processGmailForwardingConfirmationEmail(confirmationEmail(), {
        resolveOrganizerId: jest.fn().mockResolvedValue('organizer_1'),
      });
      expect(result.kind).toBe('failed');
    });
  });
});

describe('pollGmailForwardingConfirmations', () => {
  // Fresh module registry per test in this block so each test's imapflow mock (set up
  // via facebookMarketplaceEmailPollService's exported helpers) is isolated.
  beforeEach(() => {
    jest.resetModules();
  });

  function makeFakeImapClient(opts: {
    uids: number[];
    sources: Record<number, Buffer>;
  }) {
    const messageFlagsAdd = jest.fn().mockResolvedValue(undefined);
    const search = jest.fn().mockResolvedValue(opts.uids);
    const fetchOne = jest.fn(async (uid: number) => ({ source: opts.sources[uid] }));
    const logout = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn();
    return { search, fetchOne, messageFlagsAdd, logout, close };
  }

  it('marks each processed UID \\Seen so an is:unread re-poll would not return it again', async () => {
    jest.mock('../../lib/prisma', () => ({ prisma: {} }));

    const fakeClient = makeFakeImapClient({
      uids: [101],
      sources: { 101: Buffer.from('irrelevant raw source -- parse is mocked below') },
    });
    const fakeLock = { release: jest.fn() };

    jest.doMock('../facebookMarketplaceEmailPollService', () => ({
      openImapSession: jest.fn().mockResolvedValue({ client: fakeClient, lock: fakeLock }),
      parseImapMessageToInboundEmail: jest.fn().mockResolvedValue({
        from: 'billing@stripe.com',
        subject: 'Your invoice is ready',
        links: [],
        rawBody: 'not a forwarding confirmation',
      }),
    }));

    const { pollGmailForwardingConfirmations } = await import('../gmailForwardingAutoConfirmService');
    const result = await pollGmailForwardingConfirmations();

    expect(result.processed).toBe(1);
    expect(result.ignored).toBe(1);
    // The critical idempotency guarantee: a fully-handled message (even one that was
    // just 'ignored') is marked \Seen, so the is:unread search backing this poll would
    // exclude it from the very next run -- it is never reprocessed.
    expect(fakeClient.messageFlagsAdd).toHaveBeenCalledWith([101], ['\\Seen'], { uid: true });
  });

  it('processes zero messages when the IMAP search returns nothing new (already-\\Seen messages excluded upstream)', async () => {
    jest.mock('../../lib/prisma', () => ({ prisma: {} }));

    const fakeClient = makeFakeImapClient({ uids: [], sources: {} });
    const fakeLock = { release: jest.fn() };

    jest.doMock('../facebookMarketplaceEmailPollService', () => ({
      openImapSession: jest.fn().mockResolvedValue({ client: fakeClient, lock: fakeLock }),
      parseImapMessageToInboundEmail: jest.fn(),
    }));

    const { pollGmailForwardingConfirmations } = await import('../gmailForwardingAutoConfirmService');
    const result = await pollGmailForwardingConfirmations();

    expect(result.processed).toBe(0);
    expect(fakeClient.messageFlagsAdd).not.toHaveBeenCalled();
  });

  it('leaves a message unread for retry when processing throws, instead of marking it \\Seen', async () => {
    jest.mock('../../lib/prisma', () => ({ prisma: {} }));

    const fakeClient = makeFakeImapClient({ uids: [202], sources: {} });
    const fakeLock = { release: jest.fn() };

    jest.doMock('../facebookMarketplaceEmailPollService', () => ({
      openImapSession: jest.fn().mockResolvedValue({ client: fakeClient, lock: fakeLock }),
      // fetchOne resolves with no `source` for UID 202, which pollGmailForwardingConfirmations
      // treats as a thrown processing error for that message.
      parseImapMessageToInboundEmail: jest.fn(),
    }));

    const { pollGmailForwardingConfirmations } = await import('../gmailForwardingAutoConfirmService');
    const result = await pollGmailForwardingConfirmations();

    expect(result.errors.length).toBe(1);
    expect(fakeClient.messageFlagsAdd).not.toHaveBeenCalled();
  });
});
