import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface Pool {
  id: string;
  creatorId: string;
  creator: {
    id: string;
    name: string;
  };
  targetAmount: number;
  totalPledged: number;
  participantCount: number;
  percentageToTarget: number;
  status: string;
  expiresAt: string;
  participants: Array<{
    id: string;
    userId: string;
    pledgeAmount: number;
    joinedAt: string;
  }>;
}

interface BuyingPoolCardProps {
  itemId: string;
  itemPrice: number;
  itemStatus: string;
  userId?: string;
  onPoolCreated?: () => void;
}

const BuyingPoolCard: React.FC<BuyingPoolCardProps> = ({
  itemId,
  itemPrice,
  itemStatus,
  userId,
  onPoolCreated,
}) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  // Only show for items $100+ and AVAILABLE
  const shouldShow = itemPrice > 10000 && itemStatus === 'AVAILABLE';

  // Fetch pools for this item
  const { data: poolsData, isLoading } = useQuery({
    queryKey: ['buyingPools', itemId],
    queryFn: async () => {
      const response = await api.get(`/buying-pools/item/${itemId}`);
      return response.data as { pools: Pool[] };
    },
    enabled: shouldShow,
  });

  const pools = poolsData?.pools || [];
  const activePool = pools.length > 0 ? pools[0] : null;

  // Create pool mutation
  const createPoolMutation = useMutation({
    mutationFn: () => api.post('/buying-pools', { itemId }),
    onSuccess: () => {
      showToast('Buying pool created! Invite others to join.', 'success');
      queryClient.invalidateQueries({ queryKey: ['buyingPools', itemId] });
      onPoolCreated?.();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to create pool', 'error');
    },
  });

  // Join pool mutation
  const joinPoolMutation = useMutation({
    mutationFn: (poolId: string) =>
      api.post(`/buying-pools/${poolId}/join`, {
        poolId,
        pledgeAmount: parseFloat(pledgeAmount),
      }),
    onSuccess: (response) => {
      showToast(response.data.message, 'success');
      setPledgeAmount('');
      setShowJoinForm(false);
      queryClient.invalidateQueries({ queryKey: ['buyingPools', itemId] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to join pool', 'error');
    },
  });

  if (!shouldShow) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="mt-6 pt-6 border-t border-warm-200">
        <div className="bg-warm-50 rounded-lg p-4 animate-pulse h-32"></div>
      </div>
    );
  }

  // Calculate how many shoppers could split this
  const potentialSplits = [2, 3, 4, 5];
  const perPersonPrices = potentialSplits.map(n => (itemPrice / n).toFixed(2));

  return (
    <div className="mt-6 pt-6 border-t border-warm-200">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        {/* Header */}
        <div className="flex items-start gap-2 mb-3">
          <span className="text-2xl">🤝</span>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">Split this purchase</h3>
            <p className="text-xs text-blue-700 mt-1">Buy with others to share the cost</p>
          </div>
        </div>

        {activePool ? (
          /* Existing Pool */
          <div className="space-y-3">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-blue-900">
                  ${(activePool.totalPledged / 100).toFixed(2)} of ${(activePool.targetAmount / 100).toFixed(2)}
                </span>
                <span className="text-xs text-blue-700">{activePool.percentageToTarget}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${Math.min(activePool.percentageToTarget, 100)}%` }}
                />
              </div>
            </div>

            {/* Participant count */}
            <p className="text-sm text-blue-900">
              <strong>{activePool.participantCount}</strong> shopper{activePool.participantCount !== 1 ? 's' : ''} have joined
            </p>

            {/* Join button or status */}
            {userId && !activePool.participants.some(p => p.userId === userId) ? (
              <>
                {!showJoinForm ? (
                  <button
                    onClick={() => setShowJoinForm(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors text-sm"
                  >
                    Join Pool
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={(activePool.targetAmount - activePool.totalPledged) / 100}
                      value={pledgeAmount}
                      onChange={(e) => setPledgeAmount(e.target.value)}
                      placeholder={`Max: $${((activePool.targetAmount - activePool.totalPledged) / 100).toFixed(2)}`}
                      className="w-full px-3 py-2 border border-blue-300 rounded text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          joinPoolMutation.mutate(activePool.id)
                        }
                        disabled={
                          joinPoolMutation.isPending ||
                          !pledgeAmount ||
                          parseFloat(pledgeAmount) <= 0
                        }
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors text-sm disabled:opacity-50"
                      >
                        {joinPoolMutation.isPending ? 'Joining…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => {
                          setShowJoinForm(false);
                          setPledgeAmount('');
                        }}
                        className="flex-1 border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold py-2 px-4 rounded transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : userId && activePool.participants.some(p => p.userId === userId) ? (
              <p className="text-sm text-blue-700">
                ✓ You've joined this pool
              </p>
            ) : (
              <p className="text-sm text-blue-700 text-center py-2">
                <a href="/auth/login" className="font-semibold hover:underline">
                  Log in to join
                </a>
              </p>
            )}

            {activePool.status === 'FILLED' && (
              <div className="bg-green-100 border border-green-300 rounded p-2 text-sm text-green-800 text-center font-semibold">
                ✓ Pool filled! Coordinating delivery…
              </div>
            )}
          </div>
        ) : (
          /* No Pool Yet */
          <div className="space-y-3">
            <p className="text-sm text-blue-900">
              Be the first to start a pool for this item. Split with up to <strong>4 other shoppers</strong>.
            </p>

            {/* Price breakdown teaser */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {potentialSplits.map((n, i) => (
                <div key={n} className="bg-white/60 rounded p-2">
                  <p className="text-blue-700">Split {n} ways:</p>
                  <p className="font-bold text-blue-900">${perPersonPrices[i]} each</p>
                </div>
              ))}
            </div>

            {userId ? (
              <button
                onClick={() => createPoolMutation.mutate()}
                disabled={createPoolMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors text-sm disabled:opacity-50"
              >
                {createPoolMutation.isPending ? 'Creating…' : 'Start a Pool'}
              </button>
            ) : (
              <p className="text-sm text-blue-700 text-center py-2">
                <a href="/auth/login" className="font-semibold hover:underline">
                  Log in to start a pool
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyingPoolCard;
