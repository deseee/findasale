'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';
import { format } from 'date-fns';

interface ChecklistItem {
  id: string;
  phase: 'pre' | 'during' | 'post';
  label: string;
  completed: boolean;
  completedAt?: string;
}

interface SaleChecklistData {
  id: string;
  saleId: string;
  items: ChecklistItem[];
  updatedAt: string;
}

interface SaleChecklistProps {
  saleId: string;
}

const PHASE_LABELS: Record<string, string> = {
  pre: 'Pre-Sale',
  during: 'Day-Of',
  post: 'Post-Sale',
};

const SaleChecklist: React.FC<SaleChecklistProps> = ({ saleId }) => {
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({
    pre: '',
    during: '',
    post: '',
  });
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  // Fetch checklist
  const {
    data: checklist,
    isLoading,
    error,
  } = useQuery<SaleChecklistData>({
    queryKey: ['checklist', saleId],
    queryFn: async () => {
      const response = await api.get(`/checklist/${saleId}`);
      return response.data;
    },
  });

  // Mutation to update item completion
  const { mutate: updateItem } = useMutation({
    mutationFn: async (payload: { itemId: string; completed: boolean; label?: string }) => {
      const response = await api.patch(`/checklist/${saleId}`, payload);
      return response.data;
    },
    onSuccess: (data: SaleChecklistData) => {
      // Update local cache
    },
  });

  // Mutation to add item
  const { mutate: addItem } = useMutation({
    mutationFn: async (payload: { label: string; phase: 'pre' | 'during' | 'post' }) => {
      const response = await api.post(`/checklist/${saleId}/items`, payload);
      return response.data;
    },
  });

  // Mutation to delete item
  const { mutate: deleteItem } = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.delete(`/checklist/${saleId}/items/${itemId}`);
      return response.data;
    },
  });

  const handleToggleItem = useCallback(
    (itemId: string, currentCompleted: boolean) => {
      updateItem({ itemId, completed: !currentCompleted });
    },
    [updateItem]
  );

  const handleAddItem = useCallback(
    (phase: 'pre' | 'during' | 'post') => {
      const label = newItemLabel[phase]?.trim();
      if (label) {
        addItem({ label, phase });
        setNewItemLabel(prev => ({ ...prev, [phase]: '' }));
      }
    },
    [newItemLabel, addItem]
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (confirm('Are you sure you want to delete this task?')) {
        deleteItem(itemId);
      }
    },
    [deleteItem]
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map(i => (
          <div key={i}>
            <Skeleton className="h-8 w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(j => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !checklist) {
    return <div className="text-red-600">Failed to load checklist</div>;
  }

  const items = (checklist.items || []) as ChecklistItem[];
  const phases: Array<'pre' | 'during' | 'post'> = ['pre', 'during', 'post'];

  // Calculate overall progress
  const totalItems = items.length;
  const completedItems = items.filter(item => item.completed).length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Overall Progress Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Overall Progress</h3>
          <span className="text-sm font-medium text-gray-600">
            {completedItems} of {totalItems} tasks complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-amber-500 h-3 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Sections by Phase */}
      {phases.map(phase => {
        const phaseItems = items.filter(item => item.phase === phase);
        const phaseCompleted = phaseItems.filter(item => item.completed).length;
        const phaseLabel = PHASE_LABELS[phase];

        return (
          <div key={phase} className="card p-6">
            {/* Phase Header */}
            <button
              onClick={() => setExpandedPhase(expandedPhase === phase ? null : phase)}
              className="w-full flex items-center justify-between mb-4 hover:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{phaseLabel}</h3>
                <span className="text-sm font-medium text-gray-600">
                  ({phaseCompleted}/{phaseItems.length})
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  expandedPhase === phase ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>

            {expandedPhase === phase && (
              <>
                {/* Items List */}
                <div className="space-y-3 mb-4">
                  {phaseItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleItem(item.id, item.completed)}
                        className="mt-1 w-5 h-5 text-amber-500 border-gray-300 rounded focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          className={`text-sm font-medium block ${
                            item.completed
                              ? 'text-gray-500 line-through'
                              : 'text-gray-900'
                          }`}
                        >
                          {item.label}
                        </label>
                        {item.completed && item.completedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Completed {format(new Date(item.completedAt), 'MMM d, h:mm a')}
                          </p>
                        )}
                      </div>
                      {item.id.startsWith('custom_') && (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete custom task"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Item Form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemLabel[phase] || ''}
                    onChange={e =>
                      setNewItemLabel(prev => ({
                        ...prev,
                        [phase]: e.target.value,
                      }))
                    }
                    onKeyPress={e => {
                      if (e.key === 'Enter') {
                        handleAddItem(phase);
                      }
                    }}
                    placeholder="Add custom task..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => handleAddItem(phase)}
                    className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SaleChecklist;
