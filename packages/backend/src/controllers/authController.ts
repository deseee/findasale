import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../index';
import { randomUUID } from 'crypto';
import { handleReferralBadge } from './userController';
import { addShopperSubscriber, addOrganizerSubscriber, isTestOrSyntheticEmail } from '../services/mailerliteService';
import { processReferral } from '../services/referralService';
import { awardXp, XP_AWARDS } from '../services/xpService';
import { referralTrancheService } from '../services/referralTrancheService';
import { checkRegistrationLimit, recordRegistration } from '../lib/registrationRateLimiter';
import { issueChallenge, verifyChallenge } from '../lib/registrationChallenge';
import { recordRegistration as recordFraudRegistration } from '../lib/fraudDetectionService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { AuthRequest } from '../middleware/auth';
import { escapeHtml } from '../utils/htmlEscape';
import { isSameOriginRedirect, checkAdultDob, passwordProblem, normalizeEmailInput, stripSensitiveUserFields, hashOpaqueToken, tokenLookupCandidates } from '../utils/authSecurity';
import { issueRefreshToken } from '../services/refreshTokenService';
import { enforceOAuthAssertion } from '../utils/oauthAssertion';

// SECURITY FIX P0: OAuth redirect URI allowlist to prevent open redirect attacks
const ALLOWED_REDIRECT_URIS = () => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return [
    frontendUrl,
    `${frontendUrl}/organizer/dashboard`,
    `${frontendUrl}/browse`,
  ];
};

// Validate redirect URI against allowlist — returns true if valid
const isValidRedirectUri = (uri: string | null | undefined): boolean => {
  if (!uri) return true; // null/undefined is valid (no redirect requested)

  // 2026-09-29: exact ORIGIN match. The old `uri.startsWith(frontendUrl)` accepted https://finda.sale.evil.com
  // and https://finda.sale@evil.com/x (open redirect). ALLOWED_REDIRECT_URIS above is kept for reference; any path
  // on the frontend origin is fine, so origin equality is the whole test.
  return isSameOriginRedirect(uri, process.env.FRONTEND_URL || 'http://localhost:3000');
};

// P0 SECURITY FIX (2026-07-19): GET /auth/register-challenge — issues a stateless,
// signed proof-of-work challenge (see claude_docs/feature-notes/adr-registration-pow-2026-07-19.md).
// Public, unauthenticated, no rate limiting needed — cheap to issue, and the actual
// registration this feeds into is already rate-limited.
export const getRegistrationChallenge = async (req: Request, res: Response) => {
  try {
    const { token, difficulty } = issueChallenge();
    res.json({ token, difficulty });
  } catch (error) {
    console.error('[auth] Failed to issue registration challenge:', error);
    res.status(500).json({ message: 'Server misconfigured. Could not issue verification challenge.' });
  }
};

// 2026-09-30 (enumeration): a sign-up for an address that already has an account used to answer 409, which told anyone
// whether an email is registered. Both outcomes now answer with this same 201 body and NO session (Set-Cookie would
// be a tell), and the existing owner gets a "someone tried to register with your address" email instead. The
// frontend signs the new user in with a follow-up POST /auth/login (see pages/register.tsx).
export const REGISTER_ACCEPTED_BODY = { message: 'Check your email to finish signing up' };

// At most one notice per address per hour, so the register form cannot be used to mail-bomb a victim.
const registerNoticeSentAt = new Map<string, number>();
const REGISTER_NOTICE_WINDOW_MS = 60 * 60 * 1000;
/** Test helper. */
export const __resetRegisterNoticeThrottle = () => registerNoticeSentAt.clear();

