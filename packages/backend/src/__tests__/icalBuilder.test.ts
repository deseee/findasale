/**
 * RFC 5545 output checks for GET /api/sales/:id/calendar.ics (utils/icalBuilder.ts).
 * NOTE: written 2026-09-29 without the ability to run jest in the authoring environment.
 */
import { buildSaleIcs, foldIcsLine, icsEscapeText, icsDateTime, icsParamValue } from '../utils/icalBuilder';
import { canRemoveWatermark } from '../utils/watermarkPolicy';

const base = {
  id: 'sale123',
  title: 'Moving Sale; Everything, Must Go',
  description: 'Line one\nLine two, with comma',
  address: '219 E Michigan Ave',
  city: 'Paw Paw',
  state: 'MI',
  zip: '49079',
  lat: 42.2178,
  lng: -85.8919,
  startDate: new Date('2026-10-03T13:00:00.000Z'),
  endDate: new Date('2026-10-03T21:00:00.000Z'),
  updatedAt: new Date('2026-09-29T12:00:00.000Z'),
  organizerName: 'Smith, Jones & Co',
};
const opts = { frontendUrl: 'https://finda.sale', includeWatermark: true, now: new Date('2026-09-29T15:30:45.123Z') };

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildSaleIcs', () => {
  const ics = buildSaleIcs(base, opts);

  it('uses CRLF everywhere and ends with a trailing CRLF', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('has the required calendar and event properties', () => {
    const t = unfold(ics);
    expect(t).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(t).toContain('PRODID:-//FindA.Sale//FindA.Sale Sales//EN');
    expect(t).toContain('UID:sale-sale123@finda.sale');
    expect(t).toContain('DTSTAMP:20260929T153045Z');
    expect(t).toContain('DTSTART:20261003T130000Z');
    expect(t).toContain('DTEND:20261003T210000Z');
    expect(t).toContain('LAST-MODIFIED:20260929T120000Z');
    expect(t).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n');
  });

  it('escapes TEXT values (backslash, semicolon, comma, newline)', () => {
    const t = unfold(ics);
    expect(t).toContain('SUMMARY:Moving Sale\\; Everything\\, Must Go');
    expect(t).toContain('Line one\\nLine two\\, with comma');
    expect(t).toContain('LOCATION:219 E Michigan Ave\\, Paw Paw\\, MI 49079');
  });

  it('quotes the ORGANIZER common name instead of TEXT-escaping it', () => {
    expect(unfold(ics)).toContain('ORGANIZER;CN="Smith, Jones & Co":mailto:noreply@finda.sale');
  });

  it('emits GEO with a literal semicolon separator', () => {
    expect(unfold(ics)).toContain('GEO:42.217800;-85.891900');
  });

  it('never produces a physical line longer than 75 octets', () => {
    const long = buildSaleIcs({ ...base, description: 'word '.repeat(200) + 'ünïcödé '.repeat(40) }, opts);
    long.split('\r\n').forEach((line) => expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75));
  });

  it('keeps DTEND after DTSTART even when the sale has bad dates', () => {
    const t = buildSaleIcs({ ...base, endDate: base.startDate }, opts);
    expect(t).toContain('DTEND:20261003T140000Z');
  });

  it('honors the TEAMS watermark policy (#27b)', () => {
    const withMark = unfold(buildSaleIcs(base, { ...opts, includeWatermark: true }));
    const withoutMark = unfold(buildSaleIcs(base, { ...opts, includeWatermark: false }));
    expect(withMark).toContain('Shared via FindA.Sale: finda.sale');
    expect(withoutMark).not.toContain('Shared via FindA.Sale');
    expect(canRemoveWatermark({ subscriptionTier: 'TEAMS', removeWatermarkEnabled: true } as any)).toBe(true);
    expect(canRemoveWatermark({ subscriptionTier: 'PRO', removeWatermarkEnabled: true } as any)).toBe(false);
    expect(canRemoveWatermark({ subscriptionTier: 'TEAMS', removeWatermarkEnabled: false } as any)).toBe(false);
  });

  it('omits LOCATION and GEO for online-only sales with no address', () => {
    const t = unfold(buildSaleIcs({ ...base, address: '', city: '', state: '', zip: '', lat: null, lng: null }, opts));
    expect(t).not.toContain('LOCATION:');
    expect(t).not.toContain('GEO:');
  });
});

