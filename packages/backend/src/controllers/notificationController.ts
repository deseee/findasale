import { Request, Response } from 'express';
import twilio from 'twilio';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { emailService } from '../lib/emailService';
import {
  SMS_CONSENT_PENDING_TTL_MS,
  SMS_CONSENT_SOURCE_DOUBLE_OPT_IN,
  SMS_CONSENT_VERSION,
  SMS_MAX_ORGANIZER_MESSAGE_CHARS,
  SMS_MAX_SEGMENTS,
  checkQuietHours,
  composeSmsBody,
  describeAllowedWindow,
  estimateSmsSegments,
  SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY,
  SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR,
  getSentInLast24h,
  getSmsDailyCap,
  getSmsFraming,
  isConfirmationThrottled,
  isPhoneOptedOut,
  loadSmsAudience,
  normalizePhoneE164,
  phoneStorageVariants,
  resolveSendTimeZone,
} from '../services/smsComplianceService';
import { sendCompliantSmsBatch, sendConsentConfirmationSms } from '../services/compliantSms';
import { getClientIp } from '../utils/getClientIp';
import { escapeHtml, safeHttpsUrl } from '../utils/htmlEscape';
import { maskEmail, safeErrorForLog } from '../utils/logMask';

// Lazy-loaded Twilio client
let _twilioClient: any = null;
const getTwilioClient = () => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      try {
        _twilioClient = twilio(accountSid, authToken);
        console.info('✅ Twilio client initialized');
      } catch (error) {
        console.warn('⚠️ Failed to initialize Twilio client:', error);
        _twilioClient = null;
      }
    } else {
      console.warn('⚠️ Twilio credentials missing - SMS features will be disabled');
    }
  }
  return _twilioClient;
};

