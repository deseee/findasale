/**
 * TCGplayer app collection export. Headers per ADR-134 section 4.4 (third-party converter config only;
 * UNVERIFIED, see V8): Quantity, Name, Simple Name, Set, Card Number, Set Code, Printing, Condition, Language,
 * Rarity, Product ID, SKU. Printing values: Normal, Foil. The SKU column is TCGplayer's own SKU number and is
 * deliberately NOT written to Item.sku.
 */
import { Importer, hasAll, mapByAliases } from './shared';

export const tcgplayerAppImporter: Importer = {
  id: 'tcgplayer_app',
  label: 'TCGplayer app collection',
  conditionScale: 'tcgplayer',
  defaultGame: null,
  blankFinishIsNonfoil: false,
  conditionMayCarryFoil: false,
  detect: (h) => hasAll(h, 'simple name', 'product id', 'set code'),
  mapColumns: (headers) =>
    mapByAliases(headers, {
      name: ['name', 'simple name'],
      setName: ['set'],
      setCode: ['set code'],
      collectorNumber: ['card number'],
      quantity: ['quantity'],
      finish: ['printing'],
      condition: ['condition'],
      language: ['language'],
      rarity: ['rarity'],
      tcgplayerProductId: ['product id'],
    }),
};
