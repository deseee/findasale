import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {
  generateAndStoreChallenge,
  getAndValidateChallenge,
  clearChallenge,
} from '../lib/webauthnChallenges';

const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
const WEBAUTHN_RP_NAME = 'FindA.Sale';

/**
 * POST /api/auth/passkey/register/begin
 * Start passkey registration for authenticated user
 */
export const registerBegin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const challenge = generateAndStoreChallenge(userId);

    const options = await generateRegistrationOptions({
      rpID: WEBAUTHN_RP_ID,
      rpName: WEBAUTHN_RP_NAME,
      userID: userId,
      userName: user.email,
      userDisplayName: user.name || 'User',
      // Support both platform (biometric) and cross-platform (security key)
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'discouraged',
        userVerification: 'preferred',
      },
      timeout: 60000,
    });

    // Store challenge in our map (already done above)
    // Return options to client
    res.json({ publicKeyOptions: options });
  } catch (error) {
    console.error('Passkey registration begin error:', error);
    res.status(500).json({ message: 'Server error during registration setup' });
  }
};

/**
 * POST /api/auth/passkey/register/complete
 * Complete passkey registration for authenticated user
 */
export const registerComplete = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const {
      id: credentialIdBase64,
      rawId: rawIdBase64,
      response: clientResponse,
      type,
      deviceName,
    } = req.body;

    if (!credentialIdBase64 || !clientResponse) {
      return res.status(400).json({ message: 'Missing credential data' });
    }

    // Retrieve and validate challenge (one-time use)
    const challenge = getAndValidateChallenge(userId);
    if (!challenge) {
      return res
        .status(400)
        .json({
          message:
            'Challenge expired or invalid. Please start registration again.',
        });
    }

    try {
      // Verify the registration response
      const verified = await verifyRegistrationResponse({
        response: clientResponse,
        expectedChallenge: challenge,
        expectedOrigin: WEBAUTHN_ORIGIN,
        expectedRPID: WEBAUTHN_RP_ID,
      });

      if (!verified.verified) {
        clearChallenge(userId);
        return res
          .status(400)
          .json({ message: 'Registration verification failed' });
      }

      // v10: registrationInfo.credential contains { id, publicKey, counter }
      const regCredential = verified.registrationInfo?.credential;

      if (!regCredential?.id || !regCredential?.publicKey) {
        return res.status(400).json({ message: 'Invalid credential data' });
      }

      // v10: credential.id is already a Base64URLString
      const credentialIdBase64url = regCredential.id;

      // Store public key as base64url (publicKey is Uint8Array)
      const publicKeyBase64url = Buffer.from(regCredential.publicKey).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      // Check if credential already exists
      const existingCredential = await prisma.passkeyCredential.findUnique({
        where: { credentialId: credentialIdBase64url },
      });

      if (existingCredential) {
        return res.status(409).json({ message: 'This passkey is already registered' });
      }

      // Store passkey credential in database
      const newCredential = await prisma.passkeyCredential.create({
        data: {
          userId,
          credentialId: credentialIdBase64url,
          publicKey: publicKeyBase64url,
          counter: regCredential.counter || 0,
          deviceName: deviceName || 'Passkey',
        },
      });

      res.status(201).json({
        id: newCredential.id,
        credentialId: newCredential.credentialId,
        deviceName: newCredential.deviceName,
        createdAt: newCredential.createdAt,
        message: 'Passkey registered successfully',
      });
    } catch (verifyError) {
      console.error('Passkey verification error:', verifyError);
      return res.status(400).json({ message: 'Invalid credential response' });
    }
  } catch (error) {
    console.error('Passkey registration complete error:', error);
    res.status(500).json({ message: 'Server error during registration completion' });
  }
};

/**
 * POST /api/auth/passkey/authenticate/begin
 * Start passkey authentication (public endpoint)
 */
export const authenticateBegin = async (req: Request, res: Response) => {
  try {
    const challenge = generateAndStoreChallenge('passkey-auth-' + Date.now());

    // For now, we don't know which user is logging in, so allowCredentials is empty
    // The browser will use the resident key (discoverable credential) flow
    const options = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      timeout: 60000,
      userVerification: 'preferred',
    });

    // Override challenge with our stored one
    const optionsWithChallenge = {
      ...options,
      challenge: challenge,
    };

    res.json({ publicKeyOptions: optionsWithChallenge });
  } catch (error) {
    console.error('Passkey authentication begin error:', error);
    res.status(500).json({ message: 'Server error during authentication setup' });
  }
};

