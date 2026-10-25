/**
 * Outbound notification privacy gates (2026-10-13, Patrick-approved):
 *  - the sale street address goes out only to an account holder, and only from the day before the sale starts
 *    (organizer time zone, send time). Guests and early sends get "City, ST zip" plus a sale page hint.
 *  - early-access / rarity / Legendary embargoed items never appear in a message.
 * Prisma, email, push and SMS are jest mocks: nothing is sent. Email HTML comes from the real templates.
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  sale: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn(), findUnique: jest.fn() },
  purchase: { findMany: jest.fn().mockResolvedValue([]) },
  favorite: { findMany: jest.fn().mockResolvedValue([]) },
  collectorPassport: { findMany: jest.fn() },
  saleReminderSent: { createMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  pushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  smsOptOut: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
  smsSendLog: { create: jest.fn(), aggregate: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../index', () => ({ prisma: mockPrisma }));

const mockEmailSend = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: (...a: unknown[]) => mockEmailSend(...a) } } }));
const mockTransactionalSend = jest.fn().mockResolvedValue({ sent: true });
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: unknown[]) => mockTransactionalSend(...a) } },
}));
const mockSendPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/webpush', () => ({ sendPushNotification: (...a: unknown[]) => mockSendPush(...a) }));
jest.mock('twilio', () => jest.fn(() => ({ messages: { create: jest.fn() } })));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) } }));
jest.mock('../controllers/unsubscribeController', () => ({
  generateUnsubscribeToken: jest.fn().mockResolvedValue('tok'),
  buildUnsubscribeLinks: jest.fn().mockResolvedValue({ webUrl: 'https://finda.sale/unsubscribe?token=tok', listUnsubscribeHeader: '<mailto:u@x>' }),
}));

import { messageSaleLocation, formatLocality, visibleItemsForRecipient } from '../lib/messageSaleLocation';
import { notifyFollowersOfNewSale } from '../services/followerNotificationService';
import { processReminderPass } from '../services/emailReminderService';
import { sendWeeklyEmails } from '../services/weeklyEmailService';
import { sendPresaleSneakPeekEmails } from '../services/presaleSneakPeekEmailService';
import { checkPassportMatchForNewSale } from '../services/collectorPassportService';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const STREET = '12 Oak St';

/** Minimal Prisma where evaluator (AND / OR / NOT, equality, null, gt/gte/lt/lte, not, notIn, isEmpty). */
function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]: [string, any]) => {
    if (k === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((w: any) => matches(row, w));
    if (k === 'OR') return cond.some((w: any) => matches(row, w));
    if (k === 'NOT') return (Array.isArray(cond) ? cond : [cond]).every((w: any) => !matches(row, w));
    const v = row[k];
    if (cond === null) return v === null || v === undefined;
    if (cond instanceof Date || typeof cond !== 'object') return (v instanceof Date ? v.getTime() : v) === (cond instanceof Date ? cond.getTime() : cond);
    if (v === null || v === undefined) return false;
    const t = (x: any) => (x instanceof Date ? x.getTime() : x);
    return Object.entries(cond).every(([op, arg]: [string, any]) => {
      switch (op) {
        case 'gt': return t(v) > t(arg);
        case 'gte': return t(v) >= t(arg);
        case 'lt': return t(v) < t(arg);
        case 'lte': return t(v) <= t(arg);
        case 'notIn': return !arg.includes(v);
        case 'in': return arg.includes(v);
        case 'isEmpty': return arg ? v.length === 0 : v.length > 0;
        case 'not': return arg === null ? true : (typeof arg === 'object' ? !matches({ x: v }, { x: arg }) : v !== arg);
        default: throw new Error(`unsupported operator ${op}`);
      }
    });
  });
}

