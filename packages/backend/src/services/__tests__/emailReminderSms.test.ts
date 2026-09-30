/**
 * Reminder SMS compliance (2026-09-29). Prisma, Twilio and the email/push collaborators are jest mocks;
 * no network, no real text. NOT EXECUTED when written (jest cannot run on the authoring machine).
 */
const mockOptOutFindMany = jest.fn();
const mockOptOutUpsert = jest.fn();
const mockSmsLogCreate = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    smsOptOut: {
      findMany: (...a: unknown[]) => mockOptOutFindMany(...a),
      upsert: (...a: unknown[]) => mockOptOutUpsert(...a),
    },
    smsSendLog: {
      create: (...a: unknown[]) => mockSmsLogCreate(...a),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sentCount: 0 } }),
    },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const mockTwilioCreate = jest.fn();
jest.mock('twilio', () => jest.fn(() => ({ messages: { create: (...a: unknown[]) => mockTwilioCreate(...a) } })));
jest.mock('../../utils/webpush', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../emailTemplateService', () => ({ buildSaleDayReminderEmail: jest.fn(() => '<p>x</p>') }));
jest.mock('../../lib/emailService', () => ({ emailService: { emails: { send: jest.fn() } } }));
jest.mock('../suppressionService', () => ({ suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) } }));

import { sendReminderSMS, getSMSTemplate } from '../emailReminderService';

// 2026-09-29 17:00 UTC = 12:00 noon in America/Chicago (allowed); 08:00 UTC = 3:00 AM (quiet hours).
const NOON_CHICAGO = new Date('2026-09-29T17:00:00Z');
const NIGHT_CHICAGO = new Date('2026-09-29T08:00:00Z');

const base = () => ({
  to: '(269) 555-0142',
  saleName: 'Oak Street Sale',
  saleAddress: '12 Oak St, Paw Paw, MI',
  startDate: new Date('2026-09-30T14:00:00Z'),
  reminderType: 'one-day' as const,
  smsConsentAt: new Date('2026-09-01T00:00:00Z'),
  orgName: 'Oak Street Estates',
  orgTimeZone: 'America/Chicago',
  organizerId: 'org1',
  saleId: 'sale1',
  orgTier: 'PRO',
  now: NOON_CHICAGO,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_PHONE_NUMBER = '+18885550100';
  mockOptOutFindMany.mockResolvedValue([]);
  mockTwilioCreate.mockResolvedValue({ sid: 'SM1' });
  mockSmsLogCreate.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendReminderSMS compliance', () => {
  it('sends a consented, in-hours reminder with the sender prefix and STOP footer, and logs it', async () => {
    const outcome = await sendReminderSMS(base());
    expect(outcome).toBe('sent');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    const args: any = mockTwilioCreate.mock.calls[0][0];
    expect(args.to).toBe('+12695550142');
    expect(args.body.startsWith('Oak Street Estates via FindA.Sale: ')).toBe(true);
    expect(args.body.endsWith('Reply STOP to opt out.')).toBe(true);
    expect(mockSmsLogCreate).toHaveBeenCalledTimes(1);
    const log: any = (mockSmsLogCreate.mock.calls[0][0] as any).data;
    expect(log).toMatchObject({ organizerId: 'org1', saleId: 'sale1', recipientCount: 1, sentCount: 1, failedCount: 0 });
  });

  it('never texts a phone number without recorded consent', async () => {
    expect(await sendReminderSMS({ ...base(), smsConsentAt: null })).toBe('skipped_no_consent');
    expect(await sendReminderSMS({ ...base(), smsConsentAt: undefined })).toBe('skipped_no_consent');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('skips numbers on the STOP list', async () => {
    mockOptOutFindMany.mockResolvedValue([{ phone: '+12695550142' }]);
    expect(await sendReminderSMS(base())).toBe('skipped_opted_out');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('fails closed when the opt-out lookup errors', async () => {
    mockOptOutFindMany.mockRejectedValue(new Error('db down'));
    expect(await sendReminderSMS(base())).toBe('skipped_opted_out');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('skips (does not send) during quiet hours in the organizer timezone', async () => {
    expect(await sendReminderSMS({ ...base(), now: NIGHT_CHICAGO })).toBe('skipped_quiet_hours');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockSmsLogCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number before any lookup or send', async () => {
    expect(await sendReminderSMS({ ...base(), to: 'invalid-phone' })).toBe('skipped_invalid_phone');
    expect(mockOptOutFindMany).not.toHaveBeenCalled();
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });

  it('records a carrier block (21610) as an opt-out without retrying', async () => {
    mockTwilioCreate.mockRejectedValue({ code: 21610, message: 'blocked' });
    expect(await sendReminderSMS(base())).toBe('skipped_opted_out');
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    expect(mockOptOutUpsert).toHaveBeenCalledTimes(1);
    expect((mockOptOutUpsert.mock.calls[0][0] as any).where).toEqual({ phone: '+12695550142' });
  });

  it('skips quietly when Twilio is not configured', async () => {
    delete process.env.TWILIO_PHONE_NUMBER;
    expect(await sendReminderSMS(base())).toBe('skipped_not_configured');
  });

  it('does not write an audit row when the sale/organizer ids are unknown', async () => {
    // compliantSms fails closed when the organizer is unknown (the daily cap cannot be accounted for).
    expect(await sendReminderSMS({ ...base(), organizerId: null, saleId: null })).toBe('skipped_daily_cap');
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(mockSmsLogCreate).not.toHaveBeenCalled();
  });
});

describe('getSMSTemplate', () => {
  it('uses plain text (no emoji) and names the sale and address', () => {
    const t = getSMSTemplate(base());
    expect(t).toContain('Oak Street Sale');
    expect(t).toContain('12 Oak St');
    expect(/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t)).toBe(false);
    expect(getSMSTemplate({ ...base(), reminderType: 'two-hours' })).toContain('starts in about 2 hours');
  });

  it('compact form drops the address', () => {
    expect(getSMSTemplate(base(), true)).not.toContain('12 Oak St');
  });
});
