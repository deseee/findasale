/**
 * Card scan recognition (ADR-138 batch B4): acceptance AT-18 (recognition half), AT-19 and AT-20.
 * Every network call goes through a fake client. axios itself is mocked so any accidental call is counted.
 * All names, keys and ids are synthetic.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { computeAnthropicCostUsd } from '../lib/aiCostTracker';
import { createHaikuCardProvider, DEFAULT_ANTHROPIC_MODEL, ESTIMATED_INPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS } from '../services/cardScan/recognition/haikuCardProvider';
import { buildCardScanPrompt, cleanOcrText, MAX_OCR_PROMPT_CHARS } from '../services/cardScan/recognition/prompt';
import { buildVisionTextRequest, createVisionOcr, extractFullText, VISION_ANNOTATE_URL, VISION_TEXT_DETECTION_COST_USD } from '../services/cardScan/recognition/visionOcr';
import { disabledProvider, getRecognitionProvider, getRecognitionStatus } from '../services/cardScan/recognition/registry';
import { scrydexProvider } from '../services/cardScan/recognition/scrydexProvider.stub';
import { ximilarProvider } from '../services/cardScan/recognition/ximilarProvider.stub';
import type { HttpPostClient, RecognitionFrame } from '../services/cardScan/recognition/types';
import type { OcrClient } from '../services/cardScan/recognition/visionOcr';

jest.mock('axios', () => {
  const post = jest.fn();
  const get = jest.fn();
  return { __esModule: true, default: { post, get }, post, get };
});
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/redis', () => ({
  redis: { get: async () => null, setex: async () => undefined, del: async () => undefined, getDel: async () => null },
}));

const axiosPost = axios.post as unknown as jest.Mock;
const axiosGet = axios.get as unknown as jest.Mock;

/** Em dash and en dash, written as escapes so this file itself contains neither character. */
const DASH_RE = /[\u2014\u2013]/;

const KEY = 'test-anthropic-key-not-real';
const VISION_KEY = 'test-vision-key-not-real';
const ENABLED = { CARD_SCAN_ENABLED: 'true', ANTHROPIC_API_KEY: KEY };
const FRAME: RecognitionFrame = { buffer: Buffer.from('synthetic-jpeg-bytes'), mimeType: 'image/jpeg' };

interface Call {
  url: string;
  body: any;
  config: { headers?: Record<string, string>; timeout?: number };
}

function fakeHttp(handler: (call: Call) => { status?: number; data: any } | Promise<{ status?: number; data: any }>) {
  const calls: Call[] = [];
  const client: HttpPostClient = {
    post: async (url, body, config) => {
      const call: Call = { url, body, config };
      calls.push(call);
      return handler(call);
    },
  };
  return { client, calls };
}

function reply(card: unknown, extra: Record<string, unknown> = {}, usage: any = { input_tokens: 1200, output_tokens: 140 }) {
  return { status: 200, data: { content: [{ type: 'text', text: JSON.stringify({ card, confidence: 0.8, ...extra }) }], usage } };
}

const rawText = (text: string, usage: any = { input_tokens: 900, output_tokens: 60 }) => ({ status: 200, data: { content: [{ type: 'text', text }], usage } });

const BOLT = { game: 'MTG', cardName: 'Lightning Bolt', setCode: 'M10', setName: 'Magic 2010', collectorNumber: '146/249', language: 'English', finish: 'FOIL', suggestedCardCondition: 'Near Mint' };

/** A fake cost function with round numbers, so the arithmetic in the assertions is easy to follow. */
const fakeCost = jest.fn((_model: string, input: number, output: number) => input * 0.000001 + output * 0.000005);

function makeProvider(http: HttpPostClient, over: Partial<Parameters<typeof createHaikuCardProvider>[0]> = {}) {
  return createHaikuCardProvider({ http, computeCostUsd: fakeCost, env: { ...ENABLED }, ...over });
}

beforeEach(() => {
  fakeCost.mockClear();
  axiosPost.mockReset();
  axiosGet.mockReset();
});

