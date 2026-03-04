import { Request, Response } from 'express';
import twilio from 'twilio';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

// Lazy-loaded Twilio client
let _twilioClient: any = null;
const getTwilioClient = () => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      try {
        _twilioClient = twilio(accountSid, authToken);
        console.log('✅ Twilio client initialized');
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

// Lazy-loaded Resend client
let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch (error) {
      console.warn('⚠️ Failed to initialize Resend client:', error);
      _resend = null;
    }
  }
  return _resend;
};

// Subscribe to sale notifications
export const subscribeToSale = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, phone, email } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!saleId) {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Check if sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Create or update subscription
    const subscription = await prisma.saleSubscriber.upsert({
      where: {
        userId_saleId: {
          userId,
          saleId
        }
      },
      update: {
        phone: phone || null,
        email: email || null
      },
      create: {
        userId,
        saleId,
        phone: phone || null,
        email: email || null
      }
    });

    res.json({
      message: 'Successfully subscribed to sale notifications',
      subscription
    });
  } catch (error) {
    console.error('Error subscribing to sale:', error);
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
        userId_saleId: {
          userId,
          saleId
        }
      }
    });

    res.json({ message: 'Successfully unsubscribed from sale notifications' });
  } catch (error) {
    console.error('Error unsubscribing from sale:', error);
    res.status(500).json({ message: 'Failed to unsubscribe from sale' });
  }
};

// H10: Public one-click unsubscribe by email — no auth required (CAN-SPAM compliance)
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
    console.log(`Unsubscribed ${result.count} subscription(s) for ${email}`);
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

    const subscriptions = await prisma.saleSubscriber.findMany({
      where: { userId },
      include: {
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

// Send SMS update to subscribers
export const sendSMSUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, message } = req.body;
    const organizerId = req.user.organizerProfile?.id;

    if (!saleId || !message) {
      return res.status(400).json({ message: 'Sale ID and message are required' });
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

    // Get Twilio client
    const twilioClient = getTwilioClient();
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(503).json({ error: 'SMS service not configured' });
    }

    // Get subscribers with phone numbers
    const subscribers = await prisma.saleSubscriber.findMany({
      where: {
        saleId,
        phone: {
          not: null
        }
      },
      take: 100,
    });

    if (subscribers.length === 0) {
      return res.json({ message: 'No subscribers with phone numbers found' });
    }

    // Send SMS to each subscriber
    const results = [];
    for (const subscriber of subscribers) {
      try {
        const sms = await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: subscriber.phone!
        });
        results.push({ phone: subscriber.phone, success: true, sid: sms.sid });
      } catch (error) {
        console.error(`Failed to send SMS to ${subscriber.phone}:`, error);
        results.push({ phone: subscriber.phone, success: false, error: (error as Error).message });
      }
    }

    res.json({
      message: `Sent ${results.filter(r => r.success).length} of ${results.length} messages`,
      results
    });
  } catch (error) {
    console.error('Error sending SMS update:', error);
    res.status(500).json({ message: 'Failed to send SMS update' });
  }
};

// Helper: build the HTML for a weekly digest email
const buildDigestHtml = (userName: string, sales: any[], frontendUrl: string): string => {
  const saleCards = sales.map((sale) => {
    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const photo = sale.photoUrls?.[0] ? `<img src="${sale.photoUrls[0]}" alt="${sale.title}" style="width:100%;height:160px;object-fit:cover;border-radius:6px 6px 0 0;" />` : '';
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;overflow:hidden;font-family:sans-serif;">
        ${photo}
        <div style="padding:14px;">
          <h3 style="margin:0 0 4px;font-size:16px;color:#111827;">${sale.title}</h3>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${sale.address}, ${sale.city}, ${sale.state}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#374151;">${startDate} – ${endDate}</p>
          <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;">By ${sale.organizer?.businessName || 'Unknown Organizer'}</p>
          <a href="${frontendUrl}/sales/${sale.id}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;">View Sale →</a>
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
      <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Your Weekend Estate Sale Digest</p>
    </div>

    <!-- Greeting -->
    <p style="color:#374151;font-size:15px;margin-bottom:20px;">
      Hi ${userName || 'there'},<br><br>
      Here are the estate sales happening this weekend near you. Don't miss out!
    </p>

    <!-- Sale cards -->
    ${saleCards}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        You're receiving this because you have a FindA.Sale account.<br>
        <a href="${frontendUrl}" style="color:#2563eb;">View all sales</a> &middot;
        <a href="${frontendUrl}/shopper/dashboard" style="color:#2563eb;">My Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>`;
};

// Send weekly digest email to all users with upcoming sales this weekend
export const sendWeeklyDigest = async () => {
  try {
    const resendClient = getResendClient();
    if (!resendClient) {
      console.warn('Email service not configured - skipping weekly digest');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'digest@finda.sale';

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
      take: 10, // cap at 10 per digest
    });

    if (upcomingSales.length === 0) {
      console.log('Weekly digest: no upcoming published sales — skipping');
      return;
    }

    // Get all users with email addresses
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
      where: {
        email: { not: '' },
      },
      take: 5000, // cap digest at 5k users per run
    });

    console.log(`Weekly digest: sending to ${users.length} users with ${upcomingSales.length} sales`);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const html = buildDigestHtml(user.name, upcomingSales, frontendUrl);

        await resendClient.emails.send({
          from: fromEmail,
          to: user.email,
          subject: `🏷️ ${upcomingSales.length} estate sale${upcomingSales.length > 1 ? 's' : ''} this weekend near you`,
          html,
        });

        sent++;

        // Resend free tier: 1 email/sec — add small delay to avoid rate limit
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Weekly digest: failed to send to ${user.email}:`, error);
        failed++;
      }
    }

    console.log(`Weekly digest complete: ${sent} sent, ${failed} failed`);
  } catch (error) {
    console.error('Weekly digest job error:', error);
  }
};
