/**
 * Checklist Landing Page — Redirects to /plan
 *
 * The sale checklist is now integrated into /plan as the first tab.
 * This page redirects organizers there automatically.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';

const ChecklistLandingPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      // Redirect to plan page
      router.replace('/plan');
    }
  }, [authLoading, router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 dark:border-amber-400"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Redirecting…</p>
      </div>
    </div>
  );
};

export default ChecklistLandingPage;
