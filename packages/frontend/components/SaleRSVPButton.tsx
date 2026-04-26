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

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/rsvp/mine`);
        setIsGoing(response.data.isGoing);
        setCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch RSVP status:', error);
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

      const countResponse = await api.get(`/sales/${saleId}/rsvp/count`);
      const newCount = countResponse.data.count;

      setIsGoing(newIsGoing);
      setCount(newCount);

      if (onRSVPChange) {
        onRSVPChange(newIsGoing, newCount);
      }

      if (newIsGoing) {
        showToast("✓ You're going!", 'success');
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
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
        isGoing
          ? 'border border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-800/40'
          : 'bg-amber-600 hover:bg-amber-700 text-white'
      }`}
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