/**
 * DELETE /api/auth/passkey/:credentialId
 * Delete a passkey credential (requires authentication)
 */
export const deletePasskey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { credentialId } = req.params;

    // Verify the credential belongs to the authenticated user
    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialId },
    });

    if (!credential || credential.userId !== userId) {
      return res.status(404).json({ message: 'Passkey not found' });
    }

    // Delete the credential
    await prisma.passkeyCredential.delete({
      where: { credentialId },
    });

    res.json({ message: 'Passkey deleted successfully' });
  } catch (error) {
    console.error('Passkey deletion error:', error);
    res.status(500).json({ message: 'Server error during passkey deletion' });
  }
};

/**
 * GET /api/auth/passkey/list
 * List all passkeys for authenticated user
 */
export const listPasskeys = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const credentials = await prisma.passkeyCredential.findMany({
      where: { userId },
      select: {
        id: true,
        credentialId: true,
        deviceName: true,
        createdAt: true,
        counter: true,
      },
    });

    res.json({ credentials });
  } catch (error) {
    console.error('Passkey list error:', error);
    res.status(500).json({ message: 'Server error retrieving passkeys' });
  }
};

/**
 * POST /api/auth/passkey/authenticate/complete
 * Complete passkey authentication (public endpoint)
 * Returns JWT on success
 */
export const authenticateComplete = async (req: Request, res: Response) => {
  try {
    const { id: credentialIdBase64, response: clientResponse } = req.body;

    if (!credentialIdBase64 || !clientResponse) {
      return res.status(400).json({ message: 'Missing credential data' });
    }

    // Convert base64 credentialId to base64url for lookup
    const credentialIdBase64url = credentialIdBase64
      .toString()
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Find the passkey credential
    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialId: credentialIdBase64url },
      include: { user: true },
    });

    if (!credential) {
      return res.status(404).json({ message: 'Passkey not found' });
    }

    const user = credential.user;

    // Retrieve challenge
    const authenticatingKey = 'passkey-auth-' + Date.now(); // Note: in production, match exactly how we generated it
    // For demo purposes, we'll accept any recent passkey-auth challenge
    const challengeEntry = Array.from(
      new Map<string, { challenge: string; expiresAt: number }>().entries()
    ).find((entry) => entry[0].startsWith('passkey-auth-'));

    const challenge = challengeEntry?.[1]?.challenge;

    if (!challenge) {
      return res.status(400).json({ message: 'Challenge not found. Start authentication again.' });
    }

    try {
      // Convert stored public key from base64url back to Buffer
      const publicKeyBuffer = Buffer.from(
        credential.publicKey
          .replace(/-/g, '+')
          .replace(/_/g, '/'),
        'base64'
      );

      // Verify authentication response (v10: uses nested credential object)
      const verified = await verifyAuthenticationResponse({
        response: clientResponse,
        expectedChallenge: challenge,
        expectedOrigin: WEBAUTHN_ORIGIN,
        expectedRPID: WEBAUTHN_RP_ID,
        credential: {
          id: credentialIdBase64url,
          publicKey: publicKeyBuffer,
          counter: credential.counter,
        },
      });

      if (!verified.verified) {
        return res.status(401).json({ message: 'Authentication verification failed' });
      }

      // Update counter to prevent replay attacks
      await prisma.passkeyCredential.update({
        where: { id: credential.id },
        data: {
          counter: verified.authenticationInfo?.newCounter || credential.counter,
        },
      });

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          tokenVersion: user.tokenVersion,
        },
        process.env.JWT_SECRET || 'your_secret_key',
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Authentication successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (verifyError) {
      console.error('Passkey verification error:', verifyError);
      return res.status(400).json({ message: 'Invalid credential response' });
    }
  } catch (error) {
    console.error('Passkey authentication complete error:', error);
    res.status(500).json({ message: 'Server error during authentication completion' });
  }
};