function notifyExistingOwnerOfRegistrationAttempt(existing: { email: string; name?: string | null }) {
  try {
    const key = existing.email.toLowerCase();
    const now = Date.now();
    const last = registerNoticeSentAt.get(key);
    if (last !== undefined && now - last < REGISTER_NOTICE_WINDOW_MS) return;
    registerNoticeSentAt.set(key, now);
    if (registerNoticeSentAt.size > 5000) {
      for (const [k, t] of registerNoticeSentAt) if (now - t >= REGISTER_NOTICE_WINDOW_MS) registerNoticeSentAt.delete(k);
    }
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    const base = process.env.FRONTEND_URL || 'https://finda.sale';
    // Not awaited: response time must not depend on whether the address has an account.
    void Promise.resolve(transactionalEmailService.emails.send({
      from: fromEmail,
      to: existing.email,
      subject: 'Someone tried to sign up with your email address',
      html: `
        <p>Hello,</p>
        <p>Someone tried to create a FindA.Sale account using this email address. Because an account already exists for it, nothing was changed.</p>
        <p>If that was you, you can <a href="${base}/login">sign in</a>, or <a href="${base}/forgot-password">reset your password</a> if you have forgotten it.</p>
        <p>If it was not you, you can ignore this email. Nobody has access to your account.</p>
        <p>The FindA.Sale Team</p>
      `,
    })).catch((err) => console.error('[register] Failed to send existing-account notice:', err));
  } catch (err) {
    console.error('[register] Failed to send existing-account notice:', err);
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, name: rawName, role, referralCode, affiliateReferralCode, inviteCode, businessName, phone, businessAddress, consentOrganizer, consentShopper, deviceFingerprint, dateOfBirth, country, province, challengeToken, challengeNonce, website, claimOrganizerId } = req.body;

    // H3: Normalise email/name to prevent duplicate accounts from whitespace/case variations
    // 2026-09-29: non-string body values used to throw a TypeError here (500) instead of a 400.
    const email = normalizeEmailInput(rawEmail);
    const name = typeof rawName === 'string' ? rawName.trim() : undefined;

    // Security: IP-based rate limiting on registrations
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';

    // P0 SECURITY FIX (2026-07-19): honeypot field — real users never see or fill this input
    // (hidden off-screen in register.tsx). Non-empty means a bot filled every visible-looking
    // field. Return the SAME generic validation-style error as a normal bad request — never
    // reveal that a honeypot was tripped, or bots simply learn to leave it blank.
    if (website) {
      return res.status(400).json({ message: 'Registration could not be completed. Please check your information and try again.' });
    }

    // P0 SECURITY FIX (2026-07-19): first-party proof-of-work challenge, replaces removed
    // Cloudflare Turnstile (blocked outright by standard ad-block — see ADR
    // claude_docs/feature-notes/adr-registration-pow-2026-07-19.md). Verified before rate
    // limiting so a failed challenge never consumes the IP's rate-limit budget. Fails closed.
    const challengeResult = verifyChallenge(challengeToken, challengeNonce);
    if (!challengeResult.valid) {
      return res.status(400).json({
        code: 'CHALLENGE_VERIFICATION_FAILED',
        message: 'Verification failed. Please refresh and try again.',
      });
    }

    const rateLimitStatus = await checkRegistrationLimit(clientIp);
    if (rateLimitStatus.limited) {
      return res.status(429).json({
        code: 'REGISTRATION_RATE_LIMITED',
        message: 'Too many accounts created from this IP. Please try again later.',
        resetAt: rateLimitStatus.resetAt,
      });
    }

    // 2026-09-29: register accepted any password (even none, which then crashed bcrypt with a 500) and any junk email.
    if (!email || email.length > 254 || !email.includes('@')) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }
    if (name === undefined || name.length > 200) {
      return res.status(400).json({ message: 'A valid name is required.' });
    }
    const registerPasswordProblem = passwordProblem(password);
    if (registerPasswordProblem) {
      return res.status(400).json({ message: registerPasswordProblem });
    }

    // Validate invite code if provided (beta access gate)
    let validatedInvite: Awaited<ReturnType<typeof prisma.betaInvite.findUnique>> = null;
    if (inviteCode) {
      validatedInvite = await prisma.betaInvite.findUnique({
        where: { code: inviteCode.toUpperCase() }
      });
      if (!validatedInvite) {
        return res.status(400).json({ message: 'Invalid invite code' });
      }
      if (validatedInvite.usedAt) {
        return res.status(400).json({ message: 'This invite code has already been used' });
      }
      if (validatedInvite.email && validatedInvite.email.toLowerCase() !== email) {
        return res.status(400).json({ message: 'This invite code is restricted to a different email address' });
      }
    }

    // P0-L1: COPPA Compliance — Age verification (18+ required)
    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required.' });
    }

    // 2026-09-29: an unparseable date used to pass (NaN < 18 is false). checkAdultDob rejects it.
    const registerDob = checkAdultDob(dateOfBirth);
    if (registerDob === 'invalid') {
      return res.status(400).json({ message: 'Invalid date of birth format.' });
    }
    if (registerDob === 'minor') {
      return res.status(400).json({ message: 'You must be 18 or older to use FindA.Sale.' });
    }

    // #369: Quebec Block — Bill 96 provincial language law compliance
    // Quebec-based organizers cannot yet register; show friendly waitlist message
    if (country === 'CA' && province === 'QC') {
      return res.status(400).json({
        code: 'QUEBEC_NOT_SUPPORTED',
        message: "Quebec support is coming soon. We're actively working on provincial compliance. Join the waitlist at finda.sale/waitlist.",
      });
    }

    // Check if user already exists (Platform Safety #101: Email Verification Uniqueness).
    // 2026-09-30: runs AFTER every validation above so a bad invite code / date of birth answers identically for a
    // new and an existing address, then answers exactly like a successful sign-up (see REGISTER_ACCEPTED_BODY).
    // The password is hashed anyway and the IP rate-limit counter advances, so neither latency nor the eventual 429
    // reveals the branch.
    const saltRounds = 10;
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      await bcrypt.hash(password, saltRounds);
      notifyExistingOwnerOfRegistrationAttempt(existingUser);
      await recordRegistration(clientIp);
      return res.status(201).json(REGISTER_ACCEPTED_BODY);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique referral code
    const userReferralCode = randomUUID().substring(0, 8).toUpperCase();

    // Whitelist role — never allow client to self-assign ADMIN
    const safeRole = ['USER', 'ORGANIZER'].includes(role) ? role : 'USER';
    // Invite codes are issued for organizer beta access — always promote to ORGANIZER
    const effectiveRole = validatedInvite ? 'ORGANIZER' : safeRole;

    // 2026-09-30: the raw token only goes into the email link; the database stores its SHA-256 (hashOpaqueToken).
    const rawEmailVerificationToken = crypto.randomBytes(32).toString('hex');

    // DB2: Wrap user + organizer + referral creation atomically — prevents race-condition duplicate rewards
    const user = await prisma.$transaction(async (tx) => {
      const emailVerificationToken = hashOpaqueToken(rawEmailVerificationToken);

      // Hash deviceFingerprint before storage — raw fingerprint strings can exceed PostgreSQL btree
      // index row size limit (2704 bytes). SHA-256 produces a fixed 64-char hex string.
      const hashedFingerprint = deviceFingerprint
        ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex')
        : null;

      const newUser = await tx.user.create({
        data: {
          email,
          name,
          role: effectiveRole,
          roles: effectiveRole === 'USER' ? ['USER'] : ['USER', effectiveRole], // S983: set roles array on create (default is ['USER'] which bypasses the fallback for organizers)
          password: hashedPassword,
          referralCode: userReferralCode,
          deviceFingerprint: hashedFingerprint,
          emailVerified: false, // New accounts must verify email
          emailVerificationToken, // Store token for verification link
          emailVerificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // P0-3: Token expires 24h from now
          ageVerifiedAt: new Date(), // P0-L1: COPPA compliance — age verified at registration
        }
      });

      // Platform Safety #118: Device Fingerprinting — flag if 2+ accounts share same fingerprint
      if (hashedFingerprint) {
        const otherAccounts = await tx.user.count({
          where: {
            deviceFingerprint: hashedFingerprint,
            id: { not: newUser.id }
          }
        });
        if (otherAccounts > 0) {
          await tx.user.update({
            where: { id: newUser.id },
            data: { fraudSuspect: true }
          });
          console.log(`[FRAUD] New account ${newUser.id} (${newUser.email}) shares device fingerprint with ${otherAccounts} existing account(s)`);
        }
      }

      // BUG FIX (2026-07-20): when arriving via the organizer-profile "Claim This
      // Profile" flow (?claim=<organizerId>), do NOT auto-create a blank Organizer here —
      // that always collided with the follow-up POST /organizers/:id/claim-oauth call
      // (its existingOrg check saw the just-created blank profile and rejected the real
      // claim with 409 ALREADY_ORGANIZER, silently, 100% of the time). Skip creation and
      // let claim-oauth attach this user to the real existing listing instead.
      if (effectiveRole === 'ORGANIZER' && !claimOrganizerId) {
        await tx.organizer.create({
          data: {
            userId: newUser.id,
            businessName: businessName || name,
            phone: phone || '',
            address: businessAddress || '',
            country: country || 'US',
            province: province || null,
          }
        });
      }

      // SECURITY FIX P0: Handle referral INSIDE transaction to prevent race-condition duplicate rewards
      if (referralCode) {
        const referrer = await tx.user.findUnique({
          where: { referralCode },
          include: { organizer: true }
        });

        // D-XP-004 Phase 2: Self-referral gate — prevent users from using their own referral code
        if (referrer && (referrer.id !== newUser.id && referrer.email !== email)) {
          // Create referral record atomically
          await tx.referral.create({
            data: {
              referrerId: referrer.id,
              referredUserId: newUser.id
            }
          });

          // Process referral reward INSIDE transaction (atomically with user creation)
          await processReferral(referrer.id, newUser.id, tx);

          // SECURITY FIX P2: Log IP pair for self-referral ring detection
          // Same IP referring >3 accounts in 30 days warrants manual review (logged only, not blocked)
          const referreeIp = clientIp;
          console.log(`[referral][ip-audit] referrer=${referrer.id} referee=${newUser.id} referrer_ip=${referreeIp} ts=${new Date().toISOString()}`);

          // Check for referral badge
          // Note: handleReferralBadge reads outside the tx — acceptable since it's idempotent
          // It will be called after transaction commits

          // Feature #11: Organizer Referral Reciprocal (INSIDE transaction)
          // If both referrer and new user are organizers, grant 3-month fee discount to both
          if (referrer.organizer && effectiveRole === 'ORGANIZER') {
            const discountExpiry = new Date();
            discountExpiry.setMonth(discountExpiry.getMonth() + 3);

            // Create OrganizerReferral record
            await tx.organizerReferral.create({
              data: {
                referrerId: referrer.id,
                refereeId: newUser.id,
                status: 'PENDING'
              }
            });

            // Grant discount to referee (new organizer)
            await tx.organizer.update({
              where: { userId: newUser.id },
              data: { referralDiscountExpiry: discountExpiry }
            });

            // Grant reciprocal discount to referrer organizer
            await tx.organizer.update({
              where: { id: referrer.organizer.id },
              data: { referralDiscountExpiry: discountExpiry }
            });
          }
        }
      }

      // Feature #72: Affiliate Program (Batch 4) — Handle organizer-to-organizer affiliate code at signup
      // This is SEPARATE from the shopper referral system above (different fields, different rewards model)
      if (affiliateReferralCode) {
        // Look up the referrer by their affiliate code
        // NOTE: The affiliateReferralCode field is stored on the REFERRER's User row (the organizer who generated it)
        const affiliateReferrer = await tx.user.findUnique({
          where: { affiliateReferralCode }
        });

        if (affiliateReferrer) {
          // Self-referral block: prevent signup if new user matches referrer
          // Check both ID (paranoid, shouldn't happen) and email
          if (affiliateReferrer.id !== newUser.id && affiliateReferrer.email !== email) {
            // Create AffiliateReferral record with PENDING status
            // Status transitions to QUALIFIED when referred user completes first PAID sale
            await tx.affiliateReferral.create({
              data: {
                referrerId: affiliateReferrer.id,
                referredUserId: newUser.id,
                referralCode: affiliateReferralCode, // Store the code used at signup
                status: 'PENDING' // Awaiting first PAID sale
              }
            });

            // Log for fraud detection and audit trail
            console.log(`[affiliate][signup] referrer=${affiliateReferrer.id} referred=${newUser.id} code=${affiliateReferralCode} ts=${new Date().toISOString()}`);
            console.log(`[affiliate][ip-audit] referrer=${affiliateReferrer.id} referred=${newUser.id} referrer_ip=${clientIp} ts=${new Date().toISOString()}`);
          } else {
            // Self-referral attempt — log and silently ignore (don't create AffiliateReferral)
            console.log(`[affiliate][self-referral-blocked] attempted_user=${email} code=${affiliateReferralCode} ts=${new Date().toISOString()}`);
          }
        } else {
          // Invalid affiliate code — silently ignore (don't block signup, don't create AffiliateReferral)
          console.log(`[affiliate][invalid-code] email=${email} code=${affiliateReferralCode} ts=${new Date().toISOString()}`);
        }
      }

      return newUser;
    });

    // Security: Record registration for fraud detection (temporal velocity check)
    try {
      await recordFraudRegistration(clientIp, user.id);
    } catch (err) {
      console.error('[fraudDetection] Failed to record registration:', err);
      // Non-blocking — continue with rest of flow
    }

    // Record this IP registration for rate limiting
    await recordRegistration(clientIp);

    // Security: Send email verification link (non-blocking)
    if (user.emailVerificationToken) {
      try {
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
        const verifyLink = `${process.env.FRONTEND_URL || 'https://finda.sale'}/verify-email?token=${rawEmailVerificationToken}`;

        await transactionalEmailService.emails.send({
          from: fromEmail,
          to: user.email,
          subject: 'Verify Your FindA.Sale Email Address',
          html: `
            <p>Hi ${escapeHtml(user.name || 'there')},</p>
            <p>Welcome to FindA.Sale! To complete your account setup, please verify your email address by clicking the link below:</p>
            <p><a href="${verifyLink}" style="display: inline-block; padding: 10px 20px; background-color: #b45309; color: white; text-decoration: none; border-radius: 4px;">Verify Email Address</a></p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create this account, you can ignore this email.</p>
            <p>The FindA.Sale Team</p>
          `,
        });
      } catch (emailError) {
        // Non-blocking: log error but don't fail registration
        console.error('[emailVerification] Failed to send verification email:', emailError);
      }
    }

    // Feature #74: Save role-based email consent
    // Create UserRoleSubscription and RoleConsent records for consent tracking
    if (consentOrganizer && effectiveRole === 'ORGANIZER') {
      // Get the organizer's UserRoleSubscription record
      const orgRoleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: user.id, role: 'ORGANIZER' }
      });
      if (orgRoleSubscription) {
        await prisma.roleConsent.create({
          data: {
            subscriptionId: orgRoleSubscription.id,
            role: 'ORGANIZER',
            marketingOptInAt: new Date()
          }
        });
      }
    }
    if (consentShopper && effectiveRole === 'USER') {
      // Get the user's UserRoleSubscription record for SHOPPER role
      const shopperRoleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: user.id, role: 'SHOPPER' }
      });
      if (shopperRoleSubscription) {
        await prisma.roleConsent.create({
          data: {
            subscriptionId: shopperRoleSubscription.id,
            role: 'SHOPPER',
            marketingOptInAt: new Date()
          }
        });
      }
    }

    // Referral processing is now INSIDE the transaction (see above)
    // Post-transaction: award XP and check badges (non-blocking operations)
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true }
      });

      if (referrer) {
        // Award XP to referrer for signup (non-blocking, after transaction)
        awardXp(referrer.id, 'REFERRAL_SIGNUP', XP_AWARDS.REFERRAL_SIGNUP).catch((err) =>
          console.error('[referral] Failed to award signup XP to referrer:', err)
        );

        // Check for referral badge (non-blocking, after transaction)
        await handleReferralBadge(referrer.id);

        // Create tranche record so subsequent trigger calls (recordLogin, recordSaleVisit, etc.) have a target
        referralTrancheService.createTrancheRecord(referrer.id, user.id).catch((err) =>
          console.error('[referral] Failed to create tranche record:', err)
        );
      }
    }

    // Redeem invite code if one was validated
    if (validatedInvite) {
      await prisma.betaInvite.update({
        where: { code: validatedInvite.code },
        data: {
          usedAt: new Date(),
          usedById: user.id
        }
      });
    }

    // Subscribe shoppers to weekly digest (fire-and-forget, non-blocking)
    // Skip known test/synthetic accounts (QA/security-test/seed fixtures) — see
    // isTestOrSyntheticEmail in mailerliteService.ts for why this exists.
    if (effectiveRole === 'USER') {
      if (isTestOrSyntheticEmail(user.email)) {
        console.log('[mailerlite] Skipping subscribe for test/synthetic email:', user.email);
      } else {
        addShopperSubscriber(user.email, user.name || 'Shopper').catch((err) => {
          console.error('Failed to subscribe shopper to weekly digest:', err);
        });
      }
    }

    // Subscribe organizers to beta onboarding automation (fire-and-forget, non-blocking)
    // Skip known test/synthetic accounts (QA/security-test/seed fixtures) — see
    // isTestOrSyntheticEmail in mailerliteService.ts for why this exists.
    if (effectiveRole === 'ORGANIZER') {
      if (isTestOrSyntheticEmail(user.email)) {
        console.log('[mailerlite] Skipping subscribe for test/synthetic email:', user.email);
      } else {
        addOrganizerSubscriber(user.email, user.name || 'Organizer').catch((err) => {
          console.error('Failed to subscribe organizer to onboarding automation:', err);
        });
      }
    }

    // 2026-09-30: no session here. A brand-new account and an already-registered address must be
    // indistinguishable to the caller (status, body, and no Set-Cookie), so the sign-up answers with the same generic
    // message either way. The browser signs the new user in with a follow-up POST /auth/login using the credentials
    // it just submitted (pages/register.tsx); that call succeeds for the new account and simply fails for anyone who
    // does not own the existing one.
    res.status(201).json(REGISTER_ACCEPTED_BODY);
  } catch (error) {
    // Two sign-ups for the same new address racing each other: the loser hits the unique index. Answer like the
    // winner instead of leaking a 500 that only occurs for a fresh address.
    if ((error as any)?.code === 'P2002' && String((error as any)?.meta?.target ?? '').includes('email')) {
      return res.status(201).json(REGISTER_ACCEPTED_BODY);
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Phase 31: OAuth social login — find-or-create user by provider identity, return JWT
export const oauthLogin = async (req: Request, res: Response) => {
  try {
    const { provider, providerId, email: rawEmail, name: rawName, returnTo, inviteCode, oauthAssertion } = req.body;

    // 2026-09-29: provider/providerId flow straight into Prisma `where` clauses. A JSON object such as
    // {"not":""} is a Prisma filter, not a value, so `providerId: {"not":""}` matched the first OAuth user in the
    // table and logged the caller in as them. Both must be plain strings.
    if (typeof provider !== 'string' || typeof providerId !== 'string' || !provider || !providerId) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }
    if (provider.length > 40 || providerId.length > 255) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }
    if (inviteCode !== undefined && inviteCode !== null && typeof inviteCode !== 'string') {
      return res.status(400).json({ message: 'Invalid invite code' });
    }

    const email = normalizeEmailInput(rawEmail) ?? null;
    const name  = (typeof rawName === 'string' ? rawName.trim() : '') || 'User';

    // 2026-09-29: the browser used to be trusted to say who signed in. Require the HMAC assertion the NextAuth
    // server signs (utils/oauthAssertion.ts) whenever OAUTH_BRIDGE_SECRET is configured.
    const oauthDenied = enforceOAuthAssertion(oauthAssertion, { provider, providerId, email });
    if (oauthDenied) {
      console.warn(`[auth] /auth/oauth rejected: assertion ${oauthDenied} provider=${provider}`);
      return res.status(401).json({ code: 'OAUTH_ASSERTION_INVALID', message: 'Sign-in could not be verified. Please try again.' });
    }

    // 1. Find by OAuth identity (returning user)
    let user = await prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId: providerId },
    });

    // 2. SECURITY FIX (Roadmap #422 / S722 P1-1 — Option B):
    // If an existing account matches by email but does NOT already have this OAuth
    // identity linked, REFUSE to silently link. The previous behavior was an
    // unauthenticated account-takeover vector — an attacker who created a Google
    // account with a victim's email could hit /auth/oauth and inherit the victim's
    // FindA.Sale account. Industry standard (Google, GitHub, Stripe) is to require
    // the user to be logged in before linking a new OAuth provider.
    //
    // The legitimate user is told to sign in with their existing credentials and
    // link Google from account settings.
    if (!user && email) {
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser) {
        return res.status(409).json({
          code: 'OAUTH_LINK_REQUIRED',
          message:
            "This email is already registered. Please log in with your password first, then link Google from your account settings.",
        });
      }
    }

    // 3. Create new account (shoppers only — role upgrade via settings)
    if (!user) {
      const userReferralCode = randomUUID().substring(0, 8).toUpperCase();

      // Validate invite code if provided (beta access gate for OAuth)
      let validatedInvite: Awaited<ReturnType<typeof prisma.betaInvite.findUnique>> = null;
      if (inviteCode) {
        validatedInvite = await prisma.betaInvite.findUnique({
          where: { code: inviteCode.toUpperCase() }
        });
        if (!validatedInvite) {
          return res.status(400).json({ message: 'Invalid invite code' });
        }
        if (validatedInvite.usedAt) {
          return res.status(400).json({ message: 'This invite code has already been used' });
        }
        if (validatedInvite.email && validatedInvite.email.toLowerCase() !== email) {
          return res.status(400).json({ message: 'This invite code is restricted to a different email address' });
        }
      }

      // Invite codes grant ORGANIZER role; otherwise default to USER (shopper)
      const effectiveRole = validatedInvite ? 'ORGANIZER' : 'USER';

      // Create user and organizer (if invite code present) atomically
      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: email ?? `${provider}_${providerId}@oauth.placeholder`,
            name,
            role: effectiveRole,
            oauthProvider: provider,
            oauthId: providerId,
            referralCode: userReferralCode,
            // Bug fix (2026-07-03): OAuth providers (Google, Facebook) already verify
            // the user's email address as part of their own signup/login flow — that's
            // the whole point of "Sign in with Google". Previously this fell through to
            // the schema default emailVerified=false with no verification email ever
            // sent (that flow only exists on the password-signup path), permanently
            // blocking every OAuth organizer from createSale's EMAIL_NOT_VERIFIED gate.
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
        });

        // If invite code was used, promote to ORGANIZER and create organizer profile
        if (validatedInvite) {
          await tx.organizer.create({
            data: {
              userId: newUser.id,
              businessName: name || 'Business',
              phone: '',
              address: '',
            }
          });

          // Mark invite code as used
          await tx.betaInvite.update({
            where: { code: validatedInvite.code },
            data: {
              usedAt: new Date(),
              usedById: newUser.id
            }
          });
        }

        return newUser;
      });

      // Subscribe to weekly digest (fire-and-forget, non-blocking)
      // Skip known test/synthetic accounts (QA/security-test/seed fixtures) — see
      // isTestOrSyntheticEmail in mailerliteService.ts for why this exists.
      if (effectiveRole === 'USER') {
        if (isTestOrSyntheticEmail(user.email)) {
          console.log('[mailerlite] Skipping subscribe for test/synthetic email:', user.email);
        } else {
          addShopperSubscriber(user.email, user.name || 'Shopper').catch((err) => {
            console.error('Failed to subscribe OAuth user to weekly digest:', err);
          });
        }
      }

      // Subscribe organizers to onboarding automation (fire-and-forget, non-blocking)
      // Skip known test/synthetic accounts (QA/security-test/seed fixtures) — see
      // isTestOrSyntheticEmail in mailerliteService.ts for why this exists.
      if (effectiveRole === 'ORGANIZER') {
        if (isTestOrSyntheticEmail(user.email)) {
          console.log('[mailerlite] Skipping subscribe for test/synthetic email:', user.email);
        } else {
          addOrganizerSubscriber(user.email, user.name || 'Organizer').catch((err) => {
            console.error('Failed to subscribe OAuth organizer to onboarding automation:', err);
          });
        }
      }
    }

    // 2026-09-29: the password login rejects suspended/deleted accounts but the OAuth path never did, so a suspended
    // user could simply sign in with Google and mint a fresh session.
    if (user.deletedAt || user.suspendedAt) {
      return res.status(403).json({ message: 'This account is not available. Contact support@finda.sale.' });
    }

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile: Awaited<ReturnType<typeof prisma.organizer.findUnique>> = null;
    let subscriptionLapsed = false;
    const hasOrganizerRole = user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER';
    if (hasOrganizerRole) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });

      // Feature #75: Check subscription lapse status from roleSubscriptions
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: {
          userId: user.id,
          role: 'ORGANIZER',
        },
      });

      if (roleSubscription) {
        // Subscription is lapsed if tierLapsedAt is set AND tierResumedAt is null
        subscriptionLapsed = roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;
      }
    }

    // Feature #72 Phase 2: Include roles array from user.roles (array field in User model)
    // Fallback to single-role array if roles is empty, for backward compatibility
    const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];
    const token = jwt.sign(
      {
        id:           user.id,
        email:        user.email,
        name:         user.name,
        role:         user.role,
        roles:        userRoles,
        referralCode: user.referralCode,
        tokenVersion: user.tokenVersion,
        emailVerified: user.emailVerified, // S512: gate dashboard banner
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        subscriptionStatus: organizerProfile?.subscriptionStatus ?? null,
        subscriptionLapsed: subscriptionLapsed, // Feature #75: Tier lapse state
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: user.createdAt.toISOString(),
        huntPassActive: user.huntPassActive,
        huntPassExpiry: user.huntPassExpiry,
        guildXp: user.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' } // S708: bumped from 15m — was causing apparent sign-offs on idle tabs
    );

    // P0 Security Fix: Set httpOnly cookies for secure token storage
    const refreshToken = await issueRefreshToken(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: userRoles,
        // P2 Security Fix: embed version claims so /auth/refresh can enforce invalidation
        tokenVersion: user.tokenVersion,
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
      },
      { req } // 2026-09-30: rotation family row + jti (services/refreshTokenService.ts)
    );

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: true, // P0 Security Fix Item 7: Always require HTTPS
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour (S708 — must match JWT expiresIn above)
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // P0 Security Fix Item 7: Always require HTTPS
      sameSite: 'lax',
      path: '/', // P0 FIX: was '/auth/refresh' — browser path matching breaks when requests
      // go through Next.js proxy (/api/auth/refresh vs /auth/refresh). Use '/' so the
      // refresh cookie is sent regardless of proxy path depth.
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (S708 — must match refreshToken expiresIn)
    });

    const userWithoutPassword = stripSensitiveUserFields(user);

    // SECURITY FIX P0: Validate returnTo against allowlist to prevent open redirect attacks
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const validatedReturnTo = isValidRedirectUri(returnTo) ? returnTo : null;

    res.json({ user: userWithoutPassword, token, returnTo: validatedReturnTo });
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ message: 'Server error during OAuth login' });
  }
};

