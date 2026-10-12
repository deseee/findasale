/**
 * Provider factory (ADR-138 section 4). getRecognitionProvider(env) returns the configured provider, or a disabled
 * provider for any value it does not know (unknown values fail closed). Batch B5 calls this and injects the result
 * into the controller; nothing in the scan core imports this directory.
 *
 *   CARD_SCAN_PROVIDER=haiku-card (default)  -> the Haiku provider, in the mode CARD_SCAN_MODE selects
 *   CARD_SCAN_PROVIDER=scrydex | ximilar     -> typed stubs that make no network call
 *   anything else                            -> the disabled provider
 *
 * Creating a provider makes no network call. The real HTTP client (axios) and the real cost function are the
 * defaults and can be replaced through deps, which is how every test runs without a connection.
 */
import axios from 'axios';
import { computeAnthropicCostUsd } from '../../../lib/aiCostTracker';
import { getScanConfig } from '../config';
import type { ScanMode } from '../config';
import { createHaikuCardProvider } from './haikuCardProvider';
import { scrydexProvider } from './scrydexProvider.stub';
import { ximilarProvider } from './ximilarProvider.stub';
import { createVisionOcr } from './visionOcr';
import type { OcrClient } from './visionOcr';
import { failure } from './types';
import type { CardRecognitionProvider, EnvLike, HttpPostClient } from './types';

export interface RecognitionRegistryDeps {
  http?: HttpPostClient;
  computeCostUsd?: (model: string, inputTokens: number, outputTokens: number) => number;
  /** Replaces the text detection client used by OCR_PLUS_HAIKU. */
  ocr?: OcrClient | null;
}

/** Used when no recognizer is configured or the configured value is unknown. */
export const disabledProvider: CardRecognitionProvider = {
  id: 'manual',
  isAvailable: () => false,
  recognize: async () => failure('DISABLED', false),
};

export function getRecognitionProvider(env: EnvLike = process.env, deps: RecognitionRegistryDeps = {}): CardRecognitionProvider {
  const cfg = getScanConfig(env);
  switch (cfg.provider) {
    case 'haiku-card': {
      const http: HttpPostClient = deps.http ?? { post: (url, body, config) => axios.post(url, body, config) };
      const ocr: OcrClient | null =
        cfg.mode === 'OCR_PLUS_HAIKU' ? (deps.ocr === undefined ? createVisionOcr({ http, env }) : deps.ocr) : null;
      return createHaikuCardProvider({
        http,
        computeCostUsd: deps.computeCostUsd ?? computeAnthropicCostUsd,
        mode: cfg.mode,
        ocr,
        env,
      });
    }
    case 'scrydex':
      return scrydexProvider;
    case 'ximilar':
      return ximilarProvider;
    default:
      return disabledProvider;
  }
}

export interface RecognitionStatus {
  providerId: CardRecognitionProvider['id'];
  mode: ScanMode;
  providerReady: boolean;
}

/** What the status route reports. Flag and key presence only, no network. */
export function getRecognitionStatus(env: EnvLike = process.env, deps: RecognitionRegistryDeps = {}): RecognitionStatus {
  const provider = getRecognitionProvider(env, deps);
  return { providerId: provider.id, mode: getScanConfig(env).mode, providerReady: provider.isAvailable(env) };
}
