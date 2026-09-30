/**
 * HTML injection in mass emails (2026-09-29, P1-2): utils/htmlEscape.ts, utils/logMask.ts and the escaping in
 * services/emailTemplateService.ts. Pure functions, no mocks needed.
 */
import { escapeHtml, safeHttpsUrl, safeHttpUrl, sanitizeHeaderText } from '../utils/htmlEscape';
import { maskEmail, maskPhoneDisplay, redactPhonesInText } from '../utils/logMask';
import {
  buildCTAButton,
  buildSaleCardModule,
  buildItemCardModule,
  buildItemCard,
  buildNewSaleAlertEmail,
  buildSaleDayReminderEmail,
  buildOrganizerWeeklyDigestEmail,
  buildSmartMatchEmail,
} from '../services/emailTemplateService';

const EVIL = '"><script>alert(1)</script><img src=x onerror=alert(2)>';

/** No element in the HTML carries an event handler attribute or a script tag we did not write ourselves. */
const assertInert = (html: string) => {
  expect(html).not.toContain('<script');
  expect(html).not.toMatch(/<img[^>]*\sonerror=/i);
  expect(html).not.toContain('<img src=x');
  expect(html).not.toMatch(/href="javascript:/i);
};

describe('escapeHtml', () => {
  it('escapes markup characters in text and attribute contexts', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    expect(escapeHtml('`x`')).toBe('&#96;x&#96;');
  });
  it('handles null, undefined, numbers and strips control characters', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml('a\u0000b\u0007c')).toBe('abc');
  });
  it('is not double-escaping safe text', () => {
    expect(escapeHtml('Oak Street Sale')).toBe('Oak Street Sale');
  });
});

describe('safeHttpsUrl / safeHttpUrl', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://insecure.example/a.jpg',
    '//cdn.example.com/a.jpg',
    'https://user:pass@example.com/a.jpg',
    'https://example.com/a.jpg" onerror="alert(1)',
    'https://exa mple.com/a.jpg',
    'https://example.com/\u0000a.jpg',
    'not a url',
    '',
    null,
    undefined,
    42,
    `https://example.com/${'a'.repeat(3000)}`,
  ])('rejects %p', (v) => expect(safeHttpsUrl(v as any)).toBe(''));

  it('accepts and normalizes a plain https URL', () => {
    expect(safeHttpsUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(safeHttpsUrl('  https://cdn.example.com/a b.jpg'.replace(' b', '%20b'))).toBe('https://cdn.example.com/a%20b.jpg');
  });
  it('safeHttpUrl also allows http but nothing else', () => {
    expect(safeHttpUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
  });
});

describe('sanitizeHeaderText', () => {
  it('removes CR/LF and control characters and caps the length', () => {
    expect(sanitizeHeaderText('Sale\r\nBcc: evil@example.com')).not.toMatch(/[\r\n]/);
    expect(sanitizeHeaderText('x'.repeat(500), 50)).toHaveLength(50);
    expect(sanitizeHeaderText(null)).toBe('');
  });
});

describe('logMask', () => {
  it('masks emails and phones and redacts numbers inside free text', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
    expect(maskEmail(undefined)).toBe('unknown');
    expect(maskEmail('nope')).toBe('***');
    expect(maskPhoneDisplay('+12695550142')).toBe('***-0142');
    expect(maskPhoneDisplay(null)).toBeNull();
    expect(maskPhoneDisplay('12')).toBeNull();
    const red = redactPhonesInText('Twilio: number +1 (269) 555-0142 is invalid');
    expect(red).not.toContain('5550142');
    expect(red).toContain('0142');
  });
});

