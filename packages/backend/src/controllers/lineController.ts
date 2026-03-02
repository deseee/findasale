import { Request, Response } from 'express';
import { prisma } from '../index';
import twilio from 'twilio';
import { AuthRequest } from '../middleware/auth';
import { handleEarlyBirdBadge, handleExplorerBadge } from './userController';

// Initialize Twilio client only if credentials are available
let twilioClient: ReturnType<typeof twilio> | null = null;
const initTwilio = () => {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✅ Twilio client initialized for line controller');
    } catch (error) {
      console.warn('⚠️ Failed to initialize Twilio client for line controller:', error);
      twilioClient = null;
    }
  } else if (!twilioClient) {
    console.warn('Twilio credentials not found - SMS features will be disabled');
  }
};

// Initialize Twilio when module loads
initTwilio();

// Start line for a sale
export const startLine = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!saleId) {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Verify user is organizer of this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Get all subscribers for this sale
    const subscribers = await prisma.saleSubscriber.findMany({
      where: {
        saleId,
        phone: { not: null }
      },
      take: 1000,
    });

    // Create line entries for each subscriber
    const lineEntries = [];
    for (let i = 0; i < subscribers.length; i++) {
      const entry = await prisma.lineEntry.create({
        data: {
          saleId,
          userId: subscribers[i].userId,
          position: i + 1,
          status: 'WAITING'
        }
      });
      lineEntries.push(entry);
    }

    // Send SMS notifications to subscribers (if Twilio is configured)
    const results = [];
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      for (const subscriber of subscribers) {
        if (subscriber.phone) {
          try {
            const message = await twilioClient.messages.create({
              body: `The line for ${sale.title} is now open. You are position #${lineEntries.find(e => e.userId === subscriber.userId)?.position}.`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: subscriber.phone
            });
            results.push({ phone: subscriber.phone, success: true, sid: message.sid });
          } catch (error) {
            console.error(`Failed to send SMS to ${subscriber.phone}:`, error);
            results.push({ phone: subscriber.phone, success: false, error: (error as Error).message });
          }
        }
      }
    } else {
      console.log('Twilio not configured - skipping SMS notifications');
    }

    res.json({
      message: 'Line started successfully',
      lineEntries,
      smsResults: results
    });
  } catch (error) {
    console.error('Error starting line:', error);
    res.status(500).json({ message: 'Failed to start line' });
  }
};

// Call next person in line
export const callNext = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!saleId) {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Verify user is organizer of this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Get the next person in line
    const nextEntry = await prisma.lineEntry.findFirst({
      where: {
        saleId,
        status: 'WAITING'
      },
      orderBy: {
        position: 'asc'
      },
      include: {
        user: {
          select: {
            subscriptions: {
              where: { saleId },
              select: { phone: true }
            }
          }
        }
      }
    });

    if (!nextEntry) {
      return res.status(404).json({ message: 'No one is waiting in line' });
    }

    // Update entry status to CALLED
    const updatedEntry = await prisma.lineEntry.update({
      where: { id: nextEntry.id },
      data: { 
        status: 'CALLED',
        notifiedAt: new Date()
      }
    });

    // Send SMS notification (if Twilio is configured)
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      const subscriber = nextEntry.user.subscriptions[0];
      if (subscriber?.phone) {
        try {
          await twilioClient.messages.create({
            body: `You are next in line for ${sale.title}! Please prepare to enter.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: subscriber.phone
          });
        } catch (error) {
          console.error(`Failed to send SMS to ${subscriber.phone}:`, error);
        }
      }
    }

    res.json({
      message: 'Next person called successfully',
      entry: updatedEntry
    });
  } catch (error) {
    console.error('Error calling next person:', error);
    res.status(500).json({ message: 'Failed to call next person' });
  }
};

// Get line status
export const getLineStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!saleId) {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Verify user is organizer of this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to view this sale' });
    }

    // Get all line entries for this sale
    const entries = await prisma.lineEntry.findMany({
      where: { saleId },
      include: {
        user: {
          select: {
            name: true,
            phone: true
          }
        }
      },
      orderBy: { position: 'asc' },
      take: 500,
    });

    res.json(entries);
  } catch (error) {
    console.error('Error fetching line status:', error);
    res.status(500).json({ message: 'Failed to fetch line status' });
  }
};

// Mark person as entered
export const markAsEntered = async (req: AuthRequest, res: Response) => {
  try {
    const { lineEntryId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!lineEntryId) {
      return res.status(400).json({ message: 'Line entry ID is required' });
    }

    // Verify user is organizer of this sale
    const entry = await prisma.lineEntry.findUnique({
      where: { id: lineEntryId },
      include: {
        sale: { select: { organizerId: true } },
        user: { select: { id: true } }
      }
    });

    if (!entry) {
      return res.status(404).json({ message: 'Line entry not found' });
    }

    if (entry.sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Update entry status to SERVED
    const updatedEntry = await prisma.lineEntry.update({
      where: { id: lineEntryId },
      data: { 
        status: 'SERVED',
        enteredAt: new Date()
      }
    });

    // Award early bird badge if applicable
    if (entry.user && entry.enteredAt) {
      await handleEarlyBirdBadge(entry.user.id, new Date());
    }

    // Award explorer badge
    await handleExplorerBadge(entry.user.id);

    res.json({
      message: 'Person marked as entered successfully',
      entry: updatedEntry
    });
  } catch (error) {
    console.error('Error marking person as entered:', error);
    res.status(500).json({ message: 'Failed to mark person as entered' });
  }
};
