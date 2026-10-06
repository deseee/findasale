/**
 * bulkLotHoldEmails (ADR-136 Addendum D, roadmap #659): the customer emails for bulk lot holds.
 *
 * WHAT THIS PROVES (the real hold service and the real email builder; the database is the in-memory fake with real rollback,
 * the mail rail is a recorder, nothing is ever sent):
 *   - one confirmation per saved hold, to the normalized address; a shopper hold uses the shopper's account email
 *   - no address, a blocked address, an unconfigured rail or the flag off: nothing is sent, nothing fails, nothing is looked up
 *   - a send that rejects, or a hook that throws, never fails or undoes the hold
 *   - the email is validated on input (bad address refused with the plain message, blank means none, line breaks refused)
 *   - the reminder is claimed with a compare and swap on reminderSentAt before the send: a replayed sweep and two racing sweeps
 *     send it once; short holds, shopper holds, holds with a payment request, holds out of the window, and holds with no email get none
 *   - a hold that expires or that the shop releases sends one "ended" notice; a shopper releasing their own hold sends none
 *   - the paid confirmation is NOT built here: convert hands the customer's email to the existing receipt path through guestEmail
 *   - every dynamic value is HTML escaped, the subject cannot carry a line break, no tracking pixel or image, and the copy has no em dash,
 *     no "AI" and no "estate sale"
 */
import {
  HOLD_REMINDER_LEAD_HOURS,
  convertBulkHold,
  normalizeCustomerEmail,
  placeBulkHold,
  releaseBulkHold,
  sweepExpiredBulkHolds,
  sweepHoldReminders,
} from '../services/bulkLot/bulkLotHoldService';
import { HoldEmailKind, buildHoldEmail, canEmailHold, formatHoldTime, sendHoldEmail } from '../services/bulkLot/bulkLotHoldEmailService';
import { FakeDb, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

const ORG = { kind: 'ORGANIZER' as const, organizerId: 'org1', actorUserId: 'u_org' };
const HOUR = 3_600_000;

let db: FakeDb;
let now: Date;
let deps: any;
let emailDeps: any;
let lotId: string;
let users: Record<string, any>;
let orgRow: any;
let itemRow: any;
let saleRow: any;

function setup(over: Record<string, any> = {}) {
  db = new FakeDb();
  now = new Date(Date.UTC(2026, 9, 6, 12, 0, 0));
  users = { u_shop1: { email: 'Pat@Example.com', name: 'Pat' }, u_noemail: { email: null, name: 'Nobody' } };
  orgRow = { businessName: 'Cards & Co', timezone: 'America/Chicago' };
  itemRow = { title: 'Commons' };
  saleRow = { id: 'sale1', title: 'Card Show', address: '1 Main St', city: 'Paw Paw', state: 'MI' };
  lotId = db.addLot().id;
  emailDeps = {
    db: {
      item: { findUnique: jest.fn(async () => itemRow) },
      sale: { findUnique: jest.fn(async () => saleRow) },
      organizer: { findUnique: jest.fn(async () => orgRow) },
      user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
    },
    env: { CARD_BULK_LOTS_ENABLED: 'true' },
    frontendUrl: 'https://finda.sale',
    send: jest.fn(async () => ({ sent: true })),
    isBlocked: jest.fn(async () => false),
    railConfigured: () => true,
    onError: jest.fn(),
    ...over,
  };
  deps = {
    sell: fakeSell(db),
    now: () => now,
    onPlaced: (h: any) => sendHoldEmail(emailDeps, 'CONFIRMATION', h).then(() => undefined),
    onEnded: (h: any, how: 'EXPIRED' | 'RELEASED') => sendHoldEmail(emailDeps, how === 'EXPIRED' ? 'ENDED_EXPIRED' : 'ENDED_RELEASED', h).then(() => undefined),
  };
}

let n = 0;
/** A hold row as the database would hold it, with the cards already taken from the lot. */
function addHold(over: Record<string, any> = {}): any {
  const quantity = over.quantity ?? 1500;
  const row = {
    id: `h${++n}`,
    itemId: lotId,
    saleId: 'sale1',
    organizerId: 'org1',
    createdByUserId: 'u_org',
    shopperUserId: null,
    customerName: 'Sam',
    customerEmail: 'sam@example.com',
    quantity,
    pricePerThousandCents: 800,
    lineCents: 1200,
    status: 'ACTIVE',
    expiresAt: new Date(now.getTime() + 3 * HOUR),
    createdAt: new Date(now.getTime() - 21 * HOUR),
    holdInvoiceId: null,
    reminderSentAt: null,
    ...over,
  };
  db.bulkLotHold.rows.push(row);
  db.item.rows.find((r: any) => r.id === lotId)!.stockSold += quantity;
  return row;
}

const sentTo = () => (emailDeps.send as any).mock.calls.map((c: any[]) => c[0]);

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e: any) {
    return String(e.code ?? e.message);
  }
}

