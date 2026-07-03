/**
 * modelBakeoffService — DIAGNOSTIC / OBSERVABILITY-ONLY model bake-off harness.
 *
 * Runs several vision models against the SAME already-downloaded item photos and
 * the SAME targeted prompt, then LOGS each model's identification so we can compare
 * which model best identifies a secondhand resale item. It NEVER mutates the item,
 * never changes the applied re-analysis result, and never affects the reanalyze
 * response. Every model call is isolated in try/catch so one failure cannot kill
 * the others, and the whole harness is wrapped by the caller in try/catch too.
 *
 * Triggered per-request only (no env flag): the caller passes a `bakeoff` option
 * into reanalyzeItem, driven by `?bakeoff=1` / `{ bakeoff: true }` on the request.
 * When not triggered the harness is never invoked and zero extra API calls are made.
 *
 * NO new npm dependencies:
 *   - Claude models call the existing Anthropic REST endpoint via global fetch,
 *     reusing process.env.ANTHROPIC_API_KEY (same key/pattern as cloudAIService).
 *   - Gemini models call Vertex AI generateContent via global fetch, authenticated
 *     with an OAuth access token minted from the EXISTING GOOGLE_SERVICE_ACCOUNT_JSON
 *     service account (google.auth.GoogleAuth from the already-present googleapis dep).
 *     No new env var and no GEMINI_API_KEY are required. An optional GEMINI_API_KEY
 *     fast-path is honored only if that var happens to already be set.
 */

import { google } from 'googleapis';
import { getWebDetectionMatch } from './cloudAIService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Gemini auth resolution.
 *  - DEFAULT (no new env): mint a Vertex AI OAuth access token from the EXISTING
 *    GOOGLE_SERVICE_ACCOUNT_JSON service-account credentials and call Vertex AI in
 *    the service account's own project (project_id read from that JSON), us-central1.
 *  - OPTIONAL fast-path: if GEMINI_API_KEY happens to already be set, use the Google
 *    Generative Language REST endpoint with that key instead. Never required.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';

// OpenRouter — one key fans out to the broad multi-lab field via an OpenAI-compatible endpoint.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
  project_id: string;
}

/** Parse GOOGLE_SERVICE_ACCOUNT_JSON once; null (with a one-line skip log) on any problem. */
function parseServiceAccount(): ServiceAccountCreds | null {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const c = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    if (c && c.client_email && c.private_key && c.project_id) {
      return { client_email: c.client_email, private_key: c.private_key, project_id: c.project_id };
    }
    return null;
  } catch {
    return null;
  }
}

const SERVICE_ACCOUNT = parseServiceAccount();

// Cache the Vertex OAuth token across the 2 Gemini models in a single bake-off run.
let cachedVertexToken: { token: string; expiresAt: number } | null = null;

/** Mint (and briefly cache) a cloud-platform OAuth access token from the service account. */
async function getVertexAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedVertexToken && cachedVertexToken.expiresAt > now + 60_000) {
    return cachedVertexToken.token;
  }
  if (!SERVICE_ACCOUNT) throw new Error('no service account');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT.client_email,
      private_key: SERVICE_ACCOUNT.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
  if (!token) throw new Error('empty access token');
  // Google access tokens live ~1h; cache conservatively for 50 min.
  cachedVertexToken = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

const VERTEX_LOCATION = 'us-central1';

interface BakeoffModel {
  name: string; // log label
  provider: 'anthropic' | 'gemini' | 'openrouter';
  modelId: string; // provider model id
}

const BAKEOFF_MODELS: BakeoffModel[] = [
  { name: 'claude-haiku-4.5', provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001' },
  { name: 'claude-sonnet-5', provider: 'anthropic', modelId: 'claude-sonnet-5' },
  { name: 'claude-opus-4.8', provider: 'anthropic', modelId: 'claude-opus-4-8' },
  { name: 'gemini-2.5-flash-lite', provider: 'gemini', modelId: 'gemini-2.5-flash-lite' },
  { name: 'gemini-3.5-flash', provider: 'gemini', modelId: 'gemini-3.5-flash' },
  // OpenRouter — broad multi-lab field through a single key (best-guess slugs; each row
  // is isolated in try/catch and simply logs-and-continues if the slug 404s / is unavailable).
  { name: 'or/gemini-2.5-flash-lite', provider: 'openrouter', modelId: 'google/gemini-2.5-flash-lite' },
  { name: 'or/gemini-3-pro', provider: 'openrouter', modelId: 'google/gemini-3-pro' },
  { name: 'or/qwen3-vl-235b', provider: 'openrouter', modelId: 'qwen/qwen3-vl-235b-a22b-instruct' },
  { name: 'or/glm-4.6v', provider: 'openrouter', modelId: 'z-ai/glm-4.6v' },
  { name: 'or/llama-4-scout', provider: 'openrouter', modelId: 'meta-llama/llama-4-scout' },
];

// Shared targeted prompt — "targeted, marks-first, say-unknown". Used for EVERY model.
const BAKEOFF_PROMPT = `You are identifying a single secondhand resale item from the attached photos.
Identify the EXACT object by its shape, function, any on-item text, and any maker's marks.
Be specific and distinguish similar objects (for example, a trivet vs. a lid, a creamer vs. a small pitcher).
If the brand cannot be determined from marks actually visible in the photos, return brand "unknown" rather than guessing.
Base every field only on what you can actually see; do not invent details.

Respond with STRICT JSON ONLY, no markdown, no commentary, in exactly this shape:
{"title":"short specific title","brand":"brand or unknown","category":"best-fit category","condition":"NEW | USED | REFURBISHED | PARTS_OR_REPAIR","confidence":0.0,"evidence":"one short phrase citing the visual marks/shape/text you used"}`;

interface BakeoffParsed {
  title?: string;
  brand?: string;
  category?: string;
  condition?: string;
  confidence?: number;
  evidence?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Defensive JSON parse — models may wrap output in code fences or add prose. */
function parseModelJson(text: string): BakeoffParsed | null {
  if (!text) return null;
  // Strip common code-fence wrappers.
  let raw = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  // If there's still surrounding prose, grab the first {...} block.
  if (!raw.startsWith('{')) {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      raw = raw.slice(first, last + 1);
    }
  }
  try {
    return JSON.parse(raw) as BakeoffParsed;
  } catch {
    return null;
  }
}

function truncate(v: unknown, max = 120): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function shortErr(err: any): string {
  const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
  return truncate(msg, 160);
}

// ---------------------------------------------------------------------------
// Per-provider callers (each throws on failure; callers wrap in try/catch)
// ---------------------------------------------------------------------------

async function callAnthropic(
  modelId: string,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<BakeoffParsed | null> {
  if (!ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY');

  const content: any[] = imagesBase64.map((data, i) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: (mimeTypes[i] || 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp',
      data,
    },
  }));
  content.push({ type: 'text', text: BAKEOFF_PROMPT });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 400,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.content?.[0]?.text ?? '';
  return parseModelJson(text);
}

async function callGemini(
  modelId: string,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<BakeoffParsed | null> {
  const parts: any[] = imagesBase64.map((data, i) => ({
    inline_data: { mime_type: mimeTypes[i] || 'image/jpeg', data },
  }));
  parts.push({ text: BAKEOFF_PROMPT });

  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
  });

  let resp: Response;
  if (GEMINI_API_KEY) {
    // Optional fast-path: Generative Language REST with an API key (only if set).
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody,
    });
  } else {
    // DEFAULT: Vertex AI with a service-account OAuth Bearer token — no new env.
    if (!SERVICE_ACCOUNT) throw new Error('no service account');
    const token = await getVertexAccessToken();
    const url =
      `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
      `${SERVICE_ACCOUNT.project_id}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
      `${modelId}:generateContent`;
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: requestBody,
    });
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((pp: any) => pp?.text || '').join('') ?? '';
  return parseModelJson(text);
}

