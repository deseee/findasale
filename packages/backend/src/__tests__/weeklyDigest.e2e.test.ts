/**
 * RUNNER CONVERSION NOTE (2026-08-16) -- read before editing.
 *
 * This file was STRUCTURALLY DEAD from the day it was written until 2026-08-16. It had never
 * executed even once. Two independent reasons:
 *   1. packages/backend/package.json sets jest.testMatch = ["**\/__tests__/**\/*.test.ts"].
 *      This file was named `weeklyDigest.e2e.ts` -- no `.test.ts` suffix -- so jest never collected it.
 *   2. It imported `describe/it/expect/vi` from `vitest`, which is not a dependency of this
 *      repo at all. The runner is ts-jest. That import would have thrown on first execution.
 *
 * Fixed by renaming to `weeklyDigest.e2e.test.ts` and converting the vitest API to Jest:
 *   - the `from 'vitest'` import removed (jest globals are ambient, typed by @types/jest)
 *   - `vi.` -> `jest.`
 *   - `vi.hoisted(() => X)` -> plain `var` declaration. Jest has no `hoisted`; `var` (not `const`)
 *     is deliberate -- ts-jest hoists `jest.mock()` above these declarations, and `var` yields
 *     `undefined` rather than a TDZ ReferenceError if a mock factory is evaluated early.
 *   - `import { prisma } from '../index'` -> `'../lib/prisma'`. `../index` is the Express entry
 *     point: importing it boots the HTTP server, Socket.io, Redis, Sentry and ~80 cron jobs.
 *     index.ts:291 just re-exports the same singleton from lib/prisma, so this is the identical
 *     object without the server boot.
 *
 * These conversions are MECHANICAL and UNVERIFIED. They have not been run -- not locally (this
 * session's pnpm store and typescript symlink are broken, jest cannot start) and not in CI
 * before landing. The assertions inside were written against the API as it stood when the file
 * was authored and have never once been checked against the current code. Expect failures; they
 * are real information, not noise. This suite runs in a NON-BLOCKING CI step for exactly that
 * reason -- see .github/workflows/ci-typecheck.yml. Triage the failures and make it blocking.
 */
/**
 * E2E Tests for Weekly Digest Email
 *
 * Verifies that sendWeeklyDigest:
 * - Sends to all users with email when published sales exist
 * - Includes correct subject, from, and HTML content (title, address, organizer, CTA)
 * - Skips gracefully when no published sales are in the 7-day window
 * - Continues processing after a per-user send failure
 *
 * Manual step required before closing issue #2:
 * - Deploy to staging, run `sendWeeklyDigest()` once, and confirm delivery in Resend dashboard.
 */

import { prisma } from '../lib/prisma';

