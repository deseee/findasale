import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Redirect: /organizer/add-items (no saleId) \u2192 dashboard
 * The correct route is /organizer/add-items/[saleId].
 * This page exists only to handle stale links gracefully.
 */
const AddItemsRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/organizer/dashboard');
  }, [router]);
  return null;
};

export default AddItemsRedirect;
