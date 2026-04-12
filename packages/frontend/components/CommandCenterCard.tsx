import React, { useState } from 'react';
import Link from 'next/link';
import { useToast } from './ToastContext';
import api from '../lib/api';
import SocialPostGenerator from './SocialPostGenerator';
import BoostPurchaseModal from './BoostPurchaseModal';
import { Clock, ShoppingCart } from 'lucide-react';
import type { SaleMetrics } from '../types/commandCenter';

interface CommandCenterCardProps {
  sale: SaleMetrics;
}

const CommandCenterCard: React.FC<CommandCenterCardProps> = ({ sale }) => {
  const { showToast } = useToast();
  // FlashDeal navigates to sale page instead of modal (needs item data)
  const [socialPostSale, setSocialPostSale] = useState<{ id: string; title: string } | null>(null);
  const [boostSaleId, setBoostSaleId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const startDate = new Date(sale.startDate);
  const endDate = new Date(sale.endDate);
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Compute date-aware display status
  const now = new Date();
  let displayStatus: 'LIVE' | 'UPCOMING' | 'DRAFT' | 'ENDED';
  if (sale.status === 'DRAFT') {
    displayStatus = 'DRAFT';
  } else if (sale.status === 'PUBLISHED' && now < startDate) {
    displayStatus = 'UPCOMING';
  } else if (sale.status === 'PUBLISHED' && now >= startDate && now <= endDate) {
    displayStatus = 'LIVE';
  } else {
    displayStatus = 'ENDED';
  }

  const statusStyles = {
    LIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    UPCOMING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    ENDED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  const statusBg = statusStyles[displayStatus];

  const totalPending = sale.pendingActions.total;
  let pendingBadgeColor = 'bg-green-500';
  if (totalPending > 0 && totalPending <= 3) pendingBadgeColor = 'bg-yellow-500';
  if (totalPending > 3) pendingBadgeColor = 'bg-red-500';

  const handleCloseSale = async () => {
    const confirmed = window.confirm('Close this sale early? You can reopen it later from your dashboard.');
    if (!confirmed) return;
    try {
      setIsClosing(true);
      await api.patch(`/sales/${sale.id}/status`, { status: 'ENDED' });
      showToast('Sale closed successfully', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Failed to close sale:', error);
      showToast(error.response?.data?.message || 'Failed to close sale', 'error');
    } finally {
      setIsClosing(false);
    }
  };

  const handleCloneSale = async () => {
    try {
      setIsCloning(true);
      const response = await api.post(`/sales/${sale.id}/clone`);
      const newSaleId = response.data.id;
      window.location.href = `/organizer/edit-sale/${newSaleId}`;
    } catch (error: any) {
      console.error('Clone failed:', error);
      showToast(error.response?.data?.message || 'Failed to clone sale', 'error');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow relative">
        {totalPending > 0 && (
          <div className={`absolute top-3 right-3 ${pendingBadgeColor} text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center`}>
            {totalPending}
          </div>
        )}

        <div className="p-6">
          <div className="mb-4">
            <Link href={`/organizer/add-items/${sale.id}`}>
              <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-2 hover:text-amber-600 dark:hover:text-amber-400 hover:underline transition-colors cursor-pointer">{sale.title}</h3>
            </Link>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBg}`}>
              {displayStatus === 'LIVE' && '● LIVE'}
              {displayStatus === 'UPCOMING' && '◷ UPCOMING'}
              {displayStatus === 'DRAFT' && '◌ DRAFT'}
              {displayStatus === 'ENDED' && '◉ ENDED'}
            </span>
          </div>

          <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
            {formatDate(startDate)} – {formatDate(endDate)}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Listed</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-gray-100">{sale.itemsListed}</p>
            </div>
            <div>
              <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Sold</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{sale.itemsSold}</p>
            </div>
            <div>
              <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Revenue</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">${sale.revenue.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Conv. Rate</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{sale.conversionRate.toFixed(1)}%</p>
            </div>
          </div>

          {totalPending > 0 && (
            <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Pending Actions</p>
              <div className="space-y-1">
                {sale.pendingActions.itemsNeedingPhotos > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">📷 {sale.pendingActions.itemsNeedingPhotos} items need photos</p>
                )}
                {sale.pendingActions.pendingHolds > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">🤝 {sale.pendingActions.pendingHolds} pending holds</p>
                )}
                {sale.pendingActions.unpaidPurchases > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">💰 {sale.pendingActions.unpaidPurchases} unpaid purchases</p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap mb-6">
            {/* Items - all statuses */}
            <Link
              href={`/organizer/add-items/${sale.id}`}
              className="text-sm px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
              title={sale.status === 'DRAFT' ? 'Add items to this draft sale' : 'Add, edit, or remove items from this sale'}
            >
              Items
            </Link>

            {/* POS - all statuses */}
            <Link
              href={`/organizer/pos?saleId=${sale.id}`}
              className="text-sm px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full hover:bg-green-200 dark:hover:bg-green-800 transition-colors flex items-center gap-1"
              title="Open Point of Sale to process in-person transactions"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              POS
            </Link>

            {/* Holds - all statuses */}
            <Link
              href={`/organizer/holds?saleId=${sale.id}`}
              className="text-sm px-3 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors flex items-center gap-1"
              title="View and manage shopper holds for this sale"
            >
              <Clock className="w-3.5 h-3.5" />
              Holds
            </Link>

            {/* Print Kit - all statuses */}
            <Link
              href={`/organizer/print-kit/${sale.id}`}
              className="text-sm px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
              title="Generate and print labels for your items"
            >
              🖨️ Print Kit
            </Link>

            {/* PUBLISHED-only buttons */}
            {sale.status === 'PUBLISHED' && (
              <>
                <Link
                  href={`/organizer/sales/${sale.id}/flash-deals`}
                  className="text-sm px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors inline-block"
                  title="Create a flash deal to boost sales for specific items"
                >
                  ⚡ Flash Deal
                </Link>

                <button
                  onClick={() => setSocialPostSale({ id: sale.id, title: sale.title })}
                  className="text-sm px-3 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-full hover:bg-pink-200 dark:hover:bg-pink-800 transition-colors"
                  title="Generate social media posts for this sale"
                >
                  📱 Social Posts
                </button>

                <button
                  onClick={() => setBoostSaleId(sale.id)}
                  className="text-sm px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
                  title="Boost this sale to the top of search and map results"
                >
                  ⭐ Boost Sale
                </button>

                <button
                  onClick={handleCloseSale}
                  disabled={isClosing}
                  className="text-sm px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full hover:bg-red-200 dark:hover:bg-red-800 transition-colors disabled:opacity-50"
                  title="End your sale before the scheduled end date"
                >
                  {isClosing ? 'Closing...' : 'Close Sale'}
                </button>
              </>
            )}

            {/* DRAFT-only buttons */}
            {sale.status === 'DRAFT' && (
              <Link
                href={`/organizer/edit-sale/${sale.id}`}
                className="text-sm px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
                title="Review and publish this sale"
              >
                Publish Sale
              </Link>
            )}

            {/* ENDED-only buttons */}
            {sale.status === 'ENDED' && (
              <>
                <Link
                  href={`/sales/${sale.id}`}
                  className="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title="View this sale as shoppers see it"
                >
                  View
                </Link>

                <button
                  onClick={handleCloneSale}
                  disabled={isCloning}
                  className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  title="Create a copy of this sale to reuse"
                >
                  {isCloning ? 'Cloning...' : 'Clone'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals for PUBLISHED sales */}
      {socialPostSale && (
        <SocialPostGenerator
          saleId={socialPostSale.id}
          saleTitle={socialPostSale.title}
          onClose={() => setSocialPostSale(null)}
        />
      )}

      {boostSaleId && (
        <BoostPurchaseModal
          boostType="FEATURED"
          targetType="sale"
          targetId={boostSaleId}
          onClose={() => setBoostSaleId(null)}
        />
      )}
    </>
  );
};

export default CommandCenterCard;
