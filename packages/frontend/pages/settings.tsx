/**
 * Settings Redirect Page
 *
 * Routes users to role-appropriate settings:
 * - ORGANIZER → /organizer/settings
 * - USER/SHOPPER → /shopper/settings
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthContext';

const SettingsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login?redirect=/settings');
      } else if (user.roles?.includes('ORGANIZER')) {
        router.push('/organizer/settings');
      } else {
        router.push('/shopper/settings');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Redirecting to your settings...</p>
      </div>
    </div>
  );
};

export default SettingsPage;
