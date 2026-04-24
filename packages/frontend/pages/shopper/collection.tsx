import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Redirect /shopper/collection → /shopper/explorer-profile
// Collector passport / collection content lives on the Explorer Profile page
export default function ShopperCollectionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/shopper/explorer-profile');
  }, [router]);
  return null;
}
