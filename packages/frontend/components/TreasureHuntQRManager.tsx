import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface Clue {
  id: string;
  clueText: string;
  hintPhoto?: string;
  category?: string;
  createdAt: string;
}

interface TreasureHuntQRManagerProps {
  saleId: string;
  enabled: boolean;
  completionBadge: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onCompletionBadgeChange: (badge: boolean) => void;
}

const TreasureHuntQRManager: React.FC<TreasureHuntQRManagerProps> = ({
  saleId,
  enabled,
  completionBadge,
  onEnabledChange,
  onCompletionBadgeChange,
}) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [clueText, setClueText] = useState('');
  const [category, setCategory] = useState('');

  const { data: cluesData, isLoading } = useQuery({
    queryKey: ['treasureHuntQRClues', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}/treasure-hunt-qr`);
      return response.data;
    },
    enabled: !!saleId,
  });

  const clues: Clue[] = cluesData?.clues || [];

  const createClueMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/sales/${saleId}/treasure-hunt-qr`, {
        clueText,
        category: category || null,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Clue added successfully', 'success');
      setClueText('');
      setCategory('');
      queryClient.invalidateQueries({ queryKey: ['treasureHuntQRClues', saleId] });
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to add clue', 'error');
    },
  });

  const deleteClueMutation = useMutation({
    mutationFn: async (clueId: string) => {
      await api.delete(`/sales/${saleId}/treasure-hunt-qr/${clueId}`);
    },
    onSuccess: () => {
      showToast('Clue deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['treasureHuntQRClues', saleId] });
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to delete clue', 'error');
    },
  });

  const handleAddClue = () => {
    if (!clueText.trim()) {
      showToast('Clue text is required', 'error');
      return;
    }
    createClueMutation.mutate();
  };

  const categories = ['Furniture', 'Decor', 'Vintage', 'Collectibles', 'Jewelry', 'Books', 'Tools', 'Electronics', 'Clothing', 'Art'];

  return (
    <div className="border-t border-warm-300 dark:border-gray-600 pt-6 mt-6">
      <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Treasure Hunt QR Clues</h3>

      <div className="space-y-4 mb-6">
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="treasureHuntEnabled"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded cursor-pointer"
          />
          <label htmlFor="treasureHuntEnabled" className="cursor-pointer flex flex-col">
            <span className="text-sm font-medium text-warm-700 dark:text-gray-300">
              Enable Treasure Hunt QR for this sale
            </span>
            <span className="text-xs text-warm-500 dark:text-gray-400 mt-1">
              Shoppers scan QR codes to find items and earn XP
            </span>
          </label>
        </div>

        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="completionBadge"
            checked={completionBadge}
            onChange={(e) => onCompletionBadgeChange(e.target.checked)}
            disabled={!enabled}
            className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded cursor-pointer disabled:opacity-50"
          />
          <label htmlFor="completionBadge" className="cursor-pointer flex flex-col">
            <span className="text-sm font-medium text-warm-700 dark:text-gray-300">
              Offer completion bonus (50 XP when all clues found)
            </span>
            <span className="text-xs text-warm-500 dark:text-gray-400 mt-1">
              Shoppers earn extra XP when they find all treasure hunt clues
            </span>
          </label>
        </div>
      </div>

      {enabled && (
        <>
          <div className="bg-warm-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
            <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">Add a New Clue</h4>
            <div className="space-y-3">
              <div>
                <label htmlFor="clueText" className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                  Clue Hint *
                </label>
                <textarea
                  id="clueText"
                  value={clueText}
                  onChange={(e) => setClueText(e.target.value)}
                  placeholder="e.g., 'Find the red velvet chair with golden legs'"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                  rows={2}
                />
              </div>
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                  Category (optional)
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                >
                  <option value="">Select a category...</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddClue}
                disabled={createClueMutation.isPending || !clueText.trim()}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                {createClueMutation.isPending ? 'Adding...' : 'Add Clue'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">
              Clues ({clues.length})
            </h4>
            {isLoading ? (
              <div className="text-sm text-warm-500">Loading clues...</div>
            ) : clues.length === 0 ? (
              <div className="text-sm text-warm-500">No clues yet. Add one above!</div>
            ) : (
              <div className="space-y-3">
                {clues.map((clue) => {
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                    `https://finda.sale/sales/${saleId}/treasure-hunt-qr/${clue.id}?scan=true`
                  )}`;
                  return (
                    <div key={clue.id} className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 p-3 rounded-lg">
                      <div className="mb-2">
                        <p className="text-sm font-medium text-warm-900 dark:text-warm-100">{clue.clueText}</p>
                        {clue.category && (
                          <span className="inline-block mt-1 text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded">
                            {clue.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <img
                          src={qrUrl}
                          alt="QR Code"
                          className="w-20 h-20 border border-warm-300 dark:border-gray-600 rounded"
                        />
                        <div className="flex flex-col gap-2">
                          <a
                            href={qrUrl}
                            download={`treasure-hunt-${clue.id}.png`}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded"
                          >
                            Download QR
                          </a>
                          <button
                            type="button"
                            onClick={() => deleteClueMutation.mutate(clue.id)}
                            disabled={deleteClueMutation.isPending}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white py-1 px-2 rounded disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TreasureHuntQRManager;
