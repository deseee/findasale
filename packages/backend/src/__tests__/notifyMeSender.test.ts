/**
 * Notify Me sender (#455). Not executed in the authoring environment.
 */
const mockSearch = { findMany: jest.fn(), updateMany: jest.fn() };
const mockWait = { findMany: jest.fn(), updateMany: jest.fn() };
const mockItem = { findMany: jest.fn() };
const mockSale = { findMany: jest.fn() };
const mockSend = jest.fn();
const mockIsSuppressed = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: { searchNotification: mockSearch, shopperWaitlistEntry: mockWait, item: mockItem, sale: mockSale },
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: (...a: any[]) => mockIsSuppressed(...a) },
  isEmailDomainBlocked: (e: string) => e.endsWith('@finda.sale'),
}));

import {
  runNotifyMeSender,
  signNotifyMeToken,
  verifyNotifyMeToken,
  tokenizeTerm,
  buildNotifyMeEmail,
  buildNotifyMeConfirmEmail,
  signNotifyConfirmToken,
  verifyNotifyConfirmToken,
  confirmNotifyMeEmail,
  NOTIFY_ME_EXPIRY_DAYS,
} from '../services/notifyMeSenderService';

const ENV = { ...process.env };
const t0 = new Date('2026-09-29T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, NOTIFY_ME_SENDER_ENABLED: 'true', JWT_SECRET: 'test-secret' };
  delete process.env.NOTIFY_ME_DRY_RUN;
  mockIsSuppressed.mockResolvedValue(false);
  mockSearch.findMany.mockResolvedValue([]);
  mockWait.findMany.mockResolvedValue([]);
  // A claim/release/stamp touches N ids and reports N; the expiry sweep and confirm have no id list.
  const countFor = async (a: any) => ({ count: a?.where?.id?.in?.length ?? 0 });
  mockSearch.updateMany.mockImplementation(countFor);
  mockWait.updateMany.mockImplementation(countFor);
  mockItem.findMany.mockResolvedValue([{ id: 'i1', title: 'Brass lamp', price: 25, sale: { title: 'Big Sale', city: 'Paw Paw', state: 'MI' } }]);
  mockSale.findMany.mockResolvedValue([]);
  mockSend.mockResolvedValue({ sent: true });
});
afterAll(() => { process.env = ENV; });

const searchRow = (id: string, email: string, q: string) => ({ id, email, searchQuery: q, city: null, createdAt: new Date('2026-09-20'), armedAt: null, confirmedAt: new Date('2026-09-20') });
const notifiedWrites = (m: jest.Mock) => m.mock.calls.filter((c) => c[0]?.data && 'notifiedAt' in c[0].data);

