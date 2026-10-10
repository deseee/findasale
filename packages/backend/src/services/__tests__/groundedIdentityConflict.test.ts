/**
 * dropConflictingTextCandidates (2026-10-10): a text-grounded identity whose declared type conflicts with a
 * media-family category cannot beat a high-confidence visual candidate. Pure function; collaborators mocked
 * only so the module imports. NOT EXECUTED when written; verified by CI.
 */
jest.mock('../../lib/prisma', () => ({ prisma: { item: { findUnique: jest.fn(), update: jest.fn() } } }));
jest.mock('../cloudAIService', () => ({ getVisionLabels: jest.fn() }));
jest.mock('../../lib/aiCostTracker', () => ({
  groundingEnabled: () => false,
  groundingTextEnabled: () => false,
  groundingVisualEnabled: () => false,
  groundingRolloutPct: () => 0,
  groundingPerItemCeilingUsd: () => 1,
  isGroundingCeilingExceeded: jest.fn(),
  isGroundingDailyCapAvailable: jest.fn(),
  trackGroundingCall: jest.fn(),
}));
jest.mock('../modelBakeoffService', () => ({
  resolveTextGroundedCandidate: jest.fn(),
  resolveVisualCandidate: jest.fn(),
  GROUNDING_VISUAL_VALUE_MODELS: [],
  GROUNDING_VISUAL_PREMIUM_MODELS: [],
}));

import { dropConflictingTextCandidates } from '../groundedIdentityService';

const visual = { identity: 'Sweet Maya album (vinyl record)', confidence: 0.9, source: 'visual-single' };
const fruit = { identity: 'Sweet Maia apples (MAIA-SM) — fresh apples', confidence: 0.9, source: 'text-grounded' };

describe('dropConflictingTextCandidates', () => {
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });

  it('drops a fruit text identity on a Music item when a >=0.8 visual candidate agrees', () => {
    expect(dropConflictingTextCandidates([fruit, visual], 'Music')).toEqual([visual]);
  });

  it('keeps a text identity whose type matches the media family', () => {
    const ok = { identity: 'Sweet Maya — vinyl record', confidence: 0.9, source: 'text-grounded' };
    expect(dropConflictingTextCandidates([ok, visual], 'Music')).toEqual([ok, visual]);
  });

  it('does nothing when the visual candidate is below 0.8', () => {
    const weak = { ...visual, confidence: 0.7 };
    expect(dropConflictingTextCandidates([fruit, weak], 'Music')).toEqual([fruit, weak]);
  });

  it('does nothing for non-media categories', () => {
    expect(dropConflictingTextCandidates([fruit, visual], 'Kitchen')).toEqual([fruit, visual]);
  });

  it('leaves a text identity with no declared type suffix alone', () => {
    const bare = { identity: 'Sweet Maia apples', confidence: 0.9, source: 'text-grounded' };
    expect(dropConflictingTextCandidates([bare, visual], 'Music')).toEqual([bare, visual]);
  });
});
