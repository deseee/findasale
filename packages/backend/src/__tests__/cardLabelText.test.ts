/**
 * Card label text assembly (ADR-134 section 6.5, batch B6). Pure functions, no mocks needed.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
import {
  CARD_LABEL_NAME_MAX,
  buildCardLabelText,
  escapeHtml,
  formatLabelPrice,
  renderCardLabelTextHtml,
  truncateLabelName,
} from '../services/cardLabelText';

describe('cardLabelText', () => {
  it('graded card prints grader and grade, not the condition code, and never the cert number', () => {
    const t = buildCardLabelText(
      { cardName: 'Charizard', setCode: 'base1', collectorNumber: '4', finish: 'HOLO', conditionCode: null, grader: 'PSA', grade: '10' },
      1250
    );
    expect(t.conditionLine).toBe('PSA 10');
    expect(t.price).toBe('$1250.00');
    expect(t.setLine).toBe('BASE1 #4  HOLO');
    expect(JSON.stringify(t)).not.toMatch(/cert/i);
  });

  it('ungraded card prints the condition code', () => {
    const t = buildCardLabelText(
      { cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161', finish: 'NONFOIL', conditionCode: 'NM' },
      3.5
    );
    expect(t.conditionLine).toBe('NM');
    expect(t.price).toBe('$3.50');
    // Non-foil prints no finish text
    expect(t.setLine).toBe('LEA #161');
  });

  it('foil finish is shown', () => {
    const t = buildCardLabelText({ cardName: 'Sol Ring', setCode: 'cmm', collectorNumber: '400', finish: 'FOIL', conditionCode: 'LP' }, 2);
    expect(t.setLine).toBe('CMM #400  FOIL');
    expect(t.conditionLine).toBe('LP');
  });

  it('null price prints PRICE? and flags the label', () => {
    const t = buildCardLabelText({ cardName: 'Sol Ring' }, null);
    expect(t.price).toBe('PRICE?');
    expect(t.priceMissing).toBe(true);
    expect(formatLabelPrice(undefined)).toBe('PRICE?');
    expect(formatLabelPrice(Number.NaN)).toBe('PRICE?');
    expect(formatLabelPrice(-1)).toBe('PRICE?');
    expect(formatLabelPrice(0)).toBe('$0.00');
  });

  it('a 60 character name is truncated to the maximum with an ellipsis', () => {
    const long = 'A'.repeat(60);
    const t = buildCardLabelText({ cardName: long }, 1);
    expect(Array.from(t.name).length).toBe(CARD_LABEL_NAME_MAX);
    expect(t.name.endsWith('…')).toBe(true);
    expect(truncateLabelName('Short name')).toBe('Short name');
    expect(truncateLabelName('B'.repeat(CARD_LABEL_NAME_MAX))).toBe('B'.repeat(CARD_LABEL_NAME_MAX));
  });

  it('falls back to the item title when the card record has no name', () => {
    expect(buildCardLabelText({ cardName: null }, 1, 'Item Title').name).toBe('Item Title');
  });

  it('a name containing <script> is escaped in the HTML output', () => {
    const t = buildCardLabelText(
      { cardName: '<script>alert(1)</script>', setCode: '"><img src=x onerror=alert(2)>', collectorNumber: '<b>1</b>', conditionCode: '<i>NM</i>' },
      5
    );
    const html = renderCardLabelTextHtml(t);
    // After removing the label's own wrapper divs, no raw '<' may remain: every hostile tag is escaped.
    const withoutWrapper = html.replace(/<\/?div[^>]*>/g, '');
    expect(withoutWrapper).not.toContain('<');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // The wrapper markup itself is still real HTML
    expect(html.startsWith('<div class="label-text card-text">')).toBe(true);
  });

  it('control characters and newlines in a name cannot split the label onto two lines', () => {
    const t = buildCardLabelText({ cardName: 'Line one\nLine two\t\u0000x' }, 1);
    expect(t.name).toBe('Line one Line two x');
  });

  it('escapeHtml escapes the five HTML metacharacters and tolerates null', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