// Feature #72 Phase 2 + Stream A: Password reset with generic response for account enumeration prevention
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body;
    const email = rawEmail?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Generic response regardless of whether email exists (Stream A: account enumeration prevention)
    const genericResponse = { message: 'If that email exists, you\'ll receive a reset link' };

    // Attempt to find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // If user not found, return generic success and exit
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // If user found, generate reset token and save it
    const resetToken = randomUUID();
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token valid for 1 hour

    // 2026-09-30: only the SHA-256 is stored; the raw token exists only in the emailed link.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashOpaqueToken(resetToken),
        resetTokenExpiry: resetTokenExpiry
      }
    });

    // Send password reset email (non-blocking)
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    try {
      const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

      await transactionalEmailService.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset Your FindA.Sale Password',
        html: `
          <p>Hi ${escapeHtml(user.name)},</p>
          <p>We received a request to reset your password. Click the link below to create a new password:</p>
          <p><a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}" style="display: inline-block; padding: 10px 20px; background-color: #b45309; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, you can ignore this email.</p>
          <p>The FindA.Sale Team</p>
        `,
      });
    } catch (emailError) {
      // Non-blocking: log error but don't fail the request
      console.error('[passwordReset] Failed to send reset email:', emailError);
    }

    // Return generic response regardless of success
    res.status(200).json(genericResponse);
  } catch (error) {
    console.error('Password reset request error:', error);
    // Generic error response to prevent enumeration
    res.status(500).json({ message: 'Server error processing your request' });
  }
};

