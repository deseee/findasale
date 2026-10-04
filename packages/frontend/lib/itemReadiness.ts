/**
 * Review queue readiness colour for one item (item editor unification, U5).
 *
 * Mirrors `computeReadiness` in pages/organizer/add-items/[saleId]/review.tsx and returns the same four
 * values, with one deliberate change: the price that counts is the price the organizer typed into the
 * review card (the tap-to-apply input), not `editState.price || item.price`. Approve already blocks on the
 * typed value, so readiness now agrees with what Approve will do.
 *
 * Pure module: no imports, no React. Nothing imports it yet. The review page swaps to it in a later step.
 *
 *   red     missing title, a price at or below zero, or no photo
 *   yellow  has the basics but is missing category, condition or description
 *   blue    complete and has a package weight while eBay is connected
 *   green   complete
 */

export type ItemReadiness = 'red' | 'yellow' | 'green' | 'blue';

/** The parts of the review page's `Item` that readiness reads. */
export interface ReadinessItem {
  title?: string | null;
  price?: number | null;
  photoUrls?: string[] | null;
  category?: string | null;
  condition?: string | null;
  description?: string | null;
  packageWeightOz?: number | null;
}

/** The parts of the review page's `ItemEditState` that readiness reads. */
export interface ReadinessEditState {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  condition?: string;
  packageWeightOz?: number;
}

/**
 * Turns the typed price input into the number readiness uses.
 * - undefined or null: no typed value is available, so the caller falls back to editState.price || item.price.
 * - a string: what the organizer typed. Blank, unparseable or non-finite counts as 0 (no price), exactly as
 *   Approve treats it.
 * - a number: used as given when finite, otherwise 0.
 */
function resolveTypedPrice(typedPrice: string | number | null | undefined): number | null {
  if (typedPrice === undefined || typedPrice === null) return null;
  const n = typeof typedPrice === 'number' ? typedPrice : parseFloat(typedPrice.trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param item         the loaded item
 * @param editState    the card's edit state
 * @param typedPrice   the organizer-typed price input (string from the input, or a number). When provided it
 *                     is the price that counts. When undefined or null the old rule applies
 *                     (editState.price || item.price).
 * @param ebayConnected whether eBay is connected; needed for the blue state, same as the original
 */
export function computeItemReadiness(
  item: ReadinessItem,
  editState: ReadinessEditState,
  typedPrice: string | number | null | undefined,
  ebayConnected: boolean,
): ItemReadiness {
  const title = editState.title || item.title || '';
  const typed = resolveTypedPrice(typedPrice);
  const price = typed !== null ? typed : (editState.price || item.price || 0);
  const hasPhoto = (item.photoUrls?.length ?? 0) > 0;
  const category = editState.category || item.category || '';
  const condition = editState.condition || item.condition || '';
  const description = editState.description || item.description || '';
  const hasWeight = !!(editState.packageWeightOz || item.packageWeightOz);

  if (!title.trim() || price <= 0 || !hasPhoto) return 'red';
  if (!category || !condition || !description.trim()) return 'yellow';
  if (hasWeight && ebayConnected) return 'blue';
  return 'green';
}
