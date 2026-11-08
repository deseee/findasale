/**
 * Intake Haiku verify pass (2026-11-05): merge rules, gates and failure handling, then end to end through
 * analyzeItemImages(). axios is mocked (no network, no paid call, no database).
 */
process.env.GOOGLE_VISION_API_KEY = 'test-vision';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.ANTHROPIC_MODEL;

const mockPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: jest.fn() } }));
const mockCeiling = jest.fn(async () => false);
const mockDailyCap = jest.fn(async () => true);
const mockRecordUsage = jest.fn(async () => undefined);
const mockTrackCall = jest.fn(async () => undefined);
jest.mock('../lib/aiCostTracker', () => ({
  trackAITokens: jest.fn(),
  estimateTokensForRequest: () => 100,
  isAICostCeilingExceeded: () => mockCeiling(),
  trackVisionCall: jest.fn(),
  webDetectionEnabled: () => false,
  isWebDetectionCeilingExceeded: async () => false,
  isWebDetectionDailyCapAvailable: async () => true,
  trackWebDetectionCall: jest.fn(),
  recordApiUsage: jest.fn(),
  ANTHROPIC_COST_PER_M_TOKENS: 1,
  recordAnthropicUsageOrEstimate: (...a: unknown[]) => (mockRecordUsage as any)(...a),
  isAIDailyCallCapAvailable: () => mockDailyCap(),
  trackAICall: () => mockTrackCall(),
}));
jest.mock('../services/imageMatchService', () => ({ findCatalogMatches: jest.fn(async () => null), buildCatalogMatchContext: () => '', isCatalogMatchEnabled: () => false }));
jest.mock('../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(async () => null), buildEbayMatchContext: () => '' }));
jest.mock('../services/pricingEngine', () => ({ estimatePrice: jest.fn(async () => null) }));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({ isAudioFormatMatch: () => false }));

const { applyVerifyCorrections, runVerifyPass, normalizeCorrections, buildVerifyPrompt } = require('../services/intakeVerifyPass');
const { analyzeItemImages, analyzeItemImage } = require('../services/cloudAIService');

const pass1 = () => ({
  title: 'Kalani Soprano Ukulele',
  description: 'Soprano ukulele in used condition.',
  brand: 'Kalani',
  condition: 'NEW',
  category: 'Musical Instruments & Gear',
  tags: ['Ukulele', 'DVD Writer'],
  estimatedWeightOz: 30,
});

const verifyAnswer = (body: unknown) => ({ data: { content: [{ text: JSON.stringify(body) }], usage: { input_tokens: 5000, output_tokens: 200 } } });