// Shared session-minting helper (2026-09-25, exit-impersonation-adr): builds the JWT
// payload, signs both tokens, and sets both httpOnly cookies -- the exact logic login()
// used to inline. Extracted so login() and the new exitImpersonation() below always mint
// a real session identically, in exactly one place, instead of two copies that can drift.
async function mintSessionTokens(
  req: Request,
  res: Response,
  user: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>,
  organizerProfile: Awaited<ReturnType<typeof prisma.organizer.findUnique>>,
  subscriptionLapsed: boolean
) {
  const userRoles = (user.roles && user.roles.length > 0) ? user.roles : [user.role];

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: userRoles,
      referralCode: user.referralCode,
      tokenVersion: user.tokenVersion,
      emailVerified: user.emailVerified, // S512: gate dashboard banner
      subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
      subscriptionStatus: organizerProfile?.subscriptionStatus ?? null,
      subscriptionLapsed: subscriptionLapsed, // Feature #75: Tier lapse state
      organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
      onboardingComplete: organizerProfile?.onboardingComplete ?? false,
      createdAt: user.createdAt.toISOString(),
      huntPassActive: user.huntPassActive,
      huntPassExpiry: user.huntPassExpiry,
      guildXp: user.guildXp || 0, // Phase 2a: Explorer's Guild XP
      // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' } // S708: bumped from 15m — was causing apparent sign-offs on idle tabs
  );

  // P0 Security Fix: Set httpOnly cookies for secure token storage
  const refreshToken = await issueRefreshToken(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: userRoles,
      // P2 Security Fix: embed version claims so /auth/refresh can enforce invalidation
      tokenVersion: user.tokenVersion,
      organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
    },
    { req } // 2026-09-30: rotation family row + jti (services/refreshTokenService.ts)
  );

  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: true, // P0 Security Fix Item 7: Always require HTTPS
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 1000, // 1 hour (S708 — must match JWT expiresIn above)
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true, // P0 Security Fix Item 7: Always require HTTPS
    sameSite: 'lax',
    path: '/', // P0 FIX: was '/auth/refresh' — browser path matching breaks when requests
    // go through Next.js proxy (/api/auth/refresh vs /auth/refresh). Use '/' so the
    // refresh cookie is sent regardless of proxy path depth.
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (S708 — must match refreshToken expiresIn)
  });

  const userWithoutPassword = stripSensitiveUserFields(user);
  return { token, userWithoutPassword };
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawLoginEmail, password } = req.body;
    // 2026-09-29: non-string email/password used to throw (500). Reject as bad credentials, same shape as a miss.
    const email = normalizeEmailInput(rawLoginEmail);
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // #106: Account enumeration prevention
    // Measure timing start to ensure both paths take similar time
    const timingStart = Date.now();
    const targetMinDuration = 300; // 300ms minimum for bcrypt timing attack prevention

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // If user not found OR password is wrong, use generic message
    // This prevents attackers from enumerating valid email addresses
    let passwordMatch = false;
    if (user && user.password) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // Compute a dummy hash to match timing of actual password check. Runs for a missing user AND for an existing
      // user with no password (OAuth-only), so neither is distinguishable from a wrong password by response time.
      await bcrypt.compare(password, '$2a$10$dummyhashtopreventtimingatttacks.thishashnevermatches');
    }

    // Ensure minimum duration to prevent timing attacks
    const elapsedMs = Date.now() - timingStart;
    if (elapsedMs < targetMinDuration) {
      await new Promise(resolve => setTimeout(resolve, targetMinDuration - elapsedMs));
    }

    // Generic error message regardless of whether email exists or password is wrong
    if (!user || !passwordMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user has a password (some OAuth users might not)
    if (!user.password) {
      return res.status(400).json({ message: 'Account not set up for password login. Please contact support.' });
    }

    // P0 Fix: reject login for suspended/soft-deleted accounts.
    // Previously, suspend/delete only bumped tokenVersion (invalidating an EXISTING
    // session via authenticate's DB re-check) but never blocked re-login, so a
    // suspended/deleted user could just log back in and mint a fresh valid token.
    // Generic message, no deleted-vs-suspended distinction, matching the #106
    // account-enumeration-prevention pattern used above in this same function.
    if (user.deletedAt || user.suspendedAt) {
      return res.status(403).json({ message: 'This account is not available. Contact support@finda.sale.' });
    }

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile: Awaited<ReturnType<typeof prisma.organizer.findUnique>> = null;
    let subscriptionLapsed = false;
    const hasOrganizerRole = user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER';
    if (hasOrganizerRole) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });

      // Feature #75: Check subscription lapse status from roleSubscriptions
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: {
          userId: user.id,
          role: 'ORGANIZER',
        },
      });

      if (roleSubscription) {
        // Subscription is lapsed if tierLapsedAt is set AND tierResumedAt is null
        subscriptionLapsed = roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;
      }
    }

    // Generate JWT + refreshToken + cookies via the shared helper (2026-09-25,
    // exit-impersonation-adr) -- see mintSessionTokens() above.
    const { token, userWithoutPassword } = await mintSessionTokens(req, res, user, organizerProfile, subscriptionLapsed);
    // Still include token in body for backward compatibility during transition
    res.json({ user: userWithoutPassword, token });

    // Feature: Record referral tranche login (non-blocking)
    try {
      await referralTrancheService.recordLogin(user.id);
    } catch (err) {
      console.error('[referralTranche] recordLogin failed:', err);
      // Never fail the login due to tranche logic
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Exit an active admin impersonation session and restore the admin's own full session
// (2026-09-25, exit-impersonation-adr). impersonateUser() (adminController.ts) intentionally
// issues the impersonated user a 15-minute accessToken with no refreshToken, and clears the
// admin's own refreshToken cookie -- correct anti-privilege-leak behavior, but it left no way
// back except a fresh /login. middleware/auth.ts's authenticate() now forwards the JWT's
// impersonatedBy claim onto req.user, so this route can trust it: it is server-signed on the
// original "Log in as" token and cannot be forged client-side.
export const exitImpersonation = async (req: AuthRequest, res: Response) => {
  try {
    const adminUserId = (req.user as any)?.impersonatedBy;
    if (!adminUserId) {
      return res.status(400).json({ message: 'Not currently impersonating.' });
    }

    const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!admin) {
      // Admin account deleted mid-impersonation -- rare, but there is no session to
      // restore. Frontend should hard-redirect to /login on this response.
      return res.status(401).json({ message: 'Admin account not found. Please log in again.' });
    }

    // SECURITY (findasale-hacker adversarial pass, 2026-09-25): mirror login()'s own
    // suspendedAt/deletedAt rejection here. Without this check, an admin account
    // suspended or soft-deleted WHILE mid-impersonation could still exit back into a
    // brand-new, fully valid 1h/30d session -- bypassing the exact guard login() enforces
    // for every other path to a fresh session. findUnique() still returns a suspended row
    // (it isn't removed), so `!admin` alone does not catch this.
    if (admin.deletedAt || admin.suspendedAt) {
      return res.status(403).json({ message: 'This account is not available. Contact support@finda.sale.' });
    }

    // Mirror login()'s organizer/subscriptionLapsed lookup so the restored session's JWT is
    // built exactly the way a normal login would build it for this admin.
    let organizerProfile: Awaited<ReturnType<typeof prisma.organizer.findUnique>> = null;
    let subscriptionLapsed = false;
    const hasOrganizerRole = admin.roles?.includes('ORGANIZER') || admin.role === 'ORGANIZER';
    if (hasOrganizerRole) {
      organizerProfile = await prisma.organizer.findUnique({ where: { userId: admin.id } });
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: admin.id, role: 'ORGANIZER' },
      });
      if (roleSubscription) {
        subscriptionLapsed = roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;
      }
    }

    const { token, userWithoutPassword } = await mintSessionTokens(req, res, admin, organizerProfile, subscriptionLapsed);
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('[exitImpersonation] error:', error);
    res.status(500).json({ message: 'Server error exiting impersonation' });
  }
};