const EMAIL_FORMAT = /^[^\s@<>",;:()\[\]\\]+@[^\s@<>",;:()\[\]\\]+\.[^\s@<>",;:()\[\]\\]{2,}$/;
/**
 * Confirmation texts to one number across ALL sales, organizers and accounts (stops one number being texted repeatedly
 * by someone typing a victim's number on many sale pages): at most 3 per rolling day and 2 per rolling hour. Counted
 * from the SmsSendLog confirmation ledger keyed by a hashed phone (services/smsComplianceService) with NO exclusion of
 * the caller's own rows, plus the pending SaleSubscriber rows for the number (covers a request whose text has not been
 * logged yet). Over the cap the answer is identical to any other request (no oracle).
 */
const MAX_CONFIRMATION_TEXTS_PER_PHONE_PER_DAY = SMS_CONFIRMATION_MAX_PER_PHONE_PER_DAY;
const MAX_CONFIRMATION_TEXTS_PER_PHONE_PER_HOUR = SMS_CONFIRMATION_MAX_PER_PHONE_PER_HOUR;
/** A pending opt-in for the same sale and number is not re-texted for this long. */
const CONFIRMATION_RESEND_COOLDOWN_MS = 10 * 60 * 1000;

const SMS_PENDING_NOTICE =
  'If this number can receive texts, we sent one text to confirm. Reply YES to turn on text updates. ' +
  'If you ever replied STOP to our number, text START to it first, then try again.';

// Subscribe to sale notifications.
// Body: { saleId, phone?, email?, smsConsent? }
//  - phone (non-empty): smsConsent MUST be true. DOUBLE OPT-IN (2026-09-29): the number is stored with
//    smsConsentPendingAt (plus consent evidence: IP, user agent, copy version, source) and smsConsentAt stays
//    NULL. ONE confirmation text ("Reply YES ...") goes to that number; the inbound webhook
//    (smsWebhookController) sets smsConsentAt only when the number itself replies YES/START within 48
//    hours. A pending row is never texted (except that one confirmation). Any signed-in account can type
//    any number, so typing a number proves nothing about who owns it.
//  - The response is identical whether or not the number is already used by another account, on the STOP
//    list, or throttled (no phone-number oracle), and never echoes the number or the stored row.
//  - phone null or '': clears the number and every consent field ("turn off texts").
//  - a field that is omitted is left unchanged (it used to be wiped to null on every call).
//  - email (2026-09-30): the typed address is validated but NEVER stored. Reminders and every other email go to the
//    signed-in account's own address (User.email); a body email that differs from it is ignored, so an account holder
//    cannot point reminders at a third party. Sending email:null (or '') still turns email reminders off. There is no
//    guest/anonymous email subscription on this route (it requires a session). Signed-out visitors use POST
//    /notifications/subscribe-guest (controllers/guestSubscriptionController.ts): a PENDING row plus a confirmation
//    email (single-use token, 48 hours), and emailReminderService emails a guest row only after it is confirmed.
export const subscribeToSale = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, phone, email, smsConsent } = (req.body ?? {}) as {
      saleId?: unknown;
      phone?: unknown;
      email?: unknown;
      smsConsent?: unknown;
    };
    const userId = req.user.id;

    // Validate inputs
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Check if sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const existing = await prisma.saleSubscriber.findUnique({
      where: { saleId_userId: { userId, saleId } },
    });

    const data: Record<string, unknown> = {};
    const now = new Date();
    let smsStatus: 'NONE' | 'OFF' | 'PENDING' | 'CONFIRMED' = 'NONE';
    let confirmTo: string | null = null;

    if (email !== undefined) {
      if (email === null || (typeof email === 'string' && email.trim() === '')) {
        data.email = null;
      } else if (typeof email !== 'string' || email.trim().length > 254 || !EMAIL_FORMAT.test(email.trim())) {
        return res.status(400).json({ message: 'Enter a valid email address.', code: 'INVALID_EMAIL' });
      } else {
        // Ignore the typed address: only the account's own verified-at-signup email is ever used.
        const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const accountEmail = typeof account?.email === 'string' ? account.email.trim().toLowerCase() : '';
        data.email = accountEmail && EMAIL_FORMAT.test(accountEmail) ? accountEmail : null;
      }
    }

    if (phone !== undefined) {
      if (phone === null || (typeof phone === 'string' && phone.trim() === '')) {
        data.phone = null;
        data.smsConsentAt = null;
        data.smsConsentSource = null;
        data.smsConsentPendingAt = null;
        smsStatus = 'OFF';
      } else {
        const e164 = normalizePhoneE164(phone);
        if (!e164) {
          return res.status(400).json({ message: 'Enter a valid mobile phone number.', code: 'INVALID_PHONE' });
        }
        if (smsConsent !== true) {
          return res.status(400).json({
            message: 'Please agree to receive text messages to add your phone number.',
            code: 'SMS_CONSENT_REQUIRED',
          });
        }

        const sameNumber = existing?.phone === e164;
        if (sameNumber && existing?.smsConsentAt) {
          // Already confirmed for this number on this sale: nothing to change, nothing to send.
          smsStatus = 'CONFIRMED';
        } else if (
          sameNumber &&
          existing?.smsConsentPendingAt &&
          now.getTime() - new Date(existing.smsConsentPendingAt).getTime() < CONFIRMATION_RESEND_COOLDOWN_MS
        ) {
          // Just texted a moment ago: do not text again, do not extend the window.
          smsStatus = 'PENDING';
        } else {
          // Numbers we will not store or text (STOP list, lookup failure, too many recent confirmations) get
          // the same "pending" answer as everyone else, so the response reveals nothing about the number.
          let blocked = false;
          try {
            blocked = await isPhoneOptedOut(e164);
            // Per-number caps over ALL sales (no exclusion of the caller's own rows): the confirmation ledger first...
            if (!blocked) blocked = await isConfirmationThrottled(e164, now);
            // ...then the pending opt-in rows for the number, which exist before the text is logged.
            if (!blocked) {
              const phones = phoneStorageVariants(e164);
              const [pendingDay, pendingHour] = await Promise.all([
                prisma.saleSubscriber.count({
                  where: { phone: { in: phones }, smsConsentPendingAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
                }),
                prisma.saleSubscriber.count({
                  where: { phone: { in: phones }, smsConsentPendingAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
                }),
              ]);
              blocked =
                pendingDay >= MAX_CONFIRMATION_TEXTS_PER_PHONE_PER_DAY || pendingHour >= MAX_CONFIRMATION_TEXTS_PER_PHONE_PER_HOUR;
            }
          } catch (lookupErr) {
            console.error(`[subscribe] phone pre-check failed, treating as blocked: ${safeErrorForLog(lookupErr)}`);
            blocked = true;
          }
          smsStatus = 'PENDING';
          if (!blocked) {
            data.phone = e164;
            data.smsConsentAt = null;
            data.smsConsentPendingAt = now;
            data.smsConsentSource = SMS_CONSENT_SOURCE_DOUBLE_OPT_IN;
            data.smsConsentVersion = SMS_CONSENT_VERSION;
            data.smsConsentIp = getClientIp(req).slice(0, 64);
            data.smsConsentUserAgent = String(req.get('user-agent') ?? '').slice(0, 300) || null;
            confirmTo = e164;
            // Free the (sale, number) slot from unconfirmed holders (squatters): rows with no confirmed
            // consent whose pending window is over, or that never had one.
            await prisma.saleSubscriber.updateMany({
              where: {
                saleId,
                phone: e164,
                smsConsentAt: null,
                AND: [
                  { OR: [{ userId: null }, { userId: { not: userId } }] },
                  { OR: [{ smsConsentPendingAt: null }, { smsConsentPendingAt: { lt: new Date(now.getTime() - SMS_CONSENT_PENDING_TTL_MS) } }] },
                ],
              },
              data: { phone: null, smsConsentPendingAt: null, smsConsentSource: null },
            });
          }
        }
      }
    }

    // Create or update subscription
    const write = (payload: Record<string, unknown>) =>
      prisma.saleSubscriber.upsert({
        where: {
          saleId_userId: {
            userId,
            saleId
          }
        },
        update: payload,
        create: {
          userId,
          saleId,
          phone: null,
          email: null,
          smsConsentAt: null,
          smsConsentSource: null,
          ...payload,
        } as any,
      });

    let subscription;
    try {
      subscription = await write(data);
    } catch (error) {
      if ((error as any)?.code !== 'P2002' || confirmTo === null) throw error;
      // Another account already holds a CONFIRMED opt-in for this number on this sale. Answer exactly as
      // for a fresh number (no oracle): keep the caller's other changes, store no phone, send nothing.
      const { phone: _p, smsConsentAt: _a, smsConsentPendingAt: _pa, smsConsentSource: _s, smsConsentVersion: _v, smsConsentIp: _i, smsConsentUserAgent: _u, ...rest } = data;
      subscription = await write(rest);
      confirmTo = null;
    }

    if (confirmTo) {
      // One confirmation text. Its outcome is logged (masked) but never changes the response.
      try {
        const organizer = await prisma.organizer.findUnique({
          where: { id: sale.organizerId },
          select: { id: true, businessName: true, timezone: true },
        });
        const outcome = await sendConsentConfirmationSms({
          to: confirmTo,
          saleTitle: sale.title,
          orgName: organizer?.businessName ?? null,
          organizerId: organizer?.id ?? null,
          saleId,
          orgTimeZone: organizer?.timezone ?? null,
        });
        if (outcome !== 'sent') console.warn(`[subscribe] confirmation text not sent for sale ${saleId}: ${outcome}`);
      } catch (confirmErr) {
        console.error(`[subscribe] confirmation text failed: ${safeErrorForLog(confirmErr)}`);
      }
    }

    res.json({
      message: smsStatus === 'PENDING' ? SMS_PENDING_NOTICE : 'Subscription saved',
      smsStatus,
      subscription: { id: subscription.id, saleId: subscription.saleId },
    });
  } catch (error) {
    if ((error as any)?.code === 'P2002') {
      // Unreachable for phone conflicts (handled above without revealing them); anything else that
      // hits the unique index gets the same neutral answer.
      return res.json({ message: SMS_PENDING_NOTICE, smsStatus: 'PENDING', subscription: null });
    }
    console.error(`Error subscribing to sale: ${safeErrorForLog(error)}`);
    res.status(500).json({ message: 'Failed to subscribe to sale' });
  }
};

