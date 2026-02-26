import { Request, Response } from 'express';
import { prisma } from '../index';
import twilio from 'twilio';
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

interface AuthRequest extends Request {
  user?: any;
}

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
      }
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
      }
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

// Send weekly digest email
export const sendWeeklyDigest = async () => {
  try {
    // Get Resend client
    const resendClient = getResendClient();
    if (!resendClient) {
      console.warn('Email service not configured - skipping weekly digest');
      return;
    }

    // Find sales happening this weekend
    const now = new Date();
    const weekendStart = new Date(now);
    weekendStart.setDate(now.getDate() + ((5 + 7 - now.getDay()) % 7)); // Next Friday
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendStart.getDate() + 2); // Sunday

    const upcomingSales = await prisma.sale.findMany({
      where: {
        OR: [
          {
            startDate: {
              gte: weekendStart,
              lte: weekendEnd
            }
          },
          {
            endDate: {
              gte: weekendStart,
              lte: weekendEnd
            }
          }
        ]
      },
      include: {
        organizer: {
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    if (upcomingSales.length === 0) {
      console.log('No sales found for the upcoming weekend');
      return;
    }

    // Group sales by organizer
    const salesByOrganizer: Record<string, any[]> = {};
    for (const sale of upcomingSales) {
      const organizerEmail = sale.organizer.user.email;
      if (!salesByOrganizer[organizerEmail]) {
        salesByOrganizer[organizerEmail] = [];
      }
      salesByOrganizer[organizerEmail].push(sale);
    }

    // Send email to each organizer
    for (const [organizerEmail, sales] of Object.entries(salesByOrganizer)) {
      try {
        const salesList = sales.map(sale => 
          `- ${sale.title} (${new Date(sale.startDate).toLocaleDateString()} to ${new Date(sale.endDate).toLocaleDateString()})`
        ).join('\n');

        await resendClient.emails.send({
          from: process.env.FROM_EMAIL || 'noreply@salescout.com',
          to: organizerEmail,
          subject: 'Upcoming Weekend Sales Digest',
          text: `Hi there!\n\nHere are the sales happening this weekend:\n\n${salesList}\n\nBest regards,\nSaleScout Team`
        });

        console.log(`Weekly digest sent to ${organizerEmail}`);
      } catch (error) {
        console.error(`Failed to send weekly digest to ${organizerEmail}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending weekly digest:', error);
  }
};
