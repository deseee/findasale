import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useSocket } from './useSocket';

export interface POSPaymentRequestData {
  id: string;
  organizerName: string;
  saleName: string;
  saleLocation?: string;
  itemIds: string[];
  totalAmountCents: number;
  displayAmount: string;
  platformFeeCents: number;
  status: 'PENDING' | 'ACCEPTED' | 'PAID' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  isExpired: boolean;
  stripePaymentIntentId: string | null;
  clientSecret: string | null;
  createdAt: string;
  acceptedAt: string | null;
  paidAt: string | null;
}

export interface UsePOSPaymentRequestResult {
  data: POSPaymentRequestData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isExpired: boolean;
  status: string | null;
}

export const usePOSPaymentRequest = (requestId: string | undefined): UsePOSPaymentRequestResult => {
  const socket = useSocket();
  const [status, setStatus] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posPaymentRequest', requestId],
    queryFn: async () => {
      if (!requestId) return null;
      const response = await api.get(`/pos/payment-request/${requestId}`);
      return response.data as POSPaymentRequestData;
    },
    enabled: !!requestId,
    refetchInterval: (query) => {
      // Stop polling if payment is complete or declined
      const data = query.state.data as POSPaymentRequestData | null;
      if (data?.status === 'PAID' || data?.status === 'DECLINED' || data?.isExpired) {
        return false;
      }
      return 5000; // Poll every 5 seconds
    },
  });

  useEffect(() => {
    if (!socket || !requestId) return;

    const handlePaymentStatus = (event: any) => {
      if (event.requestId === requestId) {
        setStatus(event.status);
      }
    };

    socket.on('POS_PAYMENT_STATUS', handlePaymentStatus);

    return () => {
      socket.off('POS_PAYMENT_STATUS', handlePaymentStatus);
    };
  }, [socket, requestId]);

  const currentStatus = status || data?.status || null;
  const isExpired = data?.isExpired || false;

  return {
    data: data || null,
    isLoading,
    isError,
    error: error as Error | null,
    isExpired,
    status: currentStatus,
  };
};
