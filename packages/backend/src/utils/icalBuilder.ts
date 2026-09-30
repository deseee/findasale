/**
 * RFC 5545 iCalendar builder for a single FindA.Sale sale (GET /api/sales/:id/calendar.ics).
 *
 * Guarantees (each is unit tested in __tests__/icalBuilder.test.ts):
 *   - Every content line ends in CRLF, including the last one
 *   - Lines longer than 75 octets are folded (CRLF + single space), never splitting a UTF-8 character
 *   - TEXT values escape backslash, semicolon, comma and newlines (RFC 5545 section 3.3.11)
 *   - ORGANIZER common name is a quoted parameter value (commas/colons allowed), not TEXT-escaped
 *   - DTSTART/DTEND/DTSTAMP/LAST-MODIFIED are UTC ("Z" form), so no VTIMEZONE is needed and every
 *     calendar app converts to the viewer's local zone; DTEND is always after DTSTART
 *   - Stable UID (sale-<id>@finda.sale) so re-downloading updates the same event
 *   - TEAMS "remove watermark" policy (#27b): the "Shared via FindA.Sale" footer is included unless the
 *     caller passes includeWatermark=false (decided with utils/watermarkPolicy.canRemoveWatermark)
 */

export interface SaleIcsInput {
  id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  startDate: Date;
  endDate: Date;
  updatedAt?: Date | null;
  organizerName?: string | null;
}

export interface BuildSaleIcsOptions {
  frontendUrl: string;
  includeWatermark: boolean;
  now?: Date;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Every character that some parser treats as a line break: CR, LF, and the Unicode line separators
 * U+2028, U+2029 and U+0085 (NEL). Python's splitlines() and several calendar importers split on the
 * Unicode forms, so a value containing one could start a forged property line even though the CRLF
 * check passes.
 */
const LINE_BREAKS = /\r\n|[\r\n\u2028\u2029\u0085]/g;
/** Everything that must never survive inside a single-line value (parameter values, UID, URL): CR, LF, tab, NEL, U+2028/9, other C0 controls, DEL. */
// eslint-disable-next-line no-control-regex
const SINGLE_LINE_UNSAFE = /[\x00-\x1F\x7F\u0085\u2028\u2029]/g;

/** RFC 5545 TEXT escaping. Line breaks become the two characters "\n" (never a real line break); tabs become a space. */
export function icsEscapeText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\t/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(LINE_BREAKS, '\\n');
}

/**
 * A parameter value (ORGANIZER CN). Quoted-string parameter values cannot hold a double quote or any
 * control character, so those are removed: a CN of `x"\r\nATTENDEE:mailto:a@b` cannot break out of the
 * quotes or start a new line. Whitespace runs collapse to one space; length is capped.
 */
export function icsParamValue(value: string | null | undefined, fallback = 'FindA.Sale'): string {
  const v = (value ?? '')
    .replace(SINGLE_LINE_UNSAFE, ' ')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
  return v || fallback;
}

/** A value spliced into a UID or URL line: no control character, line break or whitespace at all. */
function icsSingleLineToken(value: string | null | undefined): string {
  return (value ?? '').replace(SINGLE_LINE_UNSAFE, '').replace(/\s+/g, '');
}

/** Format a Date as UTC basic format: YYYYMMDDTHHMMSSZ. */
export function icsDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Fold a content line to at most 75 octets per physical line (RFC 5545 section 3.1). */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // First physical line may hold 75 octets; continuation lines hold 74 (leading space counts).
  let limit = 75;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      limit = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

export function buildSaleIcs(sale: SaleIcsInput, opts: BuildSaleIcsOptions): string {
  const now = opts.now ?? new Date();
  const safeId = icsSingleLineToken(sale.id);
  const saleUrl = `${icsSingleLineToken(opts.frontendUrl)}/sales/${safeId}`;

  const start = new Date(sale.startDate);
  let end = new Date(sale.endDate);
  if (!(end.getTime() > start.getTime())) {
    end = new Date(start.getTime() + 60 * 60 * 1000); // DTEND must be after DTSTART
  }

  const cityStateZip = [sale.city, [sale.state, sale.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const location = [sale.address, cityStateZip].filter(Boolean).join(', ');

  const descriptionParts: string[] = [];
  if (sale.description && sale.description.trim()) descriptionParts.push(sale.description.trim());
  descriptionParts.push(`View items online: ${saleUrl}`);
  if (opts.includeWatermark) descriptionParts.push('Shared via FindA.Sale: finda.sale');
  const description = descriptionParts.map((p) => icsEscapeText(p)).join('\\n\\n');

  // ORGANIZER CN is a parameter value: quote it, drop characters that cannot appear inside quotes.
  const cn = icsParamValue(sale.organizerName);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FindA.Sale//FindA.Sale Sales//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:sale-${safeId}@finda.sale`,
    `DTSTAMP:${icsDateTime(now)}`,
    `DTSTART:${icsDateTime(start)}`,
    `DTEND:${icsDateTime(end)}`,
  ];
  if (sale.updatedAt) lines.push(`LAST-MODIFIED:${icsDateTime(new Date(sale.updatedAt))}`);
  lines.push(
    `SUMMARY:${icsEscapeText(sale.title)}`,
    `DESCRIPTION:${description}`,
  );
  if (location) lines.push(`LOCATION:${icsEscapeText(location)}`);
  if (typeof sale.lat === 'number' && typeof sale.lng === 'number' && Number.isFinite(sale.lat) && Number.isFinite(sale.lng)) {
    lines.push(`GEO:${sale.lat.toFixed(6)};${sale.lng.toFixed(6)}`); // GEO uses a literal semicolon separator
  }
  lines.push(
    `URL:${saleUrl}`,
    `ORGANIZER;CN="${cn}":mailto:noreply@finda.sale`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscapeText(`${sale.title} starts in 1 hour`)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
