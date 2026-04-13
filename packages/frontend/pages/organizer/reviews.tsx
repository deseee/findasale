/**
 * Organizer Reviews — Redirect to combined Reputation & Reviews page
 * Reviews functionality merged into reputation.tsx (S434)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function OrganizerReviewsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/organizer/reputation?tab=reviews');
  }, [router]);

  return null;
}
