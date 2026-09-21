/**
 * gmailForwardingAutoConfirmService.ts — automates Gmail's one-time "Forwarding
 * Confirmation" step for the per-organizer Facebook Marketplace sold-email forwarding
 * setup (ADR-131 §2.4 generalization; see organizerEmailForwardingService.ts).
 *
 * BACKGROUND: each organizer sets up a Gmail "Forwarding and POP/IMAP" auto-forward
 * rule on their OWN personal Gmail account, pointed at their own unique
 * `sold-<token>@mail.finda.sale` address (organizerEmailForwardingService.ts's
 * buildFacebookSoldForwardingAddress). A Google Workspace catch-all/routing rule (set up
 * separately, out of scope here) delivers any mail sent to `*@<FACEBOOK_SOLD_EMAIL_DOMAIN>`
 * that isn't a real mailbox into the single shared outreach@finda.sale inbox that
 * facebookMarketplaceEmailPollService.ts already polls.
 *
 * Before Gmail actually starts forwarding for a given organizer, it sends a one-time
 * "Gmail Forwarding Confirmation" email TO the new forwarding address (i.e. it lands in
 * outreach@finda.sale via the catch-all, same as the order-confirmation emails) carrying
 * a confirmation link (and a confirmation code, which this service does not use --
 * clicking the link is sufficient and is what a human would otherwise do by hand).
 * Someone has to click that link once per organizer or the forward never activates.
 * Given potentially many organizers doing this over time, this service polls for those
 * confirmation emails and clicks the link automatically -- but ONLY when the forwarding
 * address embedded in the email can be resolved back to a real, known organizer via
 * resolveOrganizerIdByForwardingToken(). See the SECURITY note below.
 *
 * CONNECTION REUSE: both this service and facebookMarketplaceEmailPollService.ts poll the
 * SAME outreach@finda.sale mailbox over the same Gmail App Password IMAP connection
 * shape, so this file deliberately imports that file's already-debugged
 * `openImapSession()` and `parseImapMessageToInboundEmail()` helpers (both exported for
 * exactly this reuse) instead of re-implementing IMAP connect/search/fetch/parse a second
 * time. This does mean the two jobs open two separate IMAP sessions on their own
 * schedules rather than sharing a single poll pass that dispatches by email type --
 * deliberately kept separate (own cron, own search query, own result type) to avoid
 * touching the existing, already-shipped FB poll loop for this unrelated feature, per the
 * "keep changes minimal and additive" project rule. If IMAP connection volume/rate limits
 * ever become a real concern, merging both into one poll pass that dispatches by
 * sender/subject is the natural next step -- flagged here for a human to reconsider.
 *
 * SECURITY / ABUSE GUARD (do not weaken this): this service must NEVER auto-click a
 * Gmail forwarding-confirmation link unless the forwarding-target address embedded in
 * the confirmation email resolves to a real Organizer row via
 * resolveOrganizerIdByForwardingToken(). Without that check, this job would be an open
 * "auto-click any confirmation link that lands in outreach@finda.sale" primitive --
 * anyone could point an arbitrary Gmail forward at some-guess@mail.finda.sale and have
 * it silently confirmed. An unresolvable token is logged as a structured warning and
 * left un-confirmed (fail closed), matching facebookMarketplaceEmailSoldDetection.ts's
 * own fail-closed handling of an unmatched order email.
 *
 * DETECTION FORMAT -- ***NOT YET CONFIRMED AGAINST A REAL SAMPLE***: the exact real-world
 * sender address and subject line of Gmail's forwarding-confirmation email have not been
 * verified against a live example (unlike ADR-131's order-confirmation email, which is
 * cited from a real, live-verified fixture). Based on Gmail's long-documented forwarding
 * flow, the sender is expected to be a google.com-controlled address (historically
 * forwarding-noreply@google.com) and the subject is expected to contain "Forwarding
 * Confirmation" (historically "Gmail Forwarding Confirmation - Receive Mail from
 * <account>"). The matching below is deliberately tolerant (subject contains "forwarding
 * confirmation" case-insensitively; sender domain is *.google.com) rather than an exact
 * match, same tolerant-by-design spirit as this file's forwarding-target extraction
 * below. TODO(human, first real run): capture one real Gmail forwarding-confirmation
 * email from outreach@finda.sale and confirm/tighten SENDER/SUBJECT matching against it,
 * the same way ADR-131's fixtures were confirmed against a real Facebook email.
 *
 * FORWARDING-TARGET EXTRACTION: the confirmation email is delivered to
 * outreach@finda.sale only because of the domain catch-all -- that delivery mailbox is
 * NOT the address being confirmed. Gmail's confirmation email body states, in plain
 * text, which address forwarding is being set up to receive at (the organizer's
 * `sold-<token>@<domain>` address). Rather than hardcode a "sold-" prefix separately
 * from organizerEmailForwardingService.ts's own address format (a drift risk), the
 * matcher is derived directly from buildFacebookSoldForwardingAddress() so the two stay
 * in sync automatically if that format ever changes.
 *
 * IDEMPOTENCY: same convention as facebookMarketplaceEmailPollService.ts -- the IMAP
 * search is is:unread, so an already-processed (marked \Seen) message is never returned
 * by the next poll. A message whose processing throws is deliberately left unread so the
 * next poll retries it; a message that resolved to any outcome (confirmed, unresolved,
 * or ignored) is marked \Seen since re-processing it would produce the same result.
 */

