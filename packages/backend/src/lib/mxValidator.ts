import { resolveMx } from 'dns/promises';

/**
 * Pre-send MX/domain validation — cuts the outreach bounce rate (the #1 Gmail
 * reputation killer). Scraped directory addresses frequently point at domains
 * with NO MX record (they cannot receive mail) and hard-bounce on every send
 * (confirmed: buygoldinwoodbridge.com, diamondsoncredit.com — "DNS Error: no MX").
 *
 * We verify the recipient domain can receive mail BEFORE sending and suppress
 * it if not, so we never burn sending quota on guaranteed-undeliverable mail.
 *
 * Failure philosophy:
 *  - resolveMx returns >=1 record           -> ok (domain can receive mail)
 *  - ENOTFOUND / NXDOMAIN / empty records   -> not ok (NO_MX / NXDOMAIN) -- suppress
 *  - any OTHER error (timeout/SERVFAIL/etc) -> FAIL OPEN (ok:true) -- never suppress a
 *    good domain because of a flaky/transient DNS lookup
 */

export type MxCheckReason = 'NO_MX' | 'NXDOMAIN';

export interface MxCheckResult {
  ok: boolean;
  reason?: MxCheckReason;
}

// Per-domain result cache for the lifetime of the process run. Most send windows
// share only a handful of distinct domains, so we never look the same one up twice.
const domainCache = new Map<string, MxCheckResult>();

// Hard ceiling on a single DNS lookup so a slow/hung resolver can't stall the cron.
const MX_LOOKUP_TIMEOUT_MS = 3000;

function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return null;
  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * Returns whether the recipient domain has a deliverable mail server.
 * Result is cached per-domain for the process run.
 */
export async function domainCanReceiveMail(email: string): Promise<MxCheckResult> {
  const domain = extractDomain(email);
  // No parseable domain -- leave that judgment to the synchronous domain-block
  // guards (isEmailDomainBlocked). Fail open here so we don't double-suppress.
  if (!domain) return { ok: true };

  const cached = domainCache.get(domain);
  if (cached) return cached;

  let result: MxCheckResult;
  try {
    const records = await withTimeout(resolveMx(domain), MX_LOOKUP_TIMEOUT_MS);
    if (Array.isArray(records) && records.length > 0) {
      result = { ok: true };
    } else {
      // resolveMx resolved with zero records -- domain exists but cannot receive mail.
      result = { ok: false, reason: 'NO_MX' };
    }
  } catch (err: any) {
    const code = err?.code;
    if (code === 'ENOTFOUND' || code === 'NXDOMAIN') {
      // Domain does not exist at all.
      result = { ok: false, reason: 'NXDOMAIN' };
    } else if (code === 'ENODATA') {
      // Domain exists but has no MX records.
      result = { ok: false, reason: 'NO_MX' };
    } else {
      // Timeout, SERVFAIL, or any other transient/unknown failure -> FAIL OPEN.
      result = { ok: true };
    }
  }

  domainCache.set(domain, result);
  return result;
}

/** Promise.race-based timeout so a slow resolver cannot stall the send loop. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const t = setTimeout(() => {
        const e: any = new Error('MX lookup timed out');
        e.code = 'ETIMEOUT';
        reject(e);
      }, ms);
      // Don't keep the event loop alive solely for this timer.
      if (typeof t.unref === 'function') t.unref();
    }),
  ]);
}
