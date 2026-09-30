import { decodeHtmlEntities } from '../utils/htmlEntities';

describe('decodeHtmlEntities', () => {
  it('decodes common entities in a single pass', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('Caf&#233; &#x41;')).toBe('Caf\u00e9 A');
    expect(decodeHtmlEntities('say &quot;hi&quot; &apos;there&apos;')).toBe('say "hi" \'there\'');
  });

  it('does not double-decode: &amp;lt; becomes the literal text &lt;, never <', () => {
    expect(decodeHtmlEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
  });

  it('an encoded script payload can never come out as markup', () => {
    for (const payload of ['&lt;script&gt;alert(1)&lt;/script&gt;', '&#60;script&#62;alert(1)&#60;/script&#62;', '&#x3c;img src=x onerror=alert(1)&#x3e;', '&lt;script src=//evil']) {
      const out = decodeHtmlEntities(payload);
      expect(out).not.toMatch(/[<>]/);
      expect(out).not.toMatch(/<script/i);
    }
    expect(decodeHtmlEntities('&lt;script&gt;x&lt;/script&gt;')).toBe('x');
  });

  it('strips raw tags and an unterminated tag tail, and drops control-character entities', () => {
    expect(decodeHtmlEntities('<b>Lamp</b>')).toBe('Lamp');
    expect(decodeHtmlEntities('Lamp <script src=x')).toBe('Lamp');
    expect(decodeHtmlEntities('a&#0;b&#8;c')).toBe('abc');
    expect(decodeHtmlEntities('  padded  ')).toBe('padded');
  });

  it('leaves unknown entities and surrogate / out-of-range code points out', () => {
    expect(decodeHtmlEntities('&bogus; &#xD800; &#1114112;')).toBe('&bogus;');
  });
});
