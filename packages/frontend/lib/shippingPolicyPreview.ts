/**
 * Pure helpers for the custom eBay shipping policy note in components/ShippingNetPreview.tsx, kept here so they can be
 * tested with node:test. No imports from React, no side effects.
 *
 * POST /ebay/shipping-preview returns, for the custom-override branch (customPolicy true), the additive fields
 * customPolicyId, customPolicyName and customPolicyDescription. Each may be null (a mapping-driven route where the item
 * has no override id, or the name lookup failed), and an older backend omits them entirely. Everything here reads
 * defensively.
 */

export const CUSTOM_POLICY_FALLBACK_MESSAGE = 'Custom eBay policy selected. Buyer shipping is set by your eBay policy.';
export const AUTO_POLICY_OPTION_LABEL = 'Auto (use my eBay default)';
export const SHIPPING_POLICY_SELECT_LABEL = 'Shipping policy for this item';
export const CHANGE_POLICY_LINK_TEXT = 'Change on the full edit page';
export const POLICY_UNSAVED_HINT = 'Save this item to refresh the shipping preview for the new policy.';

export interface CustomPolicyInfo {
  isCustom: boolean;
  id: string | null;
  name: string | null;
  description: string | null;
  /** The backend's own message for the custom branch, when it sent one. */
  message: string | null;
}

/** A trimmed non-empty string, or null for anything else. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

/** Reads the custom policy fields off a shipping-preview response. Never throws; unknown shapes read as "not custom". */
export function parseCustomPolicyInfo(response: unknown): CustomPolicyInfo {
  const r = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  return {
    isCustom: r.customPolicy === true,
    id: cleanString(r.customPolicyId),
    name: cleanString(r.customPolicyName),
    description: cleanString(r.customPolicyDescription),
    message: cleanString(r.message),
  };
}

/**
 * The sentence for the custom policy card. With a name: "Custom eBay policy: <name>. Buyer shipping is set by this
 * policy." Without one, the previous sentence (the backend message when present).
 */
export function customPolicyNote(name: string | null | undefined, fallbackMessage?: string | null): string {
  const n = cleanString(name);
  if (n) return `Custom eBay policy: ${n}. Buyer shipping is set by this policy.`;
  return cleanString(fallbackMessage) ?? CUSTOM_POLICY_FALLBACK_MESSAGE;
}

/**
 * True when the organizer's current selection differs from the policy the preview was computed for. The preview reads
 * the SAVED item, so until the item is saved it still describes the old choice. '' and null both mean Auto.
 */
export function policySelectionDiffersFromPreview(
  previewedPolicyId: string | null | undefined,
  selectedValue: string | null | undefined,
): boolean {
  return (cleanString(previewedPolicyId) ?? '') !== (cleanString(selectedValue) ?? '');
}
