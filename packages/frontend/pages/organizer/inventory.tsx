/**
 * Redirect to Item Library
 *
 * Inventory (coming soon) redirects to Item Library (live).
 * Route: /organizer/inventory
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const InventoryPage = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/organizer/item-library');
  }, [router]);

  return null;
};

export default InventoryPage;
