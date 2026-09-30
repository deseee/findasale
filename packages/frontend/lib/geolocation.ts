/**
 * Best-effort browser position for QR / check-in flows.
 * Never rejects and never blocks longer than `timeoutMs`: callers get coordinates or `null` (permission denied,
 * unsupported, timed out) and decide what to do. Field names match what the backend controllers read
 * (latitude, longitude, accuracy in meters).
 */
export interface QuickPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function getQuickPosition(timeoutMs = 6000): Promise<QuickPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    // Belt and braces: some browsers never call back when the permission prompt is ignored.
    const guard = setTimeout(() => resolve(null), timeoutMs + 1000);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(guard);
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 0),
          });
        },
        () => {
          clearTimeout(guard);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch {
      clearTimeout(guard);
      resolve(null);
    }
  });
}
