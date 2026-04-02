/**
 * Settlement Wizard — Feature #228
 * 5-step wizard (estate/consignment/auction) or simple 3-field card (yard sale)
 * Steps: SummaryReview → ExpenseEntry → CommissionCalc → ClientPayout → ReceiptClose
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import ExpenseLineItemList from './ExpenseLineItemList';
import CommissionCalculator from './CommissionCalculator';
import ClientPayoutPanel from './ClientPayoutPanel';
import DonationModal from './DonationModal';
import { getSaleTypeConfig } from '../lib/dashboard-sale-type-config';

interface SettlementWizardProps {
  saleId: string;
  saleType: string;
}

const WIZARD_STEPS = [
  { key: 'summary', label: 'Summary' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'commission', label: 'Commission' },
  { key: 'payout', label: 'Payout' },
  { key: 'receipt', label: 'Receipt' },
];

export default function SettlementWizard({ saleId, saleType }: SettlementWizardProps) {
  const [step, setStep] = useState(0);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const config = getSaleTypeConfig(saleType);
  const isSimple = config.settlementType === 'SIMPLE_CARD';

  // Fetch organizer data for default commission rate
  const { data: organizer } = useQuery({
    queryKey: ['organizer-me'],
    queryFn: async () => {
      const res = await api.get('/organizers/me');
      return res.data as { commissionRate?: number | null };
    },
  });

  // Fetch or create settlement
  const { data: settlement, isLoading, isError, error } = useQuery({
    queryKey: ['settlement', saleId],
    queryFn: async () => {
      try {
        const res = await api.get(`/sales/${saleId}/settlement`);
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Auto-create settlement on first visit
          const createRes = await api.post(`/sales/${saleId}/settlement`);
          return createRes.data;
        }
        throw err;
      }
    },
    enabled: !!saleId,
  });

  // Fetch unsold items for donation modal
  const { data: availableItems = [] } = useQuery({
    queryKey: ['sale-available-items', saleId],
    queryFn: () =>
      api.get(`/sales/${saleId}/items?status=AVAILABLE`).then((r) =>
        (r.data.items || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          price: item.price,
          condition: item.condition,
        }))
      ),
    enabled: !!saleId,
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      api.patch(`/sales/${saleId}/settlement`, { lifecycleStage: 'CLOSED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement', saleId] });
      showToast('Settlement closed', 'success');
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
        <p className="text-sm text-red-700 dark:text-red-300">
          Failed to load settlement data. Please try again.
        </p>
      </div>
    );
  }

  // Simple card for yard sale / flea market
  if (isSimple) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Quick Settlement
        </h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-gray-600 dark:text-gray-400">Total Revenue</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              ${(settlement?.totalRevenue ?? 0).toFixed(2)}
            </span>
          </div>

          <ExpenseLineItemList
            saleId={saleId}
            expenses={settlement?.expenses || []}
          />

          <div className="flex justify-between items-center py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{config.clientLabel}</span>
            <span className="text-xl font-bold text-green-600 dark:text-green-400">
              ${(settlement?.netProceeds ?? 0).toFixed(2)}
            </span>
          </div>

          <button
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {closeMutation.isPending ? 'Closing...' : 'Close Settlement'}
          </button>
        </div>
      </div>
    );
  }

  // Full 5-step wizard for estate / consignment / auction
  const currentStep = WIZARD_STEPS[step];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Step indicator */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${
              i === step
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                : i < step
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10'
                  : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {i < step ? '✓ ' : ''}{s.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* Step 1: Summary Review */}
        {currentStep.key === 'summary' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Review Sale Summary</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Revenue</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${(settlement?.totalRevenue ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Sale Type</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {(settlement?.saleType || saleType || 'estate').toLowerCase().replace('_', ' ')}
                </p>
              </div>
            </div>
            {settlement?.notes && (
              <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{settlement.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Expenses */}
        {currentStep.key === 'expenses' && (
          <ExpenseLineItemList saleId={saleId} expenses={settlement?.expenses || []} />
        )}

        {/* Step 3: Commission */}
        {currentStep.key === 'commission' && (
          <CommissionCalculator
            saleId={saleId}
            totalRevenue={settlement?.totalRevenue ?? 0}
            totalExpenses={settlement?.totalExpenses ?? 0}
            currentRate={settlement?.commissionRate ?? organizer?.commissionRate ?? null}
            clientLabel={config.clientLabel}
          />
        )}

        {/* Step 4: Client Payout */}
        {currentStep.key === 'payout' && (
          <ClientPayoutPanel
            saleId={saleId}
            clientLabel={config.clientLabel}
            suggestedAmount={Math.max(0, settlement?.netProceeds ?? 0)}
            existingPayout={settlement?.clientPayout ?? null}
          />
        )}

        {/* Step 5: Receipt & Close */}
        {currentStep.key === 'receipt' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Settlement Receipt</h3>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Revenue</span>
                <span className="text-gray-900 dark:text-white">${(settlement?.totalRevenue ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Commission</span>
                <span className="text-blue-600 dark:text-blue-400">${(settlement?.platformFeeAmount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Expenses</span>
                <span className="text-red-600 dark:text-red-400">-${(settlement?.totalExpenses ?? 0).toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between text-sm">
                <span className="font-semibold text-gray-700 dark:text-gray-200">{config.clientLabel} Receives</span>
                <span className="font-bold text-green-600 dark:text-green-400">${(settlement?.netProceeds ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Donation section */}
            {availableItems.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Unsold Items</h4>
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                  You have {availableItems.length} unsold item{availableItems.length !== 1 ? 's' : ''} available for donation.
                  Donating to charity can provide a tax deduction.
                </p>
                <button
                  onClick={() => setShowDonationModal(true)}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Donate Items & Get Tax Receipt
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || '/api'}/sales/${saleId}/settlement/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors text-sm"
              >
                Download Receipt
              </a>
              <button
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {closeMutation.isPending ? 'Closing...' : 'Close Settlement'}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          {step === 0 ? (
            <Link
              href="/organizer/dashboard"
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Back to Dashboard
            </Link>
          ) : (
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Back
            </button>
          )}
          {step < WIZARD_STEPS.length - 1 && (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Donation Modal */}
      {showDonationModal && (
        <DonationModal
          saleId={saleId}
          availableItems={availableItems}
          onClose={() => setShowDonationModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sale-available-items', saleId] });
          }}
        />
      )}
    </div>
  );
}
