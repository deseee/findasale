/**
 * ADR-139 recruit channel: signed confirm / unsubscribe tokens. Pure crypto, no DB, no network.
 */
import { hashConsentIp, signRecruitToken, verifyRecruitToken } from '../services/recruit/recruitTokens';

const SECRET = 'x'.repeat(48);

describe('recruit tokens', () => {
  it('a valid signature verifies', () => {
    const sig = signRecruitToken('lead_abc', 'unsub', SECRET);
    expect(verifyRecruitToken('lead_abc', sig, 'unsub', SECRET)).toBe(true);
  });

  it('an unsubscribe signature cannot be used as a confirm signature (and vice versa)', () => {
    const unsub = signRecruitToken('lead_abc', 'unsub', SECRET);
    const confirm = signRecruitToken('lead_abc', 'confirm', SECRET);
    expect(verifyRecruitToken('lead_abc', unsub, 'confirm', SECRET)).toBe(false);
    expect(verifyRecruitToken('lead_abc', confirm, 'unsub', SECRET)).toBe(false);
  });

  it('a one-character change fails', () => {
    const sig = signRecruitToken('lead_abc', 'unsub', SECRET);
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyRecruitToken('lead_abc', flipped, 'unsub', SECRET)).toBe(false);
    expect(verifyRecruitToken('lead_abd', sig, 'unsub', SECRET)).toBe(false);
  });

  it('different lengths do not throw and fail', () => {
    const sig = signRecruitToken('lead_abc', 'unsub', SECRET);
    expect(() => verifyRecruitToken('lead_abc', sig + 'x', 'unsub', SECRET)).not.toThrow();
    expect(verifyRecruitToken('lead_abc', sig + 'x', 'unsub', SECRET)).toBe(false);
    expect(verifyRecruitToken('lead_abc', 'a', 'unsub', SECRET)).toBe(false);
    expect(verifyRecruitToken('lead_abc', '', 'unsub', SECRET)).toBe(false);
  });

  it('a different secret fails, and a short or missing secret never verifies', () => {
    const sig = signRecruitToken('lead_abc', 'unsub', SECRET);
    expect(verifyRecruitToken('lead_abc', sig, 'unsub', 'y'.repeat(48))).toBe(false);
    expect(verifyRecruitToken('lead_abc', sig, 'unsub', 'short')).toBe(false);
    expect(() => signRecruitToken('lead_abc', 'unsub', 'short')).toThrow();
  });

  it('consent IP hash never contains the raw IP', () => {
    const h = hashConsentIp('203.0.113.9', SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('203.0.113.9');
    expect(hashConsentIp(undefined, SECRET)).toBeNull();
  });
});
