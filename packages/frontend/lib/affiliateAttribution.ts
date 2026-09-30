/**
 * Creator Program attribution storage (2026-09-29).
 *
 * pages/affiliate/[id].tsx calls GET /affiliate/click/:id, and when the API says the click is
 * attributable it saves { affiliateLinkId, saleId } here. CheckoutModal and CartDrawer then send
 * affiliateLinkId with the payment request. The backend re-validates everything
 * (resolveAffiliateAttribution: link exists, creator active, sale matches, no self-referral), so
 * this value is only a hint and a stale or tampered one simply attributes nothing.
 *
 * Last click wins. The window matches CREATOR_PROGRAM.ATTRIBUTION_WINDOW_DAYS on the backend.
 * Storage can be blocked (private windows), so every access is wrapped and failures are silent.
 */

const STORAGE_KEY = 'fas_affiliate_attribution';
export const AFFILIATE_ATTRIBUTION_WINDOW_DAYS = 30;

export interface AffiliateAttribution {
  affiliateLinkId: string;
  saleId: string | null;
  savedAt: number;
}

export function saveAffiliateAttribution(affiliateLinkId: string, saleId: string | null): void {
  try {
    if (typeof window === 'undefined' || !affiliateLinkId) return;
    const value: AffiliateAttribution = { affiliateLinkId, saleId, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: attribution is best effort.
  }
}

export function readAffiliateAttribution(now: number = Date.now()): AffiliateAttribution | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AffiliateAttribution>;
    if (!parsed || typeof parsed.affiliateLinkId !== 'string' || typeof parsed.savedAt !== 'number') return null;
    const ageMs = now - parsed.savedAt;
    if (ageMs < 0 || ageMs > AFFILIATE_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      clearAffiliateAttribution();
      return null;
    }
    return {
      affiliateLinkId: parsed.affiliateLinkId,
      saleId: typeof parsed.saleId === 'string' ? parsed.saleId : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * The affiliateLinkId to send with a checkout request, or undefined when there is none.
 * When saleId is provided and the stored attribution is for a different sale, returns undefined
 * so we never send a link that the backend would reject anyway.
 */
export function getAffiliateLinkIdForCheckout(saleId?: string | null): string | undefined {
  const stored = readAffiliateAttribution();
  if (!stored) return undefined;
  if (saleId && stored.saleId && stored.saleId !== saleId) return undefined;
  return stored.affiliateLinkId;
}

export function clearAffiliateAttribution(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