beforeEach(() => {
  setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('confirmation', () => {
  it('sends one confirmation after an organizer hold is saved, to the normalized address', async () => {
    const hold = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 1500, customerName: 'Sam', customerEmail: '  Sam@Example.COM ' });
    expect(hold.customerEmail).toBe('sam@example.com');
    expect(db.bulkLotHold.rows[0].customerEmail).toBe('sam@example.com');
    const sent = sentTo();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('sam@example.com');
    expect(sent[0].subject).toBe('Your hold at Cards & Co: 1,500 cards');
    expect(sent[0].html).toContain('1,500 cards');
    expect(sent[0].html).toContain('$12.00');
    expect(sent[0].html).toContain('Commons');
    expect(sent[0].html).toContain('Held until: Oct 7, 7:00 AM CDT');
    expect(sent[0].html).toContain('Pick up at Card Show, 1 Main St, Paw Paw, MI.');
    expect(sent[0].html).toContain('Pay the shop when you pick the cards up');
    expect(sent[0].text).toContain('Price: $12.00');
    expect(db.stock(lotId).left).toBe(8500);
  });

  it('a shopper hold goes to the shopper account email and says to pay at the register', async () => {
    await placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'u_shop1' }, lotId, { quantity: 500 });
    const sent = sentTo();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('pat@example.com');
    expect(sent[0].html).toContain('Hi Pat,');
    expect(sent[0].html).toContain('Pay at the register');
  });

  it('sends nothing and does not fail when the hold has no address (organizer without email, shopper without email)', async () => {
    const a = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerName: 'Walk-in' });
    const b = await placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'u_noemail' }, lotId, { quantity: 100 });
    expect(a.status).toBe('ACTIVE');
    expect(b.status).toBe('ACTIVE');
    expect(sentTo()).toHaveLength(0);
    expect(db.stock(lotId).left).toBe(9800);
    expect(await sendHoldEmail(emailDeps, 'CONFIRMATION', db.bulkLotHold.rows[0])).toEqual({ sent: false, reason: 'no_address' });
  });

  it('does not email a blocked address (suppressed, or the finda.sale zone) and the hold still stands', async () => {
    setup({ isBlocked: jest.fn(async () => true) });
    const hold = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'someone@finda.sale' });
    expect(hold.status).toBe('ACTIVE');
    expect(sentTo()).toHaveLength(0);
    expect(emailDeps.isBlocked).toHaveBeenCalledWith('someone@finda.sale');
    expect(await sendHoldEmail(emailDeps, 'CONFIRMATION', db.bulkLotHold.rows[0])).toEqual({ sent: false, reason: 'blocked' });
  });

  it('does not send when the mail rail is not configured', async () => {
    setup({ railConfigured: () => false });
    await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'sam@example.com' });
    expect(sentTo()).toHaveLength(0);
    expect(await sendHoldEmail(emailDeps, 'CONFIRMATION', db.bulkLotHold.rows[0])).toEqual({ sent: false, reason: 'not_configured' });
  });

  it('a rail that reports not sent (suppressed at the rail) is a skip, not an error', async () => {
    setup({ send: jest.fn(async () => ({ sent: false, reason: 'suppressed' })) });
    const hold = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'sam@example.com' });
    expect(hold.status).toBe('ACTIVE');
    expect(await sendHoldEmail(emailDeps, 'CONFIRMATION', db.bulkLotHold.rows[0])).toEqual({ sent: false, reason: 'suppressed' });
  });

  it('a send that rejects never fails or undoes the hold, and is reported', async () => {
    setup({ send: jest.fn(async () => { throw new Error('resend down'); }) });
    const hold = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 1500, customerEmail: 'sam@example.com' });
    expect(hold.status).toBe('ACTIVE');
    expect(db.bulkLotHold.rows).toHaveLength(1);
    expect(db.stock(lotId).left).toBe(8500);
    expect(emailDeps.onError).toHaveBeenCalledTimes(1);
    expect((emailDeps.onError as any).mock.calls[0][1]).toMatchObject({ kind: 'CONFIRMATION', holdId: db.bulkLotHold.rows[0].id });
  });

  it('a lookup that fails (lot, sale or shop) sends nothing and does not throw', async () => {
    setup();
    emailDeps.db.sale.findUnique = jest.fn(async () => { throw new Error('db blip'); });
    const hold = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'sam@example.com' });
    expect(hold.status).toBe('ACTIVE');
    expect(sentTo()).toHaveLength(0);
  });

  it('a hook that throws or rejects never fails the hold', async () => {
    for (const onPlaced of [() => { throw new Error('sync boom'); }, async () => { throw new Error('async boom'); }]) {
      setup();
      const hold = await placeBulkHold(db as any, { ...deps, onPlaced }, ORG, lotId, { quantity: 100, customerEmail: 'sam@example.com' });
      expect(hold.status).toBe('ACTIVE');
      expect(db.stock(lotId).left).toBe(9900);
    }
  });

  it('a hold that is refused (too many cards) sends no confirmation', async () => {
    expect(await code(() => placeBulkHold(db as any, deps, ORG, lotId, { quantity: 20000, customerEmail: 'sam@example.com' }))).toBe('INSUFFICIENT_STOCK');
    expect(sentTo()).toHaveLength(0);
    expect(db.bulkLotHold.rows).toHaveLength(0);
  });

  it('with the flag off nothing is looked up and nothing is sent', async () => {
    setup({ env: {} });
    await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'sam@example.com' });
    expect(sentTo()).toHaveLength(0);
    expect(emailDeps.db.item.findUnique).not.toHaveBeenCalled();
    expect(emailDeps.db.user.findUnique).not.toHaveBeenCalled();
    expect(emailDeps.isBlocked).not.toHaveBeenCalled();
    expect(await sendHoldEmail(emailDeps, 'REMINDER', addHold())).toEqual({ sent: false, reason: 'disabled' });
    expect(await canEmailHold(emailDeps, addHold())).toBe(false);
  });
});

