/**
 * HoldButton Component
 * Feature #121: Allows shoppers to place holds on items with GPS validation, QR checks, and fraud detection.
 * Integrates with organizer hold settings for customized hold experiences.
 */

import { useState, useEffect } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [holdSettings, setHoldSettings] = useState<any>(null);
  const [note, setNote] = useState('');

  // Fetch organizer hold settings to understand requirements
  useEffect(() => {
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
      showToast('Please log in to place a hold', 'info');
      return;
    }

    // Validate GPS if required
    if (holdSettings?.enableGpsValidation && !gpsCoords) {
      showToast('GPS location required. Please enable location services.', 'error');
      return;
    }

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
      showToast(`Hold placed on "${item.title}"!`, 'success');
      setIsOpen(false);
      setNote('');
      onHoldPlaced?.();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to place hold';
      showToast(msg, 'error');
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user || user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER') {
    return null;
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium transition-colors ${className}`}
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Place Hold</h2>

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
                onChange={(e) => setNote(e.target.value)}
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