describe('AT-19 Haiku provider with a fake client', () => {
  it('turns a valid card block into an observation through the card vocabulary normalizer', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.observation).toEqual({
      providerId: 'haiku-card',
      game: 'MTG',
      cardName: 'Lightning Bolt',
      setCode: 'm10',
      setName: 'Magic 2010',
      collectorNumber: '146/249',
      language: 'en',
      finish: 'FOIL',
      suggestedConditionCode: 'NM',
      confidence: 0.8,
    });
    expect(out.usage).toEqual({ inputTokens: 1200, outputTokens: 140, costUsd: 1200 * 0.000001 + 140 * 0.000005 });
    expect(calls).toHaveLength(1);
  });

  it('prices usage with the injected cost function using the response token counts and the model in use', async () => {
    const { client } = fakeHttp(() => reply(BOLT));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(fakeCost).toHaveBeenCalledTimes(1);
    expect(fakeCost).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL, 1200, 140);
    expect(out.ok && out.usage.costUsd).toBe(fakeCost.mock.results[0].value);
  });

  it('sends one Haiku request shaped like the item tagging call, with the key only in a header', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    await makeProvider(client).recognize(FRAME, {});
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.config.headers).toEqual({ 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
    expect(call.config.timeout).toBe(20000);
    expect(call.body.model).toBe('claude-haiku-4-5-20251001');
    expect(call.body.max_tokens).toBe(300);
    const [image, prompt] = call.body.messages[0].content;
    expect(image).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: FRAME.buffer.toString('base64') } });
    expect(prompt.type).toBe('text');
    expect(JSON.stringify(call.body)).not.toContain(KEY);
  });

  it('uses ANTHROPIC_MODEL when it is set', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    await makeProvider(client, { env: { ...ENABLED, ANTHROPIC_MODEL: 'claude-haiku-test-model' } }).recognize(FRAME, {});
    expect(calls[0].body.model).toBe('claude-haiku-test-model');
    expect(fakeCost).toHaveBeenCalledWith('claude-haiku-test-model', 1200, 140);
  });

  it('uses a card only prompt: printed and readable fields only, never guess a set or number, no listing or vendor evidence', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    await makeProvider(client).recognize(FRAME, {});
    const prompt: string = calls[0].body.messages[0].content[1].text;
    expect(prompt).toContain('Report a field ONLY if it is printed or clearly readable on the card');
    expect(prompt).toContain('never guess a set or collector number from memory');
    expect(prompt).not.toMatch(/vision|web detection|ebay|object detection|label detection|catalog match/i);
    expect(prompt).not.toMatch(/title guidelines|suggestedPrice|description:|tags:|estate/i);
    expect(prompt).not.toContain('Text read from the photo by character recognition');
  });

  it('adds the seller game hint to the prompt only when one is given', () => {
    expect(buildCardScanPrompt({ game: 'POKEMON' })).toContain('Likely game (from the seller, may be wrong, trust the card itself): POKEMON.');
    expect(buildCardScanPrompt({})).not.toContain('Likely game');
  });

  it('reads graded slab fields and then carries no condition suggestion', async () => {
    const { client } = fakeHttp(() => reply({ game: 'POKEMON', cardName: 'Synthetic Dragon', grader: 'PSA', grade: '9', certNumber: '12345678', suggestedCardCondition: 'NM' }));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.observation).toMatchObject({ game: 'POKEMON', grader: 'PSA', grade: '9', certNumber: '12345678' });
    expect(out.observation.suggestedConditionCode).toBeUndefined();
  });

  it('never produces a final condition or an applied finish: only hints and suggestions', async () => {
    const { client } = fakeHttp(() => reply({ game: 'MTG', cardName: 'Lightning Bolt', suggestedCardCondition: 'LP' }));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const keys = Object.keys(out.observation);
    expect(keys).not.toContain('conditionCode');
    expect(keys).not.toContain('finish');
    expect(out.observation.suggestedConditionCode).toBe('LP');
  });

  it('accepts fenced or wrapped JSON and a bare card object, and clamps the provider confidence', async () => {
    const fenced = fakeHttp(() => rawText('```json\n' + JSON.stringify({ card: BOLT, confidence: 1.7 }) + '\n```'));
    const a = await makeProvider(fenced.client).recognize(FRAME, {});
    expect(a.ok && a.observation.confidence).toBe(1);

    const wrapped = fakeHttp(() => rawText('Here is the card: ' + JSON.stringify({ card: BOLT }) + ' done.'));
    const b = await makeProvider(wrapped.client).recognize(FRAME, {});
    expect(b.ok && b.observation.cardName).toBe('Lightning Bolt');
    expect(b.ok && b.observation.confidence).toBeUndefined();

    const bare = fakeHttp(() => rawText(JSON.stringify(BOLT)));
    const c = await makeProvider(bare.client).recognize(FRAME, {});
    expect(c.ok && c.observation.setCode).toBe('m10');

    const negative = fakeHttp(() => reply(BOLT, { confidence: -3 }));
    const d = await makeProvider(negative.client).recognize(FRAME, {});
    expect(d.ok && d.observation.confidence).toBeUndefined();
  });

  it('an unknown game is NO_CARD, chargeable, with the real usage attached', async () => {
    const { client } = fakeHttp(() => reply({ game: 'Chess', cardName: 'Queen' }));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out).toEqual({ ok: false, code: 'NO_CARD', chargeable: true, usage: { inputTokens: 1200, outputTokens: 140, costUsd: 1200 * 0.000001 + 140 * 0.000005 } });
  });

  it('a null card is NO_CARD and chargeable', async () => {
    const { client } = fakeHttp(() => reply(null));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out).toMatchObject({ ok: false, code: 'NO_CARD', chargeable: true });
  });

  it('a card with no name and no set plus number is UNREADABLE and chargeable', async () => {
    const { client } = fakeHttp(() => reply({ game: 'MTG', setCode: 'm10' }));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(out).toMatchObject({ ok: false, code: 'UNREADABLE', chargeable: true });
  });

  it('malformed JSON is PROVIDER_ERROR and not chargeable, but the tokens spent are still reported', async () => {
    for (const text of ['I cannot read this card', '{"card": {"game": "MTG"', '[1, 2, 3]']) {
      const { client } = fakeHttp(() => rawText(text));
      const out = await makeProvider(client).recognize(FRAME, {});
      expect(out).toMatchObject({ ok: false, code: 'PROVIDER_ERROR', chargeable: false });
      expect(!out.ok && out.usage?.costUsd).toBeGreaterThan(0);
    }
    const noText = fakeHttp(() => ({ status: 200, data: { content: [], usage: { input_tokens: 5, output_tokens: 1 } } }));
    expect(await makeProvider(noText.client).recognize(FRAME, {})).toMatchObject({ ok: false, code: 'PROVIDER_ERROR', chargeable: false });
  });

  it('HTTP 429 is RATE_LIMIT, other failures are PROVIDER_ERROR, neither is chargeable and neither reports usage', async () => {
    const thrown429 = fakeHttp(() => {
      throw Object.assign(new Error('Request failed'), { response: { status: 429 } });
    });
    expect(await makeProvider(thrown429.client).recognize(FRAME, {})).toEqual({ ok: false, code: 'RATE_LIMIT', chargeable: false });

    const returned429 = fakeHttp(() => ({ status: 429, data: {} }));
    expect(await makeProvider(returned429.client).recognize(FRAME, {})).toEqual({ ok: false, code: 'RATE_LIMIT', chargeable: false });

    const thrown500 = fakeHttp(() => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } });
    });
    expect(await makeProvider(thrown500.client).recognize(FRAME, {})).toEqual({ ok: false, code: 'PROVIDER_ERROR', chargeable: false });

    const timeout = fakeHttp(() => {
      throw new Error('timeout of 20000ms exceeded');
    });
    expect(await makeProvider(timeout.client).recognize(FRAME, {})).toEqual({ ok: false, code: 'PROVIDER_ERROR', chargeable: false });

    const returned503 = fakeHttp(() => ({ status: 503, data: {} }));
    expect(await makeProvider(returned503.client).recognize(FRAME, {})).toEqual({ ok: false, code: 'PROVIDER_ERROR', chargeable: false });
  });

  it('does not put the error object or the key anywhere in a failure result', async () => {
    const { client } = fakeHttp(() => {
      throw new Error(`request to ${KEY} failed`);
    });
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  it('prices a response with no usage object from the documented token estimate and reports no token counts', async () => {
    const { client } = fakeHttp(() => ({ status: 200, data: { content: [{ type: 'text', text: JSON.stringify({ card: BOLT }) }] } }));
    const out = await makeProvider(client).recognize(FRAME, {});
    expect(fakeCost).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL, ESTIMATED_INPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS);
    expect(out.ok && out.usage).toEqual({ costUsd: ESTIMATED_INPUT_TOKENS * 0.000001 + ESTIMATED_OUTPUT_TOKENS * 0.000005 });
  });

  it('is DISABLED without the flag or the key, and makes no call', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    for (const env of [{ ANTHROPIC_API_KEY: KEY }, { CARD_SCAN_ENABLED: 'true' }, { ...ENABLED, ANTHROPIC_API_KEY: '   ' }, { ...ENABLED, CARD_SCAN_PROVIDER: 'scrydex' }, {}]) {
      const provider = makeProvider(client, { env });
      expect(provider.isAvailable(env)).toBe(false);
      expect(await provider.recognize(FRAME, {})).toEqual({ ok: false, code: 'DISABLED', chargeable: false });
    }
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty frame or an unsupported type before any call', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    const provider = makeProvider(client);
    expect(await provider.recognize({ buffer: Buffer.alloc(0), mimeType: 'image/jpeg' }, {})).toEqual({ ok: false, code: 'UNREADABLE', chargeable: false });
    expect(await provider.recognize({ buffer: FRAME.buffer, mimeType: 'application/pdf' }, {})).toEqual({ ok: false, code: 'UNREADABLE', chargeable: false });
    expect(calls).toHaveLength(0);
  });

  it('isAvailable reads flag and key presence from the environment it is given, with no network', () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    const provider = makeProvider(client);
    expect(provider.id).toBe('haiku-card');
    expect(provider.isAvailable({})).toBe(false);
    expect(provider.isAvailable({ ...ENABLED })).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('OCR_PLUS_HAIKU mode', () => {
  const OCR_ENV = { ...ENABLED, GOOGLE_VISION_API_KEY: VISION_KEY, CARD_SCAN_MODE: 'OCR_PLUS_HAIKU' };
  const okOcr = (text = 'Lightning Bolt 146/249 M10'): { ocr: OcrClient; calls: RecognitionFrame[] } => {
    const calls: RecognitionFrame[] = [];
    return {
      calls,
      ocr: async (frame) => {
        calls.push(frame);
        return { ok: true, text, costUsd: 0.0015 };
      },
    };
  };

  it('needs the text client and the Vision key to be available, and HAIKU_ONLY needs neither', () => {
    const { client } = fakeHttp(() => reply(BOLT));
    const withOcr = okOcr();
    expect(makeProvider(client, { env: OCR_ENV, ocr: withOcr.ocr }).isAvailable(OCR_ENV)).toBe(true);
    expect(makeProvider(client, { env: OCR_ENV, ocr: null }).isAvailable(OCR_ENV)).toBe(false);
    const noVisionKey = { ...OCR_ENV, GOOGLE_VISION_API_KEY: '' };
    expect(makeProvider(client, { env: noVisionKey, ocr: withOcr.ocr }).isAvailable(noVisionKey)).toBe(false);
    expect(makeProvider(client, { env: { ...ENABLED }, ocr: null }).isAvailable({ ...ENABLED })).toBe(true);
  });

  it('runs one text detection first, adds its text to the prompt, and adds its cost to the usage', async () => {
    const { client, calls } = fakeHttp(() => reply(BOLT));
    const { ocr, calls: ocrCalls } = okOcr('LIGHTNING BOLT 146/249 M10');
    const out = await makeProvider(client, { env: OCR_ENV, ocr }).recognize(FRAME, {});
    expect(ocrCalls).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.messages[0].content[1].text).toContain('LIGHTNING BOLT 146/249 M10');
    expect(out.ok && out.usage.costUsd).toBe(1200 * 0.000001 + 140 * 0.000005 + 0.0015);
  });

  it('goes on with the picture alone when the text step fails or throws', async () => {
    const failing = fakeHttp(() => reply(BOLT));
    const a = await makeProvider(failing.client, { env: OCR_ENV, ocr: async () => ({ ok: false }) }).recognize(FRAME, {});
    expect(a.ok).toBe(true);
    expect(failing.calls[0].body.messages[0].content[1].text).not.toContain('Text read from the photo');

    const throwing = fakeHttp(() => reply(BOLT));
    const b = await makeProvider(throwing.client, {
      env: OCR_ENV,
      ocr: async () => {
        throw new Error('vision down');
      },
    }).recognize(FRAME, {});
    expect(b.ok).toBe(true);
  });

  it('reports the text step cost even when the Haiku call then fails', async () => {
    const { client } = fakeHttp(() => {
      throw new Error('boom');
    });
    const out = await makeProvider(client, { env: OCR_ENV, ocr: okOcr().ocr }).recognize(FRAME, {});
    expect(out).toEqual({ ok: false, code: 'PROVIDER_ERROR', chargeable: false, usage: { costUsd: 0.0015 } });
  });

  it('HAIKU_ONLY never calls the text client even if one is supplied', async () => {
    const { client } = fakeHttp(() => reply(BOLT));
    const { ocr, calls } = okOcr();
    await makeProvider(client, { env: { ...ENABLED }, ocr }).recognize(FRAME, {});
    expect(calls).toHaveLength(0);
  });

  it('cleans and caps the recognized text before it reaches the prompt', () => {
    expect(cleanOcrText('  a\u0000b \n\n c\t d ')).toBe('a b c d');
    expect(cleanOcrText(42)).toBe('');
    const long = cleanOcrText('x'.repeat(MAX_OCR_PROMPT_CHARS + 500));
    expect(long).toHaveLength(MAX_OCR_PROMPT_CHARS);
  });
});