describe('the email on input', () => {
  it('refuses an address that is not valid with the plain message, and takes no cards', async () => {
    for (const bad of ['not-an-email', 'a@b', 'a b@example.com', 'sam@example.com\nBcc: x@y.com', 'x'.repeat(250) + '@example.com', 42]) {
      expect(await code(() => placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: bad }))).toBe('BULK_VALIDATION');
    }
    expect(db.stock(lotId).sold).toBe(0);
    expect(db.bulkLotHold.rows).toHaveLength(0);
    try {
      await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 100, customerEmail: 'nope' });
    } catch (e: any) {
      expect(e.extra.issues[0].message).toBe('Enter a valid email address, or leave it blank.');
    }
  });

  it('treats blank and null as no email, and lower-cases the rest', async () => {
    const a = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 10, customerEmail: '' });
    const b = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 10, customerEmail: '   ' });
    const c = await placeBulkHold(db as any, deps, ORG, lotId, { quantity: 10, customerEmail: null });
    expect([a, b, c].map((h) => h.customerEmail)).toEqual([null, null, null]);
    expect(normalizeCustomerEmail(' Sam@Example.COM ')).toBe('sam@example.com');
    expect(normalizeCustomerEmail('')).toBeNull();
    expect(normalizeCustomerEmail('nope')).toBeNull();
    expect(normalizeCustomerEmail(undefined)).toBeNull();
  });

  it('a shopper cannot attach an email (the shopper schema is strict) and a shopper view never shows the saved address', async () => {
    expect(await code(() => placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'u_shop1' }, lotId, { quantity: 10, customerEmail: 'x@example.com' }))).toBe('BULK_VALIDATION');
    const mine = await placeBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'u_shop1' }, lotId, { quantity: 10 });
    expect(mine.customerEmail).toBeNull();
  });
});

