/**
 * LeaveSaleWarning Component
 * Feature #121: Warn shoppers when leaving a sale that has active holds.
 * Helps prevent accidental loss of holds due to distance/GPS validation.
 */

import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface LeaveSaleWarningProps {
  saleId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmLeave: () => void;
}

const LeaveSaleWarning: React.FC<LeaveSaleWarningProps> = ({
  saleId,
  isOpen,
  onClose,
  onConfirmLeave,
}) => {
  const { user } = useAuth();
  const [holdCount, setHoldCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && saleId && user) {
      fetchUserHolds();
    }
  }, [isOpen, saleId, user]);

  const fetchUserHolds = async () => {
    try {
      // Check if user has any active holds at this sale
      const resp = await api.get(`/reservations/organizer`);
      const saleHolds = resp.data.holds.filter((h: any) => h.item.sale.id === saleId);
      setHoldCount(saleHolds.length);
    } catch (err) {
      console.warn('Failed to fetch holds:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-amber-100 rounded-lg">
            <svg className="h-6 w-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">You have active holds!</h2>
            <p className="text-sm text-gray-600 mt-1">
              Feature #121: Leaving the sale area may affect your holds.
            </p>
          </div>
        </div>

        {holdCount > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              You have <strong>{holdCount} active hold{holdCount !== 1 ? 's' : ''}</strong> at this
              sale.
            </p>
            <ul className="mt-2 text-sm text-amber-800 space-y-1 ml-4 list-disc">
              <li>Holds expire based on the organizer's hold duration settings</li>
              <li>If GPS validation is enabled, you may not be able to place new holds from a distance</li>
              <li>Return to confirm your holds before they expire</li>
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Stay at Sale
          </button>
          <button
            onClick={() => {
              onConfirmLeave();
              onClose();
            }}
            className="w-full py-2 px-4 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors"
          >
            Leave Sale Area
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Your holds are safe — this is just a reminder that GPS-based features may be affected by your distance from the sale.
        </p>
      </div>
    </div>
  );
};

export default LeaveSaleWarning;