describe('Vision text detection helper (typed function, fake client, never called live)', () => {
  it('builds a request with exactly one feature, TEXT_DETECTION', () => {
    expect(buildVisionTextRequest('QUJD')).toEqual({ requests: [{ image: { content: 'QUJD' }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }] });
  });

  it('posts that request to the annotate endpoint and returns the full text block', async () => {
    const { client, calls } = fakeHttp(() => ({
      status: 200,
      data: { responses: [{ textAnnotations: [{ description: 'LIGHTNING BOLT\n146/249' }, { description: 'LIGHTNING' }] }] },
    }));
    const ocr = createVisionOcr({ http: client, env: { GOOGLE_VISION_API_KEY: VISION_KEY } });
    const out = await ocr(FRAME);
    expect(out).toEqual({ ok: true, text: 'LIGHTNING BOLT 146/249', costUsd: VISION_TEXT_DETECTION_COST_USD });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${VISION_ANNOTATE_URL}?key=${VISION_KEY}`);
    expect(calls[0].config.timeout).toBe(15000);
    const features = calls[0].body.requests[0].features;
    expect(features).toEqual([{ type: 'TEXT_DETECTION', maxResults: 1 }]);
    expect(JSON.stringify(calls[0].body)).not.toMatch(/LABEL_DETECTION|OBJECT_LOCALIZATION|WEB_DETECTION/);
  });

  it('falls back to fullTextAnnotation and returns an empty string for a frame with no text', () => {
    expect(extractFullText({ responses: [{ fullTextAnnotation: { text: 'Mox   Pearl' } }] })).toBe('Mox Pearl');
    expect(extractFullText({ responses: [{}] })).toBe('');
    expect(extractFullText(undefined)).toBe('');
  });

  it('is a failure, with no call, when there is no key', async () => {
    const { client, calls } = fakeHttp(() => ({ status: 200, data: {} }));
    expect(await createVisionOcr({ http: client, env: {} })(FRAME)).toEqual({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('is a failure when the call throws or answers with an error status, and never exposes the key', async () => {
    const thrower = fakeHttp(() => {
      throw new Error(`https://vision.example/?key=${VISION_KEY} failed`);
    });
    const a = await createVisionOcr({ http: thrower.client, env: { GOOGLE_VISION_API_KEY: VISION_KEY } })(FRAME);
    expect(a).toEqual({ ok: false });
    const forbidden = fakeHttp(() => ({ status: 403, data: {} }));
    expect(await createVisionOcr({ http: forbidden.client, env: { GOOGLE_VISION_API_KEY: VISION_KEY } })(FRAME)).toEqual({ ok: false });
  });
});