let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  mockPost.mockReset();
  mockCeiling.mockReset().mockResolvedValue(false);
  mockDailyCap.mockReset().mockResolvedValue(true);
  mockRecordUsage.mockClear();
  mockTrackCall.mockClear();
  delete process.env.AI_VERIFY_PASS_ENABLED;
  delete process.env.AI_VERIFY_MAX_IMAGES;
  quiet = (['log', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => quiet.forEach((s) => s.mockRestore()));

describe('applyVerifyCorrections (merge rules)', () => {
  it('applies high-confidence corrections and notes low-confidence ones', () => {
    const r = pass1();
    const { applied, notes } = applyVerifyCorrections(r, normalizeCorrections([
      { field: 'brand', old: 'Kalani', new: 'Kalan', reason: 'Headstock reads Kalan', confidence: 0.95 },
      { field: 'condition', old: 'NEW', new: 'USED', reason: 'Visible wear on the body', confidence: 'high' },
      { field: 'tags', old: 'DVD Writer', new: ['Ukulele', 'Soprano Ukulele'], reason: 'Tag names a different device', confidence: 0.6 },
    ]), { threshold: 0.85, ocrText: 'KALAN soprano' }); // 2026-11-08: a brand spelling change needs OCR support
    expect(r.brand).toBe('Kalan');
    expect(r.condition).toBe('USED');
    expect(r.tags).toEqual(['Ukulele', 'DVD Writer']); // low confidence: not applied
    expect(applied.map((a: any) => a.field)).toEqual(['brand', 'condition']);
    expect(notes.find((n: any) => n.field === 'tags')).toMatchObject({ code: 'VERIFY_SUGGESTION', severity: 'medium' });
    expect(notes.filter((n: any) => n.code === 'VERIFY_APPLIED')).toHaveLength(2);
  });

  it('never touches organizer-edited fields (not even a note)', () => {
    const r = pass1();
    const { applied, notes } = applyVerifyCorrections(r, normalizeCorrections([
      { field: 'title', new: 'Kalan Soprano Ukulele', reason: 'label', confidence: 0.99 },
      { field: 'estimatedWeightOz', new: 18, reason: 'too heavy', confidence: 0.99 },
    ]), { userEditedFields: ['title', 'packageWeightOz'], threshold: 0.85 });
    expect(r.title).toBe('Kalani Soprano Ukulele');
    expect(r.estimatedWeightOz).toBe(30);
    expect(applied).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('rejects invalid values and stale "old" quotes', () => {
    const r = pass1();
    const { applied, notes } = applyVerifyCorrections(r, normalizeCorrections([
      { field: 'condition', new: 'GREAT', confidence: 0.99, reason: 'x' },
      { field: 'category', new: 'Not A Category', confidence: 0.99, reason: 'x' },
      { field: 'title', old: 'Something else entirely', new: 'Kalan Ukulele', confidence: 0.99, reason: 'x' },
      { field: 'nonsense', new: 'x', confidence: 0.99 },
    ]), { threshold: 0.85 });
    expect(applied).toEqual([]);
    expect(r.title).toBe('Kalani Soprano Ukulele');
    expect(notes.map((n: any) => n.field)).toEqual(['title']); // stale quote demoted to a suggestion
  });
});

describe('runVerifyPass', () => {
  const args = { imageBase64Array: ['a', 'b', 'c', 'd', 'e', 'f'], mimeTypes: [], pass1: pass1(), ocrText: 'KALAN', family: 'TRADING_CARD' };

  it('makes one Haiku call with capped images, the default model, and records usage + daily call', async () => {
    mockPost.mockResolvedValue(verifyAnswer({ corrections: [{ field: 'brand', old: 'Kalani', new: 'Kalan', reason: 'label', confidence: 0.9 }], missingShots: ['card_back', 'bogus'], photosUnclear: true }));
    const out = await runVerifyPass(args);
    expect(out.status).toBe('ran');
    expect(out.corrections).toHaveLength(1);
    expect(out.missingShots).toEqual(['card_back']);
    expect(out.photosUnclear).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].content.filter((c: any) => c.type === 'image')).toHaveLength(4);
    expect(mockRecordUsage).toHaveBeenCalledWith('anthropic:cloud_ai_verify_pass', 'claude-haiku-4-5-20251001', { input_tokens: 5000, output_tokens: 200 }, expect.any(Number));
    expect(mockTrackCall).toHaveBeenCalledTimes(1);
  });

  it('respects the cost ceiling, the daily cap and the kill switch without calling the API', async () => {
    mockCeiling.mockResolvedValueOnce(true);
    expect((await runVerifyPass(args)).status).toBe('gated');
    mockDailyCap.mockResolvedValueOnce(false);
    expect((await runVerifyPass(args)).status).toBe('gated');
    process.env.AI_VERIFY_PASS_ENABLED = 'false';
    expect((await runVerifyPass(args)).status).toBe('disabled');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('never throws on an API error or unparseable output', async () => {
    mockPost.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500 } }));
    await expect(runVerifyPass(args)).resolves.toMatchObject({ status: 'failed', corrections: [] });
    mockPost.mockResolvedValueOnce({ data: { content: [{ text: 'not json at all' }] } });
    await expect(runVerifyPass(args)).resolves.toMatchObject({ status: 'failed', corrections: [] });
  });

  it('prompt carries the fact guardrails, required shots and no em dashes', () => {
    const prompt = buildVerifyPrompt({ pass1: pass1(), ocrText: 'KALAN', family: 'TRADING_CARD' }, 2);
    expect(prompt).toContain('"card_back" = the back of the card');
    expect(prompt).toContain('Eisenhower dollars are copper-nickel clad');
    expect(prompt).toContain('A reproduction or replica is never "Antiques"');
    expect(prompt).toContain('KALAN');
    expect(prompt).not.toMatch(/\u2014/);
  });
});

