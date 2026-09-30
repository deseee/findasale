/**
 * /ai-feedback prototype-pollution regression (P0, 2026-09-29): field/action are allowlisted and the
 * stats live in a Map, so user-supplied keys can never reach Object.prototype.
 */
jest.mock('../lib/aiCostTracker', () => ({}));
jest.mock('../services/imageMatchService', () => ({}));
jest.mock('../services/ebayImageSearchService', () => ({}));
jest.mock('../services/pricingEngine', () => ({}));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({}));

import {
  recordAIFeedback,
  getAIFeedbackStats,
  isAIFeedbackField,
  isAIFeedbackAction,
  AI_FEEDBACK_FIELDS,
} from '../services/cloudAIService';

describe('AI feedback allowlist', () => {
  it('accepts only known fields and actions', () => {
    for (const f of AI_FEEDBACK_FIELDS) expect(isAIFeedbackField(f)).toBe(true);
    for (const a of ['accepted', 'dismissed', 'edited']) expect(isAIFeedbackAction(a)).toBe(true);
    for (const bad of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', 'TITLE', 'title ', 42, null, undefined, {}, ['title']]) {
      expect(isAIFeedbackField(bad)).toBe(false);
    }
    for (const bad of ['__proto__', 'constructor', 'accept', 'ACCEPTED', 7, null, undefined]) {
      expect(isAIFeedbackAction(bad)).toBe(false);
    }
  });

  it('records a valid pair and refuses everything else without recording', () => {
    expect(recordAIFeedback('title', 'accepted')).toBe(true);
    expect(recordAIFeedback('title', 'edited')).toBe(true);
    expect(recordAIFeedback('__proto__', 'accepted')).toBe(false);
    expect(recordAIFeedback('constructor', 'accepted')).toBe(false);
    expect(recordAIFeedback('title', '__proto__' as any)).toBe(false);
    expect(recordAIFeedback('title', 'constructor' as any)).toBe(false);
    expect(recordAIFeedback('made-up-field', 'accepted')).toBe(false);
    const stats = getAIFeedbackStats();
    expect(Object.keys(stats)).toEqual(['title']);
    expect(stats.title).toMatchObject({ accepted: 1, edited: 1, dismissed: 0 });
    expect(stats.title.acceptRate).toBe('50%');
  });

  it('cannot pollute Object.prototype via the field or the action', () => {
    recordAIFeedback('__proto__', '__proto__' as any);
    recordAIFeedback('constructor', 'prototype' as any);
    recordAIFeedback('__proto__', 'accepted');
    expect(({} as any).accepted).toBeUndefined();
    expect(({} as any).dismissed).toBeUndefined();
    expect(({} as any).edited).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'accepted')).toBe(false);
  });

  it('returns a null-prototype snapshot, so stats keys cannot shadow object methods', () => {
    const stats = getAIFeedbackStats();
    expect(Object.getPrototypeOf(stats)).toBeNull();
  });

  it('the key set is bounded by the allowlist', () => {
    for (const f of AI_FEEDBACK_FIELDS) for (const a of ['accepted', 'dismissed', 'edited'] as const) recordAIFeedback(f, a);
    expect(Object.keys(getAIFeedbackStats()).length).toBeLessThanOrEqual(AI_FEEDBACK_FIELDS.length);
  });
});
