import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { format, parseISO } from 'date-fns';

interface PickupSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookingCount: number;
  available: boolean;
}

interface Props {
  saleId: string;
}

const PickupSlotManager: React.FC<Props> = ({ saleId }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    capacity: '1',
  });

  // Fetch pickup slots
  const { data: slots, isLoading } = useQuery({
    queryKey: ['pickup-slots', saleId],
    queryFn: async () => {
      const response = await api.get(`/pickup/slots/${saleId}`);
      return response.data as PickupSlot[];
    },
  });

  // Create slot mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const startDateTime = new Date(
        `${formData.startDate}T${formData.startTime}`
      );
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

      if (startDateTime >= endDateTime) {
        throw new Error('Start time must be before end time');
      }

      const response = await api.post('/pickup/slots', {
        saleId,
        startsAt: startDateTime.toISOString(),
        endsAt: endDateTime.toISOString(),
        capacity: parseInt(formData.capacity, 10),
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Pickup slot created successfully!', 'success');
      setShowForm(false);
      setFormData({
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        capacity: '1',
      });
      queryClient.invalidateQueries({ queryKey: ['pickup-slots', saleId] });
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to create slot',
        'error'
      );
    },
  });

  // Delete slot mutation
  const deleteMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const response = await api.delete(`/pickup/slot/${slotId}`);
      return response.data;
    },
    onSuccess: () => {
      showToast('Slot deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['pickup-slots', saleId] });
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to delete slot',
        'error'
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.startTime || !formData.endDate || !formData.endTime) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    createMutation.mutate();
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading pickup slots...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-6">Pickup Scheduling</h2>

      {/* Existing Slots */}
      {slots && slots.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-warm-800 dark:text-gray-200 mb-4">Available Slots</h3>
          <div className="space-y-3">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-start justify-between bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-4"
              >
                <div className="flex-1">
                  <p className="font-medium text-warm-900 dark:text-gray-100">
                    {format(parseISO(slot.startsAt), 'EEE, MMM d, yyyy')}
                  </p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    {format(parseISO(slot.startsAt), 'h:mm a')} —{' '}
                    {format(parseISO(slot.endsAt), 'h:mm a')}
                  </p>
                  <p className="text-sm text-warm-600 dark:text-gray-400 mt-1">
                    Capacity: {slot.capacity} | Booked: {slot.bookingCount}
                  </p>
                  {!slot.available && (
                    <span className="inline-block mt-2 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                      FULL
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(slot.id)}
                  disabled={slot.bookingCount > 0 || deleteMutation.isPending}
                  className="ml-4 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    slot.bookingCount > 0
                      ? 'Cannot delete slot with bookings'
                      : ''
                  }
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Slots Message */}
      {slots && slots.length === 0 && !showForm && (
        <p className="text-warm-600 dark:text-gray-400 mb-6">
          No pickup slots yet. Click "Add Slot" to create one.
        </p>
      )}

      {/* Add Slot Form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
        >
          + Add Pickup Slot
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData({ ...formData, startTime: e.target.value })
                }
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                End Time
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData({ ...formData, endTime: e.target.value })
                }
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
              Capacity
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.capacity}
              onChange={(e) =>
                setFormData({ ...formData, capacity: e.target.value })
              }
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
            />
            <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">Max 10 shoppers per slot</p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Slot'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default PickupSlotManager;