async function callOpenRouter(
  modelId: string,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<BakeoffParsed | null> {
  if (!OPENROUTER_API_KEY) throw new Error('no OPENROUTER_API_KEY');

  // OpenAI-compatible multimodal content: the shared text prompt + one image_url per photo.
  const content: any[] = [{ type: 'text', text: BAKEOFF_PROMPT }];
  imagesBase64.forEach((data, i) => {
    const mime = mimeTypes[i] || 'image/jpeg';
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${data}` },
    });
  });

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://finda.sale',
      'X-Title': 'FindaSale Bakeoff',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content }],
      max_tokens: 800,
      // Privacy: never route to providers that train on the input images.
      provider: { data_collection: 'deny' },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  return parseModelJson(text);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * Run every bake-off model against the same image buffers and log the results.
 * Observability only — returns void, never throws to the caller (all errors are
 * caught and logged). The caller should still wrap the invocation in try/catch
 * as a belt-and-suspenders guard.
 *
 * @param itemId   the item being re-analyzed (for log correlation)
 * @param buffers  the SAME image buffers already downloaded by reanalyzeItem
 * @param mimeTypes parallel array of mime types for each buffer
 */
export async function runModelBakeoff(
  itemId: string,
  buffers: Buffer[],
  mimeTypes: string[],
): Promise<void> {
  try {
    if (!buffers || buffers.length === 0) return;
    if (!GEMINI_API_KEY && !SERVICE_ACCOUNT) {
      console.log(
        `[bakeoff] item=${itemId} Gemini SKIPPED: GOOGLE_SERVICE_ACCOUNT_JSON missing/unparseable and no GEMINI_API_KEY — running Claude models only`,
      );
    }
    if (!OPENROUTER_API_KEY) {
      console.log('[bakeoff] OpenRouter models SKIPPED: no OPENROUTER_API_KEY');
    }

    const imagesBase64 = buffers.map((b) => b.toString('base64'));
    const mimes = buffers.map((_, i) => mimeTypes[i] || 'image/jpeg');

    const modelNames = BAKEOFF_MODELS.map((m) => m.name).join(', ');
    console.log(`[bakeoff] START item=${itemId} models=[${modelNames}]`);

    await Promise.all(
      BAKEOFF_MODELS.map(async (m) => {
        // Gemini rows are skipped only when neither the service account nor an
        // optional API key is available; otherwise they run via Vertex AI.
        if (m.provider === 'gemini' && !GEMINI_API_KEY && !SERVICE_ACCOUNT) {
          console.log(
            `[bakeoff] item=${itemId} model=${m.name} SKIPPED: no Google service account or GEMINI_API_KEY`,
          );
          return;
        }
        if (m.provider === 'openrouter' && !OPENROUTER_API_KEY) {
          // One-line summary skip already logged above; skip silently per-row.
          return;
        }

        const started = Date.now();
        try {
          const parsed =
            m.provider === 'anthropic'
              ? await callAnthropic(m.modelId, imagesBase64, mimes)
              : m.provider === 'openrouter'
                ? await callOpenRouter(m.modelId, imagesBase64, mimes)
                : await callGemini(m.modelId, imagesBase64, mimes);

          const latencyMs = Date.now() - started;

          if (!parsed) {
            console.log(
              `[bakeoff] item=${itemId} model=${m.name} ERROR: unparseable JSON response latencyMs=${latencyMs}`,
            );
            return;
          }

          const conf =
            typeof parsed.confidence === 'number' ? parsed.confidence : 'n/a';
          console.log(
            `[bakeoff] item=${itemId} model=${m.name} ` +
              `title="${truncate(parsed.title)}" ` +
              `brand="${truncate(parsed.brand, 60)}" ` +
              `category="${truncate(parsed.category, 60)}" ` +
              `condition="${truncate(parsed.condition, 30)}" ` +
              `conf=${conf} latencyMs=${latencyMs} ` +
              `evidence="${truncate(parsed.evidence, 100)}"`,
          );
        } catch (err: any) {
          const latencyMs = Date.now() - started;
          console.log(
            `[bakeoff] item=${itemId} model=${m.name} ERROR: ${shortErr(err)} latencyMs=${latencyMs}`,
          );
        }
      }),
    );

    console.log(`[bakeoff] DONE item=${itemId}`);
  } catch (err: any) {
    // Absolutely never let the harness affect the caller.
    console.log(`[bakeoff] item=${itemId} HARNESS ERROR: ${shortErr(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Grounded resolution (two-stage: extract read marks → web-grounded lookup)
// ---------------------------------------------------------------------------
//
// The point the bake-off proved: VLMs READ the identifying marks (mold #, part #,
// backstamp) but reason from SHAPE, so a Tupperware CoolSpot Trivet (mold #2828)
// gets called a "lid." The fix is to (1) transcribe the marks only, then (2) run a
// WEB-CONNECTED text lookup on those marks and let the lookup decide identity.
//
// Observability only — logs `[resolve] ...`, never mutates the item, never changes
// the applied reanalyze result. Wrapped end-to-end in try/catch so it can never
// break the response.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = {
  'content-type': 'application/json',
  'HTTP-Referer': 'https://finda.sale',
  'X-Title': 'FindaSale Resolve',
};

// Stage 1 — TRANSCRIBE ONLY across TWO strong extractors. Do NOT ask them to identify;
// just read the marks + a shape-based guess of type. We learned a single lite extractor
// MISREADS thin marks (2828 -> 2628), which poisons resolution downstream. So we run two
// stronger, independent readers and resolve EACH separately:
//   - claude-sonnet-5 via the DIRECT Anthropic path (ANTHROPIC_API_KEY) — reads marks accurately.
//   - qwen/qwen3-vl-235b via OpenRouter — OCR champion.
interface Extractor {
  name: string; // log label
  provider: 'anthropic' | 'openrouter';
  modelId: string;
}

const EXTRACTORS: Extractor[] = [
  { name: 'claude-sonnet-5', provider: 'anthropic', modelId: 'claude-sonnet-5' },
  { name: 'qwen/qwen3-vl-235b', provider: 'openrouter', modelId: 'qwen/qwen3-vl-235b-a22b-instruct' },
];

const EXTRACT_PROMPT = `You are transcribing the identifying marks off a single secondhand item from the attached photos.
Do NOT identify the product. Only transcribe what is legibly printed, molded, stamped, or embossed on it, plus a shape-based guess of what it appears to be.
Read the brand name, any model/mold/part/style number, and any other legible text (backstamp, "Made in ...", recycling code, size, patent, etc.).
If a field is not legibly present, use an empty string. Do not invent or infer anything not visibly written.

Respond with STRICT JSON ONLY, no markdown, no commentary, exactly:
{"brand":"","model_or_part_number":"","other_text":"","raw_guess_type":"your shape-based guess of what this object is"}`;

// Stage 2 — the point. ONE web-grounded text lookup per extractor, using perplexity/sonar-pro
// (fast, calibrated, honest). We deliberately dropped the rest: perplexity/sonar-reasoning is a
// 404 (invalid slug); anthropic/claude-sonnet-5:online and google/gemini-3.5-flash:online return
// unparseable JSON; google/gemini-2.5-flash-lite:online confidently HALLUCINATES on thin marks.
const RESOLVE_MODEL = 'perplexity/sonar-pro';

// Confidence gate: at or above this, we trust the grounded product identity; below it, we fall
// back to the extractor's shape-based visual guess.
const CONFIDENCE_GATE = 0.7;

interface ExtractParsed {
  brand?: string;
  model_or_part_number?: string;
  other_text?: string;
  raw_guess_type?: string;
}

interface ResolveParsed {
  product_name?: string;
  product_type?: string;
  confidence?: number | string;
  source_hint?: string;
}

/**
 * Parse a grounded-confidence value into a 0-1 number.
 * Handles numbers (0-1 or 0-100), numeric strings, and words like "high"/"medium"/"low".
 * Returns null when nothing usable is present.
 */
function parseConfidence(raw: unknown): number | null {
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return raw > 1 ? raw / 100 : raw;
  }
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (!t) return null;
    const word: Record<string, number> = {
      high: 0.9,
      'very high': 0.95,
      medium: 0.6,
      moderate: 0.6,
      low: 0.3,
      'very low': 0.1,
      none: 0,
      unknown: 0,
    };
    if (t in word) return word[t];
    const n = parseFloat(t.replace('%', ''));
    if (!Number.isNaN(n)) return n > 1 ? n / 100 : n;
  }
  return null;
}

/** Stage 1 (Anthropic direct): TRANSCRIBE marks only via the Anthropic REST endpoint. */
async function extractMarksAnthropic(
  modelId: string,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<ExtractParsed | null> {
  if (!ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY');

  const content: any[] = imagesBase64.map((data, i) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: (mimeTypes[i] || 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp',
      data,
    },
  }));
  content.push({ type: 'text', text: EXTRACT_PROMPT });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 400,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.content?.[0]?.text ?? '';
  return parseModelJson(text) as ExtractParsed | null;
}

/** Stage 1 (OpenRouter): TRANSCRIBE marks only via an OpenAI-compatible vision call. */
async function extractMarksOpenRouter(
  modelId: string,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<ExtractParsed | null> {
  if (!OPENROUTER_API_KEY) throw new Error('no OPENROUTER_API_KEY');

  const content: any[] = [{ type: 'text', text: EXTRACT_PROMPT }];
  imagesBase64.forEach((data, i) => {
    const mime = mimeTypes[i] || 'image/jpeg';
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } });
  });

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENROUTER_API_KEY}`, ...OPENROUTER_HEADERS },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content }],
      max_tokens: 400,
      provider: { data_collection: 'deny' },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  return parseModelJson(text) as ExtractParsed | null;
}

/** Dispatch one extractor by provider. */
async function extractMarksFor(
  ex: Extractor,
  imagesBase64: string[],
  mimeTypes: string[],
): Promise<ExtractParsed | null> {
  return ex.provider === 'anthropic'
    ? extractMarksAnthropic(ex.modelId, imagesBase64, mimeTypes)
    : extractMarksOpenRouter(ex.modelId, imagesBase64, mimeTypes);
}

/** Stage 2: one WEB-GROUNDED text call that resolves the real product from the marks. */
async function resolveFromMarks(
  modelId: string,
  brand: string,
  modelNum: string,
  otherText: string,
): Promise<ResolveParsed | null> {
  if (!OPENROUTER_API_KEY) throw new Error('no OPENROUTER_API_KEY');

  const prompt =
    `Using web search, identify the EXACT product from these marks read off a secondhand item: ` +
    `brand=${brand || 'unknown'}, model/part number=${modelNum || 'unknown'}, other text=${otherText || 'none'}. ` +
    `Return STRICT JSON {"product_name","product_type","confidence","source_hint"}. ` +
    `If the marks identify a specific catalogued item, name it and its type precisely ` +
    `(e.g. distinguish trivet vs lid vs plate). If genuinely unresolvable, say so.`;

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENROUTER_API_KEY}`, ...OPENROUTER_HEADERS },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      provider: { data_collection: 'deny' },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  return parseModelJson(text) as ResolveParsed | null;
}

