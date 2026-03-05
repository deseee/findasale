/**
 * V3: BountyModal — "Can't find something?" button + submit form
 * Drop this onto any sale detail page. Pass saleId and the sale's status.
 */

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

type Props = {
  saleId: string;
  saleStatus: string; // 'DRAFT' | 'PUBLISHED' | 'ENDED'
};

const BountyModal: React.FC<Props> = ({ saleId, saleStatus }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [offerPrice, setOfferPrice] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/bounties', {
        saleId,
        description: description.trim(),
        offerPrice: offerPrice ? parseFloat(offerPrice) : undefined,
      }),
    onSuccess: () => {
      showToast('Request submitted! The organizer will be notified.', 'success');
      setOpen(false);
      setDescription('');
      setOfferPrice('');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Could not submit request', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    mutation.mutate();
  };

  // Don't render for ended sales or organizers
  if (saleStatus === 'ENDED' || user?.role === 'ORGANIZER') return null;

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-3 py-2 px-4 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        Can't find something? Request it →
      </button>

      {/* Modal backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Request a missing item</h2>
            <p className="text-sm text-gray-500 mb-4">
              Describe what you're looking for. The organizer will see your request and may add it to the sale.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What are you looking for?
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Mid-century walnut dresser, vintage cast iron skillet, 1970s record player…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What would you pay? <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={offerPrice}
                    onChange={e => setOfferPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Helps the organizer prioritize — no commitment required.
                </p>
              </div>

              {!user && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  You'll need to sign in to submit a request.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!user || mutation.isPending || !description.trim()}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {mutation.isPending ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default BountyModal;