const baseItem = (over: Record<string, unknown> = {}) => ({
  id: 'i-plain',
  title: 'Oak Dresser',
  price: 120,
  category: 'Furniture',
  tags: [],
  photoUrls: ['https://cdn.example.com/a.jpg'],
  status: 'AVAILABLE',
  isActive: true,
  draftStatus: 'PUBLISHED',
  listingType: 'FIXED',
  rarity: 'COMMON',
  createdAt: new Date(Date.now() - 5 * DAY),
  earlyAccessUntil: null,
  isLegendary: false,
  legendaryVisibleAt: null,
  ...over,
});
const embargoedItems = () => [
  baseItem({ id: 'i-early', title: 'Early Access Lamp', earlyAccessUntil: new Date(Date.now() + 2 * DAY) }),
  baseItem({ id: 'i-rare', title: 'Rare Clock', rarity: 'RARE', createdAt: new Date(Date.now() - 1 * HOUR) }),
  baseItem({ id: 'i-legend', title: 'Legend Vase', rarity: 'LEGENDARY', createdAt: new Date(Date.now() - 2 * HOUR) }),
  baseItem({ id: 'i-sage', title: 'Sage Painting', isLegendary: true, legendaryVisibleAt: new Date(Date.now() + DAY) }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockEmailSend.mockResolvedValue({ sent: true });
  mockTransactionalSend.mockResolvedValue({ sent: true });
  mockPrisma.pushSubscription.findMany.mockResolvedValue([]);
  mockPrisma.purchase.findMany.mockResolvedValue([]);
  mockPrisma.favorite.findMany.mockResolvedValue([]);
});

describe('messageSaleLocation', () => {
  const now = new Date('2026-10-13T16:00:00Z'); // noon in Detroit
  const sale = (startDate: Date, over: Record<string, unknown> = {}) => ({ address: STREET, city: 'Paw Paw', state: 'MI', zip: '49079', startDate, ...over });

  it('withholds the street before the day before the sale, even for an account holder', () => {
    const loc = messageSaleLocation(sale(new Date('2026-10-17T14:00:00Z')), 'America/Detroit', true, now);
    expect(loc.visible).toBe(false);
    expect(loc.line).toBe('Paw Paw, MI 49079');
    expect(loc.note).toBe('Full address on the sale page the day before it starts');
  });

  it('shows the street to an account holder on the day before (sale local time)', () => {
    const loc = messageSaleLocation(sale(new Date('2026-10-14T14:00:00Z')), 'America/Detroit', true, now);
    expect(loc).toEqual(expect.objectContaining({ visible: true, line: `${STREET}, Paw Paw, MI 49079`, note: '' }));
  });

  it('never shows the street to a guest, even on the day', () => {
    const loc = messageSaleLocation(sale(new Date('2026-10-13T20:00:00Z')), 'America/Detroit', false, now);
    expect(loc.visible).toBe(false);
    expect(loc.line).toBe('Paw Paw, MI 49079');
    expect(loc.note).toMatch(/Sign in on the sale page/);
  });

  it('has no dangling separators or "undefined" when parts are missing', () => {
    expect(formatLocality({ city: 'Paw Paw', state: null, zip: undefined })).toBe('Paw Paw');
    expect(formatLocality({ city: '', state: 'MI', zip: '49079' })).toBe('MI 49079');
    const online = messageSaleLocation({ address: '', city: 'Paw Paw', state: 'MI', zip: null, startDate: new Date() }, null, false, now);
    expect(online).toEqual({ visible: true, line: 'Paw Paw, MI', locality: 'Paw Paw, MI', note: '' });
    expect(JSON.stringify(online)).not.toMatch(/undefined|null|, ,/);
  });

  it('visibleItemsForRecipient drops embargoed items for a guest and keeps rarity items for a Hunt Pass holder', () => {
    const items = [baseItem(), ...embargoedItems()];
    expect(visibleItemsForRecipient(items, null).map((i) => i.id)).toEqual(['i-plain']);
    const hp = { huntPassActive: true, huntPassExpiry: new Date(Date.now() + 30 * DAY), explorerRank: 'INITIATE' };
    expect(visibleItemsForRecipient(items, hp).map((i) => i.id).sort()).toEqual(['i-early', 'i-legend', 'i-plain', 'i-rare']);
  });
});

