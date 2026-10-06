/**
 * bulkLotHoldEmailService (ADR-136 Addendum D, roadmap #659): the emails a customer gets about a bulk lot hold.
 *
 *   CONFIRMATION   right after the hold is saved: what is set aside, how many cards, the price, when it ends, how to pay
 *   REMINDER       once, 4 hours before an organizer hold ends (rule and limits: HOLD_REMINDER_* in bulkLotHoldService.ts)
 *   ENDED          a short notice when a hold expired or the shop released it without payment
 *
 * There is no "paid" email here on purpose. A paid hold goes through markHoldInvoicePaid, which already emails the buyer a
 * receipt to the shopper's account email or to HoldInvoice.guestEmail; convertBulkHold copies the hold's customerEmail onto
 * the invoice, so the existing receipt reaches an organizer-hold customer too. A second one would be a double send.
 *
 * Rail and gates (nothing new): the Resend transactional rail (lib/transactionalEmailService.ts), the same one the booth invite,
 * the hold-invoice receipt and the POS receipts use. It is wired in bulkLotHoldEmailWiring.ts. Every send passes, in order:
 *   1. CARD_BULK_LOTS_ENABLED (read at call time). Off means nothing is looked up and nothing is sent.
 *   2. a recipient: the shopper's account email for a shopper hold, otherwise the hold's customerEmail. None means no email and
 *      no error.
 *   3. suppressionService.isHardSuppressed: hard bounces, complaints, and the recipient-domain policy (the finda.sale zone is
 *      never emailed unless SENDABLE_FINDA_SALE_ADDRESSES lists it). The rail checks again.
 *   4. the rail must be configured (RESEND_API_KEY).
 * Never the Gmail or outreach rail. Every function here returns a result and never throws: a failed email must not touch a hold.
 *
 * Copy: plain, short sentences. No dashes used as punctuation, no tracking pixel, no images. Every dynamic value (customer name,
 * lot title, shop name, sale title, address) is HTML escaped; the subject goes through sanitizeHeaderText.
 *
 * No Prisma client in this module: lookups, the sender and the gates are passed in (HoldEmailDeps).
 */
import { buildEmail } from '../emailTemplateService';
import { escapeHtml, sanitizeHeaderText } from '../../utils/htmlEscape';
import { EnvLike, isBulkLotsEnabled } from './bulkLotConfig';
import { formatCardCount, formatCents } from './bulkLotPricing';

export type HoldEmailKind = 'CONFIRMATION' | 'REMINDER' | 'ENDED_EXPIRED' | 'ENDED_RELEASED';

export type HoldEmailSkipReason = 'disabled' | 'no_address' | 'blocked' | 'not_configured' | 'lookup_failed' | 'send_failed' | 'suppressed';

export interface HoldEmailResult {
  sent: boolean;
  reason?: HoldEmailSkipReason | string;
}

export interface HoldEmailDb {
  item: { findUnique(args: any): Promise<any> };
  sale: { findUnique(args: any): Promise<any> };
  organizer: { findUnique(args: any): Promise<any> };
  user: { findUnique(args: any): Promise<any> };
}

export interface HoldEmailDeps {
  db: HoldEmailDb;
  env: EnvLike;
  /** Public site origin for the link in the email, no trailing slash. */
  frontendUrl: string;
  /** The rail. transactionalEmailService.emails.send returns { sent, reason? } and throws on a rejected send. */
  send: (msg: { to: string; subject: string; html: string; text: string }) => Promise<{ sent: boolean; reason?: string } | void>;
  /** suppressionService.isHardSuppressed. */
  isBlocked: (email: string) => Promise<boolean>;
  /** True when the mail rail is configured (RESEND_API_KEY). */
  railConfigured: () => boolean;
  /** Called with a failure that is worth a Sentry event. Never throws. */
  onError?: (err: unknown, ctx: { kind: HoldEmailKind; holdId: string }) => void;
}

const DEFAULT_TIME_ZONE = 'America/Chicago';

/** "Oct 7, 3:30 PM CDT". Falls back to UTC when the zone name is not valid. */
export function formatHoldTime(value: unknown, timeZone: string | null | undefined): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(d.getTime())) return '';
  const fmt = (tz: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(d);
  try {
    return fmt(timeZone && timeZone.trim() ? timeZone.trim() : DEFAULT_TIME_ZONE);
  } catch {
    return fmt('UTC');
  }
}

export interface HoldEmailFacts {
  kind: HoldEmailKind;
  /** The person's name, or null. */
  recipientName: string | null;
  shopName: string;
  lotTitle: string;
  cards: number;
  lineCents: number;
  expiresAt: unknown;
  timeZone: string | null;
  saleId: string;
  saleTitle: string | null;
  saleAddress: string | null;
  /** A shopper hold is one the shopper placed themselves. */
  byShopper: boolean;
  frontendUrl: string;
}

export interface BuiltHoldEmail {
  subject: string;
  html: string;
  text: string;
}

