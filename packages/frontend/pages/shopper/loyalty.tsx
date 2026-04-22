/**
 * /shopper/loyalty — Redirect stub (S540)
 *
 * This page consolidated into /coupons (unified XP-spend hub).
 * Preserving this route for deep links, email references, and bookmarks.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LoyaltyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/coupons');
  }, [router]);
  return null;
}
