import { Router, Request, Response } from 'express';
import { register, login, oauthLogin, redeemInvite } from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Auth validation schemas
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// C2: Tight rate limit specifically for password reset — prevents email enumeration abuse and account takeover attempts
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
});

let _resend: any = null;
const getResend = () => {
  if (!_resend && process.env.RESEND_API_KEY) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
};

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/oauth', oauthLogin); // Phase 31: social login token exchange
router.post('/redeem-invite', authenticate, redeemInvite); // Redeem beta invite for OAuth users

// Change password — requires current password for verification
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    const { currentPassword, newPassword } = validatedData;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.password) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    // P0 Fix 4: Increment tokenVersion to invalidate all old JWTs
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Change password error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password — send a reset link
router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);
    const { email } = validatedData;

    const user = await prisma.user.findUnique({ where: { email } });
    // Always respond with 200 to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';
    const resend = getResend();

    if (resend) {
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Reset your FindA.Sale password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#2563eb;">Reset your password</h2>
            <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0;">Reset Password</a>
            <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
            <p style="color:#9ca3af;font-size:12px;">Link expires: ${expiry.toUTCString()}</p>
          </div>
        `,
      });
    } else {
      console.warn(`[Password Reset] Reset email not sent for ${email} — RESEND_API_KEY not configured.`);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Forgot password error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/reset-password — verify token and set new password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    const { token, newPassword } = validatedData;

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    // P0 Fix 4: Increment tokenVersion to invalidate all old JWTs
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 }
      },
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Reset password error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ message: 'Server error.' });
  }
});

export default router;
