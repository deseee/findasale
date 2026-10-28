/**
 * Photo-tagging pipeline homoglyph normalization (2026-10-27). Drives the real analyzeItemImage() /
 * analyzeItemImages() with axios stubbed: Google Vision fails (best-effort, so tagging continues) and the
 * Anthropic call returns a model answer whose title has a Cyrillic "т" inside "Planetwaves" -- the exact
 * live defect. No network, no database, no paid call.
 */
process.env.GOOGLE_VISION_API_KEY = 'test-vision-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

const mockPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: jest.fn() } }));
jest.mock('../lib/aiCostTracker', () => ({
  trackAITokens: jest.fn(),
  estimateTokensForRequest: () => 100,
  isAICostCeilingExceeded: async () => false,
  trackVisionCall: jest.fn(),
  webDetectionEnabled: () => false,
  isWebDetectionCeilingExceeded: async () => false,
  isWebDetectionDailyCapAvailable: async () => true,
  trackWebDetectionCall: jest.fn(),
  recordApiUsage: jest.fn(),
  ANTHROPIC_COST_PER_M_TOKENS: 1,
  recordAnthropicUsageOrEstimate: jest.fn(async () => undefined),
  isAIDailyCallCapAvailable: async () => true,
  trackAICall: jest.fn(async () => undefined),
}));
jest.mock('../services/imageMatchService', () => ({
  findCatalogMatches: jest.fn(async () => null),
  buildCatalogMatchContext: () => '',
  isCatalogMatchEnabled: () => false,
}));
jest.mock('../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(async () => null), buildEbayMatchContext: () => '' }));
jest.mock('../services/pricingEngine', () => ({ estimatePrice: jest.fn(async () => null) }));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({ isAudioFormatMatch: () => false }));

// Required after the env vars and mocks (cloudAIService reads the keys at module load).
const { analyzeItemImage, analyzeItemImages } = require('../services/cloudAIService');

const CYR_TE = 'т';
const MODEL_ANSWER = {
  detectedPrintedText: `Plane${CYR_TE}waves`,
  title: `D'Addario Plane${CYR_TE}waves Acoustic Quick-Release Guitar Strap System`,
  description: `Quick-release strap system by Plane${CYR_TE}waves​. Grеat condition.`,
  category: 'Musical Instruments',
  condition: 'USED',
  tags: ['guitar', 'strap'],
  confidence: 0.9,
};

function route(answer: unknown) {
  mockPost.mockImplementation(async (url: string) => {
    if (String(url).includes('anthropic.com')) {
      return { data: { content: [{ text: JSON.stringify(answer) }], usage: { input_tokens: 10, output_tokens: 10 } } };
    }
    throw new Error('vision unavailable in tests');
  });
}

let spies: jest.SpyInstance[] = [];
let logSpy: jest.SpyInstance;
beforeEach(() => {
  mockPost.mockReset();
  spies = (['error', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  logSpy.mockRestore();
});

const homoglyphLogs = () => logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[homoglyphs]'));

describe('photo tagging normalizes homoglyphs in the model title/description', () => {
  it('single-photo analyzeItemImage returns the Latin title and description', async () => {
    route(MODEL_ANSWER);
    const result = await analyzeItemImage(Buffer.from('fake-jpeg'), 'image/jpeg');
    expect(mockPost.mock.calls.some((c) => String(c[0]).includes('anthropic.com'))).toBe(true);
    expect(result.title).toBe("D'Addario Planetwaves Acoustic Quick-Release Guitar Strap System");
    expect(result.description).toBe('Quick-release strap system by Planetwaves. Great condition.');
    expect(homoglyphLogs().length).toBe(2);
  });

  it('multi-photo analyzeItemImages returns the Latin title', async () => {
    route(MODEL_ANSWER);
    const result = await analyzeItemImages([Buffer.from('a'), Buffer.from('b')], ['image/jpeg', 'image/jpeg']);
    expect(result.title).toBe("D'Addario Planetwaves Acoustic Quick-Release Guitar Strap System");
    expect(result.description).not.toMatch(/[Ѐ-ӿ​]/);
  });

  it('a genuinely Cyrillic model title is left untouched', async () => {
    const russian = 'Матрёшка СССР'; // Матрёшка СССР
    route({ ...MODEL_ANSWER, detectedPrintedText: null, title: russian, description: 'Nesting doll' });
    const result = await analyzeItemImage(Buffer.from('fake-jpeg'), 'image/jpeg');
    expect(result.title).toBe(russian);
    expect(homoglyphLogs()).toEqual([]);
  });
});
