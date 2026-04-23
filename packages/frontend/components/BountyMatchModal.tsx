/**
 * BountyMatchModal — Show matched bounties for an item (organizer feature)
 * Fires after item is published, shows top 3-5 matches with "Submit to Bounty" button
 */

import React from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

type BountyMatch = {
  bountyId: string;
  title: string; // bounty description
  reward: number; // xpReward
  shopperName: string;
  score: number;
  confidence: number; // 0-1 scale
};

type Props = {
  isOpen: boolean;
  matches: BountyMatch[];
  itemId: string;
  itemTitle: string;
  onClose: () => void;
};

const BountyMatchModal: React.FC<Props> = ({ isOpen, matches, itemId, itemTitle, onClose }) => {
  const { showToast } = useToast();

  const submitMutation = useMutation({
    mutationFn: (bountyId: string) =>
      api.post(`/bounties/${bountyId}/submissions`, {
        itemId,
        message: '',
      }),
    onSuccess: (response: any) => {
      showToast('Submission sent! The shopper will review it.', 'success');
      onClose();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to submit', 'error');
    },
  });

  if (!isOpen || matches.length === 0) return null;

  const confidencePercent = (conf: number) => Math.round(conf * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Your item matches bounties from shoppers
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            "{itemTitle}" matches {matches.length} {matches.length === 1 ? 'shopper request' : 'shopper requests'}
          </p>
        </div>

        {/* Matches list */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {matches.map((match) => (
              <div
                key={match.bountyId}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
              >
                {/* Match confidence badge */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{match.title}</span>
                  </span>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                    {confidencePercent(match.confidence)}% match
                  </span>
                </div>

                {/* Shopper info and reward */}
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    <strong>{match.shopperName}</strong>
                  </span>
                  <span className="text-amber-600 font-semibold">
                    Reward: {match.reward} XP
                  </span>
                </div>

                {/* Submit button */}
                <button
                  onClick={() => submitMutation.mutate(match.bountyId)}
                  disabled={submitMutation.isPending}
                  className="w-full rounded-md bg-sage-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-green-700 disabled:opacity-50 transition-colors"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit to Bounty'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BountyMatchModal;
