import { Request, Response } from 'express';
// Same singleton as '../index' (index.ts re-exports './lib/prisma'); importing it from here keeps this
// controller loadable without booting the Express entry point (tests, scripts).
import { prisma } from '../lib/prisma';
import twilio from 'twilio';
import { AuthRequest } from '../middleware/auth';
import { handleEarlyBirdBadge, handleExplorerBadge } from './userController';
import {
  cleanSmsText,
  sendCompliantSms,
  sendCompliantSmsBatch,
} from '../services/compliantSms';
import type { SmsBatchOptions, SmsBatchResult } from '../services/compliantSms';
import { describeAllowedWindow } from '../services/smsComplianceService';
import { maskPhoneDisplay } from '../utils/logMask';

// Initialize Twilio client only if credentials are available
let twilioClient: ReturnType<typeof twilio> | null = null;
const initTwilio = () => {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.info('✅ Twilio client initialized for line controller');
    } catch (error) {
      console.warn('⚠️ Failed to initialize Twilio client for line controller:', error);
      twilioClient = null;
    }
  } else if (!twilioClient) {
    console.warn('Twilio credentials not found - SMS features will be disabled');
  }
};

// initTwilio() is no longer called at load (2026-09-29): every line text now goes through
// services/compliantSms.ts, which owns its own lazy Twilio client. The function stays (nothing removed).
// initTwilio();

/**
 * DEAD / DISABLED (2026-09-29): the old raw sender. It texted any stored number with no consent check,
 * no STOP-list check, no quiet hours, no sender prefix or STOP footer, no daily cap and no SmsSendLog row,
 * and it logged the full phone number. Kept only so nothing that references it breaks; it no longer
 * sends. Use sendCompliantSms / sendCompliantSmsBatch from services/compliantSms.ts.
 */
const sendSMS = async (_to: string, _body: string): Promise<void> => {
  console.warn('[lineController] sendSMS() is disabled: use services/compliantSms.ts (sendCompliantSms).');
  void initTwilio;
  void twilioClient;
};

/**
 * Line texts are transactional messages about a sale the shopper opted in to text updates for, so they
 * follow the same consent rule as organizer updates: SaleSubscriber.smsConsentAt must be set (double
 * opt-in). Decision (2026-09-29): joining the virtual line does NOT count as consent, because the join
 * flow (POST /lines/:saleId/join) takes no phone number; it only looks up the number already stored on the
 * shopper's sale subscription. No confirmed consent means no text (the shopper still sees their place on
 * the sale page). Bulk texts (/start, /notify) respect quiet hours; the one-to-one "you are next" and
 * "you joined" texts do not, because they answer something the shopper is doing at that moment.
 */
const lineSmsContext = (
  organizer: { id: string; businessName?: string | null; timezone?: string | null; subscriptionTier?: unknown },
  saleId: string,
  over: Partial<SmsBatchOptions> = {}
): SmsBatchOptions => ({
  organizerId: organizer.id,
  saleId,
  orgName: organizer.businessName ?? null,
  orgTimeZone: organizer.timezone ?? null,
  orgTier: organizer.subscriptionTier,
  minTier: 'PRO',
  ...over,
});

/** Counts only, never phone numbers. */
const summarizeSms = (r: SmsBatchResult) => ({
  sent: r.sent,
  failed: r.failed,
  blocked: r.blocked,
  skippedNoConsent: r.skippedNoConsent,
  skippedInvalidPhone: r.skippedInvalidPhone,
  skippedOptedOut: r.skippedOptedOut,
  skippedByCap: r.skippedByCap,
  remainingToday: r.remainingToday,
});

// Helper: verify the authenticated user is an organizer of the given sale
const getOrganizerForSale = async (userId: string, saleId: string) => {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) return null;
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale || sale.organizerId !== organizer.id) return null;
  return { organizer, sale };
};