import type { ImapFlow } from 'imapflow';
import {
  openImapSession,
  parseImapMessageToInboundEmail,
} from './facebookMarketplaceEmailPollService';
import {
  resolveOrganizerIdByForwardingToken,
  buildFacebookSoldForwardingAddress,
} from './organizerEmailForwardingService';

// Gmail's IMAP server accepts its own web search syntax via X-GM-RAW (same "gmraw"
// mechanism the sibling FB poll service and bounceSuppressService.ts already use).
// Deliberately narrow to the subject only here, NOT the sender -- see the tolerant
// isFromGoogleForwardingSender() exact re-check below, same "search does coarse
// filtering, code does the real check" split already used by the FB poll service.
const GMAIL_FORWARDING_CONFIRMATION_SEARCH_QUERY =
  'subject:"Forwarding Confirmation" is:unread in:anywhere';

// Pure defense-in-depth safety cap, same idea as the sibling FB poll service's
// MAX_UIDS_PER_RUN -- real volume here should be tiny (one email per organizer signup).
const MAX_UIDS_PER_RUN = 200;

// Historical Gmail forwarding-confirmation sender. Kept as a named constant for the
// TODO above to be easy to find and update once a real sample confirms/corrects it.
const KNOWN_GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com';

const FORWARDING_CONFIRMATION_SUBJECT_PATTERN = /forwarding confirmation/i;

function isFromGoogleForwardingSender(from: string): boolean {
  const lower = from.trim().toLowerCase();
  if (lower === KNOWN_GMAIL_FORWARDING_SENDER) return true;
  // Tolerant fallback in case Google uses a different address under the same domain(s) --
  // see the file-header TODO about confirming this against a real sample.
  return lower.endsWith('@google.com') || lower.endsWith('@accounts.google.com');
}

function isForwardingConfirmationSubject(subject: string): boolean {
  return FORWARDING_CONFIRMATION_SUBJECT_PATTERN.test(subject);
}

// Placeholder swapped into buildFacebookSoldForwardingAddress() to derive a regex that
// matches ANY organizer's forwarding address in that same format, instead of hardcoding
// the "sold-" prefix a second time here (see file header).
const TOKEN_PLACEHOLDER = 'TOKEN_PLACEHOLDER_9f3a1c';

function buildTargetAddressPattern(): RegExp {
  const sample = buildFacebookSoldForwardingAddress(TOKEN_PLACEHOLDER);
  const escaped = sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withCaptureGroup = escaped.replace(TOKEN_PLACEHOLDER, '([A-Za-z0-9_-]+)');
  return new RegExp(withCaptureGroup, 'i');
}

