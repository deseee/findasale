import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import api from '../lib/api';

export interface OrganizerSetupData {
  businessName: string;
  phone?: string;
  address?: string;
}

/**
 * Hook to handle shopper→organizer conversion flow.
 * Calls POST /api/users/setup-organizer, stores new JWT, updates auth context, redirects.
 */
export const useOrganizerSetup = () => {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupOrganizer = async (data: OrganizerSetupData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/users/setup-organizer', {
        businessName: data.businessName,
        phone: data.phone || undefined,
        address: data.address || undefined,
      });

      // Success: token returned with fresh JWT including ORGANIZER role
      if (response.data?.token) {
        // Update auth context with new JWT
        login(response.data.token);

        // Show success toast
        showToast('Welcome, Organizer! You\'re ready to list your items.', 'success');

        // Redirect to dashboard with welcome flag
        router.push('/organizer/dashboard?welcome=true');
      } else {
        throw new Error('No token received from server');
      }
    } catch (err: any) {
      console.error('Setup organizer error:', err);
      const message =
        err.response?.data?.message ||
        err.message ||
        'Failed to activate organizer profile. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return { setupOrganizer, loading, error, setError };
};