// ─── ORGANIZER: Start the line for a sale ────────────────────
export const startLine = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const ctx = await getOrganizerForSale(req.user.id, saleId);
    if (!ctx) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Clear any existing line entries for this sale
    await prisma.lineEntry.deleteMany({ where: { saleId } });

    // Get subscribers with phone numbers (opted in to SMS)
    const subscribers = await prisma.saleSubscriber.findMany({
      where: { saleId, phone: { not: null }, userId: { not: null } },
      take: 1000,
    });

    // Create line entries
    const lineEntries: Awaited<ReturnType<typeof prisma.lineEntry.create>>[] = [];
    for (let i = 0; i < subscribers.length; i++) {
      const entry = await prisma.lineEntry.create({
        data: {
          saleId,
          userId: subscribers[i].userId!, // userId filtered to non-null above
          position: i + 1,
          status: 'WAITING',
        },
      });
      lineEntries.push(entry);
    }

    // Notify subscribers of their position (compliant path: consent, STOP list, quiet hours, prefix +
    // STOP footer, daily cap with partial send, SmsSendLog). Only subscribers with confirmed consent are texted.
    const positionByUser = new Map(lineEntries.map((e) => [e.userId, e.position]));
    const lineTitle = cleanSmsText(ctx.sale.title, 40);
    const smsResult = await sendCompliantSmsBatch(
      subscribers
        .filter((subscriber) => !!subscriber.phone)
        .map((subscriber) => {
          const position = positionByUser.get(subscriber.userId as string);
          return {
            to: subscriber.phone as string,
            consentAt: subscriber.smsConsentAt,
            message: `The virtual line for "${lineTitle}" is now open! You are #${position} in line. We'll text you when it's your turn.`,
            altMessage: `The line is open! You are #${position} in line. We'll text you when it's your turn.`,
          };
        }),
      lineSmsContext(ctx.organizer, saleId, { exclusive: true, logMessage: '[line] line opened' })
    );

    res.json({
      message: 'Line started successfully',
      lineCount: lineEntries.length,
      entries: lineEntries,
      sms: summarizeSms(smsResult),
      ...(smsResult.blocked === 'quiet_hours'
        ? { smsNote: `Texts were not sent because they can only go out between ${describeAllowedWindow()} (${smsResult.timeZone}).` }
        : {}),
    });
  } catch (error) {
    console.error('Error starting line:', error);
    res.status(500).json({ message: 'Failed to start line' });
  }
};

// ─── ORGANIZER: Call the next person in line ──────────────────
export const callNext = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const ctx = await getOrganizerForSale(req.user.id, saleId);
    if (!ctx) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Get next waiting entry
    const nextEntry = await prisma.lineEntry.findFirst({
      where: { saleId, status: 'WAITING' },
      orderBy: { position: 'asc' },
    });

    if (!nextEntry) {
      return res.status(404).json({ message: 'No one is waiting in line' });
    }

    // Update to NOTIFIED (corrected: was CALLED in previous version)
    const updatedEntry = await prisma.lineEntry.update({
      where: { id: nextEntry.id },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
    });

    // Look up the subscriber's phone
    const subscriber = await prisma.saleSubscriber.findUnique({
      where: { saleId_userId: { userId: nextEntry.userId, saleId } },
    });

    // One-to-one, real time: not held back by quiet hours (see lineSmsContext). Still needs confirmed consent.
    let smsOutcome: string = 'skipped_no_phone';
    if (subscriber?.phone) {
      const turnTitle = cleanSmsText(ctx.sale.title, 40);
      const sent = await sendCompliantSms(
        {
          to: subscriber.phone,
          consentAt: subscriber.smsConsentAt,
          message: `It's your turn at "${turnTitle}"! Please proceed to the entrance now.`,
          altMessage: `It's your turn! Please proceed to the entrance now.`,
        },
        lineSmsContext(ctx.organizer, saleId, { enforceQuietHours: false, logMessage: '[line] your turn' })
      );
      smsOutcome = sent.outcome;
    }

    res.json({ message: 'Next person notified', entry: updatedEntry, smsOutcome });
  } catch (error) {
    console.error('Error calling next person:', error);
    res.status(500).json({ message: 'Failed to call next person' });
  }
};

// ─── ORGANIZER: Get full line status ────────────────────
export const getLineStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const ctx = await getOrganizerForSale(req.user.id, saleId);
    if (!ctx) {
      return res.status(403).json({ message: 'Not authorized to view this sale' });
    }

    const entries = await prisma.lineEntry.findMany({
      where: { saleId },
      include: {
        user: { select: { name: true, phone: true } },
      },
      orderBy: { position: 'asc' },
      take: 500,
    });

    // Never send shoppers' phone numbers to the organizer's browser (2026-09-29): masked form only.
    res.json(
      entries.map((entry) => ({
        ...entry,
        user: entry.user ? { ...entry.user, phone: maskPhoneDisplay(entry.user.phone) } : entry.user,
      }))
    );
  } catch (error) {
    console.error('Error fetching line status:', error);
    res.status(500).json({ message: 'Failed to fetch line status' });
  }
};

