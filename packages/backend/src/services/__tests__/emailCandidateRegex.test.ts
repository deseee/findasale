/**
 * Sentry FINDASALE-NODEJS-91 / -93 root cause (2026-11-01): the bare-text email regex was quadratic on a long
 * run of local-part characters with no "@". locations.levi.com serves an 855 KB page whose text holds a
 * 96,568-char run; one match() took 17.4 s locally and ~50 s on Railway, blocking the event loop so every
 * request in flight got a 503. These tests pin both the speed and the matches.
 */
import {
  createEmailCandidateRegex,
  extractEmailCandidatesFromText,
} from '../emailProvenance';

// The pre-fix pattern, kept here only to prove the new one finds exactly the same addresses on ordinary text.
const OLD = () => /[a-zA-Z0-9_%+\-]+(?:\.[a-zA-Z0-9_%+\-]+)*@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}/g;

const match = (re: RegExp, s: string) => s.match(re) || [];

describe('createEmailCandidateRegex', () => {
  it('finishes fast on a 100k-char run with no "@" (was ~17 s)', () => {
    const run = 'aB3_-%+'.repeat(15000); // 105,000 local-part characters, no "@"
    const text = `header ${run} footer contact: jane@example.org`;
    const t0 = Date.now();
    const found = match(createEmailCandidateRegex(), text);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(found).toEqual(['jane@example.org']);
  });

  it('finishes fast on a long dotted run and on many "@" with no TLD', () => {
    const dotted = Array.from({ length: 20000 }, (_, i) => `seg${i}`).join('.');
    const ats = 'abc@def'.repeat(15000);
    const t0 = Date.now();
    expect(match(createEmailCandidateRegex(), dotted)).toEqual([]);
    match(createEmailCandidateRegex(), ats);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  const ordinary = [
    'Email us at info@acme-auctions.com or call.',
    'jane.doe@mail.example.co.uk, bob+sales@example.org; x_y%z@sub.domain.io',
    '209.232.2709hopechestthrift@hospiceheart.org',
    'Contact:-owner@shop.net (owner)',
    'a@b.co two.dots..x@site.com .lead@site.com',
    'trailing glue: hello@example.comCopyright 2026',
    'no emails here at all, just @handles and a@b',
  ];

  it.each(ordinary)('matches exactly what the old pattern matched: %s', (s) => {
    expect(match(createEmailCandidateRegex(), s)).toEqual(match(OLD(), s));
  });

  it('does not invent a suffix match from an over-long local part', () => {
    const local = 'x'.repeat(70);
    expect(match(createEmailCandidateRegex(), `${local}@example.com`)).toEqual([]);
  });

  it('returns a fresh /g regex each call (no shared lastIndex)', () => {
    const a = createEmailCandidateRegex();
    const b = createEmailCandidateRegex();
    expect(a).not.toBe(b);
    expect(a.flags).toContain('g');
  });
});

describe('extractEmailCandidatesFromText', () => {
  it('still extracts and sanitizes candidates', () => {
    expect(extractEmailCandidatesFromText('Reach [Email us](mailto:hello@example.com) or sales@example.com')).toEqual([
      'hello@example.com',
      'sales@example.com',
    ]);
  });

  it('handles a pathological page body quickly', () => {
    const body = `${'Q'.repeat(96568)} visit us ${'z9'.repeat(40000)}`;
    const t0 = Date.now();
    expect(extractEmailCandidatesFromText(body)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
