/**
 * webhookEventPruneJob never prunes a 'one-time:' marker (itemKitService.fixLegacyKitDontList's claim row): deleting it would let
 * the one-time fix run again. No database; the cron callback is captured and run against a fake prisma.
 */
const mockDeleteMany = jest.fn();
let captured: (() => Promise<void>) | null = null;
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (_e: string, fn: () => Promise<void>) => { captured = fn; } } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: () => Promise<void>) => fn }));
jest.mock('../services/refreshTokenService', () => ({ pruneExpiredRefreshTokens: jest.fn().mockResolvedValue(0) }));
jest.mock('../index', () => ({ prisma: { processedWebhookEvent: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a) } } }));

import { scheduleWebhookEventPruneJob } from '../jobs/webhookEventPruneJob';

it("excludes ids starting with 'one-time:' from the 30 day prune (and keeps the existing marker exclusions)", async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockDeleteMany.mockResolvedValue({ count: 0 });
  scheduleWebhookEventPruneJob();
  expect(captured).not.toBeNull();
  await captured!();
  const where = mockDeleteMany.mock.calls[0][0].where;
  const thirtyDay = where.OR[0];
  expect(thirtyDay.NOT).toEqual(expect.arrayContaining([
    { eventId: { startsWith: 'one-time:' } },
    { eventId: { startsWith: 'sold-unit:' } },
    { eventId: { startsWith: 'square-dispute-step:' } },
  ]));
  // the one-year branch never names one-time markers either, so they are never deleted at all
  expect(JSON.stringify(where.OR[1])).not.toContain('one-time:');
});