describe('end to end through analyzeItemImages / analyzeItemImage', () => {
  const PASS1 = {
    printedText: { brand: 'Kalan', counts: [] },
    detectedPrintedText: 'Kalan',
    title: 'Kalani Soprano Ukulele',
    description: 'Soprano ukulele, light wear.',
    category: 'Musical Instruments & Gear',
    condition: 'USED',
    brand: 'Kalani',
    tags: ['Ukulele'],
    confidence: 0.9,
  };
  function route(verify: unknown | Error) {
    let anthropicCalls = 0;
    mockPost.mockImplementation(async (url: string, body: any) => {
      if (!String(url).includes('anthropic.com')) throw new Error('vision unavailable in tests');
      anthropicCalls += 1;
      if (anthropicCalls === 1) return verifyAnswer(PASS1);
      if (verify instanceof Error) throw verify;
      return verifyAnswer(verify);
    });
  }
  const anthropicCalls = () => mockPost.mock.calls.filter((c) => String(c[0]).includes('anthropic.com'));

  it('pass 1 prompt asks for the verbatim printedText block and the fact rules; verify corrections are applied', async () => {
    route({ corrections: [{ field: 'brand', old: 'Kalani', new: 'Kalan', reason: 'Label reads Kalan', confidence: 0.95 }, { field: 'title', old: 'Kalani', new: 'Kalan Soprano Ukulele', reason: 'Label reads Kalan', confidence: 0.95 }], missingShots: [], photosUnclear: false });
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], ['image/jpeg', 'image/jpeg'], undefined, undefined, { userEditedFields: [] });
    const calls = anthropicCalls();
    expect(calls).toHaveLength(2);
    const pass1Text = calls[0][1].messages[0].content.find((c: any) => c.type === 'text').text as string;
    expect(pass1Text).toContain('"printedText"');
    expect(pass1Text).toContain('Copy spellings exactly from the label');
    expect(pass1Text).toContain('copper-nickel clad');
    expect(pass1Text).toContain('Category-specific facts');
    expect(calls[0][1].model).toBe('claude-haiku-4-5-20251001');
    expect(calls[1][1].model).toBe('claude-haiku-4-5-20251001');
    expect(result.brand).toBe('Kalan');
    expect(result.title).toBe('Kalan Soprano Ukulele');
    expect(result.printedText).toMatchObject({ brand: 'Kalan' });
    expect(result.intakeReview.verifyPass).toBe('ran');
    expect(result.intakeReview.appliedCorrections.map((c: any) => c.field).sort()).toEqual(['brand', 'title']);
  });

  it('keeps organizer-edited fields as pass 1 left them', async () => {
    route({ corrections: [{ field: 'title', new: 'Kalan Soprano Ukulele', reason: 'label', confidence: 0.99 }], missingShots: [] });
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], [], undefined, undefined, { userEditedFields: ['title'] });
    expect(result.title).toBe('Kalani Soprano Ukulele');
  });

  it('a failing verify pass never fails tagging', async () => {
    route(new Error('verify exploded'));
    const result = await analyzeItemImage(Buffer.from('a'), 'image/jpeg');
    expect(result.title).toBe('Kalani Soprano Ukulele');
    expect(result.intakeReview.verifyPass).toBe('failed');
    // deterministic checks still ran: brand differs from the printed label
    expect(result.intakeReview.notes.map((n: any) => n.code)).toContain('BRAND_SPELLING');
  });

  it('opt-out (Curio, tag-only lookups) makes exactly one Anthropic call and no review', async () => {
    route({ corrections: [] });
    const result = await analyzeItemImage(Buffer.from('a'), 'image/jpeg', undefined, { intakeReview: false });
    expect(anthropicCalls()).toHaveLength(1);
    expect(result.intakeReview).toBeUndefined();
  });

  it('kill switch: AI_VERIFY_PASS_ENABLED=false skips the second call but keeps the free checks', async () => {
    process.env.AI_VERIFY_PASS_ENABLED = 'false';
    route({ corrections: [] });
    const result = await analyzeItemImage(Buffer.from('a'), 'image/jpeg');
    expect(anthropicCalls()).toHaveLength(1);
    expect(result.intakeReview.verifyPass).toBe('disabled');
    expect(result.intakeReview.notes.length).toBeGreaterThan(0);
  });
});
