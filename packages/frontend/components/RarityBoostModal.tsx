import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useXpSink } from '@/hooks/useXpSink';

interface Sale {
  id: string;
  title: string;
  city: string;
  address: string;
  endDate: string;
}

interface RarityBoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  userXp: number;
  onSuccess?: () => void;
}

const RARITY_BOOST_COST = 15;

export const RarityBoostModal: React.FC<RarityBoostModalProps> = ({
  isOpen,
  onClose,
  userXp,
  onSuccess,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { spendXpRarityBoost, isLoading: boostLoading } = useXpSink();
  const { showToast } = useToast();

  // Fetch active sales on modal open
  useEffect(() => {
    if (isOpen) {
      fetchSales();
    }
  }, [isOpen]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await api.get('/sales?status=PUBLISHED&limit=50');
      setSales(response.data.sales || []);
    } catch (error: any) {
      showToast('Failed to load sales', 'error');
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBoostSale = async () => {
    if (!selectedSaleId) {
      showToast('Please select a sale', 'error');
      return;
    }

    const success = await spendXpRarityBoost(selectedSaleId);
    if (success) {
      showToast(`✨ Rarity boosted! -${RARITY_BOOST_COST} XP`, 'success');
      setSelectedSaleId(null);
      setSearchQuery('');
      onClose();
      onSuccess?.();
    }
  };

  // Filter sales based on search query
  const filteredSales = sales.filter(
    (sale) =>
      sale.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  const hasEnoughXp = userXp >= RARITY_BOOST_COST;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-warm-100">
              ✨ Rarity Boost
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Spend {RARITY_BOOST_COST} XP to boost a sale's rarity odds
          </p>
        </div>

        <div className="p-6">
          {/* XP Check */}
          {!hasEnoughXp && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
              Not enough XP (need {RARITY_BOOST_COST}, have {userXp})
            </div>
          )}

          {/* Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by sale name or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-warm-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Sales List */}
          <div className="mb-4">
            {loading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                Loading sales...
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                {sales.length === 0 ? 'No active sales found' : 'No results match your search'}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredSales.map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedSaleId === sale.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <p className="font-semibold text-gray-900 dark:text-warm-100 text-sm">
                      {sale.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {sale.city} • Ends {new Date(sale.endDate).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-warm-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleBoostSale}
              disabled={!selectedSaleId || boostLoading || !hasEnoughXp}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                !hasEnoughXp || !selectedSaleId || boostLoading
                  ? 'bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-700 dark:hover:bg-amber-800'
              }`}
            >
              {boostLoading ? 'Boosting...' : 'Boost Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