describe('the one expiry reminder', () => {
  const run = (over: Record<string, any> = {}) =>
    sweepHoldReminders(db as any, { now: () => now, canEmail: (h) => canEmailHold(emailDeps, h), sendReminder: (h) => sendHoldEmail(emailDeps, 'REMINDER', h), ...over });

  it('is claimed then sent once, and a replayed sweep sends nothing more', async () => {
    const hold = addHold();
    const first = await run();
    expect(first).toMatchObject({ examined: 1, claimed: 1, lostClaim: 0, skipped: 0 });
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0].to).toBe('sam@example.com');
    expect(sentTo()[0].subject).toBe('Your hold at Cards & Co ends soon');
    expect(sentTo()[0].html).toContain('ends at <strong>Oct 6, 10:00 AM CDT</strong>');
    expect(db.bulkLotHold.rows.find((r: any) => r.id === hold.id)!.reminderSentAt).toEqual(now);
    const replay = await run();
    expect(replay.examined).toBe(0);
    expect(sentTo()).toHaveLength(1);
    now = new Date(now.getTime() + 5 * 60_000);
    await run();
    expect(sentTo()).toHaveLength(1);
  });

  it('two sweeps looking at the same hold at once claim it once', async () => {
    addHold();
    const [a, b] = await Promise.all([run(), run()]);
    expect(sentTo()).toHaveLength(1);
    expect(a.claimed + b.claimed).toBe(1);
    expect(a.lostClaim + b.lostClaim).toBe(1);
  });

  it('a hold that was already claimed (reminderSentAt set) is never sent again', async () => {
    addHold({ reminderSentAt: new Date(now.getTime() - HOUR) });
    expect((await run()).examined).toBe(0);
    expect(sentTo()).toHaveLength(0);
  });

  it('a send that fails after the claim is not retried (at most one reminder) and does not throw', async () => {
    setup({ send: jest.fn(async () => { throw new Error('resend down'); }) });
    const hold = addHold();
    const r = await run();
    expect(r.claimed).toBe(1);
    expect(db.bulkLotHold.rows.find((x: any) => x.id === hold.id)!.reminderSentAt).toEqual(now);
    await run();
    expect(emailDeps.send).toHaveBeenCalledTimes(1);
  });

  it('a sender that throws outright is logged and the sweep goes on to the next hold', async () => {
    const a = addHold({ id: 'ha', expiresAt: new Date(now.getTime() + 2 * HOUR) });
    const b = addHold({ id: 'hb', expiresAt: new Date(now.getTime() + 3 * HOUR), customerEmail: 'other@example.com' });
    let calls = 0;
    const r = await run({ sendReminder: async () => { calls++; if (calls === 1) throw new Error('boom'); } });
    expect(r.claimed).toBe(2);
    expect(calls).toBe(2);
    expect([a, b].every((h) => db.bulkLotHold.rows.find((x: any) => x.id === h.id)!.reminderSentAt)).toBe(true);
  });

  it('a hold the gate refuses (blocked address, no rail, flag off) is not claimed, so nothing is lost if the gate opens later', async () => {
    setup({ isBlocked: jest.fn(async () => true) });
    const hold = addHold();
    const r = await run();
    expect(r).toMatchObject({ examined: 1, skipped: 1, claimed: 0 });
    expect(sentTo()).toHaveLength(0);
    expect(db.bulkLotHold.rows.find((x: any) => x.id === hold.id)!.reminderSentAt).toBeNull();
  });

  it('skips a hold that is too short for a reminder (under twice the lead), and the lead is 4 hours', async () => {
    expect(HOLD_REMINDER_LEAD_HOURS).toBe(4);
    addHold({ createdAt: new Date(now.getTime() - 5 * HOUR), expiresAt: new Date(now.getTime() + 3 * HOUR) }); // an 8 hour hold, 3 left: ok
    const short = addHold({ id: 'short', createdAt: new Date(now.getTime() - 4 * HOUR), expiresAt: new Date(now.getTime() + 3 * HOUR) }); // 7 hours
    const r = await run();
    expect(r.claimed).toBe(1);
    expect(db.bulkLotHold.rows.find((x: any) => x.id === short.id)!.reminderSentAt).toBeNull();
  });

  it('skips shopper holds, holds with a payment request open, holds with no email, ended holds, and holds outside the window', async () => {
    const skipped = [
      addHold({ id: 's1', shopperUserId: 'u_shop1', customerEmail: null }),
      addHold({ id: 's2', holdInvoiceId: 'inv1' }),
      addHold({ id: 's3', customerEmail: null }),
      addHold({ id: 's4', status: 'RELEASED' }),
      addHold({ id: 's5', expiresAt: new Date(now.getTime() + 10 * HOUR), createdAt: new Date(now.getTime() - 20 * HOUR) }),
      addHold({ id: 's6', expiresAt: new Date(now.getTime() + 10 * 60_000) }),
      addHold({ id: 's7', expiresAt: new Date(now.getTime() - 60_000) }),
    ];
    await run();
    expect(sentTo()).toHaveLength(0);
    expect(skipped.every((h) => !db.bulkLotHold.rows.find((x: any) => x.id === h.id)!.reminderSentAt)).toBe(true);
  });
});

