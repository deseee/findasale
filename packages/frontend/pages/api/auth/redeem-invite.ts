/**
 * POST /api/auth/redeem-invite
 *
 * Called by the frontend after OAuth login completes.
 * Redeems a pending invite code for the current authenticated user.
 *
 * Body:
 *   { inviteCode: 'ABC123' }
 *
 * Returns:
 *   { success: true, message: 'Invite redeemed' }
 *   or error response
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });

    if (!session || !(session as any).backendJwt) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

    // Call backend to redeem the invite code
    const { data } = await axios.post(
      `${apiUrl}/auth/redeem-invite`,
      { inviteCode },
      {
        headers: {
          Authorization: `Bearer ${(session as any).backendJwt}`,
        },
      }
    );

    return res.status(200).json(data);
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to redeem invite code';
    return res.status(status).json({ message });
  }
}
