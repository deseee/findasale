import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';

/**
 * POST /api/billing/checkout
 * Proxy request to backend billing/checkout endpoint
 * Requires authentication via NextAuth session
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Verify user is authenticated via NextAuth
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get backend JWT from session (set by NextAuth provider)
    const backendJwt = (session as any).backendJwt;
    if (!backendJwt) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    const { priceId, billingInterval } = req.body;

    if (!priceId || !billingInterval) {
      return res.status(400).json({ message: 'Missing required fields: priceId, billingInterval' });
    }

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    // Proxy to backend
    const backendRes = await fetch(`${backendUrl}/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendJwt}`,
      },
      body: JSON.stringify({ priceId, billingInterval }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return res.status(backendRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Checkout API error:', error);
    return res.status(500).json({ message: 'Failed to create checkout session' });
  }
}
