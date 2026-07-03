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