// ─── ORGANIZER: Mark a person as entered ───────────────────
export const markAsEntered = async (req: AuthRequest, res: Response) => {
  try {
    const { lineEntryId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const entry = await prisma.lineEntry.findUnique({
      where: { id: lineEntryId },
      include: {
        sale: { select: { organizerId: true, title: true, id: true } },
        user: { select: { id: true } },
      },
    });

    if (!entry) return res.status(404).json({ message: 'Line entry not found' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer || entry.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Update to ENTERED (corrected: was SERVED in previous version)
    const updatedEntry = await prisma.lineEntry.update({
      where: { id: lineEntryId },
      data: { status: 'ENTERED', enteredAt: new Date() },
    });

    // Award badges
    if (entry.user) {
      await handleEarlyBirdBadge(entry.user.id, new Date());
      await handleExplorerBadge(entry.user.id);
    }

    const waitingCount = await prisma.lineEntry.count({
      where: { saleId: entry.sale.id, status: 'WAITING' },
    });

    res.json({
      message: 'Person marked as entered',
      entry: updatedEntry,
      waitingCount,
    });
  } catch (error) {
    console.error('Error marking person as entered:', error);
    res.status(500).json({ message: 'Failed to mark person as entered' });
  }
};

// ─── ORGANIZER: Broadcast SMS position updates to all waiting people ──────
export const broadcastPositionUpdates = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const ctx = await getOrganizerForSale(req.user.id, saleId);
    if (!ctx) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    const waitingEntries = await prisma.lineEntry.findMany({
      where: { saleId, status: 'WAITING' },
      orderBy: { position: 'asc' },
      take: 500,
    });

    // One query for every waiting shopper's subscription instead of one per entry.
    const subscribers = await prisma.saleSubscriber.findMany({
      where: { saleId, userId: { in: waitingEntries.map((e) => e.userId) } },
      select: { userId: true, phone: true, smsConsentAt: true },
    });
    const subscriberByUser = new Map<string, { phone: string | null; smsConsentAt: Date | null }>(subscribers.filter((s) => !!s.userId).map((s) => [s.userId as string, s] as const));
    const updateTitle = cleanSmsText(ctx.sale.title, 40);
    const smsResult = await sendCompliantSmsBatch(
      waitingEntries.flatMap((entry) => {
        const subscriber = subscriberByUser.get(entry.userId);
        if (!subscriber?.phone) return [];
        return [
          {
            to: subscriber.phone,
            consentAt: subscriber.smsConsentAt,
            message: `Update for "${updateTitle}": You are now #${entry.position} in line. We'll notify you when it's your turn.`,
            altMessage: `You are now #${entry.position} in line. We'll notify you when it's your turn.`,
          },
        ];
      }),
      lineSmsContext(ctx.organizer, saleId, { exclusive: true, logMessage: '[line] position update' })
    );

    if (smsResult.blocked) {
      const blocked: Record<string, { status: number; message: string }> = {
        tier: { status: 403, message: 'Line texts require the PRO plan or higher.' },
        no_organizer: { status: 403, message: 'Organizer profile not found.' },
        not_configured: { status: 503, message: 'SMS service not configured.' },
        quiet_hours: { status: 422, message: `Texts can only be sent between ${describeAllowedWindow()} (${smsResult.timeZone}).` },
        opt_out_lookup_failed: { status: 503, message: 'Could not verify the text opt-out list. Nothing was sent. Try again shortly.' },
        in_progress: { status: 409, message: 'A text update is already being sent. Wait for it to finish.' },
        cap_reached: { status: 429, message: `You have reached today's limit of ${smsResult.dailyCap} text messages. It resets on a rolling 24 hour basis.` },
        reservation_failed: { status: 503, message: 'Could not reserve text allowance. Nothing was sent. Try again shortly.' },
      };
      const b = blocked[smsResult.blocked];
      return res.status(b.status).json({
        message: b.message,
        code: smsResult.blocked.toUpperCase(),
        smsSent: 0,
        totalWaiting: waitingEntries.length,
        sms: summarizeSms(smsResult),
      });
    }

    res.json({
      message: 'Position updates sent',
      smsSent: smsResult.sent,
      totalWaiting: waitingEntries.length,
      sms: summarizeSms(smsResult),
    });
  } catch (error) {
    console.error('Error broadcasting position updates:', error);
    res.status(500).json({ message: 'Failed to broadcast position updates' });
  }
};

// ─── SHOPPER: Join the line for a sale ───────────────────
export const joinLine = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status !== 'PUBLISHED') {
      return res.status(400).json({ message: 'Line is not open for this sale' });
    }

    // Check if user is already in line
    const existing = await prisma.lineEntry.findUnique({
      where: { saleId_userId: { saleId, userId: req.user.id } },
    });
    if (existing && existing.status !== 'CANCELLED') {
      return res.status(409).json({
        message: 'You are already in line',
        position: existing.position,
        status: existing.status,
      });
    }

    // Get current max position
    const lastEntry = await prisma.lineEntry.findFirst({
      where: { saleId },
      orderBy: { position: 'desc' },
    });
    const position = (lastEntry?.position ?? 0) + 1;

    // Upsert so that a previously-cancelled entry can rejoin
    let entry;
    if (existing) {
      entry = await prisma.lineEntry.update({
        where: { id: existing.id },
        data: { position, status: 'WAITING' },
      });
    } else {
      entry = await prisma.lineEntry.create({
        data: { saleId, userId: req.user.id, position, status: 'WAITING' },
      });
    }

    // Send SMS confirmation if subscriber has phone
    const subscriber = await prisma.saleSubscriber.findUnique({
      where: { saleId_userId: { userId: req.user.id, saleId } },
    });
    if (subscriber?.phone) {
      // The shopper just tapped Join, so this confirmation is real time (no quiet hours), but it still
      // needs confirmed consent, the STOP list, the organizer's PRO tier and the daily cap.
      const organizer = await prisma.organizer.findUnique({
        where: { id: sale.organizerId },
        select: { id: true, businessName: true, timezone: true, subscriptionTier: true },
      });
      if (organizer) {
        const joinTitle = cleanSmsText(sale.title, 40);
        await sendCompliantSms(
          {
            to: subscriber.phone,
            consentAt: subscriber.smsConsentAt,
            message: `You've joined the virtual line for "${joinTitle}"! You are #${position} in line. We'll text you when it's your turn.`,
            altMessage: `You joined the line! You are #${position}. We'll text you when it's your turn.`,
          },
          lineSmsContext(organizer, saleId, { enforceQuietHours: false, logMessage: '[line] joined' })
        );
      }
    }

    res.status(201).json({
      message: 'Joined line successfully',
      position: entry.position,
      status: entry.status,
    });
  } catch (error) {
    console.error('Error joining line:', error);
    res.status(500).json({ message: 'Failed to join line' });
  }
};

// ─── SHOPPER: Check position in line ───────────────────
export const getMyPosition = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const entry = await prisma.lineEntry.findUnique({
      where: { saleId_userId: { saleId, userId: req.user.id } },
    });

    if (!entry) {
      return res.status(404).json({ message: 'You are not in this line' });
    }

    // Count how many people are ahead in WAITING status
    const ahead = await prisma.lineEntry.count({
      where: { saleId, status: 'WAITING', position: { lt: entry.position } },
    });

    res.json({
      position: entry.position,
      aheadOfYou: ahead,
      status: entry.status,
    });
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ message: 'Failed to fetch position' });
  }
};

// ─── SHOPPER: Leave the line ─────────────────────
export const leaveLine = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const entry = await prisma.lineEntry.findUnique({
      where: { saleId_userId: { saleId, userId: req.user.id } },
    });

    if (!entry || entry.status === 'CANCELLED') {
      return res.status(404).json({ message: 'You are not in this line' });
    }

    await prisma.lineEntry.update({
      where: { id: entry.id },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Left line successfully' });
  } catch (error) {
    console.error('Error leaving line:', error);
    res.status(500).json({ message: 'Failed to leave line' });
  }
};
