/**
 * itemStockErrors.ts -- the stock error classes shared by itemStockService.ts and itemKitStock.ts.
 * Split out so the kit stock module can throw the same InsufficientStockError class without importing
 * itemStockService (which imports the kit module), avoiding a circular import. itemStockService.ts re-exports
 * InsufficientStockError, so every existing import keeps working and instanceof checks see one class.
 */
export class InsufficientStockError extends Error {
  constructor(itemId: string, requested: number, remaining: number) {
    super(
      `Cannot sell ${requested} unit(s) of item ${itemId}: only ${remaining} remaining.`
    );
    this.name = 'InsufficientStockError';
  }
}

/**
 * Thrown when a kit sale cannot be completed because one component has too few units left. A subclass of
 * InsufficientStockError so every existing handler that already treats "oversold" as a clean 409/abort does the same here.
 */
export class KitComponentShortError extends InsufficientStockError {
  readonly kitItemId: string;
  readonly componentItemId: string;
  constructor(kitItemId: string, componentItemId: string, requested: number, remaining: number) {
    super(kitItemId, requested, remaining);
    this.name = 'KitComponentShortError';
    this.kitItemId = kitItemId;
    this.componentItemId = componentItemId;
    this.message = `Kit ${kitItemId} cannot be sold: component item ${componentItemId} needs ${requested} unit(s) but only ${remaining} remain.`;
  }
}