// Redeem a beta invite code for an authenticated user (OAuth flow)
// This endpoint is called after OAuth login to upgrade an existing shopper to organizer
export const redeemInvite = async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!inviteCode) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    // Validate invite code
    const validatedInvite = await prisma.betaInvite.findUnique({
      where: { code: inviteCode.toUpperCase() }
    });

    if (!validatedInvite) {
      return res.status(400).json({ message: 'Invalid invite code' });
    }

    if (validatedInvite.usedAt) {
      return res.status(400).json({ message: 'This invite code has already been used' });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check email restriction on invite
    if (validatedInvite.email && validatedInvite.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(400).json({ message: 'This invite code is restricted to a different email address' });
    }

    // Promote user to ORGANIZER and create organizer profile
    // BUG FIX (findasale-hacker/QA pass, 2026-08-29): only the deprecated singular `role` field
    // was ever updated here, never the `roles` array -- same gap fixed in
    // curioController.ts convertScanToListing() (which explicitly mirrors this function), same
    // dispatch. DB-confirmed via QA this session on the Curio side (role became 'ORGANIZER' but
    // roles stayed ['USER']).
    const rolesWithOrganizer = user.roles?.includes('ORGANIZER') ? user.roles : [...(user.roles || ['USER']), 'ORGANIZER'];
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user role to ORGANIZER
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: 'ORGANIZER', roles: rolesWithOrganizer }
      });

      // Check if organizer profile already exists
      const existingOrganizer = await tx.organizer.findUnique({
        where: { userId }
      });

      // Create organizer profile if it doesn't exist
      if (!existingOrganizer) {
        await tx.organizer.create({
          data: {
            userId,
            businessName: user.name || 'Business',
            phone: '',
            address: '',
          }
        });
      }

      // Mark invite code as used
      await tx.betaInvite.update({
        where: { code: validatedInvite.code },
        data: {
          usedAt: new Date(),
          usedById: userId
        }
      });

      return updated;
    });

    // Generate new JWT with ORGANIZER role
    const organizerProfile = await prisma.organizer.findUnique({
      where: { userId }
    });

    // Feature #75: Check subscription lapse status from roleSubscriptions
    const roleSubscription = await prisma.userRoleSubscription.findFirst({
      where: {
        userId: userId,
        role: 'ORGANIZER',
      },
    });

    const subscriptionLapsed = roleSubscription && roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;

    const userRoles = updatedUser.roles && updatedUser.roles.length > 0 ? updatedUser.roles : ['ORGANIZER'];
    const token = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: 'ORGANIZER',
        roles: userRoles,
        referralCode: updatedUser.referralCode,
        tokenVersion: updatedUser.tokenVersion,
        emailVerified: updatedUser.emailVerified, // S512: gate dashboard banner
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        subscriptionStatus: organizerProfile?.subscriptionStatus ?? null,
        subscriptionLapsed: subscriptionLapsed, // Feature #75: Tier lapse state
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: updatedUser.createdAt.toISOString(),
        huntPassActive: updatedUser.huntPassActive,
        huntPassExpiry: updatedUser.huntPassExpiry,
        guildXp: updatedUser.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' } // S708: bumped from 15m — was causing apparent sign-offs on idle tabs
    );

    // P0 Security Fix: Set httpOnly cookies for secure token storage
    const refreshToken = await issueRefreshToken(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: 'ORGANIZER',
        roles: userRoles,
        // P2 Security Fix: embed version claims so /auth/refresh can enforce invalidation
        tokenVersion: updatedUser.tokenVersion,
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
      },
      { req } // 2026-09-30: rotation family row + jti (services/refreshTokenService.ts)
    );

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: true, // P0 Security Fix Item 7: Always require HTTPS
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour (S708 — must match JWT expiresIn above)
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // P0 Security Fix Item 7: Always require HTTPS
      sameSite: 'lax',
      path: '/', // P0 FIX: was '/auth/refresh' — browser path matching breaks when requests
      // go through Next.js proxy (/api/auth/refresh vs /auth/refresh). Use '/' so the
      // refresh cookie is sent regardless of proxy path depth.
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (S708 — must match refreshToken expiresIn)
    });

    const userWithoutPassword = stripSensitiveUserFields(updatedUser);

    res.json({
      success: true,
      message: 'Invite code redeemed successfully',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Redeem invite error:', error);
    res.status(500).json({ message: 'Server error while redeeming invite code' });
  }
};

