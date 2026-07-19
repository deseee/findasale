import { Router, Request, Response } from 'express';
import { register, login, oauthLogin, redeemInvite, verifyEmail, oauthVerifyAge, linkOAuthProvider, getRegistrationChallenge } from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { transactionalEmailService } from '../lib/transactionalEmailService';

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

// C2: Tight rate limit specifically for password reset
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
  keyGenerator: (req) => `reset:${req.body?.token || req.params?.token || 'unknown'}:${ipKeyGenerator(req as any)}`,
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

// L1: Login rate limiter
// QA bypass: if QA_RATE_LIMIT_BYPASS_SECRET is set in Railway env vars, requests carrying
// that secret in the X-QA-Bypass header skip this limiter entirely.
// This fixes the bug where Chrome QA sessions hit the 15-attempt cap during wrong-account
// login tests and account switching (bug #431). The authLimiter in index.ts has the same bypass.
const isQABypass = (req: import('express').Request): boolean => {
  const secret = process.env.QA_RATE_LIMIT_BYPASS_SECRET;
  if (!secret) return false;
  return req.headers['x-qa-bypass'] === secret;
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Please try again in 15 minutes.' },
  skip: (req) => isQABypass(req),
});

// L2: Register rate limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' },
  skip: (req) => isQABypass(req),
});

const router = Router();

// P0 SECURITY FIX (2026-07-19): first-party PoW challenge, replaces removed Turnstile CAPTCHA.
// Stateless — no rate limiting needed here, registration itself is already rate-limited below.
router.get('/register-challenge', getRegistrationChallenge);
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/oauth', loginLimiter, oauthLogin); // OAuth is authentication not registration; loginLimiter (skipSuccessfulRequests) is correct here
router.post('/redeem-invite', authenticate, redeemInvite);
router.post('/verify-email', verifyEmailLimiter, verifyEmail);
router.post('/resend-verification', verifyEmailLimiter, async (req: Request, res: Response) => {
  // P0 Security Fix Item 5: Email verification resend endpoint with enumeration prevention
  try {
    const { email: rawEmail } = req.body;
    const email = rawEmail?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    const genericResponse = { message: "If that email exists and hasn't been verified, a verification link has been sent." };

    if (!user) {
      return res.json(genericResponse);
    }

    if (user.emailVerified) {
      return res.json(genericResponse);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const newToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: newToken }
    });
    const verifyUrl = `${frontendUrl}/verify-email?token=${newToken}`;
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    if (user.emailVerificationToken) {
      try {
        await transactionalEmailService.emails.send({
          from: fromEmail,
          to: email,
          subject: 'Verify your FindA.Sale email address',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <h2 style="color:#2563eb;">Verify your email</h2>
              <p>Click the button below to verify your email address and complete your FindA.Sale account setup.</p>
              <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0;">Verify Email</a>
              <p style="color:#6b7280;font-size:13px;">This link will expire in 24 hours.</p>
              <p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('[Email Verification] Failed to send email:', emailError);
      }
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error processing your request' });
  }
});
router.post('/oauth-verify-age', authenticate, oauthVerifyAge);
router.post('/oauth/link', authenticate, linkOAuthProvider);

// Change password
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
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } }
    });

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

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);
    const { email } = validatedData;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    try {
      await transactionalEmailService.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Reset your FindA.Sale password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#2563eb;">Reset your password</h2>
            <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0;">Reset Password</a>
            <p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
            <p style="color:#9ca3af;font-size:12px;">Link expires: ${expiry.toUTCString()}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
            <p style="color:#9ca3af;font-size:11px;">For your security, this request was made from IP <code>${clientIp}</code> using <code>${userAgent.substring(0, 60)}...</code>. If this was not you, you can ignore this email and your password will remain unchanged.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn(`[Password Reset] Reset email not sent for ${email} — SMTP not configured.`);
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

// POST /api/auth/reset-password
router.post('/reset-password', resetPasswordLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    const { token, newPassword } = validatedData;

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
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

// P0 Security Fix: POST /auth/logout
router.post('/logout', (req: AuthRequest, res: Response) => {
  res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.json({ message: 'Logged out' });
});

// P0 Security Fix: POST /auth/refresh
router.post('/refresh', async (req: AuthRequest, res: Response) => {
  try {
    // ADR-088: cookie-FIRST (web app), X-Refresh-Token header FALLBACK (browser
    // extension SW — SameSite=Lax blocks cookie auto-attach on the extension-origin
    // fetch). Source only; ALL downstream checks run identically regardless of source.
    const refreshToken = req.cookies?.refreshToken || req.header('X-Refresh-Token') || undefined;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET not configured' });
    }

    // P2 Security Fix: in production, a missing dedicated refresh secret is a hard
    // misconfiguration — never silently fall back to JWT_SECRET (token-confusion risk).
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_REFRESH_SECRET) {
      console.error('[SECURITY] JWT_REFRESH_SECRET is not configured in production — refusing to mint tokens from a shared secret.');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || jwtSecret) as any;

    // P2 Security Fix: mirror the `authenticate` middleware — enforce tokenVersion,
    // organizerTokenVersion, and suspension so a stolen/old refresh token cannot keep
    // minting valid access tokens after password reset / logout-all / suspension.
    const freshUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        role: true,
        roles: true,
        tokenVersion: true,
        suspendedAt: true,
        organizer: { select: { tokenVersion: true } },
      },
    });
    if (!freshUser) return res.status(401).json({ error: 'User not found' });

    // Suspended accounts must re-authenticate — fail closed and clear cookies.
    if (freshUser.suspendedAt) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Session invalidated — please log in again.' });
    }

    // tokenVersion enforcement (matches authenticate): reject stale/invalidated sessions.
    if (payload.tokenVersion === undefined ? freshUser.tokenVersion > 0 : payload.tokenVersion !== freshUser.tokenVersion) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Session invalidated — please log in again.' });
    }

    // organizerTokenVersion enforcement for organizers — invalidate stale tier claims.
    const isOrganizer = freshUser.role === 'ORGANIZER' || freshUser.roles?.includes('ORGANIZER');
    if (isOrganizer && payload.organizerTokenVersion !== undefined && freshUser.organizer) {
      if (payload.organizerTokenVersion !== freshUser.organizer.tokenVersion) {
        res.clearCookie('accessToken', { path: '/' });
        res.clearCookie('refreshToken', { path: '/' });
        return res.status(401).json({ error: 'Session invalidated — please log in again.' });
      }
    }

    const newAccessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: freshUser.role,
        roles: freshUser.roles || [freshUser.role],
        tokenVersion: freshUser.tokenVersion,
        organizerTokenVersion: freshUser.organizer?.tokenVersion ?? 0,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000,
    });

    res.json({ token: newAccessToken });
  } catch (error) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// P1 Security Fix: GET /auth/me — strip sensitive credential fields before sending
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { subscriptionTier: true, subscriptionStatus: true },
  }).catch(() => null);

  // Strip sensitive fields that must never leave the server
  const {
    password,
    resetToken,
    resetTokenExpiry,
    emailVerificationToken,
    ...safeUser
  } = req.user;

  res.json({
    user: {
      ...safeUser,
      organizerTier: organizer?.subscriptionTier ?? 'SIMPLE',
      subscriptionStatus: organizer?.subscriptionStatus ?? null,
      subscriptionLapsed: req.user.subscriptionLapsed ?? false,
    },
  });
});

export default router;