// Unsubscribe from sale notifications
export const unsubscribeFromSale = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user.id;

    if (!saleId) {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    await prisma.saleSubscriber.delete({
      where: {
        saleId_userId: {
          userId,
          saleId
        }
      }
    });

    res.json({ message: 'Successfully unsubscribed from sale notifications' });
  } catch (error) {
    if ((error as any)?.code === 'P2025') {
      // delete() throws P2025 when there is no such subscription: that is a 404, not a server error.
      return res.status(404).json({ message: 'You are not subscribed to this sale.' });
    }
    console.error('Error unsubscribing from sale:', error);
    res.status(500).json({ message: 'Failed to unsubscribe from sale' });
  }
};

// H10: Public one-click unsubscribe by email — no auth required (CAN-SPAM compliance)
// DEPRECATED / DEAD (2026-09-29): not mounted on any route (routes/notifications.ts does not import it), and it
// must NOT be mounted as written: it is unauthenticated and deletes every subscription for any email address
// passed in the query string, so anyone could unsubscribe anyone else. Real unsubscribes use the per-user
// token flow in controllers/unsubscribeController.ts (types 'saleReminders', 'newSales', 'all', ...).
// Kept only so nothing that references it breaks.
export const unsubscribeByEmail = async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string)?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required' });
    }
    // Delete all reminder subscriptions for this email address
    const result = await prisma.saleSubscriber.deleteMany({
      where: { email }
    });
    console.info(`Unsubscribed ${result.count} subscription(s) for ${maskEmail(email)}`);
    res.json({ message: 'Successfully unsubscribed from all sale reminders', count: result.count });
  } catch (error) {
    console.error('Error unsubscribing by email:', error);
    res.status(500).json({ message: 'Failed to unsubscribe' });
  }
};

