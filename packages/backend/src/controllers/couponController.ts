/**
 * Coupon Controller — Sprint 3: Shopper Loyalty Program
 *
 * Issues $5 fixed coupons after each completed purchase.
 * Shoppers can view and redeem coupons at checkout.
 */

import crypto from 'crypto';
import { Response } from 'express';
import { Resend } from 'resend';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { buildEmail } from '../services/emailTemplateService';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try { _resend = new Resend(process.env.RESEND_API_KEY); } catch { _resend = null; }
  }
  return _resend;
};

/** Generate an 8-char uppercase hex code, e.g. "A3F2C891" */
function generateCouponCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// GET /api/coupons — list authenticated user's active, non-expired coupons
// ---------------------------------------------------------------------------
export const getUserCoupons = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  try {
    const coupons = await prisma.coupon.findMany({
      where: {
        userId: req.user.id,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minPurchaseAmount: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({ coupons });
  } catch (err) {
    console.error('[coupon] getUserCoupons error:', err);
    res.status(500).json({ message: 'Failed to load coupons' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/coupons/validate — preview discount for a code + purchase amount
// ---------------------------------------------------------------------------
export const validateCoupon = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const { code, amount } = req.body as { code: string; amount: number };

  if (!code) return res.status(400).json({ valid: false, message: 'Coupon code is required' });

  try {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });

    if (!coupon) {
      return res.json({ valid: false, message: 'Coupon not found' });
    }
    if (coupon.userId !== req.user.id) {
      return res.json({ valid: false, message: 'This coupon does not belong to your account' });
    }
    if (coupon.status !== 'ACTIVE') {
      return res.json({ valid: false, message: 'This coupon has already been used' });
    }
    if (coupon.expiresAt < new Date()) {
      return res.json({ valid: false, message: 'This coupon has expired' });
    }
    if (coupon.minPurchaseAmount && amount > 0 && amount < coupon.minPurchaseAmount) {
      return res.json({
        valid: false,
        message: `Minimum purchase of $${coupon.minPurchaseAmount.toFixed(2)} required`,
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'FIXED') {
      discount = coupon.discountValue;
    } else {
      discount = amount > 0 ? (amount * coupon.discountValue) / 100 : coupon.discountValue;
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, coupon.maxDiscountAmount);
      }
    }

    const finalAmount = amount > 0 ? Math.max(amount - discount, 0.5) : amount;

    res.json({
      valid: true,
      discount: parseFloat(discount.toFixed(2)),
      finalAmount: parseFloat(finalAmount.toFixed(2)),
      couponId: coupon.id,
    });
  } catch (err) {
    console.error('[coupon] validateCoupon error:', err);
    res.status(500).json({ valid: false, message: 'Failed to validate coupon' });
  }
};

// ---------------------------------------------------------------------------
// issueLoyaltyCoupon — called from stripeController after payment_intent.succeeded
// Fire-and-forget: caller must .catch() this
// ---------------------------------------------------------------------------
export const issueLoyaltyCoupon = async (
  userId: string,
  sourcePurchaseId: string,
): Promise<void> => {
  // Fetch user for email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) {
    console.warn('[coupon] issueLoyaltyCoupon: user not found', userId);
    return;
  }

  // Generate unique code — retry once on collision (extremely rare)
  let code = generateCouponCode();
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) code = generateCouponCode();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await prisma.coupon.create({
    data: {
      code,
      userId,
      discountType: 'FIXED',
      discountValue: 5.0,
      status: 'ACTIVE',
      sourcePurchaseId,
      expiresAt,
    },
  });

  // Send coupon email
  const resend = getResendClient();
  if (!resend) return;

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'rewards@finda.sale';
  const couponsUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;

  try {
    const html = buildEmail({
      preheader: `Your $5 coupon code: ${code}`,
      headline: "You've earned a $5 coupon! 🎉",
      accentColor: '#10b981',
      body: `
        <p>Hi ${user.name},</p>
        <p>Thanks for your purchase! As a thank-you, here's a <strong>$5 off</strong> coupon for your next FindA.Sale purchase:</p>
        <div style="text-align:center; margin: 24px 0;">
          <span style="display:inline-block; background:#f0fdf4; border:2px dashed #16a34a; border-radius:8px; padding:16px 32px; font-family:monospace; font-size:28px; font-weight:700; letter-spacing:0.2em; color:#15803d;">
            ${code}
          </span>
        </div>
        <p style="text-align:center; color:#6b7280; font-size:13px;">Expires ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <p>Apply this code at checkout on your next purchase. No minimum order required.</p>
      `,
      ctaText: 'View My Coupons',
      ctaUrl: couponsUrl,
      footerNote: 'Valid for 90 days on any FindA.Sale purchase.',
    });

    await resend.emails.send({
      from: fromEmail,
      to: user.email,
      subject: `🎟️ Your $5 coupon — code: ${code}`,
      html,
    });
  } catch (emailErr) {
    console.warn('[coupon] Failed to send coupon email:', emailErr);
    // Coupon was already created — email failure is non-fatal
  }
};

// ---------------------------------------------------------------------------
// markCouponUsed — called from stripeController after payment_intent.succeeded
// Fire-and-forget: caller must .catch() this
// ---------------------------------------------------------------------------
export const markCouponUsed = async (
  couponId: string,
  redeemedPurchaseId: string,
): Promise<void> => {
  await prisma.coupon.update({
    where: { id: couponId },
    data: {
      status: 'USED',
      usedAt: new Date(),
      redeemedPurchaseId,
    },
  });
};
