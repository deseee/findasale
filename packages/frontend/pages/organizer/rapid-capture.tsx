import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Redirect: /organizer/rapid-capture → /organizer/sales
 *
 * The Rapidfire Camera Mode is integrated into the add-items flow:
 * - Route: /organizer/add-items/[saleId]
 * - Camera tab is the entry point for rapid photo capture
 *
 * This page redirects users to the sales list so they can select a sale,
 * then access the camera flow from add-items.
 */
const RapidCaptureRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/organizer/sales');
  }, [router]);

  return null;
};

export default RapidCaptureRedirect;
