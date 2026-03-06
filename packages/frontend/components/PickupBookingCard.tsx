import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { format, parseISO, differenceInDays } from 'date-fns';

interface Props {
  saleId: string;
}

interface PickupSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookingCount: number;
  available: boolean;
  remaining: number;
  userHasBooked: boolean;
}

const PickupBookingCard: React.FC<Props> = ({ saleId }) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  // Fetch available pickup slots
  const { data: slots, isLoading } = useQuery({
    queryKey: ['pickup-slots', saleId],
    queryFn: async () => {
      const response = await api.get(`/pickup/slots/${saleId}`);
      return response.data as PickupSlot[];
    },
  });

  // Book slot mutation
  const bookMutation = useMutation({
    mutationFn: async (slotId: string) => {
      return await api.post(`/pickup/book/${slotId}`, {});
    },
    onSuccess: (response) => {
      showToast('Pickup appointment booked!', 'success');
      setBookingSuccess(response.data.slotId);
      queryClient.invalidateQueries({ queryKey: ['pickup-slots', saleId] });
      // Clear success message after 5 seconds
      setTimeout(() => setBookingSuccess(null), 5000);
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to book slot',
        'error'
      );
    },
  });

  if (isLoading) {
    return <div className="text-center py-4">Loading pickup slots...</div>;
  }

  if (!slots || slots.length === 0) {
    return null;
  }

  // Filter for future slots
  const futureSlots = slots.filter(
    (s) => differenceInDays(parseISO(s.startsAt), new Date()) >= 0
  );

  if (futureSlots.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-2xl font-bold text-warm-900 mb-6">Schedule Pickup</h2>

      {bookingSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 font-medium">
            Appointment confirmed! Check your email for details.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {futureSlots.map((slot) => (
          <div
            key={slot.id}
            className={`border rounded-lg p-4 ${
              slot.userHasBooked
                ? 'bg-amber-50 border-amber-200'
                : slot.available
                ? 'bg-white border-warm-200 hover:shadow-md transition'
                : 'bg-gray-50 border-gray-200 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-warm-900">
                  {format(parseISO(slot.startsAt), 'EEE, MMM d, yyyy')}
                </p>
                <p className="text-lg font-medium text-amber-600 mt-1">
                  {format(parseISO(slot.startsAt), 'h:mm a')} —{' '}
                  {format(parseISO(slot.endsAt), 'h:mm a')}
                </p>
                <div className="flex gap-4 mt-3 text-sm text-warm-600">
                  <span>Spots available: {slot.remaining}</span>
                  {slot.remaining <= 2 && slot.remaining > 0 && (
                    <span className="font-medium text-red-600">Filling up fast!</span>
                  )}
                </div>
              </div>

              {slot.userHasBooked ? (
                <div className="ml-4 px-4 py-2 bg-amber-600 text-white rounded font-medium text-sm">
                  Booked
                </div>
              ) : slot.available ? (
                <button
                  onClick={() => bookMutation.mutate(slot.id)}
                  disabled={bookMutation.isPending}
                  className="ml-4 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {bookMutation.isPending ? 'Booking...' : 'Book This'}
                </button>
              ) : (
                <div className="ml-4 px-4 py-2 bg-gray-400 text-white rounded font-medium text-sm">
                  Full
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PickupBookingCard;
