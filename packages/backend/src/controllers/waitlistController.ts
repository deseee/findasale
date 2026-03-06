import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      _resend = null;
    }
  }
  return _resend;
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

// Send waitlist notification email
const sendWaitlistNotificationEmail = async (
  email: string,
  name: string,
  itemTitle: string,
  itemPrice: number | null,
  itemId: string,
  saleName: string
): Promise<void> => {
  const resend = getResendClient();
  if (!resend) return;

  const itemUrl = `${FRONTEND_URL}/items/${itemId}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#fafaf9; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9; padding:24px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#10b981; padding:28px 32px; text-align:center;">
              <span style="font-size:26px; font-weight:700; color:#fff;">FindA.Sale</span>
              <p style="margin:8px 0 0; font-size:15px; color:#d1fae5; font-weight:500;">It's back in stock! 🎉</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#374151; margin:0 0 16px;">Hi ${name},</p>
              <p style="font-size:15px; color:#374151; margin:0 0 24px;">Great news! An item you wanted is now available:</p>

              <!-- Item Card -->
              <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:24px; background:#f0fdf4;">
                <div style="font-weight:600; font-size:16px; color:#1f2937; margin-bottom:4px;">${itemTitle}</div>
                ${
                  itemPrice
                    ? `<div style="color:#10b981; font-weight:700; font-size:18px; margin-bottom:8px;">$${(itemPrice / 100).toFixed(2)}</div>`
                    : ''
                }
                <div style="color:#6b7280; font-size:13px; margin-bottom:4px;">From: ${saleName}</div>
                <p style="font-size:13px; color:#6b7280; margin:12px 0 0;">Act fast — it won't last long!</p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;">
                <a href="${itemUrl}" style="display:inline-block; padding:14px 32px; background:#10b981; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px;">View Item Now</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f9f7f4; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="font-size:12px; color:#9ca3af; margin:0;">
                You're receiving this because you joined the waitlist at <a href="${FRONTEND_URL}" style="color:#10b981;">FindA.Sale</a>.<br/>
                <a href="${FRONTEND_URL}/profile" style="color:#9ca3af; text-decoration:none;">Manage preferences</a> ·
                <a href="${FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9ca3af; text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${itemTitle} is back in stock! 🎉`,
      html,
    });
    console.info(`✓ Waitlist notification email sent to ${email}`);
  } catch (err) {
    console.error(`✗ Failed to send waitlist notification email to ${email}:`, err);
    throw err;
  }
};

// Join the waitlist for an item
export const joinWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    // Verify item exists and is in appropriate status
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, status: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Only allow waitlist for SOLD or ON_HOLD items (now using RESERVED for holds)
    if (item.status !== 'SOLD' && item.status !== 'RESERVED') {
      return res.status(400).json({
        message: 'Can only join waitlist for items that are sold or on hold',
      });
    }

    // Upsert: if already on waitlist, just return success; if not, create entry
    const waitlistEntry = await prisma.itemWaitlist.upsert({
      where: {
        userId_itemId: {
          userId: req.user.id,
          itemId,
        },
      },
      create: {
        userId: req.user.id,
        itemId,
        notified: false,
      },
      update: {
        notified: false, // Reset notified flag if re-joining
      },
    });

    res.json({
      message: 'Added to waitlist',
      onWaitlist: true,
      waitlistId: waitlistEntry.id,
    });
  } catch (error) {
    console.error('Error joining waitlist:', error);
    res.status(500).json({ message: 'Failed to join waitlist' });
  }
};

// Leave the waitlist for an item
export const leaveWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    // Delete the waitlist entry
    await prisma.itemWaitlist.deleteMany({
      where: {
        userId: req.user.id,
        itemId,
      },
    });

    res.json({ message: 'Removed from waitlist' });
  } catch (error) {
    console.error('Error leaving waitlist:', error);
    res.status(500).json({ message: 'Failed to leave waitlist' });
  }
};

// Get waitlist status for an item
export const getWaitlistStatus = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    // Get total waitlist count for the item
    const count = await prisma.itemWaitlist.count({
      where: { itemId, notified: false },
    });

    // Check if current user is on the waitlist (if authenticated)
    let onWaitlist = false;
    if ((req as any).user) {
      const entry = await prisma.itemWaitlist.findUnique({
        where: {
          userId_itemId: {
            userId: (req as any).user.id,
            itemId,
          },
        },
      });
      onWaitlist = !!entry;
    }

    res.json({ onWaitlist, count });
  } catch (error) {
    console.error('Error getting waitlist status:', error);
    res.status(500).json({ message: 'Failed to get waitlist status' });
  }
};

// Internal helper: notify all users on waitlist when item becomes available
export const notifyWaitlist = async (itemId: string): Promise<void> => {
  console.info(`[Waitlist] Notifying waitlist for item ${itemId}...`);

  try {
    // Get the item details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: { select: { title: true } },
      },
    });

    if (!item) {
      console.info(`[Waitlist] Item ${itemId} not found`);
      return;
    }

    // Find all users on the waitlist who haven't been notified yet
    const waitlistEntries = await prisma.itemWaitlist.findMany({
      where: { itemId, notified: false },
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    console.info(`[Waitlist] Found ${waitlistEntries.length} users to notify for item ${itemId}`);

    if (waitlistEntries.length === 0) {
      console.info(`[Waitlist] No users to notify for item ${itemId}`);
      return;
    }

    let sent = 0;
    let errors = 0;

    // Send emails to each user
    for (const entry of waitlistEntries) {
      try {
        await sendWaitlistNotificationEmail(
          entry.user.email,
          entry.user.name || 'Shopper',
          item.title,
          item.price ? Math.round(item.price * 100) : null,
          itemId,
          item.sale?.title || 'Estate Sale'
        );

        // Mark as notified
        await prisma.itemWaitlist.update({
          where: { id: entry.id },
          data: { notified: true },
        });

        sent++;
      } catch (err) {
        console.error(`[Waitlist] Failed to notify user ${entry.user.email}:`, err);
        errors++;
      }
    }

    console.info(`[Waitlist] Notification complete for item ${itemId}. Sent: ${sent}, Errors: ${errors}`);
  } catch (err) {
    console.error(`[Waitlist] Failed to process waitlist notifications for item ${itemId}:`, err);
    throw err;
  }
};