/** Pure. Builds the subject, the HTML and the plain text for one email. */
export function buildHoldEmail(f: HoldEmailFacts): BuiltHoldEmail {
  const cards = `${formatCardCount(f.cards)} cards`;
  const price = formatCents(f.lineCents);
  const ends = formatHoldTime(f.expiresAt, f.timeZone);
  const name = f.recipientName && f.recipientName.trim() ? f.recipientName.trim() : 'there';
  const place = [f.saleTitle, f.saleAddress].filter((v): v is string => !!v && v.trim() !== '').join(', ');
  const link = `${f.frontendUrl.replace(/\/+$/, '')}/sales/${encodeURIComponent(f.saleId)}`;

  const shopH = escapeHtml(f.shopName);
  const lotH = escapeHtml(f.lotTitle);
  const nameH = escapeHtml(name);
  const placeH = escapeHtml(place);
  const endsH = escapeHtml(ends);

  let subject: string;
  let headline: string;
  let bodyHtml: string;
  let bodyText: string;
  let cta = 'See the sale';

  if (f.kind === 'CONFIRMATION') {
    subject = `Your hold at ${f.shopName}: ${cards}`;
    headline = `${cards} are set aside for you`;
    const pay = f.byShopper
      ? 'Pay at the register when you pick the cards up, in cash or by card.'
      : 'Pay the shop when you pick the cards up, in cash or by card. The shop may also send you a payment link.';
    const pickup = place ? `Pick up at ${place}.` : 'Ask the shop where to pick them up.';
    bodyHtml = `<p>Hi ${nameH},</p>
      <p>${shopH} is holding <strong>${escapeHtml(cards)}</strong> from <strong>${lotH}</strong> for you.</p>
      <ul>
        <li>Cards: ${escapeHtml(formatCardCount(f.cards))}</li>
        <li>Price: ${escapeHtml(price)} (the price is locked in, even if the shop changes the lot price)</li>
        ${ends ? `<li>Held until: ${endsH}</li>` : ''}
      </ul>
      <p>${escapeHtml(pay)} ${escapeHtml(pickup)}</p>
      <p>${ends ? 'After that time the cards go back on the shelf and anyone can buy them.' : 'When the hold ends, the cards go back on the shelf.'}</p>
      <p>The FindA.Sale Team</p>`;
    bodyText = [`Hi ${name},`, '', `${f.shopName} is holding ${cards} from ${f.lotTitle} for you.`, `Cards: ${formatCardCount(f.cards)}`, `Price: ${price} (locked in)`, ends ? `Held until: ${ends}` : '', '', `${pay} ${pickup}`, '', 'After that time the cards go back on the shelf.', '', 'The FindA.Sale Team', link].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  } else if (f.kind === 'REMINDER') {
    subject = `Your hold at ${f.shopName} ends soon`;
    headline = 'Your hold ends soon';
    bodyHtml = `<p>Hi ${nameH},</p>
      <p>Your hold of <strong>${escapeHtml(cards)}</strong> from <strong>${lotH}</strong> at ${shopH} ends ${ends ? `at <strong>${endsH}</strong>` : 'soon'}.</p>
      <p>To keep them, pay or pick them up before then. ${placeH ? `Pick up at ${placeH}.` : ''}</p>
      <p>If you no longer want them, you do not need to do anything. The cards go back on the shelf when the hold ends.</p>
      <p>The FindA.Sale Team</p>`;
    bodyText = [`Hi ${name},`, '', `Your hold of ${cards} from ${f.lotTitle} at ${f.shopName} ends ${ends ? `at ${ends}` : 'soon'}.`, `To keep them, pay or pick them up before then.${place ? ` Pick up at ${place}.` : ''}`, 'If you no longer want them, you do not need to do anything.', '', 'The FindA.Sale Team', link].join('\n');
  } else {
    const released = f.kind === 'ENDED_RELEASED';
    subject = `Your hold at ${f.shopName} has ended`;
    headline = 'Your hold has ended';
    const lead = released ? `${shopH} let go of your hold of <strong>${escapeHtml(cards)}</strong> from <strong>${lotH}</strong>.` : `Your hold of <strong>${escapeHtml(cards)}</strong> from <strong>${lotH}</strong> at ${shopH} has ended.`;
    const leadText = released ? `${f.shopName} let go of your hold of ${cards} from ${f.lotTitle}.` : `Your hold of ${cards} from ${f.lotTitle} at ${f.shopName} has ended.`;
    bodyHtml = `<p>Hi ${nameH},</p>
      <p>${lead}</p>
      <p>The cards went back to the lot. No payment was taken.</p>
      <p>If you still want them, check with the shop. They may be able to set them aside again if there are cards left.</p>
      <p>The FindA.Sale Team</p>`;
    bodyText = [`Hi ${name},`, '', leadText, 'The cards went back to the lot. No payment was taken.', 'If you still want them, check with the shop. They may be able to set them aside again if there are cards left.', '', 'The FindA.Sale Team', link].join('\n');
    cta = 'See the sale';
  }

  const html = buildEmail({
    preheader: escapeHtml(subject),
    headline: escapeHtml(headline),
    body: bodyHtml,
    ctaText: escapeHtml(cta),
    ctaUrl: link,
  });
  return { subject: sanitizeHeaderText(subject), html, text: bodyText };
}