describe('provider factory', () => {
  it('defaults to the Haiku provider, which is not ready until the flag and key are set', () => {
    const provider = getRecognitionProvider({});
    expect(provider.id).toBe('haiku-card');
    expect(provider.isAvailable({})).toBe(false);
    expect(getRecognitionStatus({})).toEqual({ providerId: 'haiku-card', mode: 'HAIKU_ONLY', providerReady: false });
    expect(getRecognitionStatus({ ...ENABLED })).toEqual({ providerId: 'haiku-card', mode: 'HAIKU_ONLY', providerReady: true });
  });

  it('selects the vendor stubs by name and fails closed on anything else', async () => {
    expect(getRecognitionProvider({ CARD_SCAN_PROVIDER: 'scrydex' })).toBe(scrydexProvider);
    expect(getRecognitionProvider({ CARD_SCAN_PROVIDER: 'XIMILAR' })).toBe(ximilarProvider);
    for (const value of ['bogus', 'delver', 'manual', 'openai']) {
      expect(getRecognitionProvider({ ...ENABLED, CARD_SCAN_PROVIDER: value })).toBe(disabledProvider);
    }
    expect(getRecognitionStatus({ ...ENABLED, CARD_SCAN_PROVIDER: 'bogus' }).providerReady).toBe(false);
    expect(await disabledProvider.recognize(FRAME, {})).toEqual({ ok: false, code: 'DISABLED', chargeable: false });
  });

  it('wires the real cost function by default (Haiku 4.5 rates from the shared tracker)', async () => {
    const { client } = fakeHttp(() => reply(BOLT));
    const provider = getRecognitionProvider({ ...ENABLED }, { http: client });
    const out = await provider.recognize(FRAME, {});
    expect(out.ok && out.usage.costUsd).toBe(computeAnthropicCostUsd(DEFAULT_ANTHROPIC_MODEL, 1200, 140));
    expect(out.ok && out.usage.costUsd).toBeCloseTo(0.0019, 6);
  });

  it('in OCR_PLUS_HAIKU mode runs the Vision text call and then the Haiku call, in that order', async () => {
    const env = { ...ENABLED, GOOGLE_VISION_API_KEY: VISION_KEY, CARD_SCAN_MODE: 'OCR_PLUS_HAIKU' };
    const { client, calls } = fakeHttp((call) =>
      call.url.startsWith(VISION_ANNOTATE_URL) ? { status: 200, data: { responses: [{ textAnnotations: [{ description: 'Lightning Bolt' }] }] } } : reply(BOLT)
    );
    const provider = getRecognitionProvider(env, { http: client });
    expect(getRecognitionStatus(env, { http: client })).toEqual({ providerId: 'haiku-card', mode: 'OCR_PLUS_HAIKU', providerReady: true });
    const out = await provider.recognize(FRAME, {});
    expect(out.ok).toBe(true);
    expect(calls.map((c) => c.url.split('?')[0])).toEqual([VISION_ANNOTATE_URL, 'https://api.anthropic.com/v1/messages']);
  });

  it('creating providers and checking status makes no network call at all', () => {
    getRecognitionProvider({ ...ENABLED });
    getRecognitionProvider({ ...ENABLED, CARD_SCAN_MODE: 'OCR_PLUS_HAIKU', GOOGLE_VISION_API_KEY: VISION_KEY });
    getRecognitionStatus({ ...ENABLED });
    expect(axiosPost).not.toHaveBeenCalled();
    expect(axiosGet).not.toHaveBeenCalled();
  });
});