describe('email templates escape untrusted text', () => {
  it('buildCTAButton escapes the URL in both branches', () => {
    const html = buildCTAButton('Go', 'https://finda.sale/x?a=1&b="><script>alert(1)</script>');
    assertInert(html);
    expect(html).toContain('a=1&amp;b=');
  });

  it('buildSaleCardModule escapes title, address, dates, badges, hours, CTA and validates the photo', () => {
    const html = buildSaleCardModule({
      title: EVIL,
      dateRange: EVIL,
      address: EVIL,
      photoUrl: 'https://x.example/a.jpg" onerror="alert(1)',
      ctaUrl: `https://finda.sale/sales/1${EVIL}`,
      ctaLabel: EVIL,
      saleType: EVIL,
      hours: EVIL,
      statusLabel: EVIL,
    });
    assertInert(html);
    expect(html).not.toContain('<img'); // hostile photo URL rejected: placeholder shown instead
    expect(html).toContain('&lt;script&gt;');
  });

  it('buildSaleCardModule keeps a valid https photo', () => {
    const html = buildSaleCardModule({ title: 'A', dateRange: 'B', address: 'C', photoUrl: 'https://cdn.example.com/a.jpg', ctaUrl: 'https://finda.sale/s/1' });
    expect(html).toContain('<img src="https://cdn.example.com/a.jpg"');
  });

  it('buildItemCardModule and the legacy buildItemCard escape text and reject javascript: photos', () => {
    assertInert(buildItemCardModule({ title: EVIL, price: 5, category: EVIL, photoUrl: 'javascript:alert(1)', ctaUrl: `https://finda.sale/i/1${EVIL}` }));
    assertInert(buildItemCard({ title: EVIL, price: 500, category: EVIL, photoUrl: 'javascript:alert(1)', url: `https://finda.sale/i/1${EVIL}` } as any));
  });

  it('buildNewSaleAlertEmail escapes the organizer name, sale, featured items, referral and unsubscribe links, and preheader', () => {
    const html = buildNewSaleAlertEmail({
      organizerName: EVIL,
      sale: { title: EVIL, dateRange: EVIL, address: EVIL, saleUrl: `https://finda.sale/s/1${EVIL}`, hours: EVIL },
      featuredItems: [{ title: EVIL, price: 3, itemUrl: `https://finda.sale/i/1${EVIL}`, category: EVIL }],
      referralUrl: `https://finda.sale/r${EVIL}`,
      unsubUrl: `https://finda.sale/u${EVIL}`,
    });
    assertInert(html);
  });

  it('buildSaleDayReminderEmail escapes everything and says Today or Tomorrow', () => {
    const base = { saleName: EVIL, saleDate: EVIL, saleTime: EVIL, saleAddress: EVIL, organizerNotes: EVIL, ctaUrl: `https://finda.sale/s/1${EVIL}`, unsubUrl: `https://finda.sale/u${EVIL}` };
    const html = buildSaleDayReminderEmail({ ...base, mapUrl: 'javascript:alert(1)', reminderType: 'one-day', dayWord: 'today', savedItems: [{ title: EVIL, price: 1, itemUrl: `https://finda.sale/i${EVIL}` }] });
    assertInert(html);
    expect(html).toContain('>Today<');
    expect(html).not.toContain('>Map');
    expect(buildSaleDayReminderEmail({ ...base, reminderType: 'one-day' })).toContain('>Tomorrow<');
    expect(buildSaleDayReminderEmail({ ...base, reminderType: 'two-hours' })).toContain('>Starting in 2 hours<');
    expect(buildSaleDayReminderEmail({ ...base, saleName: 'Oak', saleDate: 'x', saleTime: 'y', saleAddress: 'z', organizerNotes: undefined, reminderType: 'one-day', mapUrl: 'https://maps.example.com/?q=1' })).toContain('href="https://maps.example.com/?q=1"');
  });

  it('buildOrganizerWeeklyDigestEmail escapes the business name, week label and preheader', () => {
    const html = buildOrganizerWeeklyDigestEmail({
      businessName: EVIL,
      weekLabel: 'Week',
      metrics: [{ icon: 'i', stat: '5', label: 'views', context: 'c' }],
      upcomingSale: { title: EVIL, dateRange: EVIL, address: EVIL, saleUrl: `https://finda.sale/s${EVIL}` },
      dashboardUrl: `https://finda.sale/d${EVIL}`,
    });
    assertInert(html);
  });

  it('buildSmartMatchEmail escapes the item, sale, category and links', () => {
    const html = buildSmartMatchEmail({
      matchCategory: EVIL,
      item: { title: EVIL, price: 2, itemUrl: `https://finda.sale/i${EVIL}`, category: EVIL },
      sale: { title: EVIL, dateRange: EVIL, address: EVIL, saleUrl: `https://finda.sale/s${EVIL}` },
      updateInterestsUrl: `https://finda.sale/x${EVIL}`,
      unsubUrl: `https://finda.sale/u${EVIL}`,
    });
    assertInert(html);
  });
});
