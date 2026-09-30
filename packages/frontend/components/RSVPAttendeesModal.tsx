import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import AccessibleModal from './AccessibleModal';

interface Attendee {
  id: string; // RSVP id (never a user id)
  name: string;
}

interface RSVPAttendeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string;
  saleTitle: string;
}

/**
 * Who is going to a sale.
 *
 * Privacy (2026-09-29): the API returns full names only to the sale's organizer, their staff and
 * admins (audience === 'organizer'). Everyone else sees the count, plus "First name + last initial"
 * for shoppers who opted in to being named. The rest are counted but never named.
 * A signed-in shopper who is going gets a switch to opt in or out of being named.
 */
const RSVPAttendeesModal: React.FC<RSVPAttendeesModalProps> = ({
  isOpen,
  onClose,
  saleId,
  saleTitle,
}) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [count, setCount] = useState(0);
  const [anonymousCount, setAnonymousCount] = useState(0);
  const [audience, setAudience] = useState<'organizer' | 'public'>('public');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isGoing, setIsGoing] = useState(false);
  const [showName, setShowName] = useState(false);
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);

  const fetchAttendees = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await api.get(`/sales/${saleId}/rsvp/attendees`);
      setAttendees(response.data.attendees ?? []);
      setCount(response.data.count ?? 0);
      setAnonymousCount(response.data.anonymousCount ?? 0);
      setAudience(response.data.audience === 'organizer' ? 'organizer' : 'public');
    } catch (error) {
      console.error('Failed to fetch attendees:', error);
      setLoadError(true);
      showToast('Failed to load attendees', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [saleId, showToast]);

  useEffect(() => {
    if (!isOpen) return;
    fetchAttendees();
  }, [isOpen, fetchAttendees]);

  // The viewer's own RSVP + name preference (signed-in only), for the opt-in switch.
  useEffect(() => {
    if (!isOpen || !user) {
      setIsGoing(false);
      return;
    }
    let cancelled = false;
    api
      .get(`/sales/${saleId}/rsvp/mine`)
      .then((res) => {
        if (cancelled) return;
        setIsGoing(!!res.data.isGoing);
        setShowName(!!res.data.showName);
      })
      .catch(() => {
        if (!cancelled) setIsGoing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, saleId]);

  const handleToggleShowName = async () => {
    const next = !showName;
    setIsSavingVisibility(true);
    try {
      await api.put(`/sales/${saleId}/rsvp/name-visibility`, { show: next });
      setShowName(next);
      showToast(next ? 'Your first name and last initial will show in the going list' : 'You are now counted without your name', 'success');
      fetchAttendees();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Could not save your preference', 'error');
    } finally {
      setIsSavingVisibility(false);
    }
  };

  if (!isOpen) return null;

  const isOrganizerView = audience === 'organizer';
  const namedCount = attendees.length;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="rsvp-attendees-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="rsvp-attendees-modal-title" className="text-2xl font-bold text-warm-900 dark:text-warm-100">👤 Going to {saleTitle}</h2>
          <button
            onClick={onClose}
            className="text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-warm-600 dark:text-warm-300 mb-1 font-medium">{count} person{count !== 1 ? 's' : ''} going</p>
        {isOrganizerView && count > 0 && (
          <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">Names are visible to you and your team only.</p>
        )}
        {!isOrganizerView && count > 0 && (
          <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">Shoppers are only named if they choose to be.</p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8" role="status" aria-label="Loading attendees">
            <div className="animate-spin w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full"></div>
          </div>
        ) : loadError ? (
          <div className="text-center py-8">
            <p className="text-red-600 dark:text-red-400 text-sm mb-3">We could not load the going list.</p>
            <button
              onClick={fetchAttendees}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-sm"
            >
              Try again
            </button>
          </div>
        ) : count === 0 ? (
          <p className="text-warm-600 dark:text-warm-300 text-center py-8">
            {isOrganizerView ? 'No one has RSVPed yet.' : 'No one has RSVPed yet. Be the first to tap Going.'}
          </p>
        ) : namedCount === 0 ? (
          <p className="text-warm-600 dark:text-warm-300 text-center py-6 text-sm">
            {count} shopper{count !== 1 ? 's are' : ' is'} planning to go. Names stay private unless a shopper chooses to share theirs.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {attendees.map((attendee) => (
                <li
                  key={attendee.id}
                  className="p-3 bg-warm-50 dark:bg-gray-700 rounded-lg border border-warm-200 dark:border-gray-600"
                >
                  <p className="text-warm-900 dark:text-warm-100 font-medium">{attendee.name}</p>
                </li>
              ))}
            </ul>
            {!isOrganizerView && anonymousCount > 0 && (
              <p className="text-sm text-warm-600 dark:text-warm-300 mt-3">
                and {anonymousCount} more {anonymousCount !== 1 ? 'shoppers' : 'shopper'} (names private)
              </p>
            )}
          </>
        )}

        {user && isGoing && (
          <label className="flex items-start gap-3 mt-5 p-3 rounded-lg border border-warm-200 dark:border-gray-600 bg-warm-50 dark:bg-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showName}
              onChange={handleToggleShowName}
              disabled={isSavingVisibility}
              className="w-4 h-4 mt-0.5 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
            <span className="text-sm text-warm-900 dark:text-warm-100">
              Show my first name and last initial in this list
              <span className="block text-xs text-warm-500 dark:text-warm-400 mt-0.5">
                Off by default. Applies to every sale you RSVP to. Change it any time in Notification Settings.
              </span>
            </span>
          </label>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
        >
          Close
        </button>
      </div>
    </AccessibleModal>
  );
};

export default RSVPAttendeesModal;
