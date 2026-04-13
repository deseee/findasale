import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import RSVPAttendeesModal from './RSVPAttendeesModal';

interface RSVPBadgeProps {
  saleId: string;
  saleTitle?: string;
}

const RSVPBadge: React.FC<RSVPBadgeProps> = ({ saleId, saleTitle = 'Sale' }) => {
  const [count, setCount] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/rsvp/count`);
        setCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch RSVP count:', error);
        setCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    if (saleId) {
      fetchCount();
    }
  }, [saleId]);

  if (isLoading) {
    return null;
  }

  if (count === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-3 py-1 rounded text-sm font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition"
      >
        👤 {count} going
      </button>
      <RSVPAttendeesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        saleId={saleId}
        saleTitle={saleTitle}
      />
    </>
  );
};

export default RSVPBadge;
