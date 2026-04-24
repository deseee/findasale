import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Redirect /shopper/profile → /shopper/explorer-profile
// Explorer Profile is the canonical shopper profile page (consolidated S528)
export default function ShopperProfileRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/shopper/explorer-profile');
  }, [router]);
  return null;
}
