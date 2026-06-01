import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Redirect: /shopper/notifications → /notifications
 * Canonical notifications page. This redirect preserves bookmarks and links.
 * sale_alert filter for OPERATIONAL channel is now handled in /notifications.tsx.
 */
export default function ShopperNotificationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/notifications');
  }, [router]);
  return null;
}
