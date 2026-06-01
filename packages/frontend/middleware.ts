/**
 * #462/#463/#464 — UTM Parameter Preservation
 *
 * Root cause (confirmed S836): Chrome strips `utm_*` params in incognito mode before
 * the request reaches the server. Server-side middleware never sees them.
 *
 * Fix: Email/outreach links now use `fsa_*` param names (fsa_src, fsa_med, fsa_cmp,
 * fsa_cnt) which Chrome does not recognise as tracking params and does not strip.
 *
 * This middleware captures BOTH fsa_* (new) and utm_* (legacy / non-incognito) and
 * writes them to a short-lived cookie so UTMCapture in _app.tsx can read them after
 * any redirect that might still move the URL.
 *
 * Cookie: fsa_utm_pending — JSON, path=/, maxAge=300s, httpOnly=false, sameSite=lax.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // fsa_* params: used in outreach emails (Chrome-safe names)
  const fsa_src = searchParams.get('fsa_src');
  const fsa_med = searchParams.get('fsa_med');
  const fsa_cmp = searchParams.get('fsa_cmp');
  const fsa_cnt = searchParams.get('fsa_cnt');

  // utm_* params: fallback for non-incognito clicks (social shares, direct links)
  const utm_source = searchParams.get('utm_source');
  const utm_medium = searchParams.get('utm_medium');
  const utm_campaign = searchParams.get('utm_campaign');
  const utm_content = searchParams.get('utm_content');

  const ref = searchParams.get('ref');

  // Act only when at least one attribution param is present
  const hasFsa = fsa_src || fsa_med || fsa_cmp || fsa_cnt;
  const hasUtm = utm_source || utm_medium || utm_campaign || utm_content;
  if (!hasFsa && !hasUtm) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Normalise to utm_* names in the cookie regardless of input format
  const utmData = JSON.stringify({
    ...(fsa_src || utm_source ? { utm_source: fsa_src ?? utm_source } : {}),
    ...(fsa_med || utm_medium ? { utm_medium: fsa_med ?? utm_medium } : {}),
    ...(fsa_cmp || utm_campaign ? { utm_campaign: fsa_cmp ?? utm_campaign } : {}),
    ...(fsa_cnt || utm_content ? { utm_content: fsa_cnt ?? utm_content } : {}),
    ...(ref ? { ref } : {}),
    captured_at: new Date().toISOString(),
  });

  response.cookies.set('fsa_utm_pending', utmData, {
    path: '/',
    maxAge: 300,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
  ],
};
