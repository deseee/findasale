/**
 * ItemQrScanPrompt: client for GET /api/items/:itemId/qr/scan (Feature #85 Item Scout XP,
 * #317 geofence, #408 Scan & Split).
 *
 * Shown on the item page only when the visit came from a QR code (utm_source starting with "qr").
 *
 * Location rules (industry standard: never prompt on page load):
 *   - The browser location prompt is only ever triggered by the shopper tapping the button.
 *   - If the Permissions API already reports "granted", the scan is sent automatically because no
 *     prompt can appear.
 *   - The scan route is only called WITH coordinates, because the server geofence (100 m of the sale,
 *     widened by GPS accuracy) is what makes the XP fair. If location is denied or unavailable we say
 *     so plainly; the item page keeps working normally.
 * A scan is attempted at most once per browser session per item (sessionStorage), and never for
 * signed-out visitors (the route is authenticated), who get a sign-in prompt instead.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface Props {
  itemId: string;
}

type Phase = 'idle' | 'locating' | 'sending' | 'done' | 'denied' | 'unavailable' | 'too_far' | 'error';

interface ScanResult {
  xpAwarded?: number;
  badgeAwarded?: string | null;
  scanAndSplitTriggered?: boolean;
  message?: string;
}

const storageKey = (itemId: string) => `fas_qr_scan_item_${itemId}`;

const readDone = (itemId: string): boolean => {
  try {
    return sessionStorage.getItem(storageKey(itemId)) === '1';
  } catch {
    return false;
  }
};

const markDone = (itemId: string) => {
  try {
    sessionStorage.setItem(storageKey(itemId), '1');
  } catch {
    /* storage blocked: worst case the shopper can tap again */
  }
};

const isQrVisit = (utmSource: unknown): boolean =>
  typeof utmSource === 'string' && utmSource.toLowerCase().startsWith('qr');

const ItemQrScanPrompt: React.FC<Props> = ({ itemId }) => {
  const router = useRouter();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [alreadyHandled, setAlreadyHandled] = useState(false);
  const autoTried = useRef(false);

  const fromQr = router.isReady && isQrVisit(router.query.utm_source);

  useEffect(() => {
    if (fromQr) setAlreadyHandled(readDone(itemId));
  }, [fromQr, itemId]);

  const sendScan = useCallback(
    async (pos: GeolocationPosition) => {
      setPhase('sending');
      try {
        const res = await api.get(`/items/${encodeURIComponent(itemId)}/qr/scan`, {
          params: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 0),
          },
        });
        setResult(res.data as ScanResult);
        setPhase('done');
        markDone(itemId);
      } catch (err: any) {
        const status = err?.response?.status;
        const body = err?.response?.data;
        if (status === 403) {
          setPhase('too_far');
        } else if (status === 401) {
          setErrorMessage('Please sign in again to claim this scan.');
          setPhase('error');
        } else {
          setErrorMessage(body?.message || body?.error || 'We could not record this scan. Please try again.');
          setPhase('error');
        }
      }
    },
    [itemId]
  );

  // Ask the browser for a position. Only called from a tap, or when permission is already granted.
  const requestLocationAndScan = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPhase('unavailable');
      return;
    }
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendScan(pos);
      },
      (geoErr) => {
        if (geoErr.code === geoErr.PERMISSION_DENIED) setPhase('denied');
        else setPhase('unavailable'); // POSITION_UNAVAILABLE or TIMEOUT
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, [sendScan]);

  // No prompt can appear when permission is already granted, so it is safe to scan without a tap.
  useEffect(() => {
    if (!fromQr || !user || alreadyHandled || autoTried.current) return;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    autoTried.current = true;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'granted') requestLocationAndScan();
        else if (status.state === 'denied') setPhase('denied');
      })
      .catch(() => {
        /* Permissions API unsupported for geolocation: wait for the tap */
      });
    return () => {
      cancelled = true;
    };
  }, [fromQr, user, alreadyHandled, requestLocationAndScan]);

  if (!fromQr || alreadyHandled) return null;

  const box =
    'mb-4 rounded-lg border p-4 text-sm flex items-start gap-3 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100';

  if (!user) {
    return (
      <div className={box} role="status">
        <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">You scanned this item&apos;s QR code</p>
          <p className="mt-1">
            <Link href={`/login?redirect=${encodeURIComponent(router.asPath)}`} className="underline font-medium">
              Sign in
            </Link>{' '}
            to earn Item Scout XP for scanning items at the sale.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const xp = result?.xpAwarded ?? 0;
    return (
      <div className={box} role="status" aria-live="polite">
        <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-green-700 dark:text-green-300" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            {xp > 0 ? `Scan recorded. +${xp} XP` : result?.message || 'Scan recorded.'}
          </p>
          {result?.badgeAwarded && <p className="mt-1">New badge: {result.badgeAwarded}</p>}
          {result?.scanAndSplitTriggered && (
            <p className="mt-1">Someone else scanned this item too. The seller has been told you may want to split it.</p>
          )}
        </div>
      </div>
    );
  }

  const busy = phase === 'locating' || phase === 'sending';
  const problem =
    phase === 'denied'
      ? 'Location is blocked for this site, so we cannot confirm you are at the sale. You can allow it in your browser settings and tap again. Everything else on this page works as usual.'
      : phase === 'unavailable'
      ? 'We could not get your location. Move outside if you can, then tap again.'
      : phase === 'too_far'
      ? 'You need to be at the sale to earn XP for this scan.'
      : phase === 'error'
      ? errorMessage
      : '';

  return (
    <div className={box} role="status" aria-live="polite">
      {problem ? (
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
      ) : (
        <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold">You scanned this item&apos;s QR code</p>
        <p className="mt-1">Confirm you are at the sale to earn Item Scout XP. We only use your location for this check and do not store it.</p>
        {problem && <p className="mt-2 text-red-700 dark:text-red-300">{problem}</p>}
        <button
          type="button"
          onClick={requestLocationAndScan}
          disabled={busy}
          className="mt-3 inline-flex items-center justify-center px-4 py-2 min-h-[40px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {phase === 'locating' ? 'Finding you...' : phase === 'sending' ? 'Recording...' : problem ? 'Try again' : 'Confirm my location'}
        </button>
      </div>
    </div>
  );
};

export default ItemQrScanPrompt;
