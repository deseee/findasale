import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../index';
import { randomUUID } from 'crypto';
import { handleReferralBadge } from './userController';
import { addShopperSubscriber } from '../services/mailerliteService';
import { processReferral } from '../services/referralService';
import { awardXp, XP_AWARDS } from '../services/xpService';
import { checkRegistrationLimit, recordRegistration } from '../lib/registrationRateLimiter';
import { recordRegistration as recordFraudRegistration } from '../lib/fraudDetectionService';

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

  const allowed = ALLOWED_REDIRECT_URIS();

  // Only allow URLs that start with one of the allowed prefixes
  return allowed.some(allowedUri => uri.startsWith(allowedUri));
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, name: rawName, role, referralCode, inviteCode, businessName, phone, businessAddress, consentOrganizer, consentShopper, deviceFingerprint } = req.body;

    // H3: Normalise email/name to prevent duplicate accounts from whitespace/case variations
    const email = rawEmail?.trim().toLowerCase();
    const name = rawName?.trim();

    // Security: IP-based rate limiting on registrations
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const rateLimitStatus = checkRegistrationLimit(clientIp);
    if (rateLimitStatus.limited) {
      return res.status(429).json({
        code: 'REGISTRATION_RATE_LIMITED',
        message: 'Too many accounts created from this IP. Please try again later.',
        resetAt: rateLimitStatus.resetAt,
      });
    }

    // Check if user already exists (Platform Safety #101: Email Verification Uniqueness)
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({ message: 'An account already exists with this email address.' });
    }

    // Validate invite code if provided (beta access gate)
    let validatedInvite = null;
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

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique referral code
    const userReferralCode = randomUUID().substring(0, 8).toUpperCase();

    // Whitelist role — never allow client to self-assign ADMIN
    const safeRole = ['USER', 'ORGANIZER'].includes(role) ? role : 'USER';
    // Invite codes are issued for organizer beta access — always promote to ORGANIZER
    const effectiveRole = validatedInvite ? 'ORGANIZER' : safeRole;

    // DB2: Wrap user + organizer + referral creation atomically — prevents race-condition duplicate rewards
    const user = await prisma.$transaction(async (tx) => {
      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

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
          password: hashedPassword,
          referralCode: userReferralCode,
          deviceFingerprint: hashedFingerprint,
          emailVerified: false, // New accounts must verify email
          emailVerificationToken, // Store token for verification link
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

      if (effectiveRole === 'ORGANIZER') {
        await tx.organizer.create({
          data: {
            userId: newUser.id,
            businessName: businessName || name,
            phone: phone || '',
            address: businessAddress || '',
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
    recordRegistration(clientIp);

    // Security: Send email verification link (non-blocking)
    if (user.emailVerificationToken) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
        const verifyLink = `${process.env.FRONTEND_URL || 'https://finda.sale'}/verify-email?token=${user.emailVerificationToken}`;

        await resend.emails.send({
          from: fromEmail,
          to: user.email,
          subject: 'Verify Your FindA.Sale Email Address',
          html: `
            <p>Hi ${user.name || 'there'},</p>
            <p>Welcome to FindA.Sale! To complete your account setup, please verify your email address by clicking the link below:</p>
            <p><a href="${verifyLink}" style="display: inline-block; padding: 10px 20px; background-color: #b45309; color: white; text-decoration: none; border-radius: 4px;">Verify Email Address</a></p>
            <p>This link will expire in 7 days.</p>
            <p>If you didn't create this account, you can ignore this email.</p>
            <p>— FindA.Sale Team</p>
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
    if (effectiveRole === 'USER') {
      addShopperSubscriber(user.email, user.name || 'Shopper').catch((err) => {
        console.error('Failed to subscribe shopper to weekly digest:', err);
      });
    }

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile = null;
    if (user.role === 'ORGANIZER' || user.roles?.includes('ORGANIZER')) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
    }

    // Generate JWT — include name, referralCode so AuthContext can decode without a round-trip
    // Feature #72 Phase 2: Include roles array from user.roles (array field in User model)
    // Fallback to single-role array if roles is empty, for backward compatibility
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
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: user.createdAt.toISOString(),
        huntPassActive: user.huntPassActive,
        huntPassExpiry: user.huntPassExpiry,
        guildXp: user.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Phase 31: OAuth social login — find-or-create user by provider identity, return JWT
export const oauthLogin = async (req: Request, res: Response) => {
  try {
    const { provider, providerId, email: rawEmail, name: rawName, returnTo, inviteCode } = req.body;

    if (!provider || !providerId) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }

    const email = rawEmail?.trim().toLowerCase() || null;
    const name  = rawName?.trim() || 'User';

    // 1. Find by OAuth identity (returning user)
    let user = await prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId: providerId },
    });

    // 2. Auto-link: if no OAuth match found, look up by email and link the Google account.
    // Rationale: if you own the Gmail address, you own the account. Blocking this just
    // confuses users who registered with email and later try Google login.
    if (!user && email) {
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser) {
        // Link the OAuth identity to the existing account and continue
        user = await prisma.user.update({
          where: { id: emailUser.id },
          data: { oauthProvider: provider, oauthId: providerId },
        });
      }
    }

    // 3. Create new account (shoppers only — role upgrade via settings)
    if (!user) {
      const userReferralCode = randomUUID().substring(0, 8).toUpperCase();

      // Validate invite code if provided (beta access gate for OAuth)
      let validatedInvite = null;
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
      addShopperSubscriber(user.email, user.name || 'Shopper').catch((err) => {
        console.error('Failed to subscribe OAuth user to weekly digest:', err);
      });
    }

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile = null;
    const hasOrganizerRole = user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER';
    if (hasOrganizerRole) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
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
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: user.createdAt.toISOString(),
        huntPassActive: user.huntPassActive,
        huntPassExpiry: user.huntPassExpiry,
        guildXp: user.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetToken,
        resetTokenExpiry: resetTokenExpiry
      }
    });

    // Send password reset email (non-blocking)
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';

      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset Your FindA.Sale Password',
        html: `
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the link below to create a new password:</p>
          <p><a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}" style="display: inline-block; padding: 10px 20px; background-color: #b45309; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, you can ignore this email.</p>
          <p>— FindA.Sale Team</p>
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

export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawLoginEmail, password } = req.body;
    const email = rawLoginEmail?.trim().toLowerCase();

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
    } else if (!user) {
      // Compute a dummy hash to match timing of actual password check
      // This prevents timing attacks that detect user existence
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

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile = null;
    const hasOrganizerRole = user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER';
    if (hasOrganizerRole) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
    }

    // Generate JWT — include referralCode so AuthContext can decode without a round-trip
    // Feature #72 Phase 2: Include roles array from user.roles (array field in User model)
    // Fallback to single-role array if roles is empty, for backward compatibility
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
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: user.createdAt.toISOString(),
        huntPassActive: user.huntPassActive,
        huntPassExpiry: user.huntPassExpiry,
        guildXp: user.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
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
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user role to ORGANIZER
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: 'ORGANIZER' }
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
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: updatedUser.createdAt.toISOString(),
        huntPassActive: updatedUser.huntPassActive,
        huntPassExpiry: updatedUser.huntPassExpiry,
        guildXp: updatedUser.guildXp || 0, // Phase 2a: Explorer's Guild XP
        // explorerRank removed: fetch fresh from /api/xp/profile instead of caching stale rank in JWT
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = updatedUser;

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

    // Find user by email verification token
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    // Check if email is already verified (idempotent)
    if (user.emailVerified) {
      return res.status(200).json({
        message: 'Email is already verified',
        verified: true
      });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null, // Clear the token after use
      }
    });

    res.status(200).json({
      message: 'Email verified successfully! You can now create sales.',
      verified: true
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Server error during email verification' });
  }
};
