'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface AlaCartePublishModalProps {
  saleId: string;
  saleName: string;
  isOpen: boolean;
  onClose: () => void;
  onPublishSuccess: () => void; // Called after modal confirms — caller handles sale status update
}

const AlaCartePublishModal: React.FC<AlaCartePublishModalProps> = ({
  saleId,
  saleName,
  isOpen,
  onClose,
  onPublishSuccess,
}) => {
  const { showToast } = useToast();
  const [selectedOption, setSelectedOption] = useState<'pro' | 'ala-carte' | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/sales/${saleId}/ala-carte-checkout`);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create checkout session';
      showToast(message, 'error');
    },
  });

  if (!isOpen) return null;

  const handleProClick = () => {
    // Redirect to pricing page
    window.location.href = '/organizer/pricing';
  };

  const handleAlaCarteClick = () => {
    setSelectedOption('ala-carte');
    checkoutMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 px-6 py-8 border-b border-amber-200 dark:border-amber-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Ready to publish "{saleName}"?
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Choose how you'd like to get your sale live.
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Options */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* PRO Subscription */}
            <button
              onClick={handleProClick}
              className="p-6 border-2 border-amber-200 dark:border-amber-700 rounded-lg hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all text-left"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Subscribe to PRO
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                $29/month — unlimited sales + more features
              </p>
              <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Publish unlimited sales</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Advanced analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Sale templates & branding</span>
                </li>
              </ul>
              <div className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors">
                View Plans →
              </div>
            </button>

            {/* À La Carte */}
            <button
              onClick={handleAlaCarteClick}
              disabled={checkoutMutation.isPending}
              className="p-6 border-2 border-green-200 dark:border-green-700 rounded-lg hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Pay per sale
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                $9.99 one-time — publish this sale only
              </p>
              <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Publish this sale</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>No recurring charges</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Full sale analytics</span>
                </li>
              </ul>
              <div className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:bg-gray-400">
                {checkoutMutation.isPending ? 'Processing...' : 'Continue to Payment'}
              </div>
            </button>
          </div>

          {/* Tip */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              <strong>Tip:</strong> After 3 à la carte sales, PRO pays for itself.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlaCartePublishModal;