interface ForwardingTarget {
  token: string;
  address: string;
}

function extractForwardingTarget(searchText: string): ForwardingTarget | null {
  const match = buildTargetAddressPattern().exec(searchText);
  if (!match) return null;
  return { token: match[1], address: match[0].toLowerCase() };
}

// Hints that a link is plausibly Gmail's own confirmation-click URL rather than a
// boilerplate/help link elsewhere in the same email. NOT YET CONFIRMED against a real
// sample -- see file-header TODO. Deliberately does NOT fall back to "just take the
// first link": guessing wrong here means firing an HTTP GET at an arbitrary URL found in
// an email, which is exactly the blind-link-clicking risk this service exists to avoid
// for anything that isn't a validated confirmation link.
const CONFIRMATION_LINK_HINT_PATTERN = /google\.com\/(mail\/)?vf-|mail-settings\.google\.com|forwarding.*confirm|confirm.*forward/i;

function extractConfirmationLink(links: string[] | undefined): string | null {
  if (!links || links.length === 0) return null;
  return links.find((href) => CONFIRMATION_LINK_HINT_PATTERN.test(href)) ?? null;
}

export interface InboundGmailForwardingConfirmationEmail {
  /** The email's From header, exactly as delivered. */
  from: string;
  /** The email's Subject header, exactly as delivered. */
  subject: string;
  /** Every anchor href found in the body, if the caller already extracted them
   * (parseImapMessageToInboundEmail's shape -- reused as-is at the poll layer below). */
  links?: string[];
  /** Raw email body (HTML or plain text) -- searched for the forwarding-target address
   * alongside `links`, since Gmail states it in plain sentence text, not necessarily
   * inside an anchor href. */
  rawBody?: string;
}

export interface GmailForwardingConfirmDeps {
  /** Resolves a forwarding token back to a real organizerId, or null if unknown.
   * Defaults to the real resolveOrganizerIdByForwardingToken. Override in tests to
   * avoid touching Prisma. */
  resolveOrganizerId?: (token: string) => Promise<string | null>;
  /** Performs the actual confirmation HTTP GET. Defaults to a plain fetch(). Override in
   * tests to assert on the URL without making a real network call. */
  confirmForwarding?: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
}

