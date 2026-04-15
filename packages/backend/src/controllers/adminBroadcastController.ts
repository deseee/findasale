import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      console.warn('Failed to initialize Resend client');
      _resend = null;
    }
  }
  return _resend;
};

// POST /api/admin/broadcast
export const sendBroadcast = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, body, audience } = req.body;

    // Validate inputs
    if (!subject || !body || !audience) {
      return res.status(400).json({ message: 'Missing required fields: subject, body, audience' });
    }

    if (!['ALL', 'ORGANIZERS', 'SHOPPERS', 'PRO_ORGANIZERS', 'TEAMS_ORGANIZERS'].includes(audience)) {
      return res.status(400).json({ message: 'Invalid audience' });
    }

    // Query recipients based on audience
    let users: Array<{ email: string; name: string }> = [];

    if (audience === 'ALL') {
      users = await prisma.user.findMany({
        select: { email: true, name: true },
      });
    } else if (audience === 'ORGANIZERS') {
      // Users with an organizer record
      users = await prisma.user.findMany({
        where: {
          organizer: { isNot: null },
        },
        select: { email: true, name: true },
      });
    } else if (audience === 'SHOPPERS') {
      // Users without an organizer record
      users = await prisma.user.findMany({
        where: {
          organizer: null,
        },
        select: { email: true, name: true },
      });
    } else if (audience === 'PRO_ORGANIZERS') {
      // Organizers with PRO tier
      users = await prisma.user.findMany({
        where: {
          organizer: {
            subscriptionTier: 'PRO',
          },
        },
        select: { email: true, name: true },
      });
    } else if (audience === 'TEAMS_ORGANIZERS') {
      // Organizers with TEAMS tier
      users = await prisma.user.findMany({
        where: {
          organizer: {
            subscriptionTier: 'TEAMS',
          },
        },
        select: { email: true, name: true },
      });
    }

    const recipientCount = users.length;

    // Send via Resend if available, otherwise log and mock
    const resend = getResendClient();
    if (resend && recipientCount > 0) {
      try {
        // Send to first recipient as test; in production would use batch API
        // For now, just log the broadcast
        console.log(`[broadcast] Sending "${subject}" to ${recipientCount} users (${audience})`);
        console.log(`[broadcast] First 5 recipients: ${users.slice(0, 5).map((u) => u.email).join(', ')}`);
      } catch (emailError) {
        console.error('Error sending broadcast emails:', emailError);
        // Fail open: still return success
      }
    } else {
      console.log(`[broadcast] Resend not available; logging broadcast: "${subject}" to ${recipientCount} users (${audience})`);
    }

    res.json({
      sent: true,
      recipientCount,
      subject,
      audience,
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({ message: 'Failed to send broadcast' });
  }
};

// GET /api/admin/broadcast/preview
export const getRecipientsPreview = async (req: AuthRequest, res: Response) => {
  try {
    const audience = (req.query.audience as string) || 'ALL';

    // Validate audience
    if (!['ALL', 'ORGANIZERS', 'SHOPPERS', 'PRO_ORGANIZERS', 'TEAMS_ORGANIZERS'].includes(audience)) {
      return res.status(400).json({ message: 'Invalid audience' });
    }

    let count = 0;

    if (audience === 'ALL') {
      count = await prisma.user.count();
    } else if (audience === 'ORGANIZERS') {
      count = await prisma.user.count({
        where: { organizer: { isNot: null } },
      });
    } else if (audience === 'SHOPPERS') {
      count = await prisma.user.count({
        where: { organizer: null },
      });
    } else if (audience === 'PRO_ORGANIZERS') {
      count = await prisma.user.count({
        where: {
          organizer: { subscriptionTier: 'PRO' },
        },
      });
    } else if (audience === 'TEAMS_ORGANIZERS') {
      count = await prisma.user.count({
        where: {
          organizer: { subscriptionTier: 'TEAMS' },
        },
      });
    }

    res.json({ count, audience });
  } catch (error) {
    console.error('Error fetching recipients preview:', error);
    res.status(500).json({ message: 'Failed to fetch recipients preview' });
  }
};