describe('gates', () => {
  it('does nothing unless NOTIFY_ME_SENDER_ENABLED=true', async () => {
    delete process.env.NOTIFY_ME_SENDER_ENABLED;
    const r = await runNotifyMeSender(t0);
    expect(r.aborted).toBe('disabled');
    expect(mockSearch.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses to send without an unsubscribe secret', async () => {
    delete process.env.JWT_SECRET;
    const r = await runNotifyMeSender(t0);
    expect(r.aborted).toBe('no_unsubscribe_secret');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('dry run computes matches but claims and sends nothing', async () => {
    process.env.NOTIFY_ME_DRY_RUN = 'true';
    mockSearch.findMany.mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'brass lamp')]).mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.wouldEmail).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSearch.updateMany).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('sends ONE email per person even with several matching entries, and marks them notified', async () => {
    mockSearch.findMany
      .mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'brass lamp'), searchRow('s2', 'a@gmail.com', 'lamp')])
      .mockResolvedValue([]); // recently-notified lookup
    const r = await runNotifyMeSender(t0);
    expect(r.emailed).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe('a@gmail.com');
    expect(arg.html).toContain('/api/shopper/waitlist/unsubscribe?token=');
    expect(mockSearch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { notifiedAt: expect.any(Date) } }));
  });

  it('sends a generic subject, List-Unsubscribe headers and no search term in the subject', async () => {
    mockSearch.findMany.mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'brass lamp')]).mockResolvedValue([]);
    await runNotifyMeSender(t0);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.subject).toBe('New matches for your FindA.Sale alert');
    expect(arg.subject).not.toMatch(/lamp/i);
    expect(arg.headers['List-Unsubscribe']).toMatch(/^<https:\/\/finda\.sale\/api\/shopper\/waitlist\/unsubscribe\?token=/);
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('skips a person who was already emailed in the last 24 hours', async () => {
    mockSearch.findMany
      .mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'lamp')])
      .mockResolvedValueOnce([{ email: 'a@gmail.com' }]);
    const r = await runNotifyMeSender(t0);
    expect(r.skippedRecentlyNotified).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips suppressed recipients and our own finda.sale zone', async () => {
    mockIsSuppressed.mockResolvedValue(true);
    mockSearch.findMany
      .mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'lamp'), searchRow('s2', 'me@finda.sale', 'lamp')])
      .mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.skippedSuppressed).toBe(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not email when nothing matches and does not mark the entry', async () => {
    mockItem.findMany.mockResolvedValue([]);
    mockSearch.findMany.mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'lamp')]).mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.skippedNoMatch).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();
    expect(notifiedWrites(mockSearch.updateMany)).toHaveLength(0);
  });

  it('releases the claim when the send throws so the entry is retried', async () => {
    mockSend.mockRejectedValue(new Error('resend down'));
    mockSearch.findMany.mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'lamp')]).mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.failed).toBe(1);
    expect(mockSearch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { notifiedAt: null } }));
  });

  it('a failed send does not move the since-anchor: the retry still matches the same items (armedAt, not updatedAt)', async () => {
    mockSend.mockRejectedValueOnce(new Error('resend down'));
    const row = { ...searchRow('s1', 'a@gmail.com', 'lamp'), armedAt: new Date('2026-09-25T00:00:00Z') };
    mockSearch.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValue([]);
    await runNotifyMeSender(t0);
    await runNotifyMeSender(t0);
    const wheres = mockItem.findMany.mock.calls.map((c) => c[0].where.createdAt.gt.toISOString());
    expect(wheres).toEqual(['2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z']);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('only confirmed anonymous entries are loaded (double opt-in) and rotation is oldest-checked first, nulls first', async () => {
    await runNotifyMeSender(t0);
    const q = mockSearch.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ isActive: true, notifiedAt: null, confirmedAt: { not: null } });
    expect(q.orderBy[0]).toEqual({ lastCheckedAt: { sort: 'asc', nulls: 'first' } });
    const w = mockWait.findMany.mock.calls[0][0];
    expect(w.orderBy[0]).toEqual({ lastCheckedAt: { sort: 'asc', nulls: 'first' } });
  });

  it('stamps lastCheckedAt on every examined entry so non-matching entries cannot starve newer ones', async () => {
    mockItem.findMany.mockResolvedValue([]);
    mockSearch.findMany.mockResolvedValueOnce([searchRow('s1', 'a@gmail.com', 'lamp'), searchRow('s2', 'b@gmail.com', 'desk')]).mockResolvedValue([]);
    await runNotifyMeSender(t0);
    const stamp = mockSearch.updateMany.mock.calls.find((c) => c[0]?.data && 'lastCheckedAt' in c[0].data);
    expect(stamp).toBeTruthy();
    expect(stamp![0].where.id.in.sort()).toEqual(['s1', 's2']);
  });

  it('expires alerts older than 90 days: deactivates with an expiredAt marker (an expiry is not an opt-out)', async () => {
    await runNotifyMeSender(t0);
    const cutoff = new Date(t0.getTime() - NOTIFY_ME_EXPIRY_DAYS * 86400000).toISOString();
    const sweep = mockSearch.updateMany.mock.calls.find((c) => c[0]?.data?.expiredAt);
    expect(sweep![0].data).toEqual({ isActive: false, expiredAt: t0 });
    expect(sweep![0].where.OR[0].armedAt.lt.toISOString()).toBe(cutoff);
    expect(sweep![0].where.OR[1]).toMatchObject({ armedAt: null });
    const wsweep = mockWait.updateMany.mock.calls.find((c) => c[0]?.data && c[0].data.isActive === false && !c[0].where.id);
    expect(wsweep).toBeTruthy();
  });

  it('never emails an entry armed more than 90 days ago even if the sweep did not run', async () => {
    mockSearch.findMany
      .mockResolvedValueOnce([{ ...searchRow('old', 'a@gmail.com', 'lamp'), armedAt: new Date('2026-05-01T00:00:00Z') }])
      .mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.targetsLoaded).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('stops at the per-run fuse', async () => {
    process.env.NOTIFY_ME_MAX_EMAILS_PER_RUN = '2';
    mockSearch.findMany
      .mockResolvedValueOnce([1, 2, 3, 4].map((n) => searchRow(`s${n}`, `p${n}@gmail.com`, 'lamp')))
      .mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.emailed).toBe(2);
    expect(r.fuseTripped).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('aborts after repeated consecutive send failures', async () => {
    mockSend.mockRejectedValue(new Error('down'));
    mockSearch.findMany
      .mockResolvedValueOnce([1, 2, 3, 4, 5].map((n) => searchRow(`s${n}`, `p${n}@gmail.com`, 'lamp')))
      .mockResolvedValue([]);
    const r = await runNotifyMeSender(t0);
    expect(r.aborted).toBe('too_many_consecutive_failures');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});

describe('helpers', () => {
  it('round-trips and rejects tampered unsubscribe tokens', () => {
    const tok = signNotifyMeToken('Person@Example.com') as string;
    expect(verifyNotifyMeToken(tok)).toBe('person@example.com');
    expect(verifyNotifyMeToken(tok.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyNotifyMeToken('garbage')).toBeNull();
  });

  it('tokenizes queries', () => {
    expect(tokenizeTerm('Mid-Century  Lamp, a')).toEqual(['mid', 'century', 'lamp']);
  });

  it('escapes HTML in the email and includes the unsubscribe link', () => {
    const { html, subject } = buildNotifyMeEmail({
      terms: ['lamp'],
      items: [{ id: 'i1', title: '<script>x</script>', price: 5, saleTitle: 'S', city: 'C', state: 'MI' }],
      sales: [],
      unsubUrl: 'https://finda.sale/api/shopper/waitlist/unsubscribe?token=abc',
      isAccountHolder: false,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('unsubscribe?token=abc');
    expect(subject).toBe('New matches for your FindA.Sale alert');
    expect(subject).not.toContain('lamp');
    expect(html).toContain('lamp');
    expect(html).not.toMatch(/—/);
  });

  it('escapes a hostile search term in the body and never puts it in the subject', () => {
    const { html, subject, text } = buildNotifyMeEmail({
      terms: ['"><img src=x onerror=alert(1)>', 'b'],
      items: [{ id: 'i1', title: 'T', price: 5, saleTitle: 'S', city: 'C', state: 'MI' }],
      sales: [],
      unsubUrl: 'https://finda.sale/u',
      isAccountHolder: false,
    });
    expect(subject).toBe('New matches for your 2 FindA.Sale alerts');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(text).toContain('Stop all Notify Me emails: https://finda.sale/u');
  });
});

describe('double opt-in confirmation', () => {
  it('confirm and unsubscribe tokens are domain-separated: neither works as the other', () => {
    const unsub = signNotifyMeToken('a@example.com') as string;
    const conf = signNotifyConfirmToken('a@example.com') as string;
    expect(verifyNotifyMeToken(conf)).toBeNull();
    expect(verifyNotifyConfirmToken(unsub)).toBeNull();
    expect(verifyNotifyConfirmToken(conf)).toBe('a@example.com');
  });

  it('a confirmation token expires after its ttl and rejects tampering', () => {
    const now = 1_000_000;
    const tok = signNotifyConfirmToken('A@Example.com', now, 1000) as string;
    expect(verifyNotifyConfirmToken(tok, now + 500)).toBe('a@example.com');
    expect(verifyNotifyConfirmToken(tok, now + 1001)).toBeNull();
    expect(verifyNotifyConfirmToken(tok.slice(0, -2) + 'xx', now)).toBeNull();
    expect(verifyNotifyConfirmToken('garbage', now)).toBeNull();
  });

  it('confirming marks only that email\'s pending active alerts', async () => {
    mockSearch.updateMany.mockResolvedValueOnce({ count: 2 });
    const n = await confirmNotifyMeEmail(' A@Example.com ', t0);
    expect(n).toBe(2);
    expect(mockSearch.updateMany).toHaveBeenCalledWith({ where: { email: 'a@example.com', isActive: true, confirmedAt: null }, data: { confirmedAt: t0 } });
  });

  it('the confirmation email has a generic subject and escapes the term', () => {
    const { subject, html, text } = buildNotifyMeConfirmEmail({ term: '<b>x</b>', city: 'Paw Paw', confirmUrl: 'https://finda.sale/c?token=t', unsubUrl: 'https://finda.sale/u' });
    expect(subject).toBe('Confirm your FindA.Sale alert');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(text).toContain('https://finda.sale/c?token=t');
    expect(html + text).not.toMatch(/\u2014/);
  });
});