/** The address and name for a hold, or null when there is none. A shopper hold uses the account email, an organizer hold the saved customerEmail. */
export async function resolveHoldRecipient(deps: Pick<HoldEmailDeps, 'db'>, hold: any): Promise<{ email: string; name: string | null } | null> {
  if (hold.shopperUserId) {
    const user = await deps.db.user.findUnique({ where: { id: hold.shopperUserId }, select: { email: true, name: true } });
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    return email ? { email, name: typeof user?.name === 'string' && user.name.trim() ? user.name.trim() : null } : null;
  }
  const email = typeof hold.customerEmail === 'string' ? hold.customerEmail.trim().toLowerCase() : '';
  return email ? { email, name: typeof hold.customerName === 'string' && hold.customerName.trim() ? hold.customerName.trim() : null } : null;
}

/** The pre-send gates (flag, address, suppression and domain policy, rail configured). Returns why not, or null when sending is allowed. */
export async function holdEmailBlocker(deps: HoldEmailDeps, hold: any): Promise<{ reason: HoldEmailSkipReason; recipient: { email: string; name: string | null } | null } | { reason: null; recipient: { email: string; name: string | null } }> {
  if (!isBulkLotsEnabled(deps.env)) return { reason: 'disabled', recipient: null };
  const recipient = await resolveHoldRecipient(deps, hold);
  if (!recipient) return { reason: 'no_address', recipient: null };
  if (await deps.isBlocked(recipient.email)) return { reason: 'blocked', recipient };
  if (!deps.railConfigured()) return { reason: 'not_configured', recipient };
  return { reason: null, recipient };
}

/** True when a send would be allowed. Used by the reminder sweep BEFORE it claims the hold. Never throws. */
export async function canEmailHold(deps: HoldEmailDeps, hold: any): Promise<boolean> {
  try {
    return (await holdEmailBlocker(deps, hold)).reason === null;
  } catch {
    return false;
  }
}

/** Sends one hold email. Never throws; every skip and every failure comes back as { sent: false, reason }. */
export async function sendHoldEmail(deps: HoldEmailDeps, kind: HoldEmailKind, hold: any): Promise<HoldEmailResult> {
  const holdId = String(hold?.id ?? '');
  try {
    const gate = await holdEmailBlocker(deps, hold);
    if (gate.reason !== null || !gate.recipient) return { sent: false, reason: gate.reason ?? 'no_address' };

    let facts: HoldEmailFacts;
    try {
      const [item, sale, organizer] = await Promise.all([
        deps.db.item.findUnique({ where: { id: hold.itemId }, select: { title: true } }),
        deps.db.sale.findUnique({ where: { id: hold.saleId }, select: { id: true, title: true, address: true, city: true, state: true } }),
        deps.db.organizer.findUnique({ where: { id: hold.organizerId }, select: { businessName: true, timezone: true } }),
      ]);
      const address = sale ? [sale.address, sale.city, sale.state].filter((v: unknown) => typeof v === 'string' && v.trim() !== '').join(', ') : '';
      facts = {
        kind,
        recipientName: gate.recipient.name,
        shopName: typeof organizer?.businessName === 'string' && organizer.businessName.trim() ? organizer.businessName.trim() : 'the shop',
        lotTitle: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : 'a bulk lot',
        cards: Number(hold.quantity) || 0,
        lineCents: Number(hold.lineCents) || 0,
        expiresAt: hold.expiresAt,
        timeZone: organizer?.timezone ?? null,
        saleId: String(hold.saleId),
        saleTitle: typeof sale?.title === 'string' ? sale.title : null,
        saleAddress: address || null,
        byShopper: !!hold.shopperUserId,
        frontendUrl: deps.frontendUrl,
      };
    } catch (err) {
      console.warn(`[bulkLotHoldEmail] could not load the details for hold ${holdId} (no email sent):`, err instanceof Error ? err.message : err);
      return { sent: false, reason: 'lookup_failed' };
    }

    const built = buildHoldEmail(facts);
    try {
      const res = await deps.send({ to: gate.recipient.email, subject: built.subject, html: built.html, text: built.text });
      if (res && typeof res === 'object' && res.sent === false) return { sent: false, reason: res.reason ?? 'suppressed' };
      return { sent: true };
    } catch (err) {
      console.warn(`[bulkLotHoldEmail] send failed for hold ${holdId} (${kind}):`, err instanceof Error ? err.message : err);
      try {
        deps.onError?.(err, { kind, holdId });
      } catch {
        // reporting must not throw
      }
      return { sent: false, reason: 'send_failed' };
    }
  } catch (err) {
    console.warn(`[bulkLotHoldEmail] unexpected failure for hold ${holdId} (${kind}):`, err instanceof Error ? err.message : err);
    return { sent: false, reason: 'send_failed' };
  }
}