describe('helpers', () => {
  it('folds without splitting multi-byte characters', () => {
    const folded = foldIcsLine('X:' + 'é'.repeat(100));
    folded.split('\r\n').forEach((l) => expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75));
    expect(folded.replace(/\r\n /g, '')).toBe('X:' + 'é'.repeat(100));
  });
  it('escapes and formats', () => {
    expect(icsEscapeText('a\\b;c,d\r\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    expect(icsDateTime(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });
});

describe('CR/LF and parameter injection (P2, 2026-09-29)', () => {
  const evilLines = (ics: string) => unfold(ics).split('\r\n');
  const hasForgedLine = (ics: string) => evilLines(ics).some((l) => /^(ATTENDEE|X-EVIL)/.test(l));

  it('an organizer name with CR/LF cannot start a forged property line or break out of the CN quotes', () => {
    const payloads = [
      'Bob"\r\nATTENDEE:mailto:victim@example.com',
      'Bob\nX-EVIL:1',
      'Bob\rX-EVIL:1',
      'Bob\u2028X-EVIL:1',
      'Bob\u2029X-EVIL:1',
      'Bob\u0085X-EVIL:1',
      'Bob\tX-EVIL:1',
      '"; X-EVIL=1; ',
    ];
    for (const organizerName of payloads) {
      const out = buildSaleIcs({ ...base, organizerName }, opts);
      expect(hasForgedLine(out)).toBe(false);
      const line = evilLines(out).find((l) => l.startsWith('ORGANIZER;CN='))!;
      expect(line).toMatch(/^ORGANIZER;CN="[^"\r\n]*":mailto:noreply@finda\.sale$/);
      expect(out).not.toMatch(/[\u2028\u2029\u0085]/);
    }
  });

  it('title, description, address and city with line breaks stay on one logical line each', () => {
    const nasty = 'evil\r\nATTENDEE:mailto:a@b.c\u2028X-EVIL:1\u0085X-EVIL:2\tX-EVIL:3';
    const out = buildSaleIcs({ ...base, title: nasty, description: nasty, address: nasty, city: nasty, state: nasty, zip: nasty }, opts);
    expect(hasForgedLine(out)).toBe(false);
    expect(out).not.toMatch(/[\u2028\u2029\u0085]/);
    // every physical line is either a known property line or a fold continuation
    for (const l of out.split('\r\n').filter(Boolean)) {
      expect(l).toMatch(/^( |[A-Z][A-Z-]*(;[^:]*)?:)/);
    }
    const text = unfold(out);
    expect(text).toContain('SUMMARY:evil\\nATTENDEE');
  });

  it('a hostile sale id or frontend URL cannot inject lines through UID or URL', () => {
    const out = buildSaleIcs({ ...base, id: 'abc\r\nX-EVIL:1' }, { ...opts, frontendUrl: 'https://finda.sale\r\nX-EVIL:2' });
    expect(hasForgedLine(out)).toBe(false);
    expect(unfold(out)).toContain('UID:sale-abcX-EVIL:1@finda.sale');
    expect(evilLines(out).filter((l) => l.startsWith('URL:'))).toHaveLength(1);
  });

  it('icsParamValue removes quotes, controls and line breaks, collapses whitespace, caps length, falls back', () => {
    expect(icsParamValue('  A \t\r\n B "quoted" ')).toBe('A B quoted');
    expect(icsParamValue('\r\n')).toBe('FindA.Sale');
    expect(icsParamValue(null)).toBe('FindA.Sale');
    expect(icsParamValue('x'.repeat(300))).toHaveLength(100);
    expect(icsParamValue('Smith, Jones & Co; ok: fine')).toBe('Smith, Jones & Co; ok: fine');
  });

  it('icsEscapeText turns every line-break form into a literal \\n and tabs into spaces', () => {
    expect(icsEscapeText('a\r\nb\rc\nd\u2028e\u2029f\u0085g')).toBe('a\\nb\\nc\\nd\\ne\\nf\\ng');
    expect(icsEscapeText('a\tb')).toBe('a b');
  });
});
