import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Redirect: /organizer/color-rules → /organizer/discount-rules
 * Canonical page is discount-rules. This redirect preserves bookmarks.
 * Feature #310: Color-tagged Discount Rules
 */
export default function ColorRulesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/organizer/discount-rules');
  }, [router]);
  return null;
}
