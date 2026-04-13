import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LeaderboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/leaderboard');
  }, [router]);

  return null;
}