// Get user's subscriptions
export const getUserSubscriptions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Explicit select: the row also holds consent evidence (IP address, user agent) that the browser never needs.
    const subscriptions = await prisma.saleSubscriber.findMany({
      where: { userId },
      select: {
        id: true,
        saleId: true,
        userId: true,
        phone: true,
        email: true,
        smsConsentAt: true,
        smsConsentPendingAt: true,
        smsConsentSource: true,
        emailOptOutAt: true,
        createdAt: true,
        updatedAt: true,
        sale: {
          select: {
            title: true,
            startDate: true,
            endDate: true
          }
        }
      },
      take: 50,
    });

    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: 'Failed to fetch subscriptions' });
  }
};

// Only one blast per organizer at a time (double-click / retry protection on top of the rate limiter).
// Per-process fast path only: the authoritative guard is the database-backed reservation in
// services/compliantSms.ts (exclusive RESERVED row under a Postgres advisory lock).
const sendingOrganizers = new Set<string>();
// No longer used here (sendCompliantSmsBatch owns concurrency); kept because nothing is removed.
const SMS_SEND_CONCURRENCY = 10;
void SMS_SEND_CONCURRENCY;

const isSmsConfigured = (): boolean => !!getTwilioClient() && !!process.env.TWILIO_PHONE_NUMBER;

