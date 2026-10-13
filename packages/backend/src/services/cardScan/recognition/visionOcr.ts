/**
 * Text detection for the OCR_PLUS_HAIKU mode (ADR-138 sections 4 and 5.2). Selected only by CARD_SCAN_MODE=OCR_PLUS_HAIKU.
 *
 * One Vision feature only (TEXT_DETECTION). It is a NEW function and not a reuse of getVisionLabels because that
 * helper bundles label and object detection too (more cost) and throws away the full printed text block.
 *
 * Request shape: copied from getVisionLabels in services/cloudAIService.ts (same endpoint, same
 * { requests: [{ image: { content }, features: [...] }] } body, same 15 second timeout), with the feature list cut
 * down to TEXT_DETECTION. The full text block is read from textAnnotations[0].description, exactly as that helper
 * does for its ISBN and FCC id extraction. fullTextAnnotation.text is accepted as a second source and is UNVERIFIED.
 *
 * Nothing here runs by itself. Tests pass a fake HTTP client; no live call is made in this batch.
 */
import type { EnvLike, HttpPostClient, RecognitionFrame } from './types';
import { cleanOcrText } from './prompt';

export const VISION_ANNOTATE_URL = 'https://vision.googleapis.com/v1/images:annotate';
export const VISION_TIMEOUT_MS = 15000;
/** Google Vision TEXT_DETECTION alone is $1.50 per 1,000 images ($0.0015) on Google's pricing page, past the 1,000 free units a month. The regular photo pipeline's three bundled features are booked at $0.00525 in lib/aiCostTracker.ts trackVisionCall. */
export const VISION_TEXT_DETECTION_COST_USD = 0.0015;

export type OcrOutcome = { ok: true; text: string; costUsd: number } | { ok: false };

/** Reads the text of one frame. The provider treats a failure as "no text" and goes on with the picture alone. */
export type OcrClient = (frame: RecognitionFrame) => Promise<OcrOutcome>;

export interface VisionOcrDeps {
  http: HttpPostClient;
  /** Read when the client is called, never at import time. */
  env?: EnvLike;
}

/** The request body: one image, one feature. */
export function buildVisionTextRequest(imageBase64: string): {
  requests: Array<{ image: { content: string }; features: Array<{ type: 'TEXT_DETECTION'; maxResults: number }> }>;
} {
  return {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      },
    ],
  };
}

/** The full printed text block of the answer, cleaned, or an empty string when the frame had no text. */
export function extractFullText(data: any): string {
  const first = data?.responses?.[0];
  const block = first?.textAnnotations?.[0]?.description;
  if (typeof block === 'string' && block.trim() !== '') return cleanOcrText(block);
  const full = first?.fullTextAnnotation?.text;
  if (typeof full === 'string' && full.trim() !== '') return cleanOcrText(full);
  return '';
}

export function createVisionOcr(deps: VisionOcrDeps): OcrClient {
  return async (frame: RecognitionFrame): Promise<OcrOutcome> => {
    const key = (deps.env ?? process.env).GOOGLE_VISION_API_KEY;
    if (!key || key.trim() === '') return { ok: false };
    try {
      const response = await deps.http.post(
        `${VISION_ANNOTATE_URL}?key=${key}`,
        buildVisionTextRequest(frame.buffer.toString('base64')),
        { timeout: VISION_TIMEOUT_MS }
      );
      if (typeof response.status === 'number' && (response.status < 200 || response.status >= 300)) return { ok: false };
      return { ok: true, text: extractFullText(response.data), costUsd: VISION_TEXT_DETECTION_COST_USD };
    } catch {
      // The error object can carry the request URL (which contains the key), so it is never logged.
      return { ok: false };
    }
  };
}
