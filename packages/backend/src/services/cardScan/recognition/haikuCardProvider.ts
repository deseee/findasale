/**
 * HAIKU_ONLY provider (ADR-138 section 4, the default): ONE Claude Haiku call per frame with a card-only prompt.
 * In OCR_PLUS_HAIKU mode one Google Vision TEXT_DETECTION call runs first and its text is added to the prompt.
 *
 * What it never does: Vision label or object detection, web detection, marketplace image search, catalog image
 * matching. It does not touch the item tagging pipeline and it never calls the shared AI token counters; spend is
 * metered by scanCostGuard.ts in its own pool.
 *
 * The request mirrors getHaikuAnalysis in services/cloudAIService.ts (same endpoint, headers, image block and
 * ANTHROPIC_MODEL default), with a smaller max_tokens. The answer is validated by normalizeAiCard, the same
 * vocabulary normalizer that card-aware tagging uses, so an unknown game drops the whole card and any bad value is
 * dropped on its own. All network I/O goes through the injected client.
 */
import { normalizeAiCard } from '../../cardAiSuggestion';
import type { AICardResult } from '../../cardAiSuggestion';
import { getScanConfig } from '../config';
import type { ScanMode } from '../config';
import type { OcrClient } from './visionOcr';
import { buildCardScanPrompt } from './prompt';
import { failure } from './types';
import type {
  CardObservation,
  CardRecognitionProvider,
  EnvLike,
  HttpPostClient,
  RecognitionFrame,
  RecognitionHint,
  RecognitionOutcome,
  RecognitionUsage,
} from './types';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
/** Same default as cloudAIService.ts. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
export const HAIKU_MAX_TOKENS = 300;
export const HAIKU_TIMEOUT_MS = 20000;
/** Used only when the response carries no usage object (ADR section 5.1 arithmetic: about 1,000 image plus 450 prompt, about 150 out). */
export const ESTIMATED_INPUT_TOKENS = 1450;
export const ESTIMATED_OUTPUT_TOKENS = 150;

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export interface HaikuCardProviderDeps {
  http: HttpPostClient;
  /** computeAnthropicCostUsd from lib/aiCostTracker, wired by registry.ts so this file imports no tracker. */
  computeCostUsd: (model: string, inputTokens: number, outputTokens: number) => number;
  /** Overrides CARD_SCAN_MODE when set. */
  mode?: ScanMode;
  /** Required for OCR_PLUS_HAIKU; ignored otherwise. */
  ocr?: OcrClient | null;
  /** Read when a frame is recognized, never at import time. Defaults to process.env. */
  env?: EnvLike;
}

function presentKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function statusOf(err: unknown): number | null {
  const e = err as { response?: { status?: unknown }; status?: unknown } | null | undefined;
  const status = e?.response?.status ?? e?.status;
  return typeof status === 'number' ? status : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function buildUsage(model: string, rawUsage: any, extraCostUsd: number, computeCostUsd: HaikuCardProviderDeps['computeCostUsd']): RecognitionUsage {
  const inputTokens = finiteNumber(rawUsage?.input_tokens);
  const outputTokens = finiteNumber(rawUsage?.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return { costUsd: computeCostUsd(model, ESTIMATED_INPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS) + extraCostUsd };
  }
  return { inputTokens, outputTokens, costUsd: computeCostUsd(model, inputTokens, outputTokens) + extraCostUsd };
}

/** Pulls the JSON object out of the model text (fences and stray prose tolerated). Returns undefined when there is none. */
export function parseModelJson(text: string): unknown | undefined {
  const raw = text.replace(/```json\n?|\n?```/g, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** The reading for one validated card. Finish stays a hint and the condition stays a suggestion. */
export function toObservation(card: AICardResult, confidence: number | undefined): CardObservation {
  const obs: CardObservation = { providerId: 'haiku-card', game: card.game };
  if (card.cardName) obs.cardName = card.cardName;
  if (card.setCode) obs.setCode = card.setCode;
  if (card.setName) obs.setName = card.setName;
  if (card.collectorNumber) obs.collectorNumber = card.collectorNumber;
  if (card.language) obs.language = card.language;
  if (card.finish) obs.finish = card.finish;
  if (card.suggestedCardCondition) obs.suggestedConditionCode = card.suggestedCardCondition;
  if (card.grader) obs.grader = card.grader;
  if (card.grade) obs.grade = card.grade;
  if (card.certNumber) obs.certNumber = card.certNumber;
  if (confidence !== undefined) obs.confidence = confidence;
  return obs;
}

function hasIdentity(card: AICardResult): boolean {
  return Boolean(card.cardName) || Boolean(card.setCode && card.collectorNumber);
}

export function createHaikuCardProvider(deps: HaikuCardProviderDeps): CardRecognitionProvider {
  const modeFor = (env: EnvLike): ScanMode => deps.mode ?? getScanConfig(env).mode;

  const provider: CardRecognitionProvider = {
    id: 'haiku-card',

    isAvailable(env: EnvLike): boolean {
      const cfg = getScanConfig(env);
      if (!cfg.enabled || cfg.provider !== 'haiku-card') return false;
      if (!presentKey(env.ANTHROPIC_API_KEY)) return false;
      if (modeFor(env) === 'OCR_PLUS_HAIKU') {
        return Boolean(deps.ocr) && presentKey(env.GOOGLE_VISION_API_KEY);
      }
      return true;
    },

    async recognize(frame: RecognitionFrame, hint: RecognitionHint): Promise<RecognitionOutcome> {
      const env = deps.env ?? process.env;
      if (!provider.isAvailable(env)) return failure('DISABLED', false);
      if (!frame || !frame.buffer || frame.buffer.length === 0) return failure('UNREADABLE', false);
      const mimeType = String(frame.mimeType ?? '').toLowerCase();
      if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)) return failure('UNREADABLE', false);

      const model = (env.ANTHROPIC_MODEL ?? '').trim() || DEFAULT_ANTHROPIC_MODEL;

      // Optional text detection. A failure here only means the picture is read without the extra text.
      let ocrText = '';
      let ocrCostUsd = 0;
      if (modeFor(env) === 'OCR_PLUS_HAIKU' && deps.ocr) {
        try {
          const ocr = await deps.ocr(frame);
          if (ocr.ok) {
            ocrText = ocr.text;
            ocrCostUsd = ocr.costUsd;
          }
        } catch {
          // Treated as no text.
        }
      }
      const spentSoFar = ocrCostUsd > 0 ? { costUsd: ocrCostUsd } : undefined;

      const body = {
        model,
        max_tokens: HAIKU_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: frame.buffer.toString('base64') } },
              { type: 'text', text: buildCardScanPrompt(hint ?? {}, ocrText) },
            ],
          },
        ],
      };

      let response: { status?: number; data: any };
      try {
        response = await deps.http.post(ANTHROPIC_MESSAGES_URL, body, {
          headers: {
            'x-api-key': (env.ANTHROPIC_API_KEY as string).trim(),
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: HAIKU_TIMEOUT_MS,
        });
      } catch (err) {
        // Never log the error object: it can carry request headers.
        return failure(statusOf(err) === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR', false, spentSoFar);
      }
      if (typeof response.status === 'number' && response.status >= 400) {
        return failure(response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR', false, spentSoFar);
      }

      // From here on tokens were really spent, so every outcome carries the real cost.
      const usage = buildUsage(model, response.data?.usage, ocrCostUsd, deps.computeCostUsd);
      const text = response.data?.content?.[0]?.text;
      if (typeof text !== 'string') return failure('PROVIDER_ERROR', false, usage);

      const parsed = parseModelJson(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return failure('PROVIDER_ERROR', false, usage);
      const record = parsed as Record<string, unknown>;

      const rawCard = Object.prototype.hasOwnProperty.call(record, 'card') ? record.card : record;
      if (rawCard === null || rawCard === undefined) return failure('NO_CARD', true, usage);
      const card = normalizeAiCard(rawCard);
      if (!card) return failure('NO_CARD', true, usage);
      if (!hasIdentity(card)) return failure('UNREADABLE', true, usage);

      const reported = finiteNumber(record.confidence);
      const confidence = reported === undefined ? undefined : Math.min(1, reported);
      return { ok: true, observation: toObservation(card, confidence), usage };
    },
  };
  return provider;
}