describe('follower new-sale notification', () => {
  it('omits the street address when the sale is more than a day away and links to the sale page', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({
      businessName: 'Oak Street Shop',
      timezone: 'America/Detroit',
      followers: [{ notifyEmail: true, notifyPush: true, user: { id: 'u1', email: 'fan@example.com', pushSubscriptions: [{ endpoint: 'e' }] } }],
    });
    await notifyFollowersOfNewSale({
      id: 's1', title: 'Fall Sale', address: STREET, city: 'Paw Paw', state: 'MI', zip: '49079',
      startDate: new Date(Date.now() + 5 * DAY), organizerId: 'o1',
    });
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const html: string = mockEmailSend.mock.calls[0][0].html;
    expect(html).not.toContain(STREET);
    expect(html).toContain('Paw Paw, MI 49079');
    expect(html).toContain('Full address on the sale page the day before it starts');
    expect(html).not.toMatch(/undefined/);
    // push never carried the street
    expect(JSON.stringify(mockSendPush.mock.calls)).not.toContain(STREET);
  });
});

describe('sale-day reminders', () => {
  // Organizer in America/Chicago. Sale 3:00 PM CDT on 2026-09-30; run at 10:00 AM CDT the same day (DAY_BEFORE due).
  const SALE_START = new Date('2026-09-30T20:00:00Z');
  const RUN = new Date('2026-09-30T15:00:00Z');
  const sale = (subscribers: any[]) => ({
    id: 's1', title: 'Oak Street Sale', address: STREET, city: 'Paw Paw', state: 'MI', zip: '49079',
    status: 'PUBLISHED', deletedAt: null, startDate: SALE_START, endDate: new Date(SALE_START.getTime() + 6 * HOUR),
    organizerId: 'org1',
    organizer: { id: 'org1', businessName: 'Oak Street Shop', timezone: 'America/Chicago', subscriptionTier: 'PRO' },
    subscribers,
  });
  let ledger: Array<{ subscriberId: string; saleId: string; kind: string }> = [];

  beforeEach(() => {
    ledger = [];
    process.env.JWT_SECRET = 'test-secret-not-real';
    mockPrisma.saleReminderSent.findMany.mockImplementation(async () => ledger);
    mockPrisma.saleReminderSent.createMany.mockImplementation(async ({ data }: any) => {
      let count = 0;
      for (const d of data) {
        if (!ledger.some((r) => r.subscriberId === d.subscriberId && r.saleId === d.saleId && r.kind === d.kind)) {
          ledger.push(d);
          count += 1;
        }
      }
      return { count };
    });
    mockPrisma.saleReminderSent.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ notificationPrefs: null });
  });

  it('a confirmed guest subscriber gets city / state / zip only, never the street', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      sale([{ id: 'g1', email: 'guest@example.com', phone: null, userId: null, user: null, smsConsentAt: null, emailOptOutAt: null, emailConfirmedAt: new Date('2026-09-29T00:00:00Z') }]),
    ]);
    await processReminderPass('DAY_BEFORE', RUN, {});
    expect(mockTransactionalSend).toHaveBeenCalledTimes(1);
    const msg = mockTransactionalSend.mock.calls[0][0];
    expect(msg.to).toBe('guest@example.com');
    expect(msg.html).not.toContain(STREET);
    expect(msg.html).toContain('Paw Paw, MI 49079');
    expect(msg.html).toContain('Sign in on the sale page to see the full address');
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('an account holder on the day before the sale gets the full street address (email and push)', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      sale([{ id: 'a1', email: 'owner@example.com', phone: null, userId: 'u1', user: { email: 'owner@example.com' }, smsConsentAt: null, emailOptOutAt: null, emailConfirmedAt: null }]),
    ]);
    mockPrisma.pushSubscription.findMany.mockResolvedValue([{ userId: 'u1', endpoint: 'e' }]);
    await processReminderPass('DAY_BEFORE', RUN, {});
    // 2026-10-25: account-holder reminders ride the Resend rail (finda.sale), never the Gmail outreach rail.
    expect(mockTransactionalSend).toHaveBeenCalledTimes(1);
    const msg = mockTransactionalSend.mock.calls[0][0];
    expect(msg.from).toMatch(/@finda\.sale>?$/);
    const html: string = msg.html;
    expect(html).toContain(`${STREET}, Paw Paw, MI 49079`);
    expect(html).not.toContain('Full address on the sale page');
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockSendPush.mock.calls[0][1].body).toContain(STREET);
    expect(mockEmailSend).not.toHaveBeenCalled();
  });
});

