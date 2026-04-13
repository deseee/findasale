/**
 * Legacy redirect: /organizer/staff → /organizer/members
 * Kept for backward compatibility with bookmarks and external links.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function StaffRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/organizer/members');
  }, [router]);
  return null;
}