// Security: Verify email address via token
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    // 2026-09-30: tokens are stored hashed ('sha256:<hex>'); hash the presented one and match that first, then fall
    // back to a legacy plaintext row written before this change (it expires within 24h). A presented value that
    // itself starts with the hash marker yields no candidates, so a leaked stored hash cannot be replayed.
    let user: Awaited<ReturnType<typeof prisma.user.findFirst>> = null;
    for (const candidate of tokenLookupCandidates(token)) {
      user = await prisma.user.findFirst({ where: { emailVerificationToken: candidate } });
      if (user) break;
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    // P0-3: Enforce token expiry — reject tokens older than 24 hours
    if (user.emailVerificationTokenExpiry && user.emailVerificationTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'VERIFICATION_TOKEN_EXPIRED', message: 'Verification link has expired. Please request a new one.' });
    }

    // Check if email is already verified (idempotent)
    if (user.emailVerified) {
      return res.status(200).json({
        message: 'Email is already verified',
        verified: true
      });
    }

    // Mark email as verified. 2026-09-30: single-use is ATOMIC: the conditional updateMany only matches while this
    // exact stored token is still set, so two concurrent requests with the same link cannot both succeed.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, emailVerificationToken: user.emailVerificationToken },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null, // Clear the token after use
        emailVerificationTokenExpiry: null, // P0-3: Clear expiry alongside token
      }
    });
    if (claimed.count !== 1) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    res.status(200).json({
      message: 'Email verified successfully! You can now create sales.',
      verified: true
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Server error during email verification' });
  }
};

