/**
 * QR destination URL builder tests (2026-09-29): printed item QR codes must carry a utm_source that
 * starts with "qr" so the item page shows the scan prompt. NOT EXECUTED when written; CI is the first run.
 */
import { buildQrUrl, buildItemQrUrl, QR_SOURCE_ITEM_LABEL, QR_SOURCE_KIT } from '../utils/qrUrl';

describe('buildItemQrUrl', () => {
  it('stamps item label QR codes with qr_item_label', () => {
    expect(buildItemQrUrl('https://finda.sale', 'abc123', QR_SOURCE_ITEM_LABEL)).toBe(
      'https://finda.sale/items/abc123?utm_source=qr_item_label'
    );
  });
  it('stamps print kit item QR codes with qr_kit', () => {
    expect(buildItemQrUrl('https://finda.sale', 'abc123', QR_SOURCE_KIT)).toBe('https://finda.sale/items/abc123?utm_source=qr_kit');
  });
  it('both sources satisfy the item page QR check (starts with "qr")', () => {
    expect(QR_SOURCE_ITEM_LABEL.toLowerCase().startsWith('qr')).toBe(true);
    expect(QR_SOURCE_KIT.toLowerCase().startsWith('qr')).toBe(true);
  });
  it('tolerates a trailing slash on the base URL and encodes the id segment', () => {
    expect(buildItemQrUrl('http://localhost:3000/', 'a b/c', QR_SOURCE_KIT)).toBe('http://localhost:3000/items/a%20b%2Fc?utm_source=qr_kit');
  });
});

describe('buildQrUrl', () => {
  it('appends with & when the URL already has a query string', () => {
    expect(buildQrUrl('https://finda.sale', '/sales/s1?ref=x', 'qr_kit')).toBe('https://finda.sale/sales/s1?ref=x&utm_source=qr_kit');
  });
  it('replaces an existing utm_source instead of duplicating it', () => {
    expect(buildQrUrl('https://finda.sale', '/items/i1?utm_source=old', 'qr_kit')).toBe('https://finda.sale/items/i1?utm_source=qr_kit');
  });
  it('falls back to a well-formed URL when the base is not absolute', () => {
    expect(buildQrUrl('finda.sale', '/items/i1', 'qr_kit')).toBe('finda.sale/items/i1?utm_source=qr_kit');
    expect(buildQrUrl('finda.sale', '/items/i1?x=1', 'qr_kit')).toBe('finda.sale/items/i1?x=1&utm_source=qr_kit');
  });
});

describe('printed item label URL length', () => {
  // A longer URL means a denser QR code. Keep the printed item URL short enough that a small label
  // still scans: under 100 characters for the production origin with a cuid or uuid item id.
  const origin = 'https://finda.sale';
  const cuid = 'cmabcdefghijklmnopqrstuvw'; // 25 chars
  const uuid = '123e4567-e89b-12d3-a456-426614174000'; // 36 chars
  it.each([
    ['qr_item_label', QR_SOURCE_ITEM_LABEL],
    ['qr_kit', QR_SOURCE_KIT],
  ])('stays under 100 characters with %s', (_name, source) => {
    expect(buildItemQrUrl(origin, cuid, source).length).toBeLessThan(100);
    expect(buildItemQrUrl(origin, uuid, source).length).toBeLessThan(100);
  });
});
