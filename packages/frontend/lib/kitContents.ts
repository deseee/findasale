/**
 * Kit contents helpers (kits / bundles): the pure rules behind the "What's in this kit" editor on the item edit page.
 * The server (/api/kits, services/itemKitService.ts) is the authority; these mirror its limits only so the organizer gets
 * the same plain message before the request goes out. Pure module, no React.
 */

export const KIT_MAX_COMPONENTS = 25;
export const KIT_MAX_QUANTITY = 1000;

export interface KitDraftPart {
  itemId: string;
  title: string;
  photoUrl: string | null;
  /** Text so the organizer can clear the box while typing. */
  quantity: string;
  remaining: number;
  /** Unit price of the item, used only to suggest a starting kit price when a kit is first made. */
  price?: number | null;
}

export interface KitComponentLike {
  itemId: string;
  title: string;
  photoUrl: string | null;
  quantity: number;
  remaining: number;
}

export function partsFromComponents(components: KitComponentLike[]): KitDraftPart[] {
  return components.map((c) => ({ itemId: c.itemId, title: c.title, photoUrl: c.photoUrl, quantity: String(c.quantity), remaining: c.remaining }));
}

/** A whole number from 1 to 1000, or null. */
export function parseKitQuantity(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= KIT_MAX_QUANTITY ? n : null;
}

/** The first problem with the draft contents, in the words the organizer sees, or null when it can be saved. */
export function validateKitParts(parts: KitDraftPart[]): string | null {
  if (parts.length === 0) return 'Pick at least one item for the kit.';
  if (parts.length > KIT_MAX_COMPONENTS) return `A kit can have at most ${KIT_MAX_COMPONENTS} different items.`;
  if (new Set(parts.map((p) => p.itemId)).size !== parts.length) return 'Each item can be added to a kit only once. Raise its quantity instead.';
  if (parts.some((p) => parseKitQuantity(p.quantity) === null)) return `Each quantity must be a whole number from 1 to ${KIT_MAX_QUANTITY}.`;
  return null;
}

/** The body for PUT /api/kits/:kitId. Call only after validateKitParts returned null. */
export function buildKitComponentsPayload(parts: KitDraftPart[]): Array<{ itemId: string; quantity: number }> {
  return parts.map((p) => ({ itemId: p.itemId, quantity: parseKitQuantity(p.quantity) ?? 1 }));
}

/** True when the draft differs from what is saved (same items, same quantities, order ignored). */
export function kitPartsChanged(saved: KitDraftPart[], draft: KitDraftPart[]): boolean {
  if (saved.length !== draft.length) return true;
  const byId = new Map(saved.map((p) => [p.itemId, p.quantity.trim()]));
  return draft.some((p) => byId.get(p.itemId) !== p.quantity.trim());
}

/** Preview of how many kits the draft would allow: the smallest floor(remaining / quantity). 0 when empty or a quantity is invalid. */
export function previewKitAvailable(parts: KitDraftPart[]): number {
  if (parts.length === 0) return 0;
  let min = Infinity;
  for (const p of parts) {
    const q = parseKitQuantity(p.quantity);
    if (q === null) return 0;
    min = Math.min(min, Math.floor(Math.max(p.remaining, 0) / q));
  }
  return Number.isFinite(min) ? min : 0;
}

export function kitAvailableLine(n: number): string {
  return `${n} available, worked out from the items inside`;
}

export function kitErrorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } } | null | undefined;
  return e?.response?.data?.error || e?.response?.data?.message || 'Something went wrong. Please try again.';
}

export const KIT_LOCKED_NOTE =
  'This kit has already sold, so the items inside cannot change. You can still change the name, description and price above. To change what goes in a kit, make a new kit.';

/** Starting price for a brand new kit: the items' prices times their quantities, in whole cents. 0 when no item has a price. */
export function suggestKitPrice(parts: KitDraftPart[]): number {
  let cents = 0;
  for (const p of parts) {
    const q = parseKitQuantity(p.quantity);
    if (q === null || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0) continue;
    cents += Math.round(p.price * 100) * q;
  }
  return cents / 100;
}

/** The first problem with the "Add a kit" dialog, or null. priceText is only checked when it is shown (no item prices to add up). */
export function validateNewKit(name: string, parts: KitDraftPart[], priceText: string, priceNeeded: boolean): string | null {
  if (!name.trim()) return 'Give the kit a name.';
  const partsProblem = validateKitParts(parts);
  if (partsProblem) return partsProblem;
  if (priceNeeded) {
    const n = Number(priceText);
    if (priceText.trim() === '' || !Number.isFinite(n) || n <= 0) return 'Enter a kit price greater than zero.';
  }
  return null;
}

/** True when the edit page should offer "Make this a kit": a plain, unsold, available fixed-price item. The server re-checks everything (listings, other kits) and has the final say. */
export function canOfferMakeKit(item: { listingType?: string | null; status?: string | null; stockSold?: number | null; isKitComponent?: boolean | null; consignorId?: string | null } | null | undefined): boolean {
  if (!item) return false;
  const type = item.listingType ?? 'FIXED';
  return type === 'FIXED' && item.status === 'AVAILABLE' && !(Number(item.stockSold) > 0) && item.isKitComponent !== true && !item.consignorId;
}
