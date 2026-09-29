/**
 * "Auto-markdown cycles paused" downgrade notice (2026-09-29, Patrick D1). NOT EXECUTED when
 * written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockCycleCount = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockItemCount = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock('../prisma', () => ({
  prisma: {
    markdownCycle: { count: (...a: any[]) => mockCycleCount(...a) },
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      update: (...a: any[]) => mockOrganizerUpdate(...a),
    },
    item: { count: (...a: any[]) => mockItemCount(...a) },
  },
}));
jest.mock('../notificationService', () => ({
  createNotification: (...a: any[]) => mockCreateNotification(...a),
}));

import { notifyAutoMarkdownsPaused, syncTier } from '../syncTier';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockCreateNotification.mockResolvedValue({});
  mockOrganizerUpdate.mockResolvedValue({});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const flush = () => new Promise((r) => setImmediate(r));

describe('notifyAutoMarkdownsPaused', () => {
  it('sends nothing when the organizer has no active cycle (day-tier markdown is free and not paused)', async () => {
    mockCycleCount.mockResolvedValue(0);
    await notifyAutoMarkdownsPaused('org_1');
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockItemCount).not.toHaveBeenCalled();
  });

  it('notifies the owner with the discounted item count and never touches cycles or prices', async () => {
    mockCycleCount.mockResolvedValue(2);
    mockOrganizerFindUnique.mockResolvedValue({ userId: 'user_1' });
    mockItemCount.mockResolvedValue(7);
    await notifyAutoMarkdownsPaused('org_1');
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const arg = mockCreateNotification.mock.calls[0][0];
    expect(arg.userId).toBe('user_1');
    expect(arg.type).toBe('AUTO_MARKDOWNS_PAUSED');
    expect(arg.sendEmail).toBe(true);
    expect(arg.body).toContain('7 items are currently discounted');
    expect(arg.body).toContain('2 automatic markdown cycles are paused');
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('copy rules: no em dash, no "AI", no "estate sale"', async () => {
    mockCycleCount.mockResolvedValue(1);
    mockOrganizerFindUnique.mockResolvedValue({ userId: 'user_1' });
    mockItemCount.mockResolvedValue(1);
    await notifyAutoMarkdownsPaused('org_1');
    const arg = mockCreateNotification.mock.calls[0][0];
    const text = `${arg.title} ${arg.body} ${arg.emailSubject}`;
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text.toLowerCase()).not.toContain('estate sale');
  });

  it('swallows every error', async () => {
    mockCycleCount.mockRejectedValue(new Error('db down'));
    await expect(notifyAutoMarkdownsPaused('org_1')).resolves.toBeUndefined();

    mockCycleCount.mockResolvedValue(1);
    mockOrganizerFindUnique.mockResolvedValue({ userId: 'user_1' });
    mockItemCount.mockResolvedValue(0);
    mockCreateNotification.mockRejectedValue(new Error('mail down'));
    await expect(notifyAutoMarkdownsPaused('org_1')).resolves.toBeUndefined();
  });
});

describe('syncTier hook', () => {
  it('fires the notice on a PRO -> SIMPLE cancel', async () => {
    mockOrganizerFindUnique
      .mockResolvedValueOnce({ subscriptionTier: 'PRO' }) // previous tier lookup in syncTier
      .mockResolvedValueOnce({ userId: 'user_1' }); // owner lookup in the notice
    mockCycleCount.mockResolvedValue(1);
    mockItemCount.mockResolvedValue(3);
    await syncTier('org_1', 'canceled', null, null);
    await flush();
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('does not fire for an organizer that was already SIMPLE (repeat webhook)', async () => {
    mockOrganizerFindUnique.mockResolvedValueOnce({ subscriptionTier: 'SIMPLE' });
    await syncTier('org_1', 'canceled', null, null);
    await flush();
    expect(mockCycleCount).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