// Send SMS update to subscribers who explicitly opted in to texts for this sale.
// Route guards (routes/notifications.ts): authenticate, requireTier('PRO'), burst + hourly rate limits.
// Compliance (services/smsComplianceService.ts): recorded consent only, STOP suppression list,
// quiet hours in the organizer's timezone, sender prefix + "Reply STOP to opt out." on every text,
// rolling 24 hour per-organizer recipient cap, segment limit, audit row per send (SmsSendLog).
export const sendSMSUpdate = async (req: AuthRequest, res: Response) => {
  let lockedOrganizerId: string | null = null;
  try {
    const { saleId, message } = (req.body ?? {}) as { saleId?: unknown; message?: unknown };
    const profile = req.user?.organizerProfile;
    const organizerId: string | undefined = profile?.id;

    if (!organizerId) {
      return res.status(403).json({ message: 'Organizer profile not found.', code: 'ORGANIZER_PROFILE_REQUIRED' });
    }

    if (typeof saleId !== 'string' || !saleId || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Sale ID and message are required' });
    }

    const text = message.trim();
    if (text.length > SMS_MAX_ORGANIZER_MESSAGE_CHARS) {
      return res.status(400).json({
        message: `Keep your message to ${SMS_MAX_ORGANIZER_MESSAGE_CHARS} characters or fewer.`,
        code: 'MESSAGE_TOO_LONG',
      });
    }
    const body = composeSmsBody(profile.businessName, text);
    const segmentInfo = estimateSmsSegments(body);
    if (segmentInfo.segments > SMS_MAX_SEGMENTS) {
      return res.status(400).json({
        message: 'That message is too long once your name and the opt-out line are added. Shorten it, or remove emoji and special characters.',
        code: 'MESSAGE_TOO_LONG',
      });
    }

    // Verify user is organizer of this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to send updates for this sale' });
    }

    if ((sale as any).status === 'ENDED') {
      return res.status(409).json({ message: 'This sale has ended. Text updates can only be sent for active sales.', code: 'SALE_ENDED' });
    }

    // Twilio must be configured
    if (!isSmsConfigured()) {
      return res.status(503).json({ message: 'SMS service not configured', code: 'SMS_NOT_CONFIGURED' });
    }

    // Quiet hours (no texts before 8 AM or from 9 PM in the organizer's timezone)
    const timeZone = resolveSendTimeZone(profile.timezone);
    const quiet = checkQuietHours(new Date(), timeZone);
    if (!quiet.allowed) {
      return res.status(422).json({
        message: `Texts can only be sent between ${describeAllowedWindow()} (${timeZone}). Try again after ${quiet.nextAllowedAt?.toISOString() ?? '8:00 AM'}.`,
        code: 'QUIET_HOURS',
        timeZone,
        nextAllowedAt: quiet.nextAllowedAt,
      });
    }

    // Fast path: one blast per organizer per process. The real guard is database-backed (an exclusive
    // RESERVED SmsSendLog row taken under a Postgres advisory lock in sendCompliantSmsBatch), so it also
    // holds across server processes and restarts.
    if (sendingOrganizers.has(organizerId)) {
      return res.status(409).json({ message: 'A text update is already being sent. Wait for it to finish.', code: 'SEND_IN_PROGRESS' });
    }
    sendingOrganizers.add(organizerId);
    lockedOrganizerId = organizerId;

    // Only shoppers with recorded consent who have not replied STOP
    const audience = await loadSmsAudience(saleId);
    if (audience.eligible.length === 0) {
      return res.json({
        message: 'No shoppers have opted in to text updates for this sale yet.',
        sentCount: 0,
        failedCount: 0,
        skippedOptOutCount: audience.optedOut,
        skippedByCapCount: 0,
        partial: false,
        audienceSize: 0,
      });
    }

    // Consent is already enforced by loadSmsAudience (smsConsentAt IS NOT NULL, STOP list applied), hence
    // requireConsent:false. Cost control is the rolling 24 hour cap: an audience larger than the remaining
    // allowance is sent PARTIALLY (earliest subscribers first) instead of being refused outright, and the
    // allowance is reserved in the database BEFORE anything is sent and reconciled afterwards.
    const result = await sendCompliantSmsBatch(
      audience.eligible.map((to) => ({ to, message: text })),
      {
        organizerId,
        saleId,
        orgName: profile.businessName,
        orgTimeZone: profile.timezone,
        orgTier: profile.subscriptionTier,
        minTier: 'PRO',
        requireConsent: false,
        exclusive: true,
        logMessage: text,
      }
    );

    if (result.blocked) {
      switch (result.blocked) {
        case 'cap_reached':
          return res.status(429).json({
            message: `You have reached today's limit of ${result.dailyCap} text messages. It resets on a rolling 24 hour basis.`,
            code: 'DAILY_CAP_REACHED',
            dailyCap: result.dailyCap,
            remainingToday: 0,
          });
        case 'in_progress':
          return res.status(409).json({ message: 'A text update is already being sent. Wait for it to finish.', code: 'SEND_IN_PROGRESS' });
        case 'quiet_hours':
          return res.status(422).json({
            message: `Texts can only be sent between ${describeAllowedWindow()} (${result.timeZone}).`,
            code: 'QUIET_HOURS',
            timeZone: result.timeZone,
            nextAllowedAt: result.nextAllowedAt,
          });
        case 'not_configured':
          return res.status(503).json({ message: 'SMS service not configured', code: 'SMS_NOT_CONFIGURED' });
        case 'tier':
          return res.status(403).json({ message: 'Text updates require the PRO plan or higher.', code: 'TIER_REQUIRED' });
        default:
          return res.status(503).json({
            message: 'Could not safely start the send. Nothing was sent. Try again shortly.',
            code: 'SMS_SEND_UNAVAILABLE',
          });
      }
    }

    const skippedOptOutCount = audience.optedOut + result.skippedOptedOut;
    const partial = result.skippedByCap > 0;
    res.json({
      message: partial
        ? `Sent ${result.sent} of ${audience.eligible.length} text messages. ${result.skippedByCap} shopper${result.skippedByCap === 1 ? ' was' : 's were'} not texted because you reached today's limit of ${result.dailyCap} texts.`
        : `Sent ${result.sent} of ${audience.eligible.length} text message${audience.eligible.length === 1 ? '' : 's'}`,
      sentCount: result.sent,
      failedCount: result.failed,
      skippedOptOutCount,
      skippedByCapCount: result.skippedByCap,
      partial,
      audienceSize: audience.eligible.length,
      remainingToday: result.remainingToday ?? 0,
    });
  } catch (error) {
    console.error('Error sending SMS update:', error);
    res.status(500).json({ message: 'Failed to send SMS update' });
  } finally {
    if (lockedOrganizerId) sendingOrganizers.delete(lockedOrganizerId);
  }
};

