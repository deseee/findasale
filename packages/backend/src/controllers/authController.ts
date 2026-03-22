import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { randomUUID } from 'crypto';
import { handleReferralBadge, handlePointsBadge } from './userController';
import { addShopperSubscriber } from '../services/mailerliteService';

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
    const { email: rawEmail, password, name: rawName, role, referralCode, inviteCode, businessName, phone, businessAddress, consentOrganizer, consentShopper } = req.body;

    // H3: Normalise email/name to prevent duplicate accounts from whitespace/case variations
    const email = rawEmail?.trim().toLowerCase();
    const name = rawName?.trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
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

    // DB2: Wrap user + organizer creation atomically — neither is orphaned on failure
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          role: effectiveRole,
          password: hashedPassword,
          referralCode: userReferralCode,
          points: 0
        }
      });

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

      return newUser;
    });

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

    // Handle referral if provided
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode },
        include: { organizer: true }
      });

      if (referrer) {
        // Create referral record
        await prisma.referral.create({
          data: {
            referrerId: referrer.id,
            referredUserId: user.id
          }
        });

        // Award points to referrer (e.g., 50 points)
        const pointsToAdd = 50;
        await prisma.user.update({
          where: { id: referrer.id },
          data: {
            points: {
              increment: pointsToAdd
            }
          }
        });

        // Check for referral badge
        await handleReferralBadge(referrer.id);

        // Check for points badge
        const updatedReferrer = await prisma.user.findUnique({
          where: { id: referrer.id }
        });

        if (updatedReferrer) {
          await handlePointsBadge(referrer.id, updatedReferrer.points);
        }

        // Feature #11: Organizer Referral Reciprocal
        // If both referrer and new user are organizers, grant 3-month fee discount to both
        if (referrer.organizer && effectiveRole === 'ORGANIZER') {
          const discountExpiry = new Date();
          discountExpiry.setMonth(discountExpiry.getMonth() + 3);

          // Look up new user's Organizer record (just created in transaction above)
          const newOrganizer = await prisma.organizer.findUnique({ where: { userId: user.id } });

          if (newOrganizer) {
            // Create OrganizerReferral record
            await prisma.organizerReferral.create({
              data: {
                referrerId: referrer.id,
                refereeId: user.id,
                status: 'PENDING'
              }
            });

            // Grant discount to referee (new organizer)
            await prisma.organizer.update({
              where: { id: newOrganizer.id },
              data: { referralDiscountExpiry: discountExpiry }
            });

            // Grant reciprocal discount to referrer organizer
            await prisma.organizer.update({
              where: { id: referrer.organizer.id },
              data: { referralDiscountExpiry: discountExpiry }
            });
          }
        }
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
    if (user.role === 'ORGANIZER') {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
    }

    // Generate JWT — include name, points, referralCode so AuthContext can decode without a round-trip
    // Feature #72 Phase 2: Include roles array, keep role for backward compatibility
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles || [user.role], // Fallback to single-role array if roles is empty
        points: user.points,
        referralCode: user.referralCode,
        tokenVersion: user.tokenVersion,
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        tierLapsedAt: organizerProfile?.tierLapsedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
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
    const { provider, providerId, email: rawEmail, name: rawName, returnTo } = req.body;

    if (!provider || !providerId) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }

    const email = rawEmail?.trim().toLowerCase() || null;
    const name  = rawName?.trim() || 'User';

    // 1. Find by OAuth identity (returning user)
    let user = await prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId: providerId },
    });

    // 2. SECURITY FIX P0: Reject auto-link — existing non-OAuth accounts cannot be silently linked
    // If email exists and has a password (non-OAuth account), reject the login to prevent account takeover
    if (!user && email) {
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser) {
        // Existing account with this email — do not auto-link. User must sign in with password.
        return res.status(400).json({
          message: 'An account with this email already exists. Please sign in with your email and password.'
        });
      }
    }

    // 3. Create new account (shoppers only — role upgrade via settings)
    if (!user) {
      const userReferralCode = randomUUID().substring(0, 8).toUpperCase();
      user = await prisma.user.create({
        data: {
          email: email ?? `${provider}_${providerId}@oauth.placeholder`,
          name,
          role: 'USER',
          oauthProvider: provider,
          oauthId: providerId,
          referralCode: userReferralCode,
          points: 0,
        },
      });

      // Subscribe to weekly digest (fire-and-forget, non-blocking)
      addShopperSubscriber(user.email, user.name || 'Shopper').catch((err) => {
        console.error('Failed to subscribe OAuth user to weekly digest:', err);
      });
    }

    // Load organizer if user is an organizer (for subscriptionTier in JWT)
    let organizerProfile = null;
    if (user.role === 'ORGANIZER') {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
    }

    const token = jwt.sign(
      {
        id:           user.id,
        email:        user.email,
        name:         user.name,
        role:         user.role,
        roles:        user.roles || [user.role], // Fallback to single-role array if roles is empty
        points:       user.points,
        referralCode: user.referralCode,
        tokenVersion: user.tokenVersion,
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        tierLapsedAt: organizerProfile?.tierLapsedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
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

    // TODO: Send email with reset link (non-blocking)
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await sendPasswordResetEmail(user.email, user.name, resetLink);

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
    if (user.role === 'ORGANIZER') {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: user.id }
      });
    }

    // Generate JWT — include name, points, referralCode so AuthContext can decode without a round-trip
    // Feature #72 Phase 2: Include roles array, keep role for backward compatibility
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles || [user.role], // Fallback to single-role array if roles is empty
        points: user.points,
        referralCode: user.referralCode,
        tokenVersion: user.tokenVersion,
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        tierLapsedAt: organizerProfile?.tierLapsedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
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
