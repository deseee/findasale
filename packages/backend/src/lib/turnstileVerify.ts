/**
 * turnstileVerify.ts — Cloudflare Turnstile CAPTCHA verification (server-side)
 *
 * Verifies a Turnstile token from the registration form against Cloudflare's siteverify
 * endpoint before an account is created. Fails CLOSED: a missing token, missing secret key,
 * network error, or an unsuccessful Cloudflare response all block the request. This is the
 * P0 fix for near-zero signup friction — registration previously had no bot-verification step
 * at all (2026-07-18).
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Turnstile token server-side. Fails closed — returns success:false whenever
 * verification cannot be positively confirmed (missing token, missing secret, network error,
 * or Cloudflare reporting failure).
 *
 * @param token The `cf-turnstile-response` token submitted by the client widget.
 * @param remoteIp Optional client IP, passed through to Cloudflare for additional signal.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Fail closed: an unconfigured secret must never silently allow registrations through.
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not set — failing closed on all registrations');
    return { success: false, errorCodes: ['missing-secret-key'] };
  }

  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  try {
    const body = new URLSearchParams();
    body.append('secret', secretKey);
    body.append('response', token);
    if (remoteIp && remoteIp !== 'unknown') {
      body.append('remoteip', remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      console.error(`[turnstile] siteverify HTTP error: ${response.status}`);
      return { success: false, errorCodes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };

    if (!data.success) {
      console.warn('[turnstile] verification failed:', data['error-codes']);
      return { success: false, errorCodes: data['error-codes'] };
    }

    return { success: true };
  } catch (err: any) {
    // Network failure, timeout, JSON parse error, etc. — all fail closed.
    console.error('[turnstile] verification request failed:', err?.message || err);
    return { success: false, errorCodes: ['network-error'] };
  }
}