/**
 * "Top performers only" grounded resolution pass. Runs alongside the bake-off (or
 * independently via the resolve-only trigger), observability only. Returns void, never
 * throws to the caller.
 *
 * For EACH strong extractor: transcribe marks -> resolve with perplexity/sonar-pro ->
 * apply a confidence gate to pick the FINAL identity (grounded product if conf>=gate,
 * else the extractor's shape-based visual guess). Everything is logged so we can see
 * whether a strong extractor + Sonar-Pro + gate yields the correct specific identity.
 *
 * @param itemId   the item being re-analyzed (for log correlation)
 * @param buffers  the SAME image buffers already downloaded by reanalyzeItem
 * @param mimeTypes parallel array of mime types for each buffer
 */
export async function runGroundedResolution(
  itemId: string,
  buffers: Buffer[],
  mimeTypes: string[],
): Promise<void> {
  try {
    if (!buffers || buffers.length === 0) return;
    if (!OPENROUTER_API_KEY) {
      console.log(`[resolve] item=${itemId} SKIPPED: no OPENROUTER_API_KEY (needed for resolver + qwen extractor)`);
      return;
    }

    const imagesBase64 = buffers.map((b) => b.toString('base64'));
    const mimes = buffers.map((_, i) => mimeTypes[i] || 'image/jpeg');

    console.log(
      `[resolve] item=${itemId} extractors=[${EXTRACTORS.map((e) => e.name).join(',')}] resolver=${RESOLVE_MODEL} gate=${CONFIDENCE_GATE}`,
    );

    // Run each extractor's full (extract -> resolve -> gate) pipeline in parallel. Each is
    // isolated so one extractor failing (or its resolver call failing) never kills the other.
    await Promise.all(
      EXTRACTORS.map(async (ex) => {
        // ---- Stage 1: extract read marks for THIS extractor ------------------
        let extracted: ExtractParsed | null;
        try {
          extracted = await extractMarksFor(ex, imagesBase64, mimes);
        } catch (err: any) {
          console.log(`[resolve] item=${itemId} extractor=${ex.name} stage=extract ERROR: ${shortErr(err)}`);
          return;
        }
        if (!extracted) {
          console.log(`[resolve] item=${itemId} extractor=${ex.name} stage=extract ERROR: unparseable JSON response`);
          return;
        }

        const brand = truncate(extracted.brand, 80);
        const modelNum = truncate(extracted.model_or_part_number, 80);
        const otherText = truncate(extracted.other_text, 120);
        const shapeGuess = truncate(extracted.raw_guess_type, 80);
        console.log(
          `[resolve] item=${itemId} extractor=${ex.name} brand="${brand}" model="${modelNum}" ` +
            `other="${otherText}" shapeGuess="${shapeGuess}"`,
        );

        // ---- Stage 2: web-grounded resolution on THIS extractor's marks ------
        const started = Date.now();
        let resolved: ResolveParsed | null = null;
        try {
          resolved = await resolveFromMarks(RESOLVE_MODEL, brand, modelNum, otherText);
        } catch (err: any) {
          const latencyMs = Date.now() - started;
          console.log(
            `[resolve] item=${itemId} extractor=${ex.name} resolver=${RESOLVE_MODEL} ERROR: ${shortErr(err)} latencyMs=${latencyMs}`,
          );
          // No grounded result -> fall back to the visual shape guess for FINAL.
          console.log(
            `[resolve] item=${itemId} extractor=${ex.name} FINAL id="${shapeGuess}" (via=visual-fallback)`,
          );
          return;
        }
        const latencyMs = Date.now() - started;

        if (!resolved) {
          console.log(
            `[resolve] item=${itemId} extractor=${ex.name} resolver=${RESOLVE_MODEL} ERROR: unparseable JSON response latencyMs=${latencyMs}`,
          );
          console.log(
            `[resolve] item=${itemId} extractor=${ex.name} FINAL id="${shapeGuess}" (via=visual-fallback)`,
          );
          return;
        }

        const groundedProduct = truncate(resolved.product_name);
        const groundedType = truncate(resolved.product_type, 60);
        const confNum = parseConfidence(resolved.confidence);
        const confLog = confNum === null ? 'n/a' : confNum;
        console.log(
          `[resolve] item=${itemId} extractor=${ex.name} resolver=${RESOLVE_MODEL} GROUNDED ` +
            `product="${groundedProduct}" type="${groundedType}" conf=${confLog} ` +
            `source="${truncate(resolved.source_hint, 100)}" latencyMs=${latencyMs}`,
        );

        // ---- Confidence gate + final decision --------------------------------
        const passesGate = confNum !== null && confNum >= CONFIDENCE_GATE && !!groundedProduct;
        const groundedId = [groundedProduct, groundedType].filter(Boolean).join(' — ');
        const finalId = passesGate ? groundedId : shapeGuess;
        const via = passesGate ? 'grounded' : 'visual-fallback';
        console.log(
          `[resolve] item=${itemId} extractor=${ex.name} FINAL id="${finalId}" (via=${via})`,
        );
      }),
    );

    console.log(`[resolve] DONE item=${itemId}`);
  } catch (err: any) {
    // Absolutely never let the resolution pass affect the caller.
    console.log(`[resolve] item=${itemId} HARNESS ERROR: ${shortErr(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Visual reverse-image resolution (Lens parity for VISUALLY-identified items)
// ---------------------------------------------------------------------------
//
// The grounded resolver above is TEXT-ONLY — it grounds on the marks the extractor
// transcribed. That wins when identity is textual (coin date, comic issue, watch bezel
// text) but FAILS when identity is visual: a Meissen crossed-swords mark reads as "XX",
// a Depression-glass "Princess" pattern / cast-iron trivet / maki-e lacquer box have no
// readable text at all. The fix is to send the ACTUAL IMAGE to a WEB-GROUNDED VISION
// model (Gemini powers Google Lens, so a Gemini `:online` model that SEES the image AND
// searches the web is the practical Lens equivalent), plus Google Vision Web Detection
// as a first-party visual signal.
//
// Observability only — logs `[visual] ...`, never mutates the item, never changes the
// applied reanalyze result. Whole stage + every call wrapped in try/catch; runs only on
// downloaded buffers (no writes); dryRun-safe.

// Web-grounded VISION models via OpenRouter's `:online` web plugin. Each is isolated in
// its own try/catch; if a slug is invalid it simply error-logs and the others continue.
const VISUAL_MODELS: { name: string; modelId: string }[] = [
  { name: 'gemini-2.5-flash:online', modelId: 'google/gemini-2.5-flash:online' }, // primary — Gemini = Lens lineage
  { name: 'gemini-3.5-flash:online', modelId: 'google/gemini-3.5-flash:online' },
  { name: 'gpt-4o:online', modelId: 'openai/gpt-4o:online' }, // cross-lab check
];

const VISUAL_PROMPT = `You can SEE this image and SEARCH the web. Identify the EXACT specific item — maker, named pattern, model/reference number, variant, and era — reasoning from visual features AND reverse-image/web knowledge. If it is a specific catalogued item (a named glass pattern like 'Anchor Hocking Princess', a specific porcelain maker's mark like Meissen crossed-swords, a watch reference, a comic issue), name it precisely; if genuinely unidentifiable, say so. Return STRICT JSON only: {"product","type","confidence" (0-1 number),"evidence"}.`;

interface VisualParsed {
  product?: string;
  type?: string;
  confidence?: number | string;
  evidence?: string;
}

/** One web-grounded VISION call: send the PRIMARY image + prompt to an OpenRouter `:online` model. */
async function callVisualModel(
  modelId: string,
  primaryBase64: string,
  primaryMime: string,
): Promise<VisualParsed | null> {
  if (!OPENROUTER_API_KEY) throw new Error('no OPENROUTER_API_KEY');

  const content: any[] = [
    { type: 'text', text: VISUAL_PROMPT },
    { type: 'image_url', image_url: { url: `data:${primaryMime};base64,${primaryBase64}` } },
  ];

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENROUTER_API_KEY}`, ...OPENROUTER_HEADERS },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content }],
      max_tokens: 700,
      // Privacy: never route to providers that train on the input images.
      provider: { data_collection: 'deny' },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  return parseModelJson(text) as VisualParsed | null;
}

/**
 * Visual reverse-image resolution pass. Runs under the SAME gate as runGroundedResolution
 * (bakeoff || resolveOnly). Observability only — returns void, never throws to the caller.
 *
 * On the PRIMARY image (buffers[0]) it runs, in parallel and each in its own try/catch:
 *   1. Web-grounded VISION models via OpenRouter `:online` (Gemini = Lens equivalent).
 *   2. Google Vision Web Detection (existing getWebDetectionMatch) — first-party visual signal.
 * Then it reconciles: picks the highest-confidence visual model result (VISUAL_BEST) and logs a
 * FINAL_COMBINED line so it can be compared against the `[resolve] ... FINAL` lines for the same
 * item. Never mutates anything; dryRun-safe (no writes).
 *
 * @param itemId   the item being re-analyzed (for log correlation)
 * @param buffers  the SAME image buffers already downloaded by reanalyzeItem
 * @param mimeTypes parallel array of mime types for each buffer
 */
export async function runVisualResolution(
  itemId: string,
  buffers: Buffer[],
  mimeTypes: string[],
): Promise<void> {
  try {
    if (!buffers || buffers.length === 0) return;

    const primaryBase64 = buffers[0].toString('base64');
    const primaryMime = mimeTypes[0] || 'image/jpeg';

    if (!OPENROUTER_API_KEY) {
      console.log(`[visual] item=${itemId} vision models SKIPPED: no OPENROUTER_API_KEY (web detection still attempted)`);
    }

    const modelNames = VISUAL_MODELS.map((m) => m.name).join(', ');
    console.log(`[visual] item=${itemId} models=[${modelNames}] webDetection=on`);

    // Accumulate visual-model outputs so we can pick the highest-confidence one afterward.
    const visualResults: { name: string; product: string; type: string; conf: number | null }[] = [];

    // ---- Run vision models + web detection IN PARALLEL, each isolated ----------
    const modelTasks = OPENROUTER_API_KEY
      ? VISUAL_MODELS.map(async (m) => {
          const started = Date.now();
          try {
            const parsed = await callVisualModel(m.modelId, primaryBase64, primaryMime);
            const latencyMs = Date.now() - started;
            if (!parsed) {
              console.log(`[visual] item=${itemId} model=${m.name} ERROR: unparseable JSON response latencyMs=${latencyMs}`);
              return;
            }
            const product = truncate(parsed.product);
            const type = truncate(parsed.type, 60);
            const confNum = parseConfidence(parsed.confidence);
            const confLog = confNum === null ? 'n/a' : confNum;
            console.log(
              `[visual] item=${itemId} model=${m.name} ` +
                `product="${product}" type="${type}" conf=${confLog} latencyMs=${latencyMs}`,
            );
            visualResults.push({ name: m.name, product, type, conf: confNum });
          } catch (err: any) {
            const latencyMs = Date.now() - started;
            console.log(`[visual] item=${itemId} model=${m.name} ERROR: ${shortErr(err)} latencyMs=${latencyMs}`);
          }
        })
      : [];

    const webDetectionTask = (async () => {
      try {
        const web = await getWebDetectionMatch(primaryBase64);
        if (!web) {
          console.log(`[visual] item=${itemId} webDetection ERROR: no result (gated/empty/unavailable)`);
          return;
        }
        const bestGuess = web.bestGuessLabels.slice(0, 5).map((s) => truncate(s, 60)).join(', ');
        const entities = web.webEntities.slice(0, 5).map((s) => truncate(s, 60)).join(', ');
        console.log(`[visual] item=${itemId} webDetection bestGuess=[${bestGuess}] entities=[${entities}]`);
      } catch (err: any) {
        console.log(`[visual] item=${itemId} webDetection ERROR: ${shortErr(err)}`);
      }
    })();

    await Promise.all([...modelTasks, webDetectionTask]);

    // ---- Reconcile: highest-confidence visual model result = VISUAL_BEST -------
    let best: { name: string; product: string; type: string; conf: number | null } | null = null;
    for (const r of visualResults) {
      if (!r.product) continue;
      const rConf = r.conf ?? -1;
      const bConf = best?.conf ?? -1;
      if (!best || rConf > bConf) best = r;
    }

    if (!best) {
      console.log(`[visual] item=${itemId} VISUAL_BEST none (no parseable vision-model product)`);
      console.log(`[visual] item=${itemId} FINAL_COMBINED id="" (source=visual, gated at ${CONFIDENCE_GATE} -> no visual result to compare against [resolve] FINAL lines)`);
      return;
    }

    const visualBestId = [best.product, best.type].filter(Boolean).join(' — ');
    const bestConfLog = best.conf === null ? 'n/a' : best.conf;
    console.log(
      `[visual] item=${itemId} VISUAL_BEST product="${visualBestId}" conf=${bestConfLog} via=${best.name}`,
    );

    // The text-grounded best lives in runGroundedResolution's scope (logged as [resolve] ... FINAL
    // for the same item). We surface VISUAL_BEST clearly here so it can be compared against those
    // [resolve] FINAL lines; the gate note documents how the combined decision would be made.
    const passesGate = best.conf !== null && best.conf >= CONFIDENCE_GATE && !!best.product;
    console.log(
      `[visual] item=${itemId} FINAL_COMBINED id="${visualBestId}" ` +
        `(source=visual, gated at ${CONFIDENCE_GATE} -> ${passesGate ? 'grounded' : 'visual-fallback shapeGuess'}; ` +
        `compare against [resolve] item=${itemId} FINAL lines for the text-grounded best)`,
    );
  } catch (err: any) {
    // Absolutely never let the visual pass affect the caller.
    console.log(`[visual] item=${itemId} HARNESS ERROR: ${shortErr(err)}`);
  }
}
// ===========================================================================
// PRODUCTION grounded-identity candidate resolvers
// (ADR grounded-identification-production-2026-07-02)
// ===========================================================================
//
// The runGroundedResolution / runVisualResolution functions above are OBSERVABILITY-ONLY
// (they log and return void). The functions below reuse the SAME proven call plumbing
// (extractMarks*, resolveFromMarks, callVisualModel, parseModelJson, parseConfidence,
// CONFIDENCE_GATE) but RETURN a gated candidate so the production groundedIdentityService
// can act on it. They keep the same [resolve]/[visual] log-line style for continuity.
//
// Env-overridable rosters so cost can be dialed from Railway with no deploy. gemini-3.5-flash
// is deliberately NOT in any default roster (slow / unreliable JSON — dropped per ADR).

export interface GroundedCandidate {
  identity: string;
  confidence: number;
  source: string; // "text-grounded" | "visual-consensus" | "visual-single"
  /** Clean manufacturer name straight from the mark-extraction JSON (e.g. "Tupperware"), when the
   *  extractor read one off the item. NEVER a phrase sliced from the product description. Undefined
   *  for visual candidates (no mark-extraction step) and for text candidates with no legible brand. */
  brand?: string;
}

/** Rough per-call cost estimates (USD) for the grounding ceiling accounting. Deliberately
 *  conservative; exact billing lives on OpenRouter. */
export const GROUNDING_CALL_COST = {
  extractAnthropic: 0.006, // claude-sonnet-5 vision extract
  extractOpenRouter: 0.002, // qwen3-vl extract
  resolveText: 0.004, // perplexity/sonar
  resolveTextPremium: 0.012, // perplexity/sonar-pro (escalation)
  visual: 0.008, // gemini-2.5-flash:online / gpt-4o:online per image
};

function envList(name: string, fallback: string[]): string[] {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const parsed = raw.split(',').map((x) => x.trim()).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

// TIER 1 (VALUE): cheap text resolver + single cheap extractor + one cheap visual model.
const TEXT_VALUE_MODEL = process.env.GROUNDING_TEXT_VALUE_MODEL || 'perplexity/sonar';
const TEXT_PREMIUM_MODEL = process.env.GROUNDING_TEXT_PREMIUM_MODEL || 'perplexity/sonar-pro';
const VALUE_EXTRACTOR_MODEL =
  process.env.GROUNDING_VALUE_EXTRACTOR_MODEL || 'qwen/qwen3-vl-235b-a22b-instruct';

const VISUAL_VALUE_MODELS = envList('GROUNDING_VISUAL_VALUE_MODELS', ['google/gemini-2.5-flash:online']);
// TIER 2 (PREMIUM): adds a cross-lab visual model. gpt-4o:online.
const VISUAL_PREMIUM_MODELS = envList('GROUNDING_VISUAL_PREMIUM_MODELS', ['openai/gpt-4o:online']);

/** Fuzzy identity match for visual consensus — normalized token overlap (Jaccard-ish). */
function identitiesAgree(a: string, b: string): boolean {
  const norm = (x: string) =>
    x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && inter / union >= 0.5;
}

/**
 * TEXT-GROUNDED candidate. Runs the cheap value extractor (qwen via OpenRouter) to transcribe
 * marks, then resolves them via the given text model (sonar value or sonar-pro premium). Returns
 * a gated candidate (conf >= CONFIDENCE_GATE) or null.
 *
 * @param spend a mutable accumulator {usd} the caller uses for the per-item ceiling; each paid
 *              call adds its estimated cost here AND is passed to onCall for the global ceiling.
 * @param onCall async callback fired after each paid call with its cost (for trackGroundingCall).
 * @param perItemCeilingUsd abort before a call that would exceed the per-item ceiling.
 */
export async function resolveTextGroundedCandidate(
  itemId: string,
  buffers: Buffer[],
  mimeTypes: string[],
  opts: {
    premium: boolean;
    spend: { usd: number };
    perItemCeilingUsd: number;
    onCall: (costUsd: number) => Promise<void>;
    timeoutMs?: number;
  },
): Promise<GroundedCandidate | null> {
  try {
    if (!OPENROUTER_API_KEY || !buffers || buffers.length === 0) return null;
    const imagesBase64 = buffers.map((b) => b.toString('base64'));
    const mimes = buffers.map((_, i) => mimeTypes[i] || 'image/jpeg');
    const timeoutMs = opts.timeoutMs ?? 8000;

    // ---- Stage 1: extract marks (cheap value extractor) ----
    if (opts.spend.usd + GROUNDING_CALL_COST.extractOpenRouter > opts.perItemCeilingUsd) {
      console.log(`[grounding] item=${itemId} text SKIPPED extract: per-item ceiling`);
      return null;
    }
    let extracted: ExtractParsed | null = null;
    try {
      extracted = await withTimeout(
        extractMarksOpenRouter(VALUE_EXTRACTOR_MODEL, imagesBase64, mimes),
        timeoutMs,
      );
    } catch (err: any) {
      console.log(`[grounding] item=${itemId} text extract ERROR: ${shortErr(err)}`);
      return null;
    } finally {
      opts.spend.usd += GROUNDING_CALL_COST.extractOpenRouter;
      await opts.onCall(GROUNDING_CALL_COST.extractOpenRouter);
    }
    if (!extracted) return null;

    const brand = truncate(extracted.brand, 80);
    const modelNum = truncate(extracted.model_or_part_number, 80);
    const otherText = truncate(extracted.other_text, 120);
    const shapeGuess = truncate(extracted.raw_guess_type, 80);
    // No usable marks -> nothing for the text resolver to ground on.
    if (!brand && !modelNum && !otherText) {
      console.log(`[grounding] item=${itemId} text: no marks extracted, shapeGuess="${shapeGuess}"`);
      return null;
    }

    // ---- Stage 2: web-grounded resolve ----
    const resolveModel = opts.premium ? TEXT_PREMIUM_MODEL : TEXT_VALUE_MODEL;
    const callCost = opts.premium ? GROUNDING_CALL_COST.resolveTextPremium : GROUNDING_CALL_COST.resolveText;
    if (opts.spend.usd + callCost > opts.perItemCeilingUsd) {
      console.log(`[grounding] item=${itemId} text SKIPPED resolve: per-item ceiling`);
      return null;
    }
    let resolved: ResolveParsed | null = null;
    try {
      resolved = await withTimeout(resolveFromMarks(resolveModel, brand, modelNum, otherText), timeoutMs);
    } catch (err: any) {
      console.log(`[grounding] item=${itemId} text resolver=${resolveModel} ERROR: ${shortErr(err)}`);
      return null;
    } finally {
      opts.spend.usd += callCost;
      await opts.onCall(callCost);
    }
    if (!resolved) return null;

    const groundedProduct = truncate(resolved.product_name);
    const groundedType = truncate(resolved.product_type, 60);
    const confNum = parseConfidence(resolved.confidence);
    const passesGate = confNum !== null && confNum >= CONFIDENCE_GATE && !!groundedProduct;
    const identity = [groundedProduct, groundedType].filter(Boolean).join(' — ');
    console.log(
      `[grounding] item=${itemId} text resolver=${resolveModel} product="${identity}" ` +
        `conf=${confNum === null ? 'n/a' : confNum} passesGate=${passesGate}`,
    );
    if (!passesGate) return null;
    // Clean manufacturer name from the extractor (e.g. "Tupperware"), if one was legibly read.
    // "unknown"/empty -> undefined so the orchestrator never writes a placeholder brand.
    const cleanBrand = brand && brand.trim() && brand.trim().toLowerCase() !== 'unknown' ? brand.trim() : undefined;
    return { identity, confidence: confNum as number, source: 'text-grounded', brand: cleanBrand };
  } catch (err: any) {
    console.log(`[grounding] item=${itemId} text HARNESS ERROR: ${shortErr(err)}`);
    return null;
  }
}

/**
 * VISUAL candidate via CONSENSUS across web-grounded vision models on the PRIMARY image, with
 * Google Vision Web Detection as a corroborator/tiebreaker only. Combine rule:
 *   - if two visual models AGREE on identity (fuzzy) AND both conf >= gate -> strong consensus
 *   - if they disagree, take the higher-conf ONLY if its conf >= 0.8
 *   - a single model result passes only at conf >= 0.8 (guards against a lone confident hallucination)
 * Returns a gated candidate or null.
 */
export async function resolveVisualCandidate(
  itemId: string,
  buffers: Buffer[],
  mimeTypes: string[],
  opts: {
    models: string[];
    spend: { usd: number };
    perItemCeilingUsd: number;
    onCall: (costUsd: number) => Promise<void>;
    timeoutMs?: number;
  },
): Promise<GroundedCandidate | null> {
  try {
    if (!OPENROUTER_API_KEY || !buffers || buffers.length === 0) return null;
    const primaryBase64 = buffers[0].toString('base64');
    const primaryMime = mimeTypes[0] || 'image/jpeg';
    const timeoutMs = opts.timeoutMs ?? 8000;

    const results: { model: string; product: string; type: string; conf: number | null }[] = [];
    for (const modelId of opts.models) {
      if (opts.spend.usd + GROUNDING_CALL_COST.visual > opts.perItemCeilingUsd) {
        console.log(`[grounding] item=${itemId} visual SKIPPED ${modelId}: per-item ceiling`);
        break;
      }
      let parsed: VisualParsed | null = null;
      try {
        parsed = await withTimeout(callVisualModel(modelId, primaryBase64, primaryMime), timeoutMs);
      } catch (err: any) {
        console.log(`[grounding] item=${itemId} visual model=${modelId} ERROR: ${shortErr(err)}`);
        opts.spend.usd += GROUNDING_CALL_COST.visual;
        await opts.onCall(GROUNDING_CALL_COST.visual);
        continue;
      }
      opts.spend.usd += GROUNDING_CALL_COST.visual;
      await opts.onCall(GROUNDING_CALL_COST.visual);
      if (!parsed) continue;
      const product = truncate(parsed.product);
      const type = truncate(parsed.type, 60);
      const conf = parseConfidence(parsed.confidence);
      if (!product) continue;
      results.push({ model: modelId, product, type, conf });
      console.log(
        `[grounding] item=${itemId} visual model=${modelId} product="${product}" conf=${conf === null ? 'n/a' : conf}`,
      );
    }

    if (results.length === 0) return null;

    const idOf = (r: { product: string; type: string }) => [r.product, r.type].filter(Boolean).join(' — ');

    // Consensus: any two models agreeing (fuzzy) with both conf >= gate.
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i];
        const b = results[j];
        if (
          a.conf !== null && b.conf !== null &&
          a.conf >= CONFIDENCE_GATE && b.conf >= CONFIDENCE_GATE &&
          identitiesAgree(idOf(a), idOf(b))
        ) {
          const winner = a.conf >= b.conf ? a : b;
          console.log(`[grounding] item=${itemId} visual CONSENSUS id="${idOf(winner)}" conf=${winner.conf}`);
          return { identity: idOf(winner), confidence: winner.conf as number, source: 'visual-consensus' };
        }
      }
    }

    // Disagreement / single model: take the highest-conf, but only if conf >= 0.8.
    let best = results[0];
    for (const r of results) if ((r.conf ?? -1) > (best.conf ?? -1)) best = r;
    if (best.conf !== null && best.conf >= 0.8) {
      console.log(`[grounding] item=${itemId} visual SINGLE id="${idOf(best)}" conf=${best.conf} (>=0.8)`);
      return { identity: idOf(best), confidence: best.conf, source: 'visual-single' };
    }
    console.log(`[grounding] item=${itemId} visual no gated candidate (best conf=${best.conf ?? 'n/a'})`);
    return null;
  } catch (err: any) {
    console.log(`[grounding] item=${itemId} visual HARNESS ERROR: ${shortErr(err)}`);
    return null;
  }
}

/** Hard per-call timeout wrapper — rejects if the promise does not settle within ms. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// Re-export the value/premium visual roster resolvers so the orchestrator can pass them by tier.
export const GROUNDING_VISUAL_VALUE_MODELS = VISUAL_VALUE_MODELS;
export const GROUNDING_VISUAL_PREMIUM_MODELS = VISUAL_PREMIUM_MODELS;
