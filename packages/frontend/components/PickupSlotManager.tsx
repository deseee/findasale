import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { format, parseISO, addDays, startOfDay } from 'date-fns';

interface PickupSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookingCount: number;
  available: boolean;
}

interface Sale {
  id: string;
  startDate: string;
  endDate: string;
}

interface Props {
  saleId: string;
}

// Helper: Generate all slot intervals for a given date with start time, end time, and duration
const generateSlotsForDay = (
  dateStr: string,
  startTime: string,
  endTime: string,
  durationMinutes: number,
  capacity: number
): Array<{ startsAt: string; endsAt: string; capacity: number }> => {
  const slots = [];

  // Parse times (format: HH:mm)
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  // Create date objects
  const date = new Date(dateStr);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMin, 0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMin, 0);

  let currentStart = new Date(dayStart);
  while (currentStart < dayEnd) {
    const currentEnd = new Date(currentStart.getTime() + durationMinutes * 60000);
    if (currentEnd <= dayEnd) {
      slots.push({
        startsAt: currentStart.toISOString(),
        endsAt: currentEnd.toISOString(),
        capacity,
      });
    }
    currentStart = currentEnd;
  }

  return slots;
};

// Helper: Generate dates between startDate and endDate
const generateDateRange = (startDate: string, endDate: string): string[] => {
  const dates = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current = addDays(current, 1);
  }

  return dates;
};

