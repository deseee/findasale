'use client';

import { useState } from 'react';
import ReturnRequestModal from './ReturnRequestModal';

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
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {receipt.purchase.sale?.title || 'Sale Receipt'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(receipt.issuedAt).toLocaleDateString()}
            </p>
          </div>
          <span className="inline-block bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
            Receipt
          </span>
        </div>

        {/* Items */}
        <div className="space-y-3 mb-6">
          {receipt.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 pb-3 border-b border-gray-100 last:border-0">
              {item.photoUrl && (
                <img
                  src={item.photoUrl}
                  alt={item.itemTitle}
                  className="w-12 h-12 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.itemTitle}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                ${item.price.toFixed(2)}
              </p>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-t-2 border-gray-200 pt-4 pb-6">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">
              ${receipt.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Return Button */}
        {canRequestReturn && (
          <button
            onClick={() => setShowReturnModal(true)}
            className="w-full px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm"
            style={{ color: '#8FB897', borderColor: '#8FB897', backgroundColor: '#f0f5f2' }}
          >
            Request Return
          </button>
        )}

        {!canRequestReturn && (
          <p className="text-sm text-gray-500 text-center py-2">
            Return window has closed
          </p>
        )}
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
    </>
  );
}
