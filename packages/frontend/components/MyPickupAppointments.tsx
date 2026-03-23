import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

interface PickupBooking {
  id: string;
  createdAt: string;
  slot: {
    id: string;
    startsAt: string;
    endsAt: string;
    sale: {
      id: string;
      title: string;
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
}

const MyPickupAppointments: React.FC = () => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's pickup bookings
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['my-pickup-bookings'],
    queryFn: async () => {
      const response = await api.get('/pickup/my-bookings');
      return response.data as PickupBooking[];
    },
  });

  // Cancel booking mutation
  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return await api.delete(`/pickup/booking/${bookingId}`);
    },
    onSuccess: () => {
      showToast('Appointment cancelled', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-pickup-bookings'] });
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to cancel appointment',
        'error'
      );
    },
  });

  if (isLoading) {
    return <div className="text-center py-4">Loading appointments...</div>;
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
        <p className="text-5xl mb-4">📅</p>
        <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">
          No pickup appointments yet
        </h3>
        <p className="text-warm-600 dark:text-warm-400 mb-6">
          Book a pickup appointment at a sale to pick up your items.
        </p>
        <Link
          href="/"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Browse Sales
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Pickup Appointments</h2>

      {bookings.map((booking) => {
        const startTime = parseISO(booking.slot.startsAt);
        const sale = booking.slot.sale;

        return (
          <div
            key={booking.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4 border-amber-600"
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  {sale.title}
                </h3>
                <p className="text-warm-700 dark:text-warm-300 mb-3">
                  📍 {sale.address}, {sale.city}, {sale.state} {sale.zip}
                </p>
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-warm-900 dark:text-warm-100">
                    🕐 {format(startTime, 'EEE, MMM d, yyyy')}
                  </p>
                  <p className="text-warm-700 dark:text-warm-300">
                    {format(startTime, 'h:mm a')} —{' '}
                    {format(parseISO(booking.slot.endsAt), 'h:mm a')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/sales/${sale.id}`}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm"
                >
                  View Sale
                </Link>
                <button
                  onClick={() => cancelMutation.mutate(booking.id)}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm disabled:opacity-50"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MyPickupAppointments;
