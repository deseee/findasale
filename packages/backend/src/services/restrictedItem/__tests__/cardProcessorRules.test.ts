/** Per-processor card rule table (2026-11-06). */
import { blockedClassesFor, CARD_PROCESSOR_BLOCKED_CLASSES, isClassBlockedFor } from '../cardProcessorRules';
import { RESTRICTED_CLASSES } from '../restrictedItemClassifier';

describe('card processor rule table', () => {
  it('FINIX blocks all five restricted classes', () => {
    expect([...CARD_PROCESSOR_BLOCKED_CLASSES.FINIX].sort()).toEqual([...RESTRICTED_CLASSES].sort());
    for (const c of RESTRICTED_CLASSES) expect(isClassBlockedFor('FINIX', c)).toBe(true);
  });

  it('SQUARE blocks nothing (unchanged behavior; weapon-adjacent classes pending a decision)', () => {
    expect(CARD_PROCESSOR_BLOCKED_CLASSES.SQUARE).toEqual([]);
    for (const c of RESTRICTED_CLASSES) expect(isClassBlockedFor('SQUARE', c)).toBe(false);
  });

  it('NONE is never blocked', () => {
    expect(isClassBlockedFor('FINIX', 'NONE')).toBe(false);
    expect(isClassBlockedFor('SOMETHING_NEW', 'NONE')).toBe(false);
  });

  it('an unknown processor fails closed (every restricted class blocked)', () => {
    expect(blockedClassesFor('STRIPE')).toEqual(RESTRICTED_CLASSES);
    expect(isClassBlockedFor('finix', 'JEWELRY')).toBe(true); // case-sensitive: lower-case is unknown -> closed
  });
});
