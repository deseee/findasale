import { Router, Request, Response } from 'express';
import { register, login, oauthLogin, redeemInvite, verifyEmail, oauthVerifyAge, linkOAuthProvider, getRegistrationChallenge, exitImpersonation } from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
// 2026-09-30: ipKeyGenerator takes the IP STRING. The old calls passed the whole request object, which it returns unchanged, so
// every key template interpolated '[object Object]' and all clients shared one bucket (login-ip:/forgot-ip:/reset: keys).
import { z } from 'zod';
import { createRateLimitStore, isWhitelistedIP } from '../middleware/rateLimitShared'; // rate-limit hardening Item 2
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { createNotification } from '../lib/notificationService';
import { escapeHtml } from '../utils/htmlEscape';
import { normalizeEmailInput, stripSensitiveUserFields, hashOpaqueToken, tokenLookupCandidates } from '../utils/authSecurity';
import { requireSameSiteOrigin } from '../middleware/requireSameSiteOrigin'; // 2026-09-30: Origin/Referer allowlist for the CSRF-exempt cookie POSTs /logout and /refresh
import { rotateRefreshToken, revokeAllRefreshTokensForUser, revokeFamilyOfToken, setRefreshCookie } from '../services/refreshTokenService';

// Auth validation schemas
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

const forgotPasswordSchema = z.object({
  // 2026-09-29: trim + lowercase so "Alice@Example.com " finds the same account login and register use
  // (they normalize; this route used to look up the raw string and silently miss).
  email: z.string().trim().toLowerCase().email('Valid email is required'),
});

// 2026-09-30: pages/reset-password.tsx has always POSTed { token, password } while this schema only knew
// `newPassword`, so every reset from the real page failed validation. Both names are accepted now.
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters').optional(),
}).refine((d) => d.newPassword !== undefined || d.password !== undefined, {
  message: 'Password must be at least 8 characters',
  path: ['newPassword'],
});

// C2: Tight rate limit specifically for password reset
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
  store: createRateLimitStore('rl:forgot:'), // 2026-09-29: shared across instances, restart-proof; falls back to memory without Redis
});

// 2026-09-29: per-EMAIL cap on top of the per-IP one above. Without it a botnet (or one person rotating IPs) could
// mail-bomb a victim's inbox with reset links. Over the cap it answers with the SAME generic success body, so the
// response never reveals that the limit was hit or whether the account exists.
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const e = normalizeEmailInput((req as any).body?.email);
    return e ? `forgot-email:${e}` : `forgot-ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  },
  store: createRateLimitStore('rl:forgot-email:'),
});

// 2026-09-29: per-ACCOUNT failed-login cap on top of the per-IP loginLimiter. The IP limiter alone lets a botnet
// (or one attacker rotating IPs) guess passwords for a single account without limit. Counts failures only
// (skipSuccessfulRequests), keyed by the normalized email; 20 failures / 15 min / account. Tradeoff: someone who
// knows a victim's email can lock the login form for that account for up to 15 minutes; password reset is not
// affected by this limiter, and 20 is high enough that a real user mistyping never hits it.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const e = normalizeEmailInput((req as any).body?.email);
    return e ? `login-acct:${e}` : `login-ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts for this account. Please try again in 15 minutes.' },
  skip: (req) => isQABypass(req),
  store: createRateLimitStore('rl:login-acct:'),
});

// P0 Security Fix Item 4: Rate limit for reset-password endpoint (per token, 5 attempts)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => `reset:${req.body?.token || req.params?.token || 'unknown'}:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please request a new reset link.' },
  store: createRateLimitStore('rl:reset:'),
});

// P0 Security Fix Item 5: Email verification resend rate limiter (3 requests/hour/IP)
const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please try again in an hour.' },
  store: createRateLimitStore('rl:verify:'),
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

