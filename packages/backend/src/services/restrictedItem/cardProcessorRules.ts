/**
 * Per-processor card rules for restricted items (2026-11-06).
 *
 * ONE table maps each card processor to the restricted item classes it must never be asked to charge for. Adding a
 * processor = adding one row here; nothing else in the gate changes (Patrick 2026-10-07: payment rules are PER PROCESSOR
 * so more processors can be added later).
 *
 * FINIX: blocks all five restricted classes (Patrick 2026-10-06 / 2026-10-07: Finix said legal products are fine only if
 *        Finix does not process the payment; coins, bullion and jewelry route to Square; weapon-adjacent items are cash).
 * SQUARE: blocks NOTHING, which is exactly today's behavior. PENDING PATRICK DECISION: whether weapon-adjacent classes
 *        (WEAPON, FIREARM_RELATED, KNIFE) should also be card-blocked on Square. Do not change this row without that
 *        decision. Square card paths still run the gate, so an organizer card suspension already applies to them.
 *
 * An UNKNOWN processor string fails CLOSED: every restricted class is blocked (blockedClassesFor below).
 */
import { RESTRICTED_CLASSES, type RestrictedItemClassName } from './restrictedItemClassifier';

export type CardProcessor = 'FINIX' | 'SQUARE';

export const CARD_PROCESSOR_BLOCKED_CLASSES: Readonly<Record<CardProcessor, readonly RestrictedItemClassName[]>> = {
  FINIX: ['WEAPON', 'FIREARM_RELATED', 'KNIFE', 'COIN_BULLION_PRECIOUS_METAL', 'JEWELRY'],
  SQUARE: [], // PENDING PATRICK DECISION -- weapon-adjacent classes on Square. Current behavior: nothing blocked.
};

export function isCardProcessor(v: unknown): v is CardProcessor {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CARD_PROCESSOR_BLOCKED_CLASSES, v);
}

/** Classes blocked for `processor`. Unknown processor -> every restricted class (fail closed). */
export function blockedClassesFor(processor: string): readonly RestrictedItemClassName[] {
  return isCardProcessor(processor) ? CARD_PROCESSOR_BLOCKED_CLASSES[processor] : RESTRICTED_CLASSES;
}

export function isClassBlockedFor(processor: string, cls: RestrictedItemClassName): boolean {
  if (cls === 'NONE') return false;
  return blockedClassesFor(processor).includes(cls);
}
