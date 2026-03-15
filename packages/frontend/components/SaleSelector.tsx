/**
 * SaleSelector Component
 * Dropdown to select a sale for performance dashboard
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface Sale {
  id: string;
  title: string;
  endDate?: string;
}

interface SaleSelectorProps {
  onSaleChange: (saleId: string) => void;
  selectedSaleId: string | null;
}

const SaleSelector: React.FC<SaleSelectorProps> = ({ onSaleChange, selectedSaleId }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data: sales = [] } = useQuery({
    queryKey: ['organizer-sales'],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return (response.data?.sales || []) as Sale[];
    },
  });

  const selectedSale = sales.find((s) => s.id === selectedSaleId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-white border border-warm-300 rounded-lg text-left text-warm-900 font-medium hover:border-warm-400 transition-colors"
      >
        <div className="flex justify-between items-center">
          <span>{selectedSale?.title || 'Select a Sale'}</span>
          <span className="text-warm-600">▼</span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-warm-300 rounded-lg shadow-lg z-50">
          {sales.length === 0 ? (
            <div className="px-4 py-3 text-center text-warm-600 text-sm">
              No sales yet
            </div>
          ) : (
            sales.map((sale) => (
              <button
                key={sale.id}
                onClick={() => {
                  onSaleChange(sale.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-3 hover:bg-warm-50 border-b border-warm-100 last:border-b-0 transition-colors ${
                  selectedSaleId === sale.id ? 'bg-amber-50' : ''
                }`}
              >
                <div className="font-medium text-warm-900">{sale.title}</div>
                {sale.endDate && (
                  <div className="text-xs text-warm-600">
                    Ends: {new Date(sale.endDate).toLocaleDateString()}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SaleSelector;
