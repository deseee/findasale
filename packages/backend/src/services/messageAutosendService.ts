/**
 * messageAutosendService.ts — Feature #602 (2026-08-05): AI Message-Reply Autosend,
 * Price + Availability.
 *
 * Extends the buyer-message-reply concept the shipping-zip/dimensions design doc
 * (extension-feature-ideation-2026-07-17) described, but NOTE: at the time this file
 * was written, no shipping-zip/dimensions message-reading/autosend code existed
 * anywhere in this repo (schema.prisma, every controller, and the full extension/
 * directory were all searched — zero matches for autosend/autoReply/draft-reply
 * logic). That prior feature was a design, never shipped code. This file is the
 * FIRST real message-autosend decision engine in the codebase, built from scratch
 * against the SAME organizer-trusted eBay best-offer thresholds already used for
 * real money decisions today (Item.bestOfferAutoAcceptAmt/bestOfferMinimumAmt) and
 * the new organizer-default percentages (Feature #603, Organizer.defaultBestOfferAcceptPct/
 * defaultBestOfferDeclinePct).
 *
 * Deliberately a pure, self-contained decision module: given a buyer message's text
 * plus the item/organizer context, return a decision (autosend + reply text, or
 * draft-only) and a same-shape log row. No LLM/AI API call of any kind — regex/string
 * parsing only, both per this project's zero-tolerance no-unapproved-spend rule and
 * because a plain, auditable parser is the right tool for "does this text contain
 * exactly one unambiguous dollar figure" (an LLM call here would also be a NEW attack
 * surface for prompt-injection-style buyer-message manipulation that a fixed regex
 * simply has no surface for).
 *
 * SECURITY (self-check, see dispatch return): the parser only ever extracts a NUMBER
 * from buyer-supplied text — it can never cause code execution or query manipulation.
 * A buyer cannot force an unintended AUTOSENT_ACCEPT except by typing a real single
 * dollar figure at or above the organizer's own configured accept threshold, which is
 * the exact same trust boundary eBay's own built-in Best Offer auto-accept already
 * has today (organizer sets the threshold, ANY buyer message hitting it is accepted).
 * This is not a new class of risk, it inherits an existing one the organizer already
 * lives with on eBay. Cross-tenant safety is enforced entirely by the CALLER
 * (extensionController.ts's assertItemOwned) — this module never reads req/res or
 * performs its own auth; it trusts the item/organizer objects it's handed.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

export type AutosendCategory = 'PRICE' | 'AVAILABILITY';

export type AutosendDecision =
  | 'AUTOSENT_ACCEPT'
  | 'AUTOSENT_DECLINE'
  | 'AUTOSENT_AVAILABLE'
  | 'DRAFT_ONLY_AMBIGUOUS'
  | 'DRAFT_ONLY_MIDBAND'
  | 'DRAFT_ONLY_NO_THRESHOLD'
  | 'DRAFT_ONLY_NOT_AVAILABLE'
  | 'DRAFT_ONLY_FEATURE_DISABLED';

export interface AutosendResult {
  category: AutosendCategory | null;
  decision: AutosendDecision | null;
  autosend: boolean;
  replyText: string | null;
}

// Max length of buyer text considered — bounds regex work against pathologically
// long input (defensive against a ReDoS-shaped abuse attempt, even though none of
// the patterns below are of the catastrophic-backtracking shape).
const MAX_MESSAGE_LEN = 2000;
// How much of the raw message we keep in the log row — debugging aid only.
const SNIPPET_LEN = 300;

// --- Message classification -------------------------------------------------

const AVAILABILITY_PATTERN =
  /\b(still (have|available|for sale|selling)|is (it|this) (still )?available|available\?|do you still have|you still have|is this (still )?sold|sold yet|is this gone)\b/i;

/**
 * Best-effort category guess: PRICE if the message contains anything money-shaped
 * ($ sign or "best offer"/"take" phrasing), else AVAILABILITY if it matches a still-
 * available question, else null (not recognized — draft-only, no autosend, matches
 * the existing project convention of falling back to draft-only for anything not
 * confidently matched).
 */
export function classifyMessage(rawText: string): AutosendCategory | null {
  const text = (rawText || '').slice(0, MAX_MESSAGE_LEN);
  if (/\$/.test(text) || /\bbest offer\b/i.test(text)) return 'PRICE';
  if (AVAILABILITY_PATTERN.test(text)) return 'AVAILABILITY';
  return null;
}

// --- Price parsing ------------------------------------------------------------

// Hedge language — ANY match anywhere in the message means "not unambiguous", fall
// back to draft-only regardless of how many/few dollar figures are present.
const HEDGE_PATTERN = /\b(or so|-?ish\b|roughly|about|around|approx(?:imately)?|maybe|give or take|somewhere)\b/i;

