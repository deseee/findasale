import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try { _resend = new Resend(process.env.RESEND_API_KEY); } catch { _resend = null; }
  }
  return _resend;
};
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

// POST /api/sale-waitlist/:saleId/join
export const joinSaleWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const existing = await prisma.saleWaitlist.findUnique({
      where: { saleId_userId: { saleId, userId: req.user.id } },
    });
    if (existing) return res.status(409).json({ message: 'Already on waitlist' });

    const entry = await prisma.saleWaitlist.create({
      data: { saleId, userId: req.user.id },
    });
    return res.status(201).json(entry);
  } catch (err) {
    console.error('joinSaleWaitlist error:', err);
    return res.status(500).json({ message: 'Failed to join waitlist' });
  }
};

// DELETE /api/sale-waitlist/:saleId/leave
export const leaveSaleWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { saleId } = req.params;
    await prisma.saleWaitlist.deleteMany({
      where: { saleId, userId: req.user.id },
    });
    return res.json({ message: 'Removed from waitlist' });
  } catch (err) {
    console.error('leaveSaleWaitlist error:', err);
    return res.status(500).json({ message: 'Failed to leave waitlist' });
  }
};

// GET /api/sale-waitlist/:saleId/status — check if current user is on waitlist
export const getSaleWaitlistStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.json({ onWaitlist: false });
    const { saleId } = req.params;
    const entry = await prisma.saleWaitlist.findUnique({
      where: { saleId_userId: { saleId, userId: req.user.id } },
    });
    const count = await prisma.saleWaitlist.count({ where: { saleId } });
    return res.json({ onWaitlist: !!entry, count });
  } catch (err) {
    console.error('getSaleWaitlistStatus error:', err);
    return res.status(500).json({ message: 'Failed to get status' });
  }
};

// POST /api/sale-waitlist/:saleId/notify — organizer triggers when new items are added
export const notifySaleWaitlist = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer only' });
    }
    const { saleId } = req.params;
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale' });
    }

    const waitlistEntries = await prisma.saleWaitlist.findMany({
      where: { saleId, notified: false },
      include: { user: true },
    });

    const resend = getResendClient();
    let notified = 0;
    for (const entry of waitlistEntries) {
      if (resend && entry.user.email) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: entry.user.email,
            subject: `New items added to ${sale.title}`,
            html: `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="background:#d97706;padding:28px 32px;text-align:center;">
<span style="font-size:26px;font-weight:700;color:#fff;">FindA.Sale</span>
<p style="margin:8px 0 0;font-size:15px;color:#fef3c7;">New items just added! 🎉</p>
</td></tr>
<tr><td style="padding:28px 32px;">
<p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${entry.user.name},</p>
<p style="font-size:15px;color:#374151;margin:0 0 24px;">
You're on the waitlist for <strong>${sale.title}</strong> — new items have just been added.
Browse before they sell out!
</p>
<div style="text-align:center;margin-top:24px;">
<a href="${FRONTEND_URL}/sales/${saleId}" style="display:inline-block;background:#d97706;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Browse New Items</a>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
          });
          notified++;
        } catch (emailErr) {
          console.error('Failed to send sale waitlist email:', emailErr);
        }
      }
      await prisma.saleWaitlist.update({ where: { id: entry.id }, data: { notified: true } });
    }

    return res.json({ notified, total: waitlistEntries.length });
  } catch (err) {
    console.error('notifySaleWaitlist error:', err);
    return res.status(500).json({ message: 'Failed to notify waitlist' });
  }
};
