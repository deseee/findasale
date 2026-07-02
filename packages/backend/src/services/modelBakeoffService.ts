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
 * Gated entirely behind the AI_TAG_BAKEOFF env flag (default OFF). When OFF the
 * harness is never invoked and zero extra API calls are made.
 *
 * NO new npm dependencies:
 *   - Claude models call the existing Anthropic REST endpoint via global fetch,
 *     reusing process.env.ANTHROPIC_API_KEY (same key/pattern as cloudAIService).
 *   - Gemini models call the Google Generative Language REST endpoint via global
 *     fetch. If no Gemini-capable key is configured, the Gemini rows log SKIPPED.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Gemini key resolution. The dedicated var is GEMINI_API_KEY (Google AI Studio).
 * We do NOT reuse GG_API_KEY (that is a GitGuardian token, prefix "gg_pat") and we
 * do NOT assume GOOGLE_VISION_API_KEY works for generativelanguage — but if Patrick
 * has explicitly pointed GOOGLE_GENAI_API_KEY at a Gemini key we honor it too.
 */
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '';

interface BakeoffModel {
  name: string; // log label
  provider: 'anthropic' | 'gemini';
  modelId: string; // provider model id
}

const BAKEOFF_MODELS: BakeoffModel[] = [
  { name: 'claude-haiku-4.5', provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001' },
  { name: 'claude-sonnet-5', provider: 'anthropic', modelId: 'claude-sonnet-5' },
  { name: 'claude-opus-4.8', provider: 'anthropic', modelId: 'claude-opus-4-8' },
  { name: 'gemini-2.5-flash-lite', provider: 'gemini', modelId: 'gemini-2.5-flash-lite' },
  { name: 'gemini-3.5-flash', provider: 'gemini', modelId: 'gemini-3.5-flash' },
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

/** True when the bake-off flag is explicitly enabled. */
export function isBakeoffEnabled(): boolean {
  return process.env.AI_TAG_BAKEOFF === 'true';
}

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
  if (!GEMINI_API_KEY) throw new Error('no Gemini API key');

  const parts: any[] = imagesBase64.map((data, i) => ({
    inline_data: { mime_type: mimeTypes[i] || 'image/jpeg', data },
  }));
  parts.push({ text: BAKEOFF_PROMPT });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${truncate(body, 140)}`);
  }
  const json: any = await resp.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ?? '';
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
    if (!isBakeoffEnabled()) return;
    if (!buffers || buffers.length === 0) return;

    const imagesBase64 = buffers.map((b) => b.toString('base64'));
    const mimes = buffers.map((_, i) => mimeTypes[i] || 'image/jpeg');

    const modelNames = BAKEOFF_MODELS.map((m) => m.name).join(', ');
    console.log(`[bakeoff] START item=${itemId} models=[${modelNames}]`);

    await Promise.all(
      BAKEOFF_MODELS.map(async (m) => {
        // Gemini rows are skipped (not called) when no Gemini key is configured.
        if (m.provider === 'gemini' && !GEMINI_API_KEY) {
          console.log(
            `[bakeoff] item=${itemId} model=${m.name} SKIPPED: no Gemini API key (set GEMINI_API_KEY)`,
          );
          return;
        }

        const started = Date.now();
        try {
          const parsed =
            m.provider === 'anthropic'
              ? await callAnthropic(m.modelId, imagesBase64, mimes)
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