describe('weekly picks email', () => {
  it('never includes an item still in an early-access window', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'shopper@example.com', name: 'Pat', notificationPrefs: null }]);
    const allItems = [baseItem(), ...embargoedItems()];
    mockPrisma.sale.findMany.mockImplementation(async (args: any) => [
      {
        id: 's1', title: 'Fall Sale', city: 'Paw Paw', startDate: new Date(Date.now() + 3 * DAY),
        items: allItems.filter((it) => matches(it, args.include.items.where)),
      },
    ]);
    await sendWeeklyEmails();
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const html: string = mockEmailSend.mock.calls[0][0].html;
    expect(html).toContain('Oak Dresser');
    for (const hidden of ['Early Access Lamp', 'Rare Clock', 'Legend Vase', 'Sage Painting']) expect(html).not.toContain(hidden);
  });
});

describe('presale sneak peek', () => {
  it('excludes embargoed items and withholds the street from a guest subscriber', async () => {
    const allItems = [baseItem(), ...embargoedItems()];
    process.env.OUTREACH_SECRET = 'test-outreach-secret';
    process.env.BACKEND_URL = 'https://api.example.com';
    mockPrisma.sale.findMany.mockImplementation(async (args: any) => [
      {
        id: 's1', title: 'Fall Sale', address: STREET, city: 'Paw Paw', state: 'MI', zip: '49079',
        startDate: new Date(Date.now() + 30 * HOUR),
        organizer: { timezone: 'America/Detroit', user: { email: 'org@example.com', name: 'Org' } },
        subscribers: [{ userId: null, email: 'guest@example.com' }],
        rsvps: [],
        items: allItems.filter((it) => matches(it, args.include.items.where)),
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    await sendPresaleSneakPeekEmails();
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const html: string = mockEmailSend.mock.calls[0][0].html;
    expect(html).toContain('Oak Dresser');
    for (const hidden of ['Early Access Lamp', 'Rare Clock', 'Legend Vase', 'Sage Painting']) expect(html).not.toContain(hidden);
    expect(html).not.toContain(STREET);
    expect(html).toContain('Paw Paw, MI 49079');
  });
});

describe('collector passport match alert', () => {
  it('only names items the collector may see yet', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      id: 's1', organizer: { businessName: 'Oak Street Shop' },
      items: [baseItem({ title: 'Plain Clock' }), baseItem({ id: 'i-rare', title: 'Rare Clock', rarity: 'RARE', createdAt: new Date(Date.now() - HOUR) })],
    });
    mockPrisma.collectorPassport.findMany.mockResolvedValue([
      { specialties: [], categories: [], keywords: ['clock'], notifyEmail: true, notifyPush: false,
        user: { id: 'u1', email: 'free@example.com', pushSubscriptions: [], huntPassActive: false, huntPassExpiry: null, explorerRank: 'INITIATE' } },
      { specialties: [], categories: [], keywords: ['clock'], notifyEmail: true, notifyPush: false,
        user: { id: 'u2', email: 'hp@example.com', pushSubscriptions: [], huntPassActive: true, huntPassExpiry: new Date(Date.now() + 30 * DAY), explorerRank: 'INITIATE' } },
    ]);
    await checkPassportMatchForNewSale('s1');
    await new Promise((r) => setImmediate(r));
    const byTo = (to: string) => mockEmailSend.mock.calls.find((c) => c[0].to === to)?.[0].html as string;
    expect(byTo('free@example.com')).toContain('Plain Clock');
    expect(byTo('free@example.com')).not.toContain('Rare Clock');
    expect(byTo('hp@example.com')).toContain('Rare Clock');
  });
});