const PickupSlotManager: React.FC<Props> = ({ saleId }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // States for the generator
  const [view, setView] = useState<'generator' | 'preview'>('generator');
  const [showManualForm, setShowManualForm] = useState(false);

  // Sale data for date pre-population
  const { data: sale } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      try {
        const response = await api.get(`/sales/${saleId}`);
        return response.data as Sale;
      } catch {
        return null;
      }
    },
  });

  // Generator form data
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [capacity, setCapacity] = useState('5');

  // Pre-populate selected dates from sale
  useEffect(() => {
    if (sale?.startDate && sale?.endDate && selectedDates.length === 0) {
      const dates = generateDateRange(sale.startDate, sale.endDate);
      setSelectedDates(dates);
    }
  }, [sale, selectedDates]);

  // Generate preview slots
  const previewSlots = selectedDates.flatMap((date) =>
    generateSlotsForDay(date, startTime, endTime, slotDuration, parseInt(capacity, 10))
  );

  // Fetch pickup slots
  const { data: slots, isLoading } = useQuery({
    queryKey: ['pickup-slots', saleId],
    queryFn: async () => {
      const response = await api.get(`/pickup/slots/${saleId}`);
      return response.data as PickupSlot[];
    },
  });

  // Batch create mutation
  const batchCreateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/pickup/slots/batch', {
        saleId,
        slots: previewSlots,
      });
      return response.data;
    },
    onSuccess: (data) => {
      showToast(`${data.created} pickup slots created successfully!`, 'success');
      setView('generator');
      setSelectedDates([]);
      setStartTime('09:00');
      setEndTime('15:00');
      setSlotDuration(30);
      setCapacity('5');
      queryClient.invalidateQueries({ queryKey: ['pickup-slots', saleId] });
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to create slots',
        'error'
      );
    },
  });

  // Single slot creation for manual form
  const [manualFormData, setManualFormData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    capacity: '5',
  });

  const createSingleSlotMutation = useMutation({
    mutationFn: async () => {
      const startDateTime = new Date(
        `${manualFormData.startDate}T${manualFormData.startTime}`
      );
      const endDateTime = new Date(`${manualFormData.endDate}T${manualFormData.endTime}`);

      if (startDateTime >= endDateTime) {
        throw new Error('Start time must be before end time');
      }

      const response = await api.post('/pickup/slots', {
        saleId,
        startsAt: startDateTime.toISOString(),
        endsAt: endDateTime.toISOString(),
        capacity: parseInt(manualFormData.capacity, 10),
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Pickup slot created successfully!', 'success');
      setShowManualForm(false);
      setManualFormData({
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        capacity: '5',
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

  const handlePreview = () => {
    if (selectedDates.length === 0) {
      showToast('Please select at least one day', 'error');
      return;
    }
    setView('preview');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFormData.startDate || !manualFormData.startTime || !manualFormData.endDate || !manualFormData.endTime) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    createSingleSlotMutation.mutate();
  };

  if (isLoading) {
    return <div className="text-center py-4 text-warm-600 dark:text-gray-400">Loading pickup slots...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-6">Pickup Scheduling</h2>

      {/* Existing Slots Display */}
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
                    {format(parseISO(slot.startsAt), 'h:mm a')} — {format(parseISO(slot.endsAt), 'h:mm a')}
                  </p>
                  <p className="text-sm text-warm-600 dark:text-gray-400 mt-1">
                    Capacity: {slot.capacity} | Booked: {slot.bookingCount}
                  </p>
                  {!slot.available && (
                    <span className="inline-block mt-2 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 text-xs font-medium rounded">
                      FULL
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(slot.id)}
                  disabled={slot.bookingCount > 0 || deleteMutation.isPending}
                  className="ml-4 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={slot.bookingCount > 0 ? 'Cannot delete slot with bookings' : ''}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Slots Message */}
      {slots && slots.length === 0 && view !== 'preview' && !showManualForm && (
        <p className="text-warm-600 dark:text-gray-400 mb-6">
          No pickup slots yet. Create some using the generator below.
        </p>
      )}

      {/* GENERATOR VIEW (Step 1) */}
      {view === 'generator' && !showManualForm && (
        <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-warm-800 dark:text-gray-200 mb-4">Generate Pickup Slots</h3>

          {/* Which days? */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-3">Which days?</label>
            {sale?.startDate && sale?.endDate ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {generateDateRange(sale.startDate, sale.endDate).map((date) => (
                  <label key={date} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDates.includes(date)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDates([...selectedDates, date].sort());
                        } else {
                          setSelectedDates(selectedDates.filter((d) => d !== date));
                        }
                      }}
                      className="w-4 h-4 text-amber-600 dark:bg-gray-600 dark:border-gray-500 rounded"
                    />
                    <span className="ml-2 text-sm text-warm-700 dark:text-gray-300">
                      {format(new Date(date), 'EEE, MMM d')}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                type="date"
                value={selectedDates[0] || ''}
                onChange={(e) => (e.target.value ? setSelectedDates([e.target.value]) : setSelectedDates([]))}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            )}
          </div>

          {/* Start and End Times */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Slot Length */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Slot length</label>
            <select
              value={slotDuration}
              onChange={(e) => setSlotDuration(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Capacity */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Shoppers per slot</label>
            <input
              type="number"
              min="1"
              max="50"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
            />
            <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">Min 1, max 50</p>
          </div>

          {/* Preview Button */}
          <button
            type="button"
            onClick={handlePreview}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white rounded font-medium"
          >
            Preview Schedule →
          </button>

          {/* Escape hatch */}
          <button
            type="button"
            onClick={() => setShowManualForm(true)}
            className="w-full mt-3 px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
          >
            + Add a single slot manually
          </button>
        </div>
      )}

      {/* PREVIEW VIEW (Step 2) */}
      {view === 'preview' && (
        <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-warm-800 dark:text-gray-200 mb-4">Preview Schedule</h3>

          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-600 rounded-lg p-4 mb-6">
            <p className="text-sm text-warm-700 dark:text-gray-300">
              <strong>This will create {previewSlots.length} slots</strong> — every {slotDuration} minutes from{' '}
              {startTime} to {endTime} on{' '}
              {selectedDates.length === 1
                ? format(new Date(selectedDates[0]), 'EEE, MMM d, yyyy')
                : `${selectedDates.length} days`}
            </p>
          </div>

          {/* Scrollable Slot List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-600 max-h-64 overflow-y-auto mb-6">
            <div className="divide-y divide-warm-200 dark:divide-gray-600">
              {previewSlots.map((slot, idx) => (
                <div key={idx} className="p-3 text-sm">
                  <p className="font-medium text-warm-900 dark:text-gray-100">
                    {format(parseISO(slot.startsAt), 'EEE, MMM d, yyyy')}
                  </p>
                  <p className="text-warm-600 dark:text-gray-400">
                    {format(parseISO(slot.startsAt), 'h:mm a')} — {format(parseISO(slot.endsAt), 'h:mm a')}
                  </p>
                  <p className="text-xs text-warm-600 dark:text-gray-500">Capacity: {slot.capacity}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => batchCreateMutation.mutate()}
              disabled={batchCreateMutation.isPending}
              className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white rounded font-medium disabled:opacity-50"
            >
              {batchCreateMutation.isPending ? 'Creating...' : 'Confirm & Create All'}
            </button>
            <button
              type="button"
              onClick={() => setView('generator')}
              className="flex-1 px-4 py-3 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded font-medium"
            >
              ← Edit
            </button>
          </div>
        </div>
      )}

      {/* MANUAL FORM (fallback) */}
      {showManualForm && (
        <form onSubmit={handleManualSubmit} className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-warm-800 dark:text-gray-200 mb-4">Add a Single Slot</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={manualFormData.startDate}
                onChange={(e) => setManualFormData({ ...manualFormData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Start Time</label>
              <input
                type="time"
                value={manualFormData.startTime}
                onChange={(e) => setManualFormData({ ...manualFormData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={manualFormData.endDate}
                onChange={(e) => setManualFormData({ ...manualFormData, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">End Time</label>
              <input
                type="time"
                value={manualFormData.endTime}
                onChange={(e) => setManualFormData({ ...manualFormData, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Capacity</label>
            <input
              type="number"
              min="1"
              max="50"
              value={manualFormData.capacity}
              onChange={(e) => setManualFormData({ ...manualFormData, capacity: e.target.value })}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-gray-100"
            />
            <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">Min 1, max 50</p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createSingleSlotMutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white rounded font-medium disabled:opacity-50"
            >
              {createSingleSlotMutation.isPending ? 'Creating...' : 'Create Slot'}
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded font-medium"
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
