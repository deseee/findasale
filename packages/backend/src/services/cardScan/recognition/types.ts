/**
 * Recognition provider contract (ADR-138 section 4, batch B4).
 *
 * This directory is the ONLY place under services/cardScan allowed to import an AI service, an HTTP client or
 * the shared cost tracker. The scan core never imports it; the controller (batch B5) injects a provider.
 *
 * Everything a provider returns is a READING. Finish is a hint, condition is a suggestion, and neither is ever
 * written as the card's finish or condition by anything in this directory.
 */
import type { CardGame } from '../../../constants/cardVocabulary';
import type { CardObservation, ObservationProviderId } from '../types';
import type { EnvLike } from '../config';

export type { CardObservation, ObservationProviderId, EnvLike };

export const RECOGNITION_FAILURES = ['NO_CARD', 'UNREADABLE', 'PROVIDER_ERROR', 'RATE_LIMIT', 'DISABLED', 'CAP_REACHED'] as const;
export type RecognitionFailure = (typeof RECOGNITION_FAILURES)[number];

export interface RecognitionUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** What this frame really cost, in US dollars (model tokens plus any text-detection call). */
  costUsd: number;
}

/**
 * ok true: a reading. ok false: nothing usable.
 *
 * chargeable is true only when the provider did paid work AND the answer is a real answer about the picture
 * (NO_CARD, UNREADABLE): the organizer keeps the Smart tag spent. Every other failure is not chargeable and the
 * tag is refunded.
 *
 * usage on a failure (an addition to the ADR contract) is present whenever tokens were really spent, even when the
 * answer was unusable (for example malformed JSON). The cost guard should then be settled with that cost instead of
 * refunded, so the platform spend pool stays honest.
 */
export type RecognitionOutcome =
  | { ok: true; observation: CardObservation; usage: RecognitionUsage }
  | { ok: false; code: RecognitionFailure; chargeable: boolean; usage?: RecognitionUsage };

export interface RecognitionFrame {
  buffer: Buffer;
  mimeType: string;
}

export interface RecognitionHint {
  game?: CardGame;
}

export interface CardRecognitionProvider {
  id: ObservationProviderId;
  /** Flag and key presence only. Never touches the network. */
  isAvailable(env: EnvLike): boolean;
  recognize(frame: RecognitionFrame, hint: RecognitionHint): Promise<RecognitionOutcome>;
}

/**
 * The narrow HTTP surface the providers need (axios.post satisfies it). Tests pass a fake, so no test ever opens a
 * connection. A real client throws on a non 2xx answer; a fake may also return a status, and both are handled.
 */
export interface HttpPostClient {
  post(
    url: string,
    body: unknown,
    config: { headers?: Record<string, string>; timeout?: number }
  ): Promise<{ status?: number; data: any }>;
}

export function failure(code: RecognitionFailure, chargeable: boolean, usage?: RecognitionUsage): RecognitionOutcome {
  return usage ? { ok: false, code, chargeable, usage } : { ok: false, code, chargeable };
}