async function defaultConfirmForwarding(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // Plain GET is all Gmail's confirmation link requires -- same house convention as
    // indexNowService.ts's use of Node's built-in fetch (no axios instance needed for a
    // single unauthenticated GET with no request body).
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    return { ok: response.ok, status: response.status };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export type GmailForwardingConfirmResult =
  | {
      kind: 'ignored';
      /** Why this email wasn't even considered a forwarding-confirmation candidate
       * (wrong sender, wrong subject, or no recognizable forwarding-target address
       * found anywhere in it). Not an error -- most mail in this inbox is NOT this. */
      reason: string;
    }
  | {
      kind: 'unresolved';
      /** organizerId when the token DID resolve but confirmation still didn't happen
       * (e.g. no confirmation link could be extracted) -- null when the token itself
       * didn't resolve to any organizer at all (the security-guard case). */
      organizerId: string | null;
      targetAddress: string;
      forwardingToken: string;
      reason: string;
    }
  | {
      kind: 'confirmed';
      organizerId: string;
      targetAddress: string;
      forwardingToken: string;
      confirmationUrl: string;
    }
  | {
      kind: 'failed';
      /** Recognized, validated, and attempted -- but the confirmation GET itself
       * failed (network error or non-2xx). Caller should leave the message unread so
       * the next poll retries the GET. */
      organizerId: string;
      targetAddress: string;
      forwardingToken: string;
      confirmationUrl: string;
      reason: string;
    };

/**
 * Parses and validates one inbound email against Gmail's forwarding-confirmation
 * signature, and on a validated match (known organizer only), performs the confirmation
 * GET. See file header for the full contract, especially the SECURITY / ABUSE GUARD
 * section. Never throws for a malformed/unrelated email -- those resolve to
 * `{ kind: 'ignored' | 'unresolved' }`. Only a truly unexpected failure (not a network
 * error from confirmForwarding, which is caught and returned as `{ kind: 'failed' }`)
 * propagates.
 */
export async function processGmailForwardingConfirmationEmail(
  email: InboundGmailForwardingConfirmationEmail,
  deps: GmailForwardingConfirmDeps = {},
): Promise<GmailForwardingConfirmResult> {
  const resolveOrganizerId = deps.resolveOrganizerId ?? resolveOrganizerIdByForwardingToken;
  const confirmForwarding = deps.confirmForwarding ?? defaultConfirmForwarding;

  if (!isFromGoogleForwardingSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not a recognized Google forwarding sender` };
  }
  if (!isForwardingConfirmationSubject(email.subject)) {
    return { kind: 'ignored', reason: `subject does not look like a forwarding confirmation: "${email.subject}"` };
  }

  const searchText = [email.subject, email.rawBody ?? '', ...(email.links ?? [])].join('\n');
  const target = extractForwardingTarget(searchText);

  if (!target) {
    return {
      kind: 'ignored',
      reason: 'sender/subject matched but no recognizable forwarding-target address (sold-<token>@<domain>) found in the body/links',
    };
  }

  // SECURITY / ABUSE GUARD -- resolve BEFORE even looking at the confirmation link, so an
  // unknown token never gets anywhere near the "fetch this URL" step below.
  const organizerId = await resolveOrganizerId(target.token);
  if (!organizerId) {
    console.warn(
      '[gmailForwardingAutoConfirmService] UNRESOLVED forwarding token -- refusing to auto-confirm (fail closed)',
      { targetAddress: target.address, forwardingToken: target.token },
    );
    return {
      kind: 'unresolved',
      organizerId: null,
      targetAddress: target.address,
      forwardingToken: target.token,
      reason: 'forwarding token did not resolve to any known organizer',
    };
  }

  const confirmationUrl = extractConfirmationLink(email.links);
  if (!confirmationUrl) {
    console.warn(
      '[gmailForwardingAutoConfirmService] known organizer but no confirmation link could be extracted -- needs manual reconciliation',
      { organizerId, targetAddress: target.address, forwardingToken: target.token },
    );
    return {
      kind: 'unresolved',
      organizerId,
      targetAddress: target.address,
      forwardingToken: target.token,
      reason: 'forwarding token resolved to a known organizer, but no confirmation link could be extracted from the email',
    };
  }

  const outcome = await confirmForwarding(confirmationUrl);
  if (!outcome.ok) {
    return {
      kind: 'failed',
      organizerId,
      targetAddress: target.address,
      forwardingToken: target.token,
      confirmationUrl,
      reason: outcome.error ?? `confirmation GET returned HTTP ${outcome.status}`,
    };
  }

  return {
    kind: 'confirmed',
    organizerId,
    targetAddress: target.address,
    forwardingToken: target.token,
    confirmationUrl,
  };
}

export interface GmailForwardingConfirmPollResult {
  processed: number;
  confirmed: number;
  unresolved: number;
  ignored: number;
  failed: number;
  errors: string[];
}

/**
 * Polls outreach@finda.sale for unread Gmail forwarding-confirmation emails and runs
 * each one through processGmailForwardingConfirmationEmail. Mirrors
 * pollFacebookMarketplaceSoldEmails()'s per-message isolation and \Seen idempotency --
 * see that function's own doc comment for the shared rationale.
 */
export async function pollGmailForwardingConfirmations(): Promise<GmailForwardingConfirmPollResult> {
  const result: GmailForwardingConfirmPollResult = {
    processed: 0,
    confirmed: 0,
    unresolved: 0,
    ignored: 0,
    failed: 0,
    errors: [],
  };

  let session: { client: ImapFlow; lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> };
  try {
    session = await openImapSession();
  } catch (err: any) {
    result.errors.push(`IMAP auth/connect failed: ${err.message}`);
    console.error('[gmailForwardingAutoConfirmService] IMAP auth/connect error:', err.message);
    return result;
  }

  const { client, lock } = session;

  try {
    let uids: number[] = [];
    try {
      const found = await client.search({ gmraw: GMAIL_FORWARDING_CONFIRMATION_SEARCH_QUERY }, { uid: true });
      uids = found === false ? [] : found;
      if (uids.length > MAX_UIDS_PER_RUN) {
        console.warn(
          `[gmailForwardingAutoConfirmService] IMAP search returned ${uids.length} UIDs -- capping at ${MAX_UIDS_PER_RUN} for this run.`
        );
        uids = uids.slice(0, MAX_UIDS_PER_RUN);
      }
    } catch (err: any) {
      result.errors.push(`IMAP search failed: ${err.message}`);
      console.error('[gmailForwardingAutoConfirmService] IMAP search error:', err.message);
      return result;
    }

    if (uids.length === 0) {
      console.log('[gmailForwardingAutoConfirmService] No unread Gmail forwarding-confirmation emails found.');
      return result;
    }

    console.log(`[gmailForwardingAutoConfirmService] Found ${uids.length} unread candidate email(s) to process.`);

    for (const uid of uids) {
      result.processed++;
      let outcome: GmailForwardingConfirmResult;

      try {
        const msg: any = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) {
          throw new Error(`IMAP fetchOne returned no source for UID ${uid}`);
        }
        const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
        outcome = await processGmailForwardingConfirmationEmail(email);
      } catch (err: any) {
        const errMsg = `UID ${uid}: ${err.message}`;
        result.errors.push(errMsg);
        console.error(
          `[gmailForwardingAutoConfirmService] Error processing UID ${uid} -- leaving unread for retry on next poll:`,
          err.message
        );
        continue; // do NOT mark \Seen -- next poll retries this message
      }

      switch (outcome.kind) {
        case 'confirmed':
          result.confirmed++;
          console.log(
            `[gmailForwardingAutoConfirmService] CONFIRMED UID ${uid}: organizerId=${outcome.organizerId} targetAddress=${outcome.targetAddress}`
          );
          break;
        case 'unresolved':
          result.unresolved++;
          console.warn(
            '[gmailForwardingAutoConfirmService] UNRESOLVED forwarding confirmation -- not auto-confirmed, needs manual reconciliation',
            {
              uid,
              organizerId: outcome.organizerId,
              targetAddress: outcome.targetAddress,
              forwardingToken: outcome.forwardingToken,
              reason: outcome.reason,
            }
          );
          break;
        case 'ignored':
          result.ignored++;
          console.log(`[gmailForwardingAutoConfirmService] IGNORED UID ${uid}: ${outcome.reason}`);
          break;
        case 'failed':
          result.failed++;
          console.error(
            `[gmailForwardingAutoConfirmService] FAILED to confirm UID ${uid} for organizerId=${outcome.organizerId}: ${outcome.reason}`
          );
          break;
      }

      // Every branch above (including 'failed') is a terminal outcome for THIS message's
      // content -- a failed confirmation GET is a network/HTTP problem to retry via
      // alerting/manual follow-up, not something re-reading the same email will fix
      // differently. Mark \Seen in all cases so the next poll doesn't re-attempt the same
      // GET indefinitely; ADR-131's own precedent (facebookMarketplaceEmailPollService.ts)
      // reserves "leave unread" for a thrown processing exception only (handled in the
      // catch block above), not for a resolved-but-unsuccessful outcome.
      try {
        await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
      } catch (flagErr: any) {
        console.warn(
          `[gmailForwardingAutoConfirmService] Could not mark UID ${uid} \\Seen -- it may be reprocessed next poll:`,
          flagErr.message
        );
      }
    }

    console.log(
      `[gmailForwardingAutoConfirmService] Done. processed=${result.processed} confirmed=${result.confirmed} unresolved=${result.unresolved} ignored=${result.ignored} failed=${result.failed} errors=${result.errors.length}`
    );
    return result;
  } finally {
    try {
      lock.release();
    } catch {
      // already released or connection gone -- non-fatal
    }
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
