/**
 * The card-only prompt for the photo recognizer (ADR-138 section 4).
 *
 * Deliberately NOT the listing prompt used by item tagging: it asks for identity fields only, with no title,
 * description, price, tags or shipping estimate, and it receives no Vision labels, no object guesses, no web
 * detection and no marketplace image-search hints. The card field list mirrors the trading card paragraph of the
 * item tagging prompt so the same vocabulary normalizer (normalizeAiCard) validates the answer.
 */
import { CARD_GAME_LABELS } from '../../../constants/cardVocabulary';
import type { RecognitionHint } from './types';

/** Only this much recognized text is passed along, so a noisy frame cannot inflate the prompt. */
export const MAX_OCR_PROMPT_CHARS = 1500;

export const CARD_SCAN_INSTRUCTIONS = `You read ONE collectible trading card from a photo. Respond with ONLY valid JSON (no markdown, no explanation).

If the photo does not clearly show a single collectible trading card (Magic: The Gathering, Pokemon, Yu-Gi-Oh!, Disney Lorcana, One Piece, a sports card, or another card game), respond with {"card": null, "confidence": 0}.

Otherwise fill the "card" object. Fields: game (MTG | POKEMON | YUGIOH | LORCANA | ONE_PIECE | OTHER; use OTHER for sports cards and any other card game), cardName (as printed), setName and setCode (only if printed on the card), collectorNumber (as printed, e.g. "138/195"), language (en | es | fr | de | it | pt | ja | ko | ru | zhs | zht), finish (NONFOIL | FOIL | ETCHED | HOLO | REVERSE_HOLO, only if clearly visible).
Report a field ONLY if it is printed or clearly readable on the card; never guess a set or collector number from memory, use null instead. Copy printed text exactly as shown and do not replace it with a more familiar spelling.
Then EITHER (ungraded card) set "suggestedCardCondition" to NM | LP | MP | HP | DMG judged from visible edge and corner wear, whitening, scratches, creases and bends. Be conservative: when unsure between two conditions pick the WORSE one, and use null if the photo cannot show the card's surface and edges well. OR (card inside a graded slab) set "grader" (PSA | BGS | BVG | BCCG | CGC | SGC | TAG | CSG | HGA | ISA | OTHER), "grade" (the number on the label, e.g. "9" or "9.5") and "certNumber", each read from the slab label only, and leave "suggestedCardCondition" null.
"confidence" is your own 0.0 to 1.0 rating of how sure you are of the identification.

{
  "card": {
    "game": "one of the game values above",
    "cardName": null,
    "setName": null,
    "setCode": null,
    "collectorNumber": null,
    "language": null,
    "finish": null,
    "suggestedCardCondition": null,
    "grader": null,
    "grade": null,
    "certNumber": null
  },
  "confidence": 0.8
}`;

/** Control characters and runs of whitespace are flattened so recognized text cannot break the prompt layout. */
export function cleanOcrText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_OCR_PROMPT_CHARS);
}

/**
 * The text block sent after the image. ocrText is present only in OCR_PLUS_HAIKU mode; it is evidence for the
 * printed words, and the picture still decides when the two disagree.
 */
export function buildCardScanPrompt(hint: RecognitionHint, ocrText?: string | null): string {
  const parts: string[] = [CARD_SCAN_INSTRUCTIONS];
  if (hint.game && Object.prototype.hasOwnProperty.call(CARD_GAME_LABELS, hint.game)) {
    parts.push(`Likely game (from the seller, may be wrong, trust the card itself): ${hint.game}.`);
  }
  const text = cleanOcrText(ocrText ?? '');
  if (text !== '') {
    parts.push(
      `Text read from the photo by character recognition (it may contain mistakes; use it only to help read printed words, and trust the picture if they disagree): ${text}`
    );
  }
  return parts.join('\n\n');
}
