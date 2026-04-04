import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function HaulComingSoonPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new haul posts feed
    router.replace('/shopper/haul-posts');
  }, [router]);

  return null;
}
