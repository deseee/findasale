import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PerformanceRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/organizer/insights'); }, [router]);
  return null;
}