describe('the notice that a hold ended', () => {
  it('sends one notice when the sweep expires a hold, and a replayed sweep sends nothing more', async () => {
    addHold({ expiresAt: new Date(now.getTime() - 60_000) });
    const first = await sweepExpiredBulkHolds(db as any, deps);
    expect(first.expired).toBe(1);
    expect(db.stock(lotId).sold).toBe(0);
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0].subject).toBe('Your hold at Cards & Co has ended');
    expect(sentTo()[0].html).toContain('has ended');
    expect(sentTo()[0].html).toContain('No payment was taken.');
    const replay = await sweepExpiredBulkHolds(db as any, deps);
    expect(replay.expired).toBe(0);
    expect(sentTo()).toHaveLength(1);
  });

  it('a failing send does not stop the sweep from giving the other holds their cards back', async () => {
    setup({ send: jest.fn(async () => { throw new Error('resend down'); }) });
    addHold({ id: 'e1', expiresAt: new Date(now.getTime() - 60_000) });
    addHold({ id: 'e2', expiresAt: new Date(now.getTime() - 30_000), customerEmail: 'two@example.com' });
    const r = await sweepExpiredBulkHolds(db as any, deps);
    expect(r.expired).toBe(2);
    expect(db.stock(lotId).sold).toBe(0);
  });

  it('an expired hold with no email expires quietly', async () => {
    addHold({ customerEmail: null, expiresAt: new Date(now.getTime() - 60_000) });
    const r = await sweepExpiredBulkHolds(db as any, deps);
    expect(r.expired).toBe(1);
    expect(sentTo()).toHaveLength(0);
  });

  it('the shop releasing a hold sends the released notice once; releasing twice does not send again', async () => {
    const hold = addHold();
    const first = await releaseBulkHold(db as any, deps, ORG, hold.id);
    expect(first.released).toBe(true);
    expect(sentTo()).toHaveLength(1);
    expect(sentTo()[0].html).toContain('let go of your hold');
    expect(sentTo()[0].html).toContain('No payment was taken.');
    const second = await releaseBulkHold(db as any, deps, ORG, hold.id);
    expect(second.released).toBe(false);
    expect(sentTo()).toHaveLength(1);
  });

  it('a shopper releasing their own hold sends no notice', async () => {
    const hold = addHold({ shopperUserId: 'u_shop1', customerEmail: null, expiresAt: new Date(now.getTime() + 2 * HOUR) });
    const r = await releaseBulkHold(db as any, deps, { kind: 'SHOPPER', userId: 'u_shop1' }, hold.id);
    expect(r.released).toBe(true);
    expect(sentTo()).toHaveLength(0);
  });

  it('a hold that expires while a payment request is still open is left alone and sends nothing', async () => {
    db.holdInvoice.rows.push({ id: 'inv1', status: 'PENDING' });
    addHold({ holdInvoiceId: 'inv1', expiresAt: new Date(now.getTime() - 60_000) });
    const r = await sweepExpiredBulkHolds(db as any, deps);
    expect(r).toMatchObject({ expired: 0, waitingOnInvoice: 1 });
    expect(sentTo()).toHaveLength(0);
  });
});

