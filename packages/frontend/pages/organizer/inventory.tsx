import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import InventoryItemCard from '../../components/InventoryItemCard';
import useInventory from '../../hooks/useInventory';
import { useAuth } from '../../components/AuthContext';
import { SkeletonCard } from '../../components/SkeletonCards';
import { Search, Filter } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';

interface PullModalState {
  isOpen: boolean;
  inventoryItemId?: string;
  itemTitle?: string;
}

interface HistoryModalState {
  isOpen: boolean;
  itemId?: string;
  itemTitle?: string;
  history?: Array<{ price: number; changedBy: string; createdAt: string }>;
}

/**
 * Inventory Page — Feature #25: Organizer Inventory (consolidated from Item Library)
 * Browse, search, filter, and manage inventory items across all sales.
 */
const InventoryPage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [statusFilter, setStatusFilter] = useState('AVAILABLE');

  const [pullModal, setPullModal] = useState<PullModalState>({ isOpen: false });
  const [historyModal, setHistoryModal] = useState<HistoryModalState>({ isOpen: false });
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [sales, setSales] = useState<Array<{ id: string; title: string }>>([]);

  const { inventoryItems, loading, isRemovingFromInventory, isPullingFromInventory, removeFromInventory, pullFromInventory, getPriceHistory } =
    useInventory(user?.role === 'ORGANIZER' ? user?.id : undefined);

  // Filter items
  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchesSearch = !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesCondition = !conditionFilter || item.condition === conditionFilter;
      const matchesMinPrice = !minPrice || (item.price && item.price >= parseFloat(minPrice));
      const matchesMaxPrice = !maxPrice || (item.price && item.price <= parseFloat(maxPrice));
      const matchesStatus = !statusFilter || item.status === statusFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesCondition &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesStatus
      );
    });
  }, [inventoryItems, searchQuery, categoryFilter, conditionFilter, minPrice, maxPrice, statusFilter]);

  const handlePullClick = (itemId: string, itemTitle: string) => {
    setPullModal({ isOpen: true, inventoryItemId: itemId, itemTitle });
    fetchUserSales();
  };

  const fetchUserSales = async () => {
    try {
      const res = await api.get('/sales/mine');
      const salesData = res.data.sales.map((s: any) => ({ id: s.id, title: s.title }));
      setSales(salesData);
    } catch (error) {
      console.error('Error fetching sales:', error);
      setSales([]);
    }
  };

  const handleConfirmPull = () => {
    if (!pullModal.inventoryItemId || !selectedSaleId) {
      alert('Please select a sale');
      return;
    }
    const price = priceOverride ? parseFloat(priceOverride) : undefined;
    pullFromInventory(pullModal.inventoryItemId, selectedSaleId, price);
    setPullModal({ isOpen: false });
    setSelectedSaleId('');
    setPriceOverride('');
  };

  const handleViewHistory = async (itemId: string, itemTitle: string) => {
    try {
      const history = await getPriceHistory(itemId);
      setHistoryModal({ isOpen: true, itemId, itemTitle, history });
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  return (
    <>
      <Head>
        <title>Inventory | FindA.Sale</title>
      </Head>
      {/* Check authorization */}
      {!user || !user.roles?.includes('ORGANIZER') ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Please log in as an organizer to access your inventory.</p>
        </div>
      ) : (
      <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Inventory</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage your persistent inventory and pull items into sales.</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Category</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100">
                  <option value="">All</option>
                  <option value="furniture">Furniture</option>
                  <option value="decor">Decor</option>
                  <option value="vintage">Vintage</option>
                  <option value="collectibles">Collectibles</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Condition</label>
                <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100">
                  <option value="">All</option>
                  <option value="mint">Mint</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100">
                  <option value="">All</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="IN_SALE">In Sale</option>
                  <option value="SOLD">Sold</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Min Price</label>
                <input type="number" placeholder="$" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Max Price</label>
                <input type="number" placeholder="$" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100" />
              </div>
            </div>
          </div>
          <div>
            <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </div>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon="📦"
                heading="No items match your filters"
                subtext="Try adjusting your search terms, category, or price range to find items in your inventory."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredItems.map((item) => (
                  <InventoryItemCard
                    key={item.id}
                    {...item}
                    onPull={() => handlePullClick(item.id, item.title)}
                    onDelete={() => removeFromInventory(item.id)}
                    onViewHistory={() => handleViewHistory(item.id, item.title)}
                    isLoading={isRemovingFromInventory || isPullingFromInventory}
                  />
                ))}
              </div>
            )}
          </div>
          {pullModal.isOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Pull to Sale</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{pullModal.itemTitle}</p>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Select Sale</label>
                  <select value={selectedSaleId} onChange={(e) => setSelectedSaleId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100">
                    <option value="">Choose a sale...</option>
                    {sales.map((sale) => (<option key={sale.id} value={sale.id}>{sale.title}</option>))}
                  </select>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Price Override (optional)</label>
                  <input type="number" placeholder="$0.00" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPullModal({ isOpen: false })} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-slate-700">Cancel</button>
                  <button onClick={handleConfirmPull} disabled={!selectedSaleId || isPullingFromInventory} className="flex-1 px-4 py-2 bg-[#8FB897] hover:bg-[#7BA380] text-white font-semibold rounded-lg disabled:opacity-50">Pull Item</button>
                </div>
              </div>
            </div>
          )}
          {historyModal.isOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Price History</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{historyModal.itemTitle}</p>
                <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                  {historyModal.history && historyModal.history.length > 0 ? (
                    historyModal.history.map((entry, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-gray-50 dark:bg-slate-700 rounded">
                        <span className="text-gray-700 dark:text-gray-300">${entry.price.toFixed(2)}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{entry.changedBy}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600 dark:text-gray-400 text-sm">No price history</p>
                  )}
                </div>
                <button onClick={() => setHistoryModal({ isOpen: false })} className="w-full px-4 py-2 bg-[#8FB897] hover:bg-[#7BA380] text-white font-semibold rounded-lg">Close</button>
              </div>
            </div>
          )}
        </div>
        )}
    </>
  );
};

export default InventoryPage;
