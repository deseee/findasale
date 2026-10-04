/**
 * TCGplayer seller inventory export. Headers per ADR-134 section 4.4 (column list from a WebFetch extraction
 * of TCGplayer's help page, which returned HTTP 403 to a direct fetch; header casing and how Condition encodes
 * foil are UNVERIFIED, see V8): TCGplayer Id, Product Line, Set Name, Product Name, Title, Number, Rarity,
 * Condition, TCG Market Price, TCG Direct Low, TCG Low Price With Shipping, TCG Low Price, Total Quantity,
 * Add to Quantity, TCG Marketplace Price (plus Pro columns My Store Reserve Quantity, My Store Price).
 * Quantity is Total Quantity; Add to Quantity is TCGplayer's own edit delta and is ignored.
 * The price used when the seller picks "Use price from file" is TCG Marketplace Price.
 */
import { Importer, mapByAliases } from './shared';

export const tcgplayerSellerImporter: Importer = {
  id: 'tcgplayer_seller',
  label: 'TCGplayer seller inventory',
  conditionScale: 'tcgplayer',
  defaultGame: null,
  blankFinishIsNonfoil: false,
  conditionMayCarryFoil: true,
  detect: (h) => h.has('tcgplayer id') && (h.has('total quantity') || h.has('add to quantity')),
  mapColumns: (headers) =>
    mapByAliases(headers, {
      name: ['product name', 'title'],
      setName: ['set name'],
      collectorNumber: ['number'],
      rarity: ['rarity'],
      condition: ['condition'],
      quantity: ['total quantity'],
      price: ['tcg marketplace price'],
      tcgplayerProductId: ['tcgplayer id'],
      game: ['product line'],
    }),
};
