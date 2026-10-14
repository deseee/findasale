// ---------------------------------------------------------------------------------------------
// Sale location for OUTBOUND MESSAGES (email, SMS, push, in-app) (2026-10-13, Patrick-approved).
// Same rule as the public sale page (lib/saleLocationPrivacy.getSaleAddressGate):
//  - the street address goes out only to a real account holder (a User row; guest / email-only
//    subscribers count as not signed in), and only from the day before the sale starts (sale local time,
//    evaluated at SEND time);
//  - everyone else gets "City, ST 12345" plus a short line pointing to the sale page.
// Items: messages never list an item still inside an early-access / rarity / Legendary window.
// ---------------------------------------------------------------------------------------------
import { getSaleAddressGate, isItemEmbargoedForViewer } from './saleLocationPrivacy';

export interface MessageSaleLike {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  startDate: Date | string | null;
}

export interface MessageSaleLocation {
  /** True when the full street address is included in `line`. */
  visible: boolean;
  /** Ready-to-print location: "123 Main St, Springfield, MI 49000" or "Springfield, MI 49000". */
  line: string;
  /** City / state / zip only (never the street). */
  locality: string;
  /** Plain-text hint shown when the street is withheld ('' when nothing is withheld). */
  note: string;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "City, ST 12345" with no dangling separators when parts are missing. */
export function formatLocality(sale: { city?: string | null; state?: string | null; zip?: string | null }): string {
  const city = clean(sale.city);
  const stateZip = [clean(sale.state), clean(sale.zip)].filter(Boolean).join(' ');
  return [city, stateZip].filter(Boolean).join(', ');
}

/**
 * Location text for one recipient of one message.
 * @param timeZone   the organizer's IANA time zone (Organizer.timezone); null falls back to the default.
 * @param isAccountHolder true only when the recipient is a real User account.
 * @param now        the send time.
 */
export function messageSaleLocation(
  sale: MessageSaleLike,
  timeZone: string | null | undefined,
  isAccountHolder: boolean,
  now: Date = new Date()
): MessageSaleLocation {
  const locality = formatLocality(sale);
  const street = clean(sale.address);
  // Online-only / no street on file: nothing to withhold.
  if (!street) return { visible: true, line: locality, locality, note: '' };
  const gate = getSaleAddressGate({ startDate: sale.startDate }, timeZone, isAccountHolder, now);
  if (gate.visible) {
    return { visible: true, line: [street, locality].filter(Boolean).join(', '), locality, note: '' };
  }
  const note =
    gate.reason === 'NOT_YET'
      ? 'Full address on the sale page the day before it starts'
      : 'Sign in on the sale page to see the full address';
  return { visible: false, line: locality, locality, note };
}

/** Escaped HTML snippet for the withheld-address hint, linking to the sale page ('' when not needed). */
export function addressNoteHtml(loc: MessageSaleLocation, saleUrl: string, style = 'color:#C8552B; text-decoration:none;'): string {
  if (!loc.note) return '';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<a href="${esc(saleUrl)}" style="${style}">${esc(loc.note)}</a>`;
}

/** Recipient fields the item embargo check understands (anything missing = treated as anonymous). */
export interface MessageRecipient {
  huntPassActive?: boolean | null;
  huntPassExpiry?: Date | string | null;
  explorerRank?: string | null;
}

/** Drops items the recipient may not see yet. Pass null for an unknown / guest recipient. */
export function visibleItemsForRecipient<T>(items: T[], recipient: MessageRecipient | null | undefined, now: Date = new Date()): T[] {
  return (items || []).filter((it) => !isItemEmbargoedForViewer(it, recipient ?? null, now));
}
