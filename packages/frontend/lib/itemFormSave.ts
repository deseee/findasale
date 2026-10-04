/**
 * The one place the item form turns its state into a PUT /items/:id body.
 *
 * It wraps lib/buildItemSavePayload.ts (still the single payload builder) and adds only the condition/grade
 * touched-gating: while the organizer has not touched condition or grade on this form, the payload carries the STORED
 * values (see lib/itemFormCondition.ts), so showing a legacy condition normalized (LIKE_NEW as Used, grade A) never
 * rewrites it on an unrelated save. Once touched, the form's values are sent, as before.
 *
 * Pure module, no React.
 */
import { buildItemSavePayload } from './buildItemSavePayload';
import type { ItemFormData, ItemSavePayload, ItemSaveTouched } from './buildItemSavePayload';
import { untouchedConditionValue, untouchedGradeValue } from './itemFormCondition';

export interface EditSaveInput {
  formData: ItemFormData;
  quantityText: string;
  stockTotalText: string;
  touched: ItemSaveTouched;
  /** True once the organizer changed the condition or the grade on this form (reset after a save). */
  conditionTouched: boolean;
  /** The stored values from the loaded item (null/undefined when the item has none). */
  loadedCondition: unknown;
  loadedGrade: unknown;
  /** "Save without updating marketplaces". Only a strict true adds skipMarketplaceSync: true. */
  skipMarketplaceSync?: boolean;
}

export function buildEditSavePayload(input: EditSaveInput): ItemSavePayload {
  const formData: ItemFormData = input.conditionTouched
    ? input.formData
    : {
        ...input.formData,
        condition: untouchedConditionValue(input.loadedCondition),
        conditionGrade: untouchedGradeValue(input.loadedGrade),
      };
  return buildItemSavePayload(
    { formData, quantityText: input.quantityText, stockTotalText: input.stockTotalText },
    input.touched,
    { skipMarketplaceSync: input.skipMarketplaceSync === true }
  );
}