// P0-L1: OAuth Age Verification — COPPA compliance for OAuth users
export const oauthVerifyAge = async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { dateOfBirth } = req.body;

    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required.' });
    }

    // Validate age (2026-09-29: invalid dates no longer pass; see checkAdultDob)
    const verifyDob = checkAdultDob(dateOfBirth);
    if (verifyDob === 'invalid') {
      return res.status(400).json({ message: 'Invalid date of birth format.' });
    }
    if (verifyDob === 'minor') {
      return res.status(400).json({ message: 'You must be 18 or older to use FindA.Sale.' });
    }

    // Update user's ageVerifiedAt timestamp
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ageVerifiedAt: new Date()
      }
    });

    const userWithoutPassword = stripSensitiveUserFields(user);

    res.json({
      success: true,
      message: 'Age verified successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('OAuth age verification error:', error);
    res.status(500).json({ message: 'Server error during age verification' });
  }
};

// Roadmap #422 / S722 P1-1 (Option B): Authenticated OAuth provider linking.
// Called from account settings when a logged-in user wants to attach a Google
// (or other) identity to their existing FindA.Sale account. Replaces the
// silent auto-link that previously happened inside oauthLogin.
//
// Expected body: { provider: string, providerId: string, email?: string }
// Caller MUST be authenticated (route uses `authenticate` middleware).
export const linkOAuthProvider = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { provider, providerId, email: linkEmail, oauthAssertion: linkAssertion } = req.body;
    // 2026-09-29: strings only (Prisma filter-object injection) and a signed assertion, exactly like /auth/oauth.
    if (typeof provider !== 'string' || typeof providerId !== 'string' || !provider || !providerId || provider.length > 40 || providerId.length > 255) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }
    const linkDenied = enforceOAuthAssertion(linkAssertion, { provider, providerId, email: normalizeEmailInput(linkEmail) });
    if (linkDenied) {
      console.warn(`[auth] /auth/oauth/link rejected: assertion ${linkDenied} provider=${provider}`);
      return res.status(401).json({ code: 'OAUTH_ASSERTION_INVALID', message: 'Sign-in could not be verified. Please try again.' });
    }

    // Reject if this OAuth identity is already attached to a DIFFERENT account.
    const existingLink = await prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId: providerId },
    });
    if (existingLink && existingLink.id !== userId) {
      return res.status(409).json({
        code: 'OAUTH_ALREADY_LINKED',
        message: 'This Google account is already linked to a different FindA.Sale account.',
      });
    }

    // Reject if the current user already has a different OAuth provider linked.
    // Prevents accidental overwrite — user must explicitly unlink first.
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (
      currentUser.oauthProvider &&
      currentUser.oauthId &&
      (currentUser.oauthProvider !== provider || currentUser.oauthId !== providerId)
    ) {
      return res.status(409).json({
        code: 'PROVIDER_ALREADY_LINKED',
        message: 'Your account already has a linked social login. Unlink it first to switch providers.',
      });
    }

    // Already linked to this same provider+id — no-op success.
    if (currentUser.oauthProvider === provider && currentUser.oauthId === providerId) {
      return res.json({ success: true, message: 'Provider already linked.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { oauthProvider: provider, oauthId: providerId },
    });

    res.json({ success: true, message: `${provider} account linked successfully.` });
  } catch (error) {
    console.error('OAuth link error:', error);
    res.status(500).json({ message: 'Server error linking provider' });
  }
};