// rate-limit hardening Item 2 (2026-08-27): whitelisted IP gets a MATERIALLY HIGHER cap,
// not an unconditional skip -- Hacker review flagged that an unconditional bypass on these
// two TIGHTEST limiters (login/register) is a real risk: home/residential IPs are
// DHCP-leased and get reassigned, and if RATE_LIMIT_WHITELIST_IPS is ever expanded to a
// shared IP (coworking space, coffee shop, VPN exit), anyone sharing that IP would inherit
// unlimited login/register attempts, defeating brute-force protection entirely. Also adds a
// Redis-backed store -- previously in-memory only, so the ONLY way to clear either limiter
// once tripped was a full backend process restart (confirmed: what happened today, and why
// Patrick's own whitelisted IP stayed blocked from his own login test).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => (isWhitelistedIP(req) ? 100 : 15),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Please try again in 15 minutes.' },
  skip: (req) => isQABypass(req),
  store: createRateLimitStore('rl:login:'),
});

// L2: Register rate limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => (isWhitelistedIP(req) ? 20 : 5), // rate-limit hardening Item 2 -- see loginLimiter comment above
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' },
  skip: (req) => isQABypass(req),
  store: createRateLimitStore('rl:register:'),
});

const router = Router();

// P0 SECURITY FIX (2026-07-19): first-party PoW challenge, replaces removed Turnstile CAPTCHA.
// Stateless — no rate limiting needed here, registration itself is already rate-limited below.
router.get('/register-challenge', getRegistrationChallenge);
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, loginAccountLimiter, login);
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
    // 2026-08-08 (shipped-batch verification, roadmap #606 fix): also refresh
    // emailVerificationTokenExpiry to +24h from now, same as registration does
    // (authController.ts). Previously only the token itself was reissued -- the
    // expiry stayed at its original registration-time value, so anyone who waited
    // past that original 24h window (exactly who "resend" exists for) got a fresh
    // token that verifyEmail() would reject as already-expired.
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: hashOpaqueToken(newToken), emailVerificationTokenExpiry: newExpiry } // 2026-09-30: hashed at rest, raw token only in the link
    });
    const verifyUrl = `${frontendUrl}/verify-email?token=${newToken}`;
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    if (user.emailVerificationToken) {
      try {
        // 2026-09-29: not awaited, so response time does not reveal whether the address has an unverified account.
        void Promise.resolve(transactionalEmailService.emails.send({
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
        })).catch((emailError) => {
          console.error('[Email Verification] Failed to send email:', emailError);
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
    // 2026-09-30: tokenVersion already rejects every old refresh token; also revoke the rotation families outright.
    await revokeAllRefreshTokensForUser(req.user.id, 'password_change');

    // Security notification: alert the account owner their password changed, in case
    // this wasn't them (ADD, S1192 security-notification audit). sendEmail: true --
    // security-sensitive events default to email, not just in-app, per audit directive.
    createNotification({
      userId: req.user.id,
      type: 'password_changed',
      title: 'Your password was changed',
      body: 'Your FindA.Sale password was just changed. If this was not you, reset your password immediately and contact support.',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send password_changed notification:', err);
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
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordEmailLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);
    const { email } = validatedData;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashOpaqueToken(token), resetTokenExpiry: expiry }, // 2026-09-30: hashed at rest, raw token only in the link
    });

    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    try {
      // 2026-09-29: not awaited. Awaiting only for existing accounts made the response measurably slower for a
      // registered email than for an unknown one (account enumeration by timing).
      void Promise.resolve(transactionalEmailService.emails.send({
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
            <p style="color:#9ca3af;font-size:11px;">For your security, this request was made from IP <code>${escapeHtml(clientIp)}</code> using <code>${escapeHtml(userAgent.substring(0, 60))}...</code>. If this was not you, you can ignore this email and your password will remain unchanged.</p>
          </div>
        `,
      })).catch(() => {
        console.warn('[Password Reset] Reset email not sent — SMTP not configured or provider error.');
      });
    } catch (emailErr) {
      console.warn('[Password Reset] Reset email not sent — SMTP not configured or provider error.');
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
    const { token } = validatedData;
    const newPassword = (validatedData.newPassword ?? validatedData.password) as string;

    // 2026-09-30: tokens are stored as 'sha256:<hex>'. Match the hashed form first, then a legacy plaintext row written
    // before this change (valid for at most its original 1h). A presented value that starts with the hash marker
    // yields no candidates, so a leaked stored hash cannot be replayed as a token.
    let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
    for (const candidate of tokenLookupCandidates(token)) {
      user = await prisma.user.findUnique({ where: { resetToken: candidate } });
      if (user) break;
    }
    if (!user || !user.resetToken || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    // 2026-09-29: single-use must be ATOMIC. The read above and the write below used to be separate statements, so two
    // concurrent requests carrying the same token could both pass the check and both set a password. The conditional
    // updateMany matches only while the token is still set and unexpired; exactly one caller gets count === 1.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, resetToken: user.resetToken, resetTokenExpiry: { gt: new Date() } }, // the exact stored value that matched (hashed or legacy plaintext)
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 }
      },
    });
    if (claimed.count !== 1) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }
    await revokeAllRefreshTokensForUser(user.id, 'password_change'); // 2026-09-30: every device signs in again

    // Security notification: alert the account owner their password was reset via the
    // forgot-password flow, in case this wasn't them (ADD, S1192 security-notification
    // audit). sendEmail: true -- security-sensitive events default to email.
    createNotification({
      userId: user.id,
      type: 'password_changed',
      title: 'Your password was reset',
      body: 'Your FindA.Sale password was just reset via the "forgot password" link. If this was not you, contact support immediately.',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send password_changed (reset) notification:', err);
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
router.post('/logout', requireSameSiteOrigin, async (req: AuthRequest, res: Response) => {
  // 2026-09-30: revoke the refresh-token family so the cookie cannot be replayed after logout. Best effort.
  await revokeFamilyOfToken(req.cookies?.refreshToken || req.header('X-Refresh-Token'), 'logout');
  res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.json({ message: 'Logged out' });
});

// P0 Security Fix: POST /auth/refresh
router.post('/refresh', requireSameSiteOrigin, async (req: AuthRequest, res: Response) => {
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

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || jwtSecret, { algorithms: ['HS256'] }) as any; // 2026-09-29: pin the algorithm like authenticate() does

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
        deletedAt: true, // 2026-09-30: a soft-deleted account must not keep refreshing
        // S-TIER-RECONCILE: subscriptionTier/Status/onboardingComplete added to an
        // ALREADY-EXECUTING select — no additional query, only extra columns.
        organizer: {
          select: {
            tokenVersion: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            onboardingComplete: true,
          },
        },
      },
    });
    if (!freshUser) return res.status(401).json({ error: 'User not found' });

    // Suspended accounts must re-authenticate — fail closed and clear cookies.
    if (freshUser.suspendedAt || freshUser.deletedAt) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      // 2026-09-30: stable code so the frontend can log a removed account out cleanly and explain a suspension
      // (it reads ACCOUNT_DELETED / ACCOUNT_SUSPENDED); the error text is unchanged.
      return res.status(401).json({ error: 'Session invalidated. Please log in again.', code: freshUser.deletedAt ? 'ACCOUNT_DELETED' : 'ACCOUNT_SUSPENDED' });
    }

    // tokenVersion enforcement (matches authenticate): reject stale/invalidated sessions.
    if (payload.tokenVersion === undefined ? freshUser.tokenVersion > 0 : payload.tokenVersion !== freshUser.tokenVersion) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
    }

    // S1197 fix: organizerTokenVersion is INTENTIONALLY not enforced here (it previously
    // was, matching `authenticate`, and that was the actual root cause of "tier change
    // forces a hard logout"). organizerTokenVersion exists to make an already-issued
    // 1h ACCESS token go stale fast when tier changes (see middleware/auth.ts
    // authenticate()) — every tier-affecting update (syncTier.ts, both Stripe webhook
    // handlers) bumps it on purpose, on every upgrade AND downgrade. But the refresh
    // TOKEN embeds organizerTokenVersion from LOGIN time, so applying the same
    // equality check here meant the refresh token itself went stale in lockstep with
    // the access token on every tier change — the frontend's 401 interceptor
    // (lib/api.ts) calls POST /auth/refresh to recover silently, and that call was
    // ALSO rejected, forcing a full re-login right after a customer just paid for an
    // upgrade. tokenVersion (below) still gates the refresh token correctly for actual
    // security events (password reset, logout-all, suspension) — those are rare and
    // SHOULD force re-auth. Tier changes are not a security event and should not.
    // The reissued access token always carries the FRESH organizer.tokenVersion read
    // from the DB just below (S-TIER-RECONCILE), so the new access token is correct
    // and up to date regardless of what the old refresh token's stale claim said.
    const isOrganizer = freshUser.role === 'ORGANIZER' || freshUser.roles?.includes('ORGANIZER');

    // S-TIER-RECONCILE: the refreshed access token previously carried NO
    // `subscriptionTier` claim. AuthContext.resolveOrganizerTier() no longer falls
    // back to 'SIMPLE', so any consumer that decodes this token sees the tier as
    // UNKNOWN and useOrganizerTier.canAccess() closes every gate above SIMPLE.
    // Claim block copied from authController.ts login() (:897) so a refreshed token
    // is tier-equivalent to a freshly-logged-in one.
    //
    // Feature #75: lapse state must be minted alongside the tier. Emitting
    // subscriptionTier on its own would let a lapsed organizer's paid features
    // un-gate on the client, because a missing lapse flag defaults to false there.
    // This is the ONE extra query this handler adds, and only for organizers.
    let subscriptionLapsed = false;
    if (isOrganizer) {
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: payload.id, role: 'ORGANIZER' },
        select: { tierLapsedAt: true, tierResumedAt: true },
      });
      subscriptionLapsed =
        roleSubscription !== null &&
        roleSubscription.tierLapsedAt !== null &&
        roleSubscription.tierResumedAt === null;
    }

    // 2026-09-30: rotation with reuse detection (services/refreshTokenService.ts). A cookie-sourced token is consumed
    // and replaced by the next one in its family; a header-sourced one (browser extension, which cannot store a
    // rotated cookie) is validated but not consumed. A replayed, revoked or unknown token ends the session.
    const rotation = await rotateRefreshToken({
      presented: refreshToken,
      payload,
      rotate: Boolean(req.cookies?.refreshToken),
      nextClaims: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: freshUser.role,
        roles: freshUser.roles || [freshUser.role],
        tokenVersion: freshUser.tokenVersion,
        organizerTokenVersion: freshUser.organizer?.tokenVersion ?? 0,
      },
      req,
    });
    if (!rotation.ok) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ error: 'Session invalidated. Please log in again.', code: rotation.code });
    }

    const newAccessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: freshUser.role,
        roles: freshUser.roles || [freshUser.role],
        tokenVersion: freshUser.tokenVersion,
        organizerTokenVersion: freshUser.organizer?.tokenVersion ?? 0,
        subscriptionTier: freshUser.organizer?.subscriptionTier ?? 'SIMPLE',
        subscriptionStatus: freshUser.organizer?.subscriptionStatus ?? null,
        subscriptionLapsed: subscriptionLapsed, // Feature #75: Tier lapse state
        onboardingComplete: freshUser.organizer?.onboardingComplete ?? false,
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

    if (rotation.rotated && rotation.refreshToken) setRefreshCookie(res, rotation.refreshToken);

    res.json({ token: newAccessToken });
  } catch (error) {
    // 2026-09-30: only a bad/expired JWT means "the session is dead". A database hiccup used to clear both cookies and
    // sign the user out; answer 503 and keep the cookies so the next attempt can succeed.
    const name = (error as any)?.name;
    if (name !== 'JsonWebTokenError' && name !== 'TokenExpiredError' && name !== 'NotBeforeError') {
      console.error('[auth/refresh] transient failure:', error);
      return res.status(503).json({ error: 'Temporarily unavailable. Please retry.' });
    }
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// Exit an active admin impersonation session and restore the admin's own full session.
// authenticate ONLY -- deliberately no admin-role gate: while impersonating, req.user.role
// IS the impersonated user's role, not ADMIN, so a role gate would lock the admin out of
// their own exit route. The real guard is exitImpersonation() checking for a server-signed
// impersonatedBy claim (see middleware/auth.ts and 2026-09-25 exit-impersonation-adr).
router.post('/exit-impersonation', authenticate, exitImpersonation);

// P1 Security Fix: GET /auth/me — strip sensitive credential fields before sending
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

  // S-TIER-RECONCILE: `authenticate` has ALREADY loaded the organizer row
  // (middleware/auth.ts: `include: { organizer: true }`) and attached it as
  // req.user.organizerProfile. That is the exact same object requireTier()
  // reads Organizer.subscriptionTier from, so sourcing the tier from it here
  // makes /auth/me agree with the backend gate by construction.
  //
  // The previous code re-queried the organizer row and swallowed any failure
  // with `.catch(() => null)`, then defaulted the tier to 'SIMPLE'. A single
  // transient database error therefore returned HTTP 200 telling the frontend
  // that a paying TEAMS customer was on the free plan — silently hiding every
  // paid feature while the backend happily kept authorising TEAMS routes.
  const attachedProfile = (req.user as any).organizerProfile ?? null;
  const organizer = attachedProfile
    ? attachedProfile
    : await prisma.organizer.findUnique({
        where: { userId: req.user.id },
        select: { subscriptionTier: true, subscriptionStatus: true },
      }).catch((err) => {
        console.error('[auth/me] organizer lookup failed — tier will be reported as UNKNOWN, not SIMPLE:', err);
        return undefined; // undefined = unknown; null would be indistinguishable from "no organizer"
      });

  const isOrganizerAccount =
    req.user.role === 'ORGANIZER' || (req.user as any).roles?.includes('ORGANIZER');

  // Unknown tier must stay distinguishable from a genuine SIMPLE tier so the
  // client can keep paid features gated WITHOUT showing upgrade prompts.
  let organizerTier: string | null;
  if (organizer === undefined) {
    organizerTier = null; // lookup genuinely failed
  } else if (organizer === null) {
    // No organizer profile at all. For a plain shopper that legitimately means SIMPLE.
    // For an account that carries the ORGANIZER role it is a data inconsistency.
    if (isOrganizerAccount) {
      console.error(`[auth/me] user ${req.user.id} has ORGANIZER role but no organizer profile — reporting tier as UNKNOWN.`);
      organizerTier = null;
    } else {
      organizerTier = 'SIMPLE';
    }
  } else {
    organizerTier = organizer.subscriptionTier ?? (isOrganizerAccount ? null : 'SIMPLE');
    if (organizerTier === null) {
      console.error(`[auth/me] organizer ${req.user.id} has a profile with no subscriptionTier — reporting tier as UNKNOWN.`);
    }
  }

  // Strip sensitive fields that must never leave the server
  // 2026-09-29: shared helper also strips emailVerificationTokenExpiry, deviceFingerprint and fraudSuspect.
  const safeUser = stripSensitiveUserFields(req.user as Record<string, any>);

  res.json({
    user: {
      ...safeUser,
      organizerTier,
      // S-TIER-RECONCILE: emit the JWT-shaped field name too, so any consumer
      // reading either `organizerTier` or `subscriptionTier` gets the same
      // value and a field-name mismatch can no longer downgrade a customer.
      subscriptionTier: organizerTier,
      subscriptionStatus: organizer?.subscriptionStatus ?? null,
      subscriptionLapsed: req.user.subscriptionLapsed ?? false,
    },
  });
});

export default router;