describe('the paid confirmation is not duplicated', () => {
  it('convert gives the existing receipt path the customer email (guestEmail) and sends nothing itself', async () => {
    const hold = addHold();
    const markPaid = jest.fn(async () => ({ recorded: true, alreadyPaid: false }));
    const res = await convertBulkHold(db as any, { ...deps, markPaid }, { organizerId: 'org1', organizerUserId: 'u_org', actorUserId: 'u_staff1', squareReady: false }, hold.id, { method: 'CASH' });
    expect(res.status).toBe('PAID');
    expect(db.holdInvoice.rows[0]).toMatchObject({ guestEmail: 'sam@example.com', guestName: 'Sam', organizerUserId: 'u_org', shopperUserId: null });
    expect(markPaid).toHaveBeenCalledTimes(1);
    expect(sentTo()).toHaveLength(0);
  });

  it('a shopper hold leaves guestEmail empty because the receipt path uses the shopper account email', async () => {
    const hold = addHold({ shopperUserId: 'u_shop1', customerEmail: null, customerName: null });
    const markPaid = jest.fn(async () => ({ recorded: true, alreadyPaid: false }));
    await convertBulkHold(db as any, { ...deps, markPaid }, { organizerId: 'org1', organizerUserId: 'u_org', squareReady: false }, hold.id, { method: 'CASH' });
    expect(db.holdInvoice.rows[0]).toMatchObject({ guestEmail: null, shopperUserId: 'u_shop1' });
  });

  it('an organizer hold with no email makes an invoice with no guest email, as before', async () => {
    const hold = addHold({ customerEmail: null });
    await convertBulkHold(db as any, { ...deps, markPaid: async () => ({ recorded: true, alreadyPaid: false }) }, { organizerId: 'org1', organizerUserId: 'u_org', squareReady: false }, hold.id, { method: 'CASH' });
    expect(db.holdInvoice.rows[0].guestEmail).toBeNull();
  });
});

