import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import RSVPAttendeesModal from './RSVPAttendeesModal';
import SaleTextUpdatesOptIn from './SaleTextUpdatesOptIn';
import { useAuth } from './AuthContext';

interface RSVPBadgeProps {
  saleId: string;
  saleTitle?: string;
}

const RSVPBadge: React.FC<RSVPBadgeProps> = ({ saleId, saleTitle = 'Sale' }) => {
  const { user } = useAuth();
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

  // Nothing to show: no one is going and there is no signed-in shopper to offer text updates to.
  if (count === 0 && !user) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {count > 0 && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1 rounded text-sm font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60 transition"
          >
            👤 {count} going
          </button>
        )}
        {/* Opt-in for organizer text updates (signed-in shoppers only; renders nothing otherwise) */}
        <SaleTextUpdatesOptIn saleId={saleId} saleTitle={saleTitle} />
      </div>
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