// GET /notifications/sms-audience/:saleId
// What the send-update page needs before the organizer writes anything: how many shoppers will
// be texted, why others will not, the remaining daily allowance, and whether quiet hours are on.
// Returns counts only, never phone numbers or names.
export const getSmsAudienceSummary = async (req: AuthRequest, res: Response) => {
  try {
    const profile = req.user?.organizerProfile;
    const organizerId: string | undefined = profile?.id;
    if (!organizerId) {
      return res.status(403).json({ message: 'Organizer profile not found.', code: 'ORGANIZER_PROFILE_REQUIRED' });
    }

    const { saleId } = req.params;
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, title: true, organizerId: true, status: true },
    });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    if (sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to send updates for this sale' });
    }

    const [audience, sentToday] = await Promise.all([loadSmsAudience(saleId), getSentInLast24h(organizerId)]);
    const cap = getSmsDailyCap();
    const timeZone = resolveSendTimeZone(profile.timezone);
    const quiet = checkQuietHours(new Date(), timeZone);
    const framing = getSmsFraming(profile.businessName);

    res.json({
      saleId: sale.id,
      saleTitle: sale.title,
      saleEnded: (sale as any).status === 'ENDED',
      eligibleCount: audience.eligible.length,
      optedOutCount: audience.optedOut,
      noConsentCount: audience.noConsent,
      pendingConfirmationCount: audience.pendingConfirmation,
      dailyCap: cap,
      sentLast24h: sentToday,
      remainingToday: Math.max(0, cap - sentToday),
      quietHours: {
        allowedNow: quiet.allowed,
        timeZone,
        window: describeAllowedWindow(),
        nextAllowedAt: quiet.nextAllowedAt,
      },
      maxMessageChars: SMS_MAX_ORGANIZER_MESSAGE_CHARS,
      maxSegments: SMS_MAX_SEGMENTS,
      messagePrefix: framing.prefix,
      messageSuffix: framing.suffix,
      smsConfigured: isSmsConfigured(),
    });
  } catch (error) {
    console.error('Error loading SMS audience:', error);
    res.status(500).json({ message: 'Failed to load text update audience' });
  }
};

