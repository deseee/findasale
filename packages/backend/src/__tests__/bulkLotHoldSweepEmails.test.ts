/**
 * bulkLotHoldSweepEmails (ADR-136 Addendum D, roadmap #659): the 5 minute hold sweep job runs the expiry pass AND the reminder pass,
 * hands the expiry pass the "hold ended" email hook, and does nothing at all with the flag off or the kill switch on.
 * A failing reminder pass never fails the run.
 */
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../lib/prisma', () => ({ prisma: { marker: 'prisma' } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_opts: any, fn: any) => fn }));
jest.mock('../services/bulkLot/bulkLotEbayWiring', () => ({ reconcileBulkLotEbayInBackgroundIfEnabled: jest.fn() }));
jest.mock('../services/bulkLot/bulkLotHoldEmailWiring', () => ({
  liveReminderDeps: { canEmail: jest.fn(), sendReminder: jest.fn() },
  onBulkHoldEnded: jest.fn(),
}));
jest.mock('../services/bulkLot/bulkLotHoldService', () => ({
  sweepExpiredBulkHolds: jest.fn(async () => ({ examined: 0, expired: 0, waitingOnInvoice: 0, paidAnomalies: 0 })),
  sweepHoldReminders: jest.fn(async () => ({ examined: 0, skipped: 0, lostClaim: 0, claimed: 0 })),
}));

import cron from 'node-cron';
import { runBulkLotHoldSweep } from '../jobs/bulkLotHoldSweepJob';
import { sweepExpiredBulkHolds, sweepHoldReminders } from '../services/bulkLot/bulkLotHoldService';
import { liveReminderDeps, onBulkHoldEnded } from '../services/bulkLot/bulkLotHoldEmailWiring';

const expirySweep = sweepExpiredBulkHolds as unknown as jest.Mock;
const reminderSweep = sweepHoldReminders as unknown as jest.Mock;

const saved = { flag: process.env.CARD_BULK_LOTS_ENABLED, kill: process.env.BULK_HOLD_SWEEP_DISABLED };

beforeEach(() => {
  expirySweep.mockClear();
  reminderSweep.mockClear();
  delete process.env.CARD_BULK_LOTS_ENABLED;
  delete process.env.BULK_HOLD_SWEEP_DISABLED;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  if (saved.flag === undefined) delete process.env.CARD_BULK_LOTS_ENABLED;
  else process.env.CARD_BULK_LOTS_ENABLED = saved.flag;
  if (saved.kill === undefined) delete process.env.BULK_HOLD_SWEEP_DISABLED;
  else process.env.BULK_HOLD_SWEEP_DISABLED = saved.kill;
});

describe('bulkLotHoldSweepJob', () => {
  it('schedules one cron run every 5 minutes', () => {
    const calls = (cron.schedule as unknown as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('2,7,12,17,22,27,32,37,42,47,52,57 * * * *');
  });

  it('does nothing with the flag off: no expiry pass, no reminder pass, no email', async () => {
    await runBulkLotHoldSweep();
    expect(expirySweep).not.toHaveBeenCalled();
    expect(reminderSweep).not.toHaveBeenCalled();
    expect(onBulkHoldEnded).not.toHaveBeenCalled();
  });

  it('does nothing with the kill switch on', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    process.env.BULK_HOLD_SWEEP_DISABLED = '1';
    await runBulkLotHoldSweep();
    expect(expirySweep).not.toHaveBeenCalled();
    expect(reminderSweep).not.toHaveBeenCalled();
  });

  it('with the flag on, runs the expiry pass with the ended-email hook and then the reminder pass with the live deps', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    await runBulkLotHoldSweep();
    expect(expirySweep).toHaveBeenCalledTimes(1);
    expect(expirySweep.mock.calls[0][1]).toEqual({ onEnded: onBulkHoldEnded });
    expect(reminderSweep).toHaveBeenCalledTimes(1);
    expect(reminderSweep.mock.calls[0][1]).toBe(liveReminderDeps);
  });

  it('a reminder pass that fails never fails the run', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    reminderSweep.mockRejectedValueOnce(new Error('db blip'));
    await expect(runBulkLotHoldSweep()).resolves.toBeUndefined();
    expect(expirySweep).toHaveBeenCalledTimes(1);
  });
});
