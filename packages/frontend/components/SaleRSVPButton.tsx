import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

interface SaleRSVPButtonProps {
  saleId: string;
  onRSVPChange?: (isGoing: boolean, count: number) => void;
}

const SaleRSVPButton: React.FC<SaleRSVPButtonProps> = ({ saleId, onRSVPChange }) => {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isGoing, setIsGoing] = useState(false);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch current RSVP status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/rsvp/mine`);
        setIsGoing(response.data.isGoing);
        setCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch RSVP status:', error);
        // If not authenticated, just fetch count
        try {
          const countResponse = await api.get(`/sales/${saleId}/rsvp/count`);
          setCount(countResponse.data.count);
        } catch {
          // Silent fail
        }
      }
    };

    if (saleId) {
      fetchStatus();
    }
  }, [saleId, user]);

  const handleToggleRSVP = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post(`/sales/${saleId}/rsvp`);
      const newIsGoing = response.data.isGoing;

      // Refetch count after toggling
      const countResponse = await api.get(`/sales/${saleId}/rsvp/count`);
      const newCount = countResponse.data.count;

      setIsGoing(newIsGoing);
      setCount(newCount);

      if (onRSVPChange) {
        onRSVPChange(newIsGoing, newCount);
      }

      if (newIsGoing) {
        showToast('✓ You\'re going!', 'success');
      } else {
        showToast('RSVP cancelled', 'info');
      }
    } catch (error: any) {
      console.error('RSVP toggle error:', error);
      showToast(error.response?.data?.message || 'Failed to update RSVP', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggleRSVP}
      disabled={isLoading}
      className={`px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
        isGoing
          ? 'bg-green-100 text-green-800 hover:bg-green-200'
          : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
      } disabled:opacity-50`}
    >
      {isGoing ? (
        <>
          <span>✓ You&apos;re going</span>
          <span className="text-sm">({count})</span>
        </>
      ) : (
        <>
          <span>📅 Going</span>
          <span className="text-sm">({count})</span>
        </>
      )}
    </button>
  );
};

export default SaleRSVPButton;
