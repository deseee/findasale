import { Router, Request, Response } from 'express';
import { register, login, oauthLogin, redeemInvite, verifyEmail, oauthVerifyAge } from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

// P0 Security Fix Item 4: Rate limit for reset-password endpoint (per token, 5 attempts)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => `reset:${req.body?.token || req.params?.token || 'unknown'}:${ipKeyGenerator(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please request a new reset link.' },
});

// P0 Security Fix Item 5: Email verification resend rate limiter (3 requests/hour/IP)
const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please try again in an hour.' },
});

// L1: Login rate limiter — 5 attempts per 15 minutes per IP (P0-S2: COPPA compliance)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// L2: Register rate limiter — 3 attempts per hour per IP (P0-S2: COPPA compliance)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' },
});

let _resend: any = null;
const getResend = () => {
  if (!_resend && process.env.RESEND_API_KEY) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
};

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/oauth', oauthLogin); // Phase 31: social login token exchange
router.post('/redeem-invite', authenticate, redeemInvite); // Redeem beta invite for OAuth users
router.post('/verify-email', verifyEmail); // Security: Email verification gate (P0)
router.post('/resend-verification', verifyEmailLimiter, async (req: Request, res: Response) => {
  // P0 Security Fix Item 5: Email verification resend endpoint with enumeration prevention
  try {
    const { email: rawEmail } = req.body;
    const email = rawEmail?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic response regardless of whether email exists (prevents enumeration)
    const genericResponse = { message: 'If that email exists and hasn\'t been verified, a verification link has been sent.' };

    if (!user) {
      return res.json(genericResponse);
    }

    // If email is already verified, also return generic response
    if (user.emailVerified) {
      return res.json(genericResponse);
    }

    // Send verification email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${user.emailVerificationToken}`;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';
    const resend = getResend();

    if (resend && user.emailVerificationToken) {
      try {
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: 'Verify your FindA.Sale email address',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <h2 style="color:#2563eb;">Verify your email</h2>
              <p>Click the button below to verify your email address and complete your FindA.Sale account setup.</p>
              <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0;">Verify Email</a>
              <p style="color:#6b7280;font-size:13px;">This link will expire in 24 hours.</p>
              <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('[Email Verification Resend] Failed to send email:', emailError);
      }
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error processing your request' });
  }
});
router.post('/oauth-verify-age', authenticate, oauthVerifyAge); // P0-L1: COPPA compliance — OAuth age verification

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

    // P0 Security Fix Item 3: Clear access and refresh cookies on password change
    res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });

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

    // P0 Security Fix Item 6: Include IP and User-Agent context in password reset email
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

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
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
            <p style="color:#9ca3af;font-size:11px;">For your security, this request was made from IP <code>${clientIp}</code> using <code>${userAgent.substring(0, 60)}...</code>. If this wasn't you, you can ignore this email and your password will remain unchanged.</p>
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

// POST /api/auth/reset-password — verify token and set new password (with rate limiting)
router.post('/reset-password', resetPasswordLimiter, async (req: Request, res: Response) => {
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

// P0 Security Fix: POST /auth/logout — clears both accessToken and refreshToken cookies
router.post('/logout', (req: AuthRequest, res: Response) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/auth/refresh' });
  res.json({ message: 'Logged out' });
});

// P0 Security Fix: POST /auth/refresh — issues new access token using refresh token
router.post('/refresh', (req: AuthRequest, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET not configured' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || jwtSecret) as any;

    const newAccessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        roles: payload.roles || [payload.role],
      },
      jwtSecret,
      { expiresIn: '15m' }
    );

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: true, // P0 Security Fix Item 7: Always require HTTPS
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.json({ token: newAccessToken });
  } catch (error) {
    // Refresh token invalid or expired — clear both cookies and return 401
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// P0 Security Fix: GET /auth/me — returns current user from authenticated session (cookie or header)
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
