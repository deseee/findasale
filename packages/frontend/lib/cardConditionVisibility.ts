/**
 * Pure helper: does an item carry a trading card record, so the card condition flow (NM / LP / MP / HP / DMG, one-tap
 * confirm in components/cardRecord/CardConditionConfirm.tsx) replaces the generic A to D grade picker?
 *
 * Both item payloads expose the card record as `item.card` (null or absent for non-card items):
 * - GET /items/drafts?saleId= (Add Items rows, Review): card { game, conditionCode, grader, grade }
 * - GET /items/:id/edit (Edit page and the slide-up sheets): the owner-shaped card block
 * An empty object, an array or a non-object is not a card record.
 */
export function showCardCondition(item: { card?: unknown } | null | undefined): boolean {
  const card = item?.card;
  return !!card && typeof card === 'object' && !Array.isArray(card);
}
