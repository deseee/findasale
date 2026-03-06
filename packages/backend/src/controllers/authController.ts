import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { randomUUID } from 'crypto';
import { handleReferralBadge, handlePointsBadge } from './userController';

export const register = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, name: rawName, role, referralCode, businessName, phone, businessAddress } = req.body;

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

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique referral code
    const userReferralCode = randomUUID().substring(0, 8).toUpperCase();

    // Whitelist role — never allow client to self-assign ADMIN
    const safeRole = ['USER', 'ORGANIZER'].includes(role) ? role : 'USER';

    // DB2: Wrap user + organizer creation atomically — neither is orphaned on failure
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          role: safeRole,
          password: hashedPassword,
          referralCode: userReferralCode,
          points: 0
        }
      });

      if (safeRole === 'ORGANIZER') {
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

    // Handle referral if provided
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode }
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
      }
    }

    // Generate JWT — include name, points, referralCode so AuthContext can decode without a round-trip
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        points: user.points,
        referralCode: user.referralCode,
      },
      process.env.JWT_SECRET || 'fallback-secret',
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
    const { provider, providerId, email: rawEmail, name: rawName } = req.body;

    if (!provider || !providerId) {
      return res.status(400).json({ message: 'provider and providerId are required' });
    }

    const email = rawEmail?.trim().toLowerCase() || null;
    const name  = rawName?.trim() || 'User';

    // 1. Find by OAuth identity (returning user)
    let user = await prisma.user.findFirst({
      where: { oauthProvider: provider, oauthId: providerId },
    });

    // 2. Link OAuth to an existing email account (deduplication)
    if (!user && email) {
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser) {
        user = await prisma.user.update({
          where: { id: emailUser.id },
          data: { oauthProvider: provider, oauthId: providerId },
        });
      }
    }

    // 3. Create new account (shoppers only — role upgrade via settings)
    if (!user) {
      const userReferralCode = randomUUID().substring(0, 8).toUpperCase();
      // Use generated email only if provider didn't return one (no placeholder emails)
      const finalEmail = email || `oauth_${provider}_${providerId}@noreply.finda.sale`;
      user = await prisma.user.create({
        data: {
          email: finalEmail,
          name,
          role: 'USER',
          oauthProvider: provider,
          oauthId: providerId,
          referralCode: userReferralCode,
          points: 0,
        },
      });
    }

    const token = jwt.sign(
      {
        id:           user.id,
        email:        user.email,
        name:         user.name,
        role:         user.role,
        points:       user.points,
        referralCode: user.referralCode,
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ message: 'Server error during OAuth login' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawLoginEmail, password } = req.body;
    const email = rawLoginEmail?.trim().toLowerCase();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials - User not found' });
    }

    // Check if user has a password (some OAuth users might not)
    if (!user.password) {
      return res.status(400).json({ message: 'Account not set up for password login. Please contact support.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials - Incorrect password' });
    }

    // Generate JWT — include name, points, referralCode so AuthContext can decode without a round-trip
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        points: user.points,
        referralCode: user.referralCode,
      },
      process.env.JWT_SECRET || 'fallback-secret',
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
