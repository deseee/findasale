jest.mock('../../lib/prisma', () => ({
  prisma: { emailSuppression: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) } },
}));

import { isEmailDomainBlocked, isNonDeliverableEmail, suppressionService } from '../suppressionService';
import { isTestOrSyntheticEmail } from '../mailerliteService';

const NON_DELIVERABLE = [
  'qa@findasale.test', 'a@x.invalid', 'a@foo.example', 'a@host.localhost', 'a@printer.local',
  'a@localhost', 'a@example.com', 'a@example.net', 'a@example.org', 'a@mail.example.com',
  'A@FindaSale.TEST', ' a@findasale.test ', 'a@nodot',
];
const DELIVERABLE = ['real@gmail.com', 'shopper@yahoo.com', 'x@testing.com', 'x@mytest.co', 'x@localhost.com'];

describe('reserved / non-deliverable domains', () => {
  it.each(NON_DELIVERABLE)('blocks %s', (e) => {
    expect(isNonDeliverableEmail(e)).toBe(true);
    expect(isEmailDomainBlocked(e)).toBe(true);
    expect(isTestOrSyntheticEmail(e)).toBe(true);
  });

  it.each(DELIVERABLE)('does not flag %s as non-deliverable', (e) => {
    expect(isNonDeliverableEmail(e)).toBe(false);
  });

  it('suppression service gates treat them as suppressed without a DB hit', async () => {
    expect(await suppressionService.isHardSuppressed('qa@findasale.test')).toBe(true);
    expect(await suppressionService.isSuppressed('qa@findasale.test')).toBe(true);
    const map = await suppressionService.checkMultipleHard(['qa@findasale.test', 'real@gmail.com']);
    expect(map.get('qa@findasale.test')).toBe(true);
    expect(map.get('real@gmail.com')).toBe(false);
  });
});

describe('mailerlite skips non-deliverable addresses', () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.MAILERLITE_API_KEY = 'k';
    process.env.MAILERLITE_SHOPPERS_GROUP_ID = 'g1';
    process.env.MAILERLITE_ORGANIZERS_GROUP_ID = 'g2';
    process.env.MAILERLITE_COLD_GROUP_ID = 'g3';
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
  });
  afterEach(() => { process.env = { ...OLD }; });

  it('makes no API call for .test addresses', async () => {
    const ml = await import('../mailerliteService');
    await ml.addShopperSubscriber('qa@findasale.test', 'QA');
    await ml.addOrganizerSubscriber('qa@findasale.test', 'QA');
    await ml.markSalePublished('qa@findasale.test');
    await ml.syncLeadTierToMailerLite('qa@findasale.test', 'COLD', 'org1');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('batch sync skips them', async () => {
    const ml = await import('../mailerliteService');
    const r = await ml.batchSyncLeadTiersToMailerLite([{ id: '1', contactEmail: 'qa@findasale.test', leadTier: 'COLD' }]);
    expect(r).toEqual({ synced: 0, skipped: 1, failed: 0 });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});