// Helper: extract a friendly first name from a possibly-messy name field
const firstNameOf = (name: string | null | undefined): string => {
  if (!name) return 'there';
  const first = String(name).trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'there';
};

// Helper: build the HTML for a weekly digest email (exported so the escaping can be unit tested)
export const buildDigestHtml = (userName: string, sales: any[], frontendUrl: string, unsubUrl: string, nearYou: boolean): string => {
  const saleCards = sales.map((sale) => {
    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    // Untrusted text (sale titles, addresses, business names) and the photo URL are escaped / validated:
    // an unescaped title or a photo URL such as `" onerror="...` would otherwise become markup in every
    // recipient's inbox (utils/htmlEscape.ts).
    const photoUrl = safeHttpsUrl(sale.photoUrls?.[0]);
    const photo = photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(sale.title)}" style="width:100%;height:160px;object-fit:cover;border-radius:6px 6px 0 0;" />` : '';
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;overflow:hidden;font-family:sans-serif;">
        ${photo}
        <div style="padding:14px;">
          <h3 style="margin:0 0 4px;font-size:16px;color:#111827;">${escapeHtml(sale.title)}</h3>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${escapeHtml(sale.address)}, ${escapeHtml(sale.city)}, ${escapeHtml(sale.state)}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#374151;">${startDate} – ${endDate}</p>
          <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;">By ${escapeHtml(sale.organizer?.businessName || 'Unknown Organizer')}</p>
          <a href="${escapeHtml(frontendUrl)}/sales/${escapeHtml(sale.id)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;">View Sale →</a>
        </div>
      </div>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">
    <!-- Header -->
    <div style="background:#2563eb;border-radius:10px;padding:24px;margin-bottom:24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">🏷️ FindA.Sale</h1>
      <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Your Weekend Sale Digest</p>
    </div>

    <!-- Greeting -->
    <p style="color:#374151;font-size:15px;margin-bottom:20px;">
      Hi ${escapeHtml(firstNameOf(userName))},<br><br>
      Here are the sales happening this weekend${nearYou ? ' near you' : ''}: yard sales, auctions, flea markets, consignment sales, and more. Don't miss out!
    </p>

    <!-- Sale cards -->
    ${saleCards}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        You're receiving this because you have a FindA.Sale account.<br>
        <a href="${escapeHtml(frontendUrl)}" style="color:#2563eb;">View all sales</a> &middot;
        <a href="${escapeHtml(frontendUrl)}/shopper/dashboard" style="color:#2563eb;">My Dashboard</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Don't want these? <a href="${escapeHtml(unsubUrl)}" style="color:#6b7280;">Unsubscribe</a></p>
      <p style="font-size:11px;color:#9ca3af;margin-top:8px;">${process.env.OUTREACH_PHYSICAL_ADDRESS || '219 E Michigan Ave, Suite F, Paw Paw, MI 49079'}</p>
    </div>
  </div>
</body>
</html>`;
};

// Extract a usable {lat,lng,radius} from a user's saved searches, if any.
// SavedSearch.filters is JSON: { q, category, radius, lat, lng, priceMin, ... }.
const pickUserLocation = (
  savedSearches: Array<{ filters: unknown }> | undefined | null,
): { lat: number; lng: number; radius: number } | null => {
  if (!savedSearches || savedSearches.length === 0) return null;
  for (const entry of savedSearches) {
    const f = ((entry && entry.filters) || {}) as Record<string, unknown>;
    const lat = typeof f.lat === 'number' ? f.lat : parseFloat(String(f.lat));
    const lng = typeof f.lng === 'number' ? f.lng : parseFloat(String(f.lng));
    const radiusRaw = typeof f.radius === 'number' ? f.radius : parseFloat(String(f.radius));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 40;
      return { lat, lng, radius };
    }
  }
  return null;
};

// In-memory bounding-box filter mirroring saleController's near-me logic
// (radius / 111 deg per unit). Keeps units identical to the sale feed.
const filterSalesWithinRadius = (
  sales: any[],
  loc: { lat: number; lng: number; radius: number },
): any[] => {
  const latDelta = loc.radius / 111;
  const lngDelta = loc.radius / (111 * Math.cos((loc.lat * Math.PI) / 180));
  return sales.filter((sale) => {
    if (typeof sale.lat !== 'number' || typeof sale.lng !== 'number') return false;
    return (
      sale.lat >= loc.lat - latDelta &&
      sale.lat <= loc.lat + latDelta &&
      sale.lng >= loc.lng - lngDelta &&
      sale.lng <= loc.lng + lngDelta
    );
  });
};

// Send weekly digest email to all users with upcoming sales this weekend
export const sendWeeklyDigest = async () => {
  try {
    if (!process.env.SMTP_USERNAME) {
      console.warn('Email service not configured (SMTP_USERNAME missing) - skipping weekly digest');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    // Find PUBLISHED sales starting in the next 7 days
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcomingSales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: {
          gte: now,
          lte: sevenDaysOut,
        },
      },
      include: {
        organizer: {
          select: { businessName: true },
        },
      },
      orderBy: { startDate: 'asc' },
      take: 500, // superset — filtered per-recipient by location below
    });

    if (upcomingSales.length === 0) {
      console.info('Weekly digest: no upcoming published sales — skipping');
      return;
    }

    // Get all users with email addresses
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        notificationPrefs: true,
        savedSearches: { select: { filters: true } },
      },
      where: {
        AND: [
          { email: { not: '' } },
          // Exclude scraped organizer system accounts (scraper+*@system.finda.sale)
          { email: { not: { endsWith: '@system.finda.sale' } } },
        ],
      },
      take: 5000, // cap digest at 5k users per run
    });

    console.info(`Weekly digest: sending to ${users.length} users with ${upcomingSales.length} sales`);

    let sent = 0;
    let failed = 0;

    const { suppressionService } = await import('../services/suppressionService');
    const { buildUnsubscribeLinks } = await import('./unsubscribeController');

    for (const user of users) {
      try {
        // Opt-out check
        const prefs = (user.notificationPrefs as Record<string, unknown> | null) ?? {};
        if (prefs['emailWeeklyDigest'] === false) continue;

        // Suppression check
        const suppressed = await suppressionService.isSuppressed(user.email);
        if (suppressed) continue;

        // Per-user unsubscribe URL + RFC 8058 List-Unsubscribe header (same
        // UnsubscribeToken scheme, one token used for both).
        const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(user.id, 'weekly'); // FIX (findasale-hacker 2026-09-05): 'emailWeeklyDigest' is a TYPE_TO_PREF_MAP *value*, not a key -- handleUnsubscribe looked it up as a key and always 400'd "Invalid unsubscribe type". 'weekly' is the correct key.

        // Location-relevant selection: filter the sale superset to the user's
        // saved-search location (bounding box). Falls back to the global list
        // when we have no location or no nearby sales — audience is unchanged,
        // only relevance + honest copy vary.
        const userLoc = pickUserLocation(user.savedSearches);
        let salesForUser = upcomingSales.slice(0, 10);
        let nearYou = false;
        if (userLoc) {
          const nearby = filterSalesWithinRadius(upcomingSales, userLoc);
          if (nearby.length > 0) {
            salesForUser = nearby.slice(0, 10);
            nearYou = true;
          }
        }

        const html = buildDigestHtml(user.name, salesForUser, frontendUrl, unsubUrl, nearYou);

        await emailService.emails.send({
          from: fromEmail,
          to: user.email,
          subject: `🏷️ ${salesForUser.length} sale${salesForUser.length > 1 ? 's' : ''}${nearYou ? ' near you' : ''} this weekend`,
          html,
          jobName: 'notificationController-weeklyDigest',
          listUnsubscribe: listUnsubscribeHeader,
        });

        sent++;

        // Rate limit guard — small delay between sends
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Weekly digest: failed to send to ${maskEmail(user.email)}:`, error);
        failed++;
      }
    }

    console.info(`Weekly digest complete: ${sent} sent, ${failed} failed`);
  } catch (error) {
    console.error('Weekly digest job error:', error);
  }
};
