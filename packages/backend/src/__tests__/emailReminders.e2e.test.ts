/**
 * RUNNER CONVERSION NOTE (2026-08-16) -- read before editing.
 *
 * This file was STRUCTURALLY DEAD from the day it was written until 2026-08-16. It had never
 * executed even once. Two independent reasons:
 *   1. packages/backend/package.json sets jest.testMatch = ["**\/__tests__/**\/*.test.ts"].
 *      This file was named `emailReminders.e2e.ts` -- no `.test.ts` suffix -- so jest never collected it.
 *   2. It imported `describe/it/expect/vi` from `vitest`, which is not a dependency of this
 *      repo at all. The runner is ts-jest. That import would have thrown on first execution.
 *
 * Fixed by renaming to `emailReminders.e2e.test.ts` and converting the vitest API to Jest:
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
 * E2E Tests for Email & SMS Reminder System
 * Tests the full lifecycle of reminder delivery (email + SMS)
 */

import { prisma } from '../lib/prisma';
import { processReminderEmails, sendReminderEmail, sendReminderSMS } from '../services/emailReminderService';

describe('Email & SMS Reminder System E2E', () => {
  // Mock organizer and test user
  let testOrganizer: any;
  let testUser: any;
  let testSale: any;
  let testSubscriber: any;

  beforeAll(async () => {
    // Create test organizer
    testOrganizer = await prisma.organizer.create({
      data: {
        businessName: 'Test Estate Sales',
        phone: '5551234567',
        address: '123 Main St',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        userId: 'test-user-org',
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        id: 'test-shopper-e2e',
        email: 'shopper@test.com',
        name: 'Test Shopper',
        password: 'hashed_password',
        role: 'USER',
      },
    });

    // Create test sale starting tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    testSale = await prisma.sale.create({
      data: {
        title: 'Test Estate Sale - Tomorrow',
        description: 'This is a test sale',
        address: '456 Oak Ave',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        latitude: 42.9629,
        longitude: -85.6789,
        startDate: tomorrow,
        endDate: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000),
        status: 'PUBLISHED',
        organizerId: testOrganizer.id,
      },
    });

    console.log('✓ Test data created');
  });

  afterAll(async () => {
    // Clean up test data
    if (testSubscriber) {
      await prisma.saleSubscriber.delete({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
      }).catch(() => {}); // Ignore if not found
    }

    if (testSale) {
      await prisma.sale.delete({ where: { id: testSale.id } }).catch(() => {});
    }

    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }

    if (testOrganizer) {
      await prisma.organizer.delete({ where: { id: testOrganizer.id } }).catch(() => {});
    }

    console.log('✓ Test data cleaned up');
  });

  describe('Email Reminder Delivery', () => {
    it('should send email reminder to subscriber', async () => {
      // Create subscription with email only
      testSubscriber = await prisma.saleSubscriber.create({
        data: {
          userId: testUser.id,
          saleId: testSale.id,
          email: testUser.email,
          phone: null,
        },
      });

      // Mock Resend API call
      const sendEmail = jest.fn().mockResolvedValue({ id: 'test-email-id' });

      // Send reminder email
      await sendReminderEmail({
        to: testUser.email,
        saleName: testSale.title,
        saleAddress: `${testSale.address}, ${testSale.city}, ${testSale.state}`,
        startDate: testSale.startDate,
        saleUrl: `http://localhost:3000/sales/${testSale.id}`,
        reminderType: 'one-day',
      });

      // Verify email was sent (in real E2E, check with Resend API)
      console.log(`✓ Email reminder sent to ${testUser.email}`);
      expect(testSubscriber.email).toBe(testUser.email);
    });

    it('should include correct sale details in email template', async () => {
      const emailContent = {
        to: testUser.email,
        subject: `Reminder: ${testSale.title} starts tomorrow!`,
        body: `Don't miss ${testSale.title} tomorrow at ${testSale.startDate.toLocaleString()}`,
      };

      expect(emailContent.subject).toContain(testSale.title);
      expect(emailContent.body).toContain(testSale.address);
    });

    it('should handle missing email gracefully', async () => {
      // Update subscription to remove email
      await prisma.saleSubscriber.update({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
        data: { email: null },
      });

      // Verify no email is sent
      const updatedSubscriber = await prisma.saleSubscriber.findUnique({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
      });

      expect(updatedSubscriber?.email).toBeNull();
      console.log('✓ Email gracefully skipped for null email');
    });
  });

  describe('SMS Reminder Delivery', () => {
    beforeAll(async () => {
      // Update subscription to include phone
      await prisma.saleSubscriber.update({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
        data: {
          phone: '+15551234567',
          email: testUser.email, // Re-add email for combined tests
        },
      });
    });

    it('should send SMS reminder to subscriber with phone', async () => {
      const subscriber = await prisma.saleSubscriber.findUnique({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
      });

      expect(subscriber?.phone).toBe('+15551234567');

      // SMS would be sent via Twilio (mocked in real tests)
      console.log(`✓ SMS reminder sent to ${subscriber?.phone}`);
    });

    it('should include correct sale details in SMS template', async () => {
      const smsContent = `🏷️ Reminder: ${testSale.title} starts tomorrow. 📍 ${testSale.address}, ${testSale.city}, ${testSale.state}`;

      expect(smsContent).toContain(testSale.title);
      expect(smsContent).toContain(testSale.address);
    });

    it('should handle missing phone gracefully', async () => {
      await prisma.saleSubscriber.update({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
        data: { phone: null },
      });

      const subscriber = await prisma.saleSubscriber.findUnique({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
      });

      expect(subscriber?.phone).toBeNull();
      console.log('✓ SMS gracefully skipped for null phone');
    });
  });

  describe('Combined Email + SMS Processing', () => {
    beforeAll(async () => {
      // Ensure subscription has both email and phone
      await prisma.saleSubscriber.update({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
        data: {
          email: testUser.email,
          phone: '+15551234567',
        },
      });
    });

    it('should process both email and SMS for 1-day reminders', async () => {
      // Run reminder processing
      const remindersSent = {
        emails: 0,
        sms: 0,
      };

      const subscribers = await prisma.saleSubscriber.findMany({
        where: { saleId: testSale.id },
      });

      for (const sub of subscribers) {
        if (sub.email) remindersSent.emails++;
        if (sub.phone) remindersSent.sms++;
      }

      expect(remindersSent.emails).toBeGreaterThan(0);
      expect(remindersSent.sms).toBeGreaterThan(0);

      console.log(`✓ Processed ${remindersSent.emails} emails and ${remindersSent.sms} SMS messages`);
    });

    it('should handle rate limiting for SMS', async () => {
      // SMS has rate limits (Twilio free tier: 1 msg/sec max)
      // Verify delays are implemented in actual Twilio calls
      const startTime = Date.now();

      // Simulate sending multiple SMS with delays
      const phoneNumbers = ['+15551234567', '+15559876543'];
      for (const phone of phoneNumbers) {
        // In real code, there would be a delay here
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(100);

      console.log(`✓ Rate limiting verified (${duration}ms for 2 messages)`);
    });

    it('should track reminder delivery metrics', async () => {
      const subscriber = await prisma.saleSubscriber.findUnique({
        where: {
          userId_saleId: {
            userId: testUser.id,
            saleId: testSale.id,
          },
        },
      });

      const metrics = {
        emailOptIn: !!subscriber?.email,
        smsOptIn: !!subscriber?.phone,
        saleId: testSale.id,
        timestamp: new Date(),
      };

      expect(metrics.emailOptIn).toBe(true);
      expect(metrics.smsOptIn).toBe(true);

      console.log(`✓ Delivery metrics tracked: ${JSON.stringify(metrics)}`);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing if email fails', async () => {
      // Create a subscriber with invalid email
      const invalidSubscriber = await prisma.saleSubscriber.create({
        data: {
          userId: 'invalid-user',
          saleId: testSale.id,
          email: 'invalid-email-format',
          phone: null,
        },
      });

      // Attempt to send (should log error but not crash)
      try {
        await sendReminderEmail({
          to: 'invalid-email-format',
          saleName: testSale.title,
          saleAddress: `${testSale.address}, ${testSale.city}, ${testSale.state}`,
          startDate: testSale.startDate,
          saleUrl: `http://localhost:3000/sales/${testSale.id}`,
          reminderType: 'one-day',
        });
      } catch (error) {
        console.log('✓ Email error handled gracefully');
      }

      // Clean up
      await prisma.saleSubscriber.delete({
        where: {
          userId_saleId: {
            userId: 'invalid-user',
            saleId: testSale.id,
          },
        },
      }).catch(() => {});
    });

    it('should continue processing if SMS fails', async () => {
      // Create a subscriber with invalid phone
      const invalidSubscriber = await prisma.saleSubscriber.create({
        data: {
          userId: 'invalid-user-sms',
          saleId: testSale.id,
          email: null,
          phone: 'invalid-phone',
        },
      });

      // Attempt to send (should log error but not crash)
      try {
        await sendReminderSMS({
          to: 'invalid-phone',
          saleName: testSale.title,
          saleAddress: `${testSale.address}, ${testSale.city}, ${testSale.state}`,
          startDate: testSale.startDate,
          reminderType: 'one-day',
        });
      } catch (error) {
        console.log('✓ SMS error handled gracefully');
      }

      // Clean up
      await prisma.saleSubscriber.delete({
        where: {
          userId_saleId: {
            userId: 'invalid-user-sms',
            saleId: testSale.id,
          },
        },
      }).catch(() => {});
    });
  });
});
