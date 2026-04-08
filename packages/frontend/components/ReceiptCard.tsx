'use client';

import { useState } from 'react';
import ReturnRequestModal from './ReturnRequestModal';
import DisputeForm from './DisputeForm';
import { useAuth } from './AuthContext';

interface ReceiptItem {
  itemTitle: string;
  photoUrl?: string;
  price: number;
}

interface ReceiptCardProps {
  receipt: {
    id: number;
    items: ReceiptItem[];
    total: number;
    issuedAt: string;
    purchase: {
      id: string;
      amount: number;
      createdAt: string;
      sale?: {
        id: string;
        title: string;
      };
      item?: {
        id: string;
        title: string;
      };
    };
  };
  returnWindowHours?: number;
  saleEndDate?: string;
}

export default function ReceiptCard({ receipt, returnWindowHours = 48, saleEndDate }: ReceiptCardProps) {
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const { user } = useAuth();

  // Calculate if return window is still open
  const isReturnWindowOpen = () => {
    if (!saleEndDate) return false;
    const endTime = new Date(saleEndDate);
    const returnDeadline = new Date(endTime.getTime() + returnWindowHours * 60 * 60 * 1000);
    return new Date() <= returnDeadline;
  };

  const canRequestReturn = isReturnWindowOpen();

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {receipt.purchase.sale?.title || 'Sale Receipt'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {new Date(receipt.issuedAt).toLocaleDateString()}
            </p>
          </div>
          <span className="inline-block bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
            Receipt
          </span>
        </div>

        {/* Items */}
        <div className="space-y-3 mb-6">
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 pb-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
              {item.photoUrl && (
                <img
                  key={item.photoUrl}
                  src={item.photoUrl}
                  alt={item.itemTitle}
                  className="w-12 h-12 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.itemTitle}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                ${item.price.toFixed(2)}
              </p>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-4 pb-6">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              ${receipt.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {canRequestReturn && (
            <button
              onClick={() => setShowReturnModal(true)}
              className="w-full px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors font-medium text-sm"
            >
              Request Return
            </button>
          )}

          {!canRequestReturn && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              Return window has closed
            </p>
          )}

          {!showDisputeForm && (
            <button
              onClick={() => setShowDisputeForm(true)}
              className="w-full px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium text-sm"
            >
              ⚠ Report Issue
            </button>
          )}
        </div>
      </div>

      {/* Return Request Modal */}
      {showReturnModal && (
        <ReturnRequestModal
          purchaseId={receipt.purchase.id}
          itemTitle={receipt.purchase.item?.title || 'Item'}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            setShowReturnModal(false);
            // Optionally refresh or show success message
          }}
        />
      )}

      {/* Dispute Form */}
      {showDisputeForm && (
        <DisputeForm
          itemId={receipt.purchase.item?.id || ''}
          itemTitle={receipt.purchase.item?.title || 'Item'}
          orderId={receipt.purchase.id}
          saleId={receipt.purchase.sale?.id || ''}
          userEmail={user?.email || ''}
          onSuccess={() => {
            setShowDisputeForm(false);
            // Optionally refresh or show success message
          }}
          onCancel={() => setShowDisputeForm(false)}
        />
      )}
    </>
  );
}
