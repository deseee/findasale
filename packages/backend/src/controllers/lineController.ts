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

initTwilio();

// Helper: send SMS if Twilio is configured, otherwise no-op
const sendSMS = async (to: string, body: string): Promise<void> => {
  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
    } catch (error) {
      console.error(`Failed to send SMS to ${to}:`, error);
    }
  }
};

// Helper: verify the authenticated user is an organizer of the given sale
const getOrganizerForSale = async (userId: string, saleId: string) => {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) return null;
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale || sale.organizerId !== organizer.id) return null;
  return { organizer, sale };
};

// ─── ORGANIZER: Start the line for a sale ────────────────────────────────────
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
    const lineEntries = [];
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

    // Notify subscribers of their position
    for (const subscriber of subscribers) {
      if (subscriber.phone) {
        const entry = lineEntries.find(e => e.userId === subscriber.userId);
        await sendSMS(
          subscriber.phone,
          `The virtual line for "${ctx.sale.title}" is now open! You are #${entry?.position} in line. We'll text you when it's your turn.`
        );
      }
    }

    res.json({
      message: 'Line started successfully',
      lineCount: lineEntries.length,
      entries: lineEntries,
    });
  } catch (error) {
    console.error('Error starting line:', error);
    res.status(500).json({ message: 'Failed to start line' });
  }
};

// ─── ORGANIZER: Call the next person in line ─────────────────────────────────
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

    if (subscriber?.phone) {
      await sendSMS(
        subscriber.phone,
        `It's your turn at "${ctx.sale.title}"! Please proceed to the entrance now.`
      );
    }

    res.json({ message: 'Next person notified', entry: updatedEntry });
  } catch (error) {
    console.error('Error calling next person:', error);
    res.status(500).json({ message: 'Failed to call next person' });
  }
};

// ─── ORGANIZER: Get full line status ─────────────────────────────────────────
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

    res.json(entries);
  } catch (error) {
    console.error('Error fetching line status:', error);
    res.status(500).json({ message: 'Failed to fetch line status' });
  }
};

// ─── ORGANIZER: Mark a person as entered ─────────────────────────────────────
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

// ─── ORGANIZER: Broadcast SMS position updates to all waiting people ──────────
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

    let smsSent = 0;
    for (const entry of waitingEntries) {
      const subscriber = await prisma.saleSubscriber.findUnique({
        where: { saleId_userId: { userId: entry.userId, saleId } },
      });
      if (subscriber?.phone) {
        await sendSMS(
          subscriber.phone,
          `Update for "${ctx.sale.title}": You are now #${entry.position} in line. We'll notify you when it's your turn.`
        );
        smsSent++;
        // Respect Twilio rate limits
        await new Promise(r => setTimeout(r, 100));
      }
    }

    res.json({ message: 'Position updates sent', smsSent, totalWaiting: waitingEntries.length });
  } catch (error) {
    console.error('Error broadcasting position updates:', error);
    res.status(500).json({ message: 'Failed to broadcast position updates' });
  }
};

// ─── SHOPPER: Join the line for a sale ───────────────────────────────────────
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
      await sendSMS(
        subscriber.phone,
        `You've joined the virtual line for "${sale.title}"! You are #${position} in line. We'll text you when it's your turn.`
      );
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

// ─── SHOPPER: Check position in line ─────────────────────────────────────────
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

// ─── SHOPPER: Leave the line ──────────────────────────────────────────────────
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
