import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

interface SaleSubscriptionProps {
  saleId: string;
  userEmail?: string;
  userPhone?: string;
}

const SaleSubscription: React.FC<SaleSubscriptionProps> = ({ 
  saleId, 
  userEmail,
  userPhone 
}) => {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(userPhone || '');
  const [email, setEmail] = useState(userEmail || '');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Check if user is already subscribed
  useQuery({
    queryKey: ['subscription', saleId],
    queryFn: async () => {
      const response = await api.get('/notifications/subscriptions');
      const subscriptions = response.data;
      const isAlreadySubscribed = subscriptions.some(
        (sub: any) => sub.saleId === saleId
      );
      setIsSubscribed(isAlreadySubscribed);
      return isAlreadySubscribed;
    },
    enabled: !!saleId,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/notifications/subscribe', {
        saleId,
        phone: phone || undefined,
        email: email || undefined,
      });
    },
    onSuccess: () => {
      setIsSubscribed(true);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['subscription', saleId] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      return await api.delete(`/notifications/unsubscribe/${saleId}`);
    },
    onSuccess: () => {
      setIsSubscribed(false);
      queryClient.invalidateQueries({ queryKey: ['subscription', saleId] });
    },
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    subscribeMutation.mutate();
  };

  const handleUnsubscribe = () => {
    unsubscribeMutation.mutate();
  };

  if (isSubscribed) {
    return (
      <div className="mt-4 p-4 bg-green-50 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-green-800 font-medium">Subscribed to notifications</p>
            <p className="text-green-600 text-sm">
              You'll receive updates about this sale
            </p>
          </div>
          <button
            onClick={handleUnsubscribe}
            disabled={unsubscribeMutation.isPending}
            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
          >
            {unsubscribeMutation.isPending ? 'Unsubscribing...' : 'Unsubscribe'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
        >
          Subscribe to Updates
        </button>
      ) : (
        <div className="p-4 bg-warm-50 rounded-lg">
          <h3 className="font-medium text-warm-900 mb-3">Subscribe to Sale Updates</h3>
          <form onSubmit={handleSubscribe} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-warm-700 mb-1">
                Email (for weekly digests)
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="your@email.com"
              />
            </div>
            
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-warm-700 mb-1">
                Phone (for SMS alerts)
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="(123) 456-7890"
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={subscribeMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {subscribeMutation.isPending ? 'Subscribing...' : 'Subscribe'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-warm-500 hover:bg-warm-600 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
            
            {subscribeMutation.isError && (
              <div className="text-red-600 text-sm">
                Failed to subscribe. Please try again.
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default SaleSubscription;