describe('AT-20 vendor stubs', () => {
  it.each([
    ['scrydex', scrydexProvider],
    ['ximilar', ximilarProvider],
  ])('%s is never available and never calls out', async (id, provider) => {
    expect(provider.id).toBe(id);
    const everything = { ...ENABLED, GOOGLE_VISION_API_KEY: VISION_KEY, CARD_SCAN_PROVIDER: id, SCRYDEX_API_KEY: 'x', XIMILAR_API_KEY: 'x' };
    expect(provider.isAvailable(everything)).toBe(false);
    expect(await provider.recognize(FRAME, {})).toEqual({ ok: false, code: 'DISABLED', chargeable: false });
    expect(await provider.recognize(FRAME, { game: 'MTG' })).toEqual({ ok: false, code: 'DISABLED', chargeable: false });
    expect(axiosPost).not.toHaveBeenCalled();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('the stub source files import nothing but the provider types', () => {
    for (const name of ['scrydexProvider.stub.ts', 'ximilarProvider.stub.ts']) {
      const text = fs.readFileSync(path.join(RECOGNITION_DIR, name), 'utf8');
      const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect({ name, imports }).toEqual({ name, imports: ['./types', './types'] });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// AT-18, recognition half: static checks of the recognition directory itself
// ---------------------------------------------------------------------------------------------

const SRC = path.join(__dirname, '..');
const RECOGNITION_DIR = path.join(SRC, 'services', 'cardScan', 'recognition');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const importsOf = (text: string): string[] => [...text.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
const recognitionFiles = () => fs.readdirSync(RECOGNITION_DIR).filter((n) => n.endsWith('.ts'));

describe('AT-18 recognition directory (card only, nothing else imported)', () => {
  it('holds the files the ADR names', () => {
    expect(recognitionFiles().sort()).toEqual(
      ['haikuCardProvider.ts', 'index.ts', 'prompt.ts', 'registry.ts', 'scanCostGuard.ts', 'scrydexProvider.stub.ts', 'types.ts', 'visionOcr.ts', 'ximilarProvider.stub.ts'].sort()
    );
  });

  it('imports no item tagging service, no image matching, no marketplace image search and no vendor SDK', () => {
    const banned = ['cloudAIService', 'imageMatchService', 'ebayImageSearchService', '@anthropic-ai/sdk', '@google-cloud/vision', 'openai', 'node-fetch', 'safeFetch'];
    for (const name of recognitionFiles()) {
      const specs = importsOf(stripComments(fs.readFileSync(path.join(RECOGNITION_DIR, name), 'utf8')));
      const offenders = specs.filter((s) => banned.some((b) => s.includes(b)));
      expect({ name, offenders }).toEqual({ name, offenders: [] });
    }
  });

  it('only the factory imports an HTTP client, and no file requests label, object or web detection', () => {
    const withAxios: string[] = [];
    for (const name of recognitionFiles()) {
      const code = stripComments(fs.readFileSync(path.join(RECOGNITION_DIR, name), 'utf8'));
      if (importsOf(code).includes('axios')) withAxios.push(name);
      expect({ name, hit: /LABEL_DETECTION|OBJECT_LOCALIZATION|WEB_DETECTION|searchByImage|getVisionLabels|analyzeItemImage|findCatalogMatches/.test(code) }).toEqual({ name, hit: false });
      expect({ name, fetch: /\bfetch\(/.test(code) }).toEqual({ name, fetch: false });
    }
    expect(withAxios).toEqual(['registry.ts']);
  });

  it('relative imports stay inside the small allowed set (types, config, vocabulary, the card normalizer, two shared libs)', () => {
    const allowed = new Set([
      './types',
      './prompt',
      './visionOcr',
      './haikuCardProvider',
      './registry',
      './scanCostGuard',
      './scrydexProvider.stub',
      './ximilarProvider.stub',
      '../types',
      '../config',
      '../../cardAiSuggestion',
      '../../../constants/cardVocabulary',
      '../../../lib/aiCostTracker',
      '../../../lib/redis',
    ]);
    for (const name of recognitionFiles()) {
      const specs = importsOf(stripComments(fs.readFileSync(path.join(RECOGNITION_DIR, name), 'utf8'))).filter((s) => s.startsWith('.'));
      const unexpected = specs.filter((s) => !allowed.has(s));
      expect({ name, unexpected }).toEqual({ name, unexpected: [] });
    }
  });

  it('nothing in the recognition code calls the shared token counters', () => {
    for (const name of recognitionFiles()) {
      const code = stripComments(fs.readFileSync(path.join(RECOGNITION_DIR, name), 'utf8'));
      expect({ name, hit: /trackAITokens|trackAICall|recordAnthropicUsage|trackVisionCall/.test(code) }).toEqual({ name, hit: false });
    }
  });

  it('the scan core never imports the recognition directory', () => {
    const coreDir = path.join(SRC, 'services', 'cardScan');
    for (const name of fs.readdirSync(coreDir).filter((n) => n.endsWith('.ts'))) {
      const specs = importsOf(stripComments(fs.readFileSync(path.join(coreDir, name), 'utf8')));
      expect({ name, offenders: specs.filter((s) => s.includes('recognition')) }).toEqual({ name, offenders: [] });
    }
  });

  it('follows the dash rule in every recognition file and in the files of this batch', () => {
    const files = [
      ...recognitionFiles().map((n) => path.join(RECOGNITION_DIR, n)),
      path.join(SRC, 'services', 'cardScan', 'evalScoring.ts'),
      path.join(__dirname, 'cardScanRecognition.test.ts'),
      path.join(__dirname, 'cardScanCostGuard.test.ts'),
      path.join(__dirname, 'cardScanEval.test.ts'),
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      expect({ file: path.basename(file), dash: DASH_RE.test(text) }).toEqual({ file: path.basename(file), dash: false });
    }
  });

  it('the prompt and the answer fields name no listing or vendor evidence', () => {
    const prompt = buildCardScanPrompt({ game: 'MTG' }, 'sample text');
    expect(prompt).not.toMatch(DASH_RE);
    expect(prompt).not.toMatch(/\bAI\b/);
  });
});