// jest.hoisted ensures the mock function is available before jest.mock hoisting
var mockEmailsSend = jest.fn().mockResolvedValue({ id: 'mock-email-id-digest', error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

// Import after mocks are set up
import { sendWeeklyDigest } from '../controllers/notificationController';

describe('Weekly Digest E2E', () => {
  let testOrganizer: any;
  let testUser: any;
  let testSale: any;

  beforeAll(async () => {
    process.env.SMTP_USERNAME = 'test_smtp_user_digest_e2e';
    process.env.SES_FROM_EMAIL = 'digest@finda.sale';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    testOrganizer = await prisma.organizer.create({
      data: {
        businessName: 'E2E Digest Test Sales',
        phone: '5559990001',
        address: '789 Elm St',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        userId: 'test-user-org-digest-e2e',
      },
    });

    testUser = await prisma.user.create({
      data: {
        id: 'test-digest-shopper-e2e',
        email: 'digest-e2e@findasale.test',
        name: 'Digest E2E Shopper',
        password: 'hashed_password',
        role: 'USER',
      },
    });

    // PUBLISHED sale starting in 3 days — within the 7-day digest window
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 3);
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

    testSale = await prisma.sale.create({
      data: {
        title: 'E2E Weekly Digest Test Sale',
        description: 'Created by weeklyDigest.e2e.ts — safe to delete',
        address: '789 Elm St',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        latitude: 42.9629,
        longitude: -85.6789,
        startDate,
        endDate,
        status: 'PUBLISHED',
        organizerId: testOrganizer.id,
      },
    });

    console.log('✓ Weekly digest test data created');
  });

  afterAll(async () => {
    if (testSale) await prisma.sale.delete({ where: { id: testSale.id } }).catch(() => {});
    if (testUser) await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    if (testOrganizer) await prisma.organizer.delete({ where: { id: testOrganizer.id } }).catch(() => {});
    delete process.env.SMTP_USERNAME;
    delete process.env.SES_FROM_EMAIL;
    delete process.env.FRONTEND_URL;
    console.log('✓ Weekly digest test data cleaned up');
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  describe('when published sales exist within the 7-day window', () => {
    beforeAll(() => mockEmailsSend.mockClear());

    it('should call Resend at least once', async () => {
      await sendWeeklyDigest();
      expect(mockEmailsSend).toHaveBeenCalled();
      console.log(`✓ Resend called ${mockEmailsSend.mock.calls.length} time(s)`);
    });

    it('should address an email to the test user', async () => {
      const recipients = mockEmailsSend.mock.calls.map((c) => c[0].to as string);
      expect(recipients).toContain(testUser.email);
      console.log(`✓ Email addressed to ${testUser.email}`);
    });

    it('should send from the configured from address', async () => {
      const call = mockEmailsSend.mock.calls[0][0];
      expect(call.from).toBe('digest@finda.sale');
    });

    it('should use a subject that references the sale count and emoji', async () => {
      const call = mockEmailsSend.mock.calls[0][0];
      expect(call.subject).toMatch(/🏷️/);
      expect(call.subject).toMatch(/estate sale/i);
      console.log(`✓ Subject: "${call.subject}"`);
    });

    // ── HTML content checks ─────────────────────────────────────────────────

    it('should include the sale title in the HTML body', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain(testSale.title);
      console.log(`✓ HTML contains sale title "${testSale.title}"`);
    });

    it('should include the sale address in the HTML body', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain(testSale.address);
      expect(call[0].html).toContain(testSale.city);
    });

    it('should include the organizer business name in the HTML body', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain(testOrganizer.businessName);
      console.log(`✓ Organizer "${testOrganizer.businessName}" present in HTML`);
    });

    it('should include a CTA link to the sale page', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain(`/sales/${testSale.id}`);
      console.log(`✓ CTA link /sales/${testSale.id} present`);
    });

    it('should include footer links to dashboard and all-sales page', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain('/shopper/dashboard');
      expect(call[0].html).toContain('http://localhost:3000');
    });

    it('should include a personalized greeting with the user name', async () => {
      const call = mockEmailsSend.mock.calls.find((c) => c[0].to === testUser.email)!;
      expect(call[0].html).toContain(testUser.name);
      console.log(`✓ Personalized greeting includes "${testUser.name}"`);
    });
  });

  // ─── No sales → skip ────────────────────────────────────────────────────────

  describe('when no published sales exist in the 7-day window', () => {
    beforeAll(async () => {
      await prisma.sale.update({ where: { id: testSale.id }, data: { status: 'DRAFT' } });
      mockEmailsSend.mockClear();
    });

    afterAll(async () => {
      await prisma.sale.update({ where: { id: testSale.id }, data: { status: 'PUBLISHED' } });
    });

    it('should not call Resend', async () => {
      await sendWeeklyDigest();
      expect(mockEmailsSend).not.toHaveBeenCalled();
      console.log('✓ Digest skipped — no published sales in window');
    });

    it('should resolve without throwing', async () => {
      await expect(sendWeeklyDigest()).resolves.not.toThrow();
    });
  });

  // ─── Per-user send failure → continue ──────────────────────────────────────

  describe('when one Resend send call fails', () => {
    beforeAll(() => {
      mockEmailsSend
        .mockRejectedValueOnce(new Error('Resend: simulated delivery failure'))
        .mockResolvedValue({ id: 'mock-email-id-digest', error: null });
    });

    it('should not throw and should complete the run', async () => {
      await expect(sendWeeklyDigest()).resolves.not.toThrow();
      console.log('✓ Digest completed despite one send failure');
    });
  });
});
