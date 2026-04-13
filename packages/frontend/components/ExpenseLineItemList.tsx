/**
 * Expense Line Item List — Feature #228
 * Add/remove expense rows, category dropdown, running total
 */
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

const EXPENSE_CATEGORIES = [
  { value: 'HAULING', label: 'Hauling / Moving' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'STAFF', label: 'Staff / Labor' },
  { value: 'SUPPLIES', label: 'Supplies' },
  { value: 'VENUE', label: 'Venue Rental' },
  { value: 'OTHER', label: 'Other' },
];

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  vendorName?: string | null;
}

interface ExpenseLineItemListProps {
  saleId: string;
  expenses: Expense[];
}

export default function ExpenseLineItemList({ saleId, expenses }: ExpenseLineItemListProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [newExpense, setNewExpense] = useState({
    category: 'OTHER',
    description: '',
    amount: '',
    vendorName: '',
  });

  const addMutation = useMutation({
    mutationFn: (data: { category: string; description: string; amount: number; vendorName?: string }) =>
      api.post(`/sales/${saleId}/settlement/expenses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement', saleId] });
      setIsAdding(false);
      setNewExpense({ category: 'OTHER', description: '', amount: '', vendorName: '' });
      showToast('Expense added', 'success');
    },
    onError: () => showToast('Failed to add expense', 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (expenseId: string) =>
      api.delete(`/sales/${saleId}/settlement/expenses/${expenseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement', saleId] });
      showToast('Expense removed', 'success');
    },
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    addMutation.mutate({
      category: newExpense.category,
      description: newExpense.description,
      amount: parseFloat(newExpense.amount),
      vendorName: newExpense.vendorName || undefined,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Expenses</h4>
        <span className="text-sm font-medium text-red-600 dark:text-red-400">
          -${totalExpenses.toFixed(2)}
        </span>
      </div>

      {/* Existing expenses */}
      {expenses.length > 0 ? (
        <div className="space-y-2 mb-3">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-750 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white">{expense.description}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.label || expense.category}
                  {expense.vendorName && ` • ${expense.vendorName}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  ${expense.amount.toFixed(2)}
                </span>
                <button
                  onClick={() => removeMutation.mutate(expense.id)}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-xs p-1"
                  title="Remove expense"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No expenses recorded yet.</p>
      )}

      {/* Add expense form */}
      {isAdding ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            />
          </div>
          <input
            type="text"
            placeholder="Description (e.g., Dumpster rental)"
            value={newExpense.description}
            onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
          <input
            type="text"
            placeholder="Vendor name (optional)"
            value={newExpense.vendorName}
            onChange={(e) => setNewExpense({ ...newExpense, vendorName: e.target.value })}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add Expense'}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="py-1.5 px-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm rounded-lg hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
        >
          + Add Expense
        </button>
      )}
    </div>
  );
}
