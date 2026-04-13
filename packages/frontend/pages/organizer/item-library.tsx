/**
 * Redirect to Inventory
 *
 * Item Library (deprecated) redirects to Inventory (live).
 * Route: /organizer/item-library → /organizer/inventory
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const ItemLibraryPage = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/organizer/inventory');
  }, [router]);

  return null;
};

export default ItemLibraryPage;