// Range language — "$35-40", "$35-$40", "$35 to $40", "between $35 and $40".
const RANGE_PATTERN = /\$\s?\d+(?:\.\d{1,2})?\s*(?:-|–|—|to)\s*\$?\d+(?:\.\d{1,2})?|\bbetween\b.*\$\d/i;

// A single dollar-prefixed figure, e.g. "$35", "$35.50". Deliberately requires the
// literal "$" — bare numbers ("would you take 35") or "35 dollars" phrasing are
// intentionally NOT parsed. This is a strict-by-design choice (documented in the
// dispatch return as a judgment call): erring toward draft-only on a phrasing this
// parser doesn't recognize is always safe; a false-positive price extraction from
// an unrelated number (item count, phone digits, etc.) is not.
const DOLLAR_FIGURE = /\$\s?(\d{1,6}(?:\.\d{1,2})?)\b/g;

/**
 * Parse a message for EXACTLY ONE unambiguous dollar figure. Returns null (fall
 * back to draft-only) for hedge language, ranges, multiple figures, zero figures,
 * or an out-of-sane-bounds amount.
 */
export function parsePriceFromMessage(rawText: string): number | null {
  const text = (rawText || '').slice(0, MAX_MESSAGE_LEN);
  if (HEDGE_PATTERN.test(text)) return null;
  if (RANGE_PATTERN.test(text)) return null;

  const matches = [...text.matchAll(DOLLAR_FIGURE)];
  if (matches.length !== 1) return null;

  const amount = parseFloat(matches[0][1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
  return Math.round(amount * 100) / 100;
}

// --- Threshold resolution -------------------------------------------------------

export interface PriceThresholds {
  acceptThreshold: number;
  declineThreshold: number;
  source: 'ITEM_EBAY' | 'ORGANIZER_DEFAULT';
}

interface ThresholdItemInput {
  price: Decimal | number | null;
  bestOfferAutoAcceptAmt: Decimal | number | null;
  bestOfferMinimumAmt: Decimal | number | null;
}

interface ThresholdOrganizerInput {
  defaultBestOfferAcceptPct: number | null;
  defaultBestOfferDeclinePct: number | null;
}

/**
 * Item-level eBay dollar thresholds win when BOTH are set (already-cross-listed,
 * best-offer-enabled item — organizer-trusted, real-money numbers). Falls back to
 * computing a threshold from the organizer's new default percentage x the item's FB
 * listing price for FB-only items that were never eBay-cross-listed. Returns null
 * (zero-threshold-eligible — no basis to autosend) when neither source is usable.
 */
export function resolvePriceThresholds(
  item: ThresholdItemInput,
  organizer: ThresholdOrganizerInput
): PriceThresholds | null {
  const itemAccept = item.bestOfferAutoAcceptAmt != null ? Number(item.bestOfferAutoAcceptAmt) : null;
  const itemDecline = item.bestOfferMinimumAmt != null ? Number(item.bestOfferMinimumAmt) : null;
  if (itemAccept != null && itemDecline != null) {
    return { acceptThreshold: itemAccept, declineThreshold: itemDecline, source: 'ITEM_EBAY' };
  }

  const acceptPct = organizer.defaultBestOfferAcceptPct;
  const declinePct = organizer.defaultBestOfferDeclinePct;
  const price = item.price != null ? Number(item.price) : null;
  if (acceptPct != null && declinePct != null && price != null && price > 0) {
    return {
      acceptThreshold: Math.round(price * (1 - acceptPct / 100) * 100) / 100,
      declineThreshold: Math.round(price * (1 - declinePct / 100) * 100) / 100,
      source: 'ORGANIZER_DEFAULT',
    };
  }

  return null;
}

// --- Reply templates -------------------------------------------------------------

export function buildAcceptReply(amount: number): string {
  return `Yes, I can do $${amount.toFixed(2)}!`;
}

export function buildDeclineReply(floorReferenceAmount: number): string {
  return `Thanks for the offer, but I can't go that low — best I can do is $${floorReferenceAmount.toFixed(2)}.`;
}

export const AVAILABLE_REPLY = 'Yes, still available!';

// --- Decision engine ---------------------------------------------------------

interface DecideInput {
  organizerId: string;
  itemId: string;
  messageText: string;
  organizer: ThresholdOrganizerInput & { autosendPriceAvailabilityEnabled: boolean };
  item: ThresholdItemInput;
}

function snippet(text: string): string {
  return (text || '').slice(0, SNIPPET_LEN);
}

async function logDecision(params: {
  organizerId: string;
  itemId: string;
  category: AutosendCategory;
  decision: AutosendDecision;
  parsedAmount: number | null;
  thresholdSource: 'ITEM_EBAY' | 'ORGANIZER_DEFAULT' | null;
  messageText: string;
}): Promise<void> {
  try {
    await prisma.messageAutosendLog.create({
      data: {
        organizerId: params.organizerId,
        itemId: params.itemId,
        category: params.category,
        decision: params.decision,
        parsedAmount: params.parsedAmount != null ? params.parsedAmount : null,
        thresholdSource: params.thresholdSource,
        messageTextSnippet: snippet(params.messageText),
      },
    });
  } catch (err: any) {
    // Logging must never block a real decision from reaching the extension.
    console.warn('[messageAutosend] failed to write MessageAutosendLog:', err?.message || err);
  }
}

/**
 * Decide how (or whether) to autosend a reply to a buyer message for price or
 * availability. Always logs a MessageAutosendLog row for a recognized category
 * (see monitoring note atop this file), even when the outcome is draft-only.
 *
 * Availability is resolved via a FRESH Item.status read taken as the very last
 * step before returning (mirrors itemSaleGuard.ts / ADR-098's TOCTOU discipline) —
 * this backend call IS "immediately before send" from this architecture's point of
 * view, since the extension has no direct DB access and must call this endpoint
 * right before it clicks Send.
 */
export async function decideMessageAutosend(input: DecideInput): Promise<AutosendResult> {
  const category = classifyMessage(input.messageText);
  if (!category) {
    return { category: null, decision: null, autosend: false, replyText: null };
  }

  // Feature-level opt-in gate — separate from and OFF by default even for
  // organizers already opted into any other extension autosend category.
  if (!input.organizer.autosendPriceAvailabilityEnabled) {
    // Deliberately not logged: the feature is off, so there is nothing for the
    // 4 monitoring metrics (all scoped to categorized attempts) to learn from an
    // organizer who never turned this on. Avoids polluting the log with rows a
    // disabled organizer's ordinary buyer chatter would otherwise generate.
    return { category, decision: 'DRAFT_ONLY_FEATURE_DISABLED', autosend: false, replyText: null };
  }

  if (category === 'PRICE') {
    const parsedAmount = parsePriceFromMessage(input.messageText);
    if (parsedAmount == null) {
      await logDecision({
        organizerId: input.organizerId,
        itemId: input.itemId,
        category,
        decision: 'DRAFT_ONLY_AMBIGUOUS',
        parsedAmount: null,
        thresholdSource: null,
        messageText: input.messageText,
      });
      return { category, decision: 'DRAFT_ONLY_AMBIGUOUS', autosend: false, replyText: null };
    }

    const thresholds = resolvePriceThresholds(input.item, input.organizer);
    if (!thresholds) {
      await logDecision({
        organizerId: input.organizerId,
        itemId: input.itemId,
        category,
        decision: 'DRAFT_ONLY_NO_THRESHOLD',
        parsedAmount,
        thresholdSource: null,
        messageText: input.messageText,
      });
      return { category, decision: 'DRAFT_ONLY_NO_THRESHOLD', autosend: false, replyText: null };
    }

    if (parsedAmount >= thresholds.acceptThreshold) {
      const replyText = buildAcceptReply(parsedAmount);
      await logDecision({
        organizerId: input.organizerId,
        itemId: input.itemId,
        category,
        decision: 'AUTOSENT_ACCEPT',
        parsedAmount,
        thresholdSource: thresholds.source,
        messageText: input.messageText,
      });
      return { category, decision: 'AUTOSENT_ACCEPT', autosend: true, replyText };
    }

    if (parsedAmount <= thresholds.declineThreshold) {
      // Per Patrick's 2026-08-05 decision, decline-zone autosend IS included.
      const replyText = buildDeclineReply(thresholds.acceptThreshold);
      await logDecision({
        organizerId: input.organizerId,
        itemId: input.itemId,
        category,
        decision: 'AUTOSENT_DECLINE',
        parsedAmount,
        thresholdSource: thresholds.source,
        messageText: input.messageText,
      });
      return { category, decision: 'AUTOSENT_DECLINE', autosend: true, replyText };
    }

    // Between the two thresholds — mirrors eBay's own "no automatic action" band.
    await logDecision({
      organizerId: input.organizerId,
      itemId: input.itemId,
      category,
      decision: 'DRAFT_ONLY_MIDBAND',
      parsedAmount,
      thresholdSource: thresholds.source,
      messageText: input.messageText,
    });
    return { category, decision: 'DRAFT_ONLY_MIDBAND', autosend: false, replyText: null };
  }

  // category === 'AVAILABILITY'
  // Fresh read, last step before returning — see function doc comment.
  const freshItem = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { status: true },
  });
  const isAvailable = freshItem?.status === 'AVAILABLE';
  const decision: AutosendDecision = isAvailable ? 'AUTOSENT_AVAILABLE' : 'DRAFT_ONLY_NOT_AVAILABLE';
  await logDecision({
    organizerId: input.organizerId,
    itemId: input.itemId,
    category,
    decision,
    parsedAmount: null,
    thresholdSource: null,
    messageText: input.messageText,
  });
  return {
    category,
    decision,
    autosend: isAvailable,
    replyText: isAvailable ? AVAILABLE_REPLY : null,
  };
}
