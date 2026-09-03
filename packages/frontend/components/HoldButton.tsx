/**
 * HoldButton Component
 * Feature #121: Allows shoppers to place holds on items with GPS validation, QR checks, and fraud detection.
 * Integrates with organizer hold settings for customized hold experiences.
 */

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface Item {
  id: string;
  title: string;
  sale?: {
    id: string;
    title: string;
  };
}

/**
 * Pull the most useful human-readable message out of ANY rejection from
 * POST /reservations. That endpoint refuses holds for a dozen different reasons --
 * rank hold limit, sale not published, holds disabled, item already reserved,
 * unmanaged listing, self-dealing guard, GPS geofence, en-route limit -- and every
 * one of them is a sentence the shopper needs to read. Before this, the only
 * surface was a toast; when the toast was missed the modal just sat there and the
 * app looked broken (live QA 2026-08-16, rank hold-limit 403).
 *
 * Order matters: server-authored copy first, then the axios interceptor's Zod
 * summary, then a status-based fallback, then a true-network-error fallback.
 */
function extractHoldErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof err?.validationMessage === 'string' && err.validationMessage.trim()) {
    return err.validationMessage;
  }

  const status = err?.response?.status;
  if (!status) {
    return 'We could not reach FindA.Sale just now. Check your connection and try again.';
  }
  switch (status) {
    case 401:
      return 'Please log in again to place this hold.';
    case 403:
      return 'This hold was not allowed. Please check with the organizer.';
    case 404:
      return 'This item is no longer listed.';
    case 409:
      return 'Someone else got there first. This item is no longer available to hold.';
    case 429:
      return 'That was a lot of requests at once. Wait a moment and try again.';
    default:
      return status >= 500
        ? 'Something went wrong on our end. Please try again in a moment.'
        : 'We could not place this hold. Please try again.';
  }
}

interface HoldButtonProps {
  item: Item;
  onHoldPlaced?: () => void;
  variant?: 'default' | 'compact';
  className?: string;
}

const HoldButton: React.FC<HoldButtonProps> = ({
  item,
  onHoldPlaced,
  variant = 'default',
  className = '',
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [holdSettings, setHoldSettings] = useState<any>(null);
  const [note, setNote] = useState('');
  // Inline rejection copy. The toast alone was not enough -- see extractHoldErrorMessage.
  const [error, setError] = useState<string | null>(null);

  // Fetch organizer hold settings to understand requirements
  useEffect(() => {
    if (isOpen) setError(null);
    if (isOpen && item.sale?.id) {
      fetchHoldSettings();
    }
  }, [isOpen, item.sale?.id]);

  const fetchHoldSettings = async () => {
    try {
      const resp = await api.get('/reservations/organizer/settings');
      setHoldSettings(resp.data);
    } catch (err) {
      console.warn('Failed to fetch hold settings:', err);
    }
  };

  // Request GPS permission when modal opens
  useEffect(() => {
    if (isOpen && holdSettings?.enableGpsValidation) {
      requestGPS();
    }
  }, [isOpen, holdSettings?.enableGpsValidation]);

  const requestGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not available on this device');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsError(null);
      },
      (error) => {
        setGpsError('Location permission denied. You may not be able to place a hold.');
        console.warn('GPS error:', error);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handlePlaceHold = async () => {
    if (!user) {
      const msg = 'Please log in to place a hold.';
      setError(msg);
      showToast(msg, 'info');
      return;
    }

    // Validate GPS if required
    if (holdSettings?.enableGpsValidation && !gpsCoords) {
      const msg = 'We need your location to place this hold. Turn on location services and try again.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const payload: any = {
        itemId: item.id,
        note: note.trim() || null,
      };

      // Add GPS coords if available
      if (gpsCoords) {
        payload.latitude = gpsCoords.lat;
        payload.longitude = gpsCoords.lng;
      }

      const resp = await api.post('/reservations', payload);
      showToast(`Hold placed on "${item.title}"! The organizer will confirm via email.`, 'success');
      setNote('');
      onHoldPlaced?.();
      // Immediately refresh cart icon — don't wait for the 30s poll
      queryClient.invalidateQueries({ queryKey: ['my-holds-full'] });
      // Close modal after brief delay so user sees success state
      setTimeout(() => setIsOpen(false), 1500);
    } catch (err: any) {
      // Show it in BOTH places. The modal stays open on failure, so the inline
      // banner is what the shopper actually reads; the toast is the backstop.
      const msg = extractHoldErrorMessage(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1 px-3 py-2 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium transition-colors min-h-[44px] min-w-[44px] ${className}`}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5 2a1 1 0 011 1v1h1a1 1 0 000-2H5a1 1 0 00-1 1zm0 4a1 1 0 011 1v1h1a1 1 0 100-2H5a1 1 0 00-1 1zm0 4a1 1 0 011 1v1h1a1 1 0 100-2H5a1 1 0 00-1 1zm3-6a1 1 0 000 2h6a1 1 0 100-2H8zm0 4a1 1 0 000 2h6a1 1 0 100-2H8zm0 4a1 1 0 000 2h6a1 1 0 100-2H8z"
            clipRule="evenodd"
          />
        </svg>
        Hold
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors ${className}`}
      >
        Place Hold
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-4">Place Hold</h2>

            {/* Item info */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Item</div>
              <div className="font-semibold text-gray-900">{item.title}</div>
              {item.sale?.title && (
                <div className="text-sm text-gray-600 mt-1">{item.sale.title}</div>
              )}
            </div>

            {/* GPS status */}
            {holdSettings?.enableGpsValidation && (
              <div className="mb-4">
                {gpsCoords ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-green-700">Location confirmed</span>
                  </div>
                ) : gpsError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-sm text-red-700">{gpsError}</div>
                    <button
                      onClick={requestGPS}
                      className="text-sm text-red-600 underline mt-1"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    Requesting your location...
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); if (error) setError(null); }}
                maxLength={200}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Hold for pickup tomorrow"
                rows={2}
              />
            </div>

            {/* Info message */}
            {holdSettings?.enableQrValidation && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                Organizer requires QR scan to confirm this hold.
              </div>
            )}

            {/* Rejection message -- the server tells the shopper exactly why a hold was
                refused (rank limit, geofence, sale closed). Never swallow it. */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700"
              >
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceHold}
                disabled={isLoading || (holdSettings?.enableGpsValidation && !gpsCoords)}
                className="flex-1 py-2 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Placing...' : 'Place Hold'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HoldButton;
