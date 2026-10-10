import { isRelevantComp, meaningfulTokens } from '../compRelevance';

describe('compRelevance', () => {
  it('ignores stop words, format words and 4-digit years', () => {
    expect([...meaningfulTokens('The Vinyl LP Record Album 1978 and Sweet Maya')].sort()).toEqual(['maya', 'sweet']);
  });

  it('matches on a shared meaningful token', () => {
    expect(isRelevantComp('Sweet Maya LP', 'Sweet Maya Vinyl Record')).toBe(true);
  });

  it('matches on the artist when the title differs', () => {
    expect(isRelevantComp('Hornsby Live Vinyl', 'The Way It Is', 'Bruce Hornsby')).toBe(true);
  });

  it('does not match on format words or years alone', () => {
    expect(isRelevantComp('Vinyl Record Album 1978', 'Sweet Maya LP 1978')).toBe(false);
  });

  it('handles empty input', () => {
    expect(isRelevantComp('', 'Sweet Maya')).toBe(false);
    expect(isRelevantComp('Sweet Maya', null, null)).toBe(false);
  });
});
