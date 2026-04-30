import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface Attendee {
  id: string;
  name: string;
}

interface RSVPAttendeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  saleTitle: string;
}

const RSVPAttendeesModal: React.FC<RSVPAttendeesModalProps> = ({
  isOpen,
  onClose,
  saleId,
  saleTitle,
}) => {
  const { showToast } = useToast();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchAttendees = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/sales/${saleId}/rsvp/attendees`);
        setAttendees(response.data.attendees);
        setCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch attendees:', error);
        showToast('Failed to load attendees', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttendees();
  }, [isOpen, saleId, showToast]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-warm-900">👤 Going to {saleTitle}</h2>
          <button
            onClick={onClose}
            className="text-warm-500 hover:text-warm-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-warm-600 mb-4 font-medium">{count} person{count !== 1 ? 's' : ''} going</p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        ) : attendees.length === 0 ? (
          <p className="text-warm-600 text-center py-8">No one has RSVP'd yet.</p>
        ) : (
          <ul className="space-y-2">
            {attendees.map((attendee) => (
              <li
                key={attendee.id}
                className="p-3 bg-warm-50 rounded-lg border border-warm-200"
              >
                <p className="text-warm-900 font-medium">{attendee.name}</p>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default RSVPAttendeesModal;