describe('escaping, headers and copy', () => {
  const FACTS = {
    recipientName: 'Sam',
    shopName: 'Cards & Co',
    lotTitle: 'Commons',
    cards: 1500,
    lineCents: 1200,
    expiresAt: new Date(Date.UTC(2026, 9, 7, 12, 0, 0)),
    timeZone: 'America/Chicago',
    saleId: 'sale1',
    saleTitle: 'Card Show',
    saleAddress: '1 Main St, Paw Paw, MI',
    byShopper: false,
    frontendUrl: 'https://finda.sale',
  };
  const KINDS: HoldEmailKind[] = ['CONFIRMATION', 'REMINDER', 'ENDED_EXPIRED', 'ENDED_RELEASED'];

  it('escapes the customer name, lot title, shop name, sale title and address in every email', () => {
    for (const kind of KINDS) {
      const e = buildHoldEmail({
        ...FACTS,
        kind,
        recipientName: '<b>Sam</b>',
        shopName: '<script>alert(1)</script> Cards',
        lotTitle: '"><img src=x onerror=alert(1)>',
        saleTitle: "Show <i>one</i> & 'two'",
        saleAddress: '1 <u>Main</u> St',
      });
      for (const raw of ['<script>alert(1)</script>', '<img src=x', '<b>Sam</b>', '<i>one</i>', '<u>Main</u>', 'onerror=alert(1)>']) {
        expect([kind, e.html.includes(raw)]).toEqual([kind, false]);
      }
      expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Cards');
      expect(e.html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
    }
  });

  it('keeps a line break out of the subject', () => {
    for (const kind of KINDS) {
      const e = buildHoldEmail({ ...FACTS, kind, shopName: 'Cards\r\nBcc: evil@example.com' });
      expect(/[\r\n]/.test(e.subject)).toBe(false);
    }
  });

  it('has no tracking pixel and no image at all', () => {
    for (const kind of KINDS) {
      const e = buildHoldEmail({ ...FACTS, kind });
      expect(/<img\b/i.test(e.html)).toBe(false);
      expect(/\bsrc\s*=|url\(\s*['"]?https?:|<link\b|<script\b|<iframe\b|width="1"|height="1"/i.test(e.html)).toBe(false);
    }
  });

  it('has no em dash, no "AI" and no "estate sale" in any email, for an organizer or a shopper hold', () => {
    for (const kind of KINDS) {
      for (const byShopper of [false, true]) {
        for (const timeZone of ['America/Chicago', null]) {
          const e = buildHoldEmail({ ...FACTS, kind, byShopper, timeZone });
          for (const [label, text] of [['subject', e.subject], ['text', e.text], ['html', e.html]] as const) {
            expect([kind, byShopper, label, /—/.test(text)]).toEqual([kind, byShopper, label, false]);
            expect([kind, byShopper, label, /\bAI\b/.test(text)]).toEqual([kind, byShopper, label, false]);
            expect([kind, byShopper, label, /estate\s+sale/i.test(text)]).toEqual([kind, byShopper, label, false]);
          }
        }
      }
    }
  });

  it('links to the sale page and shows the price and the card count', () => {
    const e = buildHoldEmail({ ...FACTS, kind: 'CONFIRMATION' });
    expect(e.html).toContain('href="https://finda.sale/sales/sale1"');
    expect(e.html).toContain('$12.00');
    expect(e.html).toContain('1,500 cards');
  });

  it('formats the end time in the shop time zone and falls back to UTC for a zone that does not exist', () => {
    const t = new Date(Date.UTC(2026, 9, 7, 12, 0, 0));
    expect(formatHoldTime(t, 'America/Chicago')).toBe('Oct 7, 7:00 AM CDT');
    expect(formatHoldTime(t, 'America/New_York')).toBe('Oct 7, 8:00 AM EDT');
    expect(formatHoldTime(t, 'Not/AZone')).toBe('Oct 7, 12:00 PM UTC');
    expect(formatHoldTime(t, null)).toBe('Oct 7, 7:00 AM CDT');
    expect(formatHoldTime('garbage', null)).toBe('');
  });
});
