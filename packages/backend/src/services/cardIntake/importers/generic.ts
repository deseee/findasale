/**
 * Generic importer: the seller maps columns in the UI; these aliases give a first guess (ADR-134 section 4.4:
 * name, set, set code, number, quantity, foil/finish, condition, language, price, sku, scryfall id,
 * tcgplayer id, cost). The bare header "set" is treated as a set NAME (a code mistaken for a name only
 * loses precision; a name mistaken for a code would stop the card from matching at all); the seller can
 * re-map it. Auto-detected sku aliases: sku, custom label, store sku, barcode.
 */
import { Importer, mapByAliases } from './shared';

export const GENERIC_ALIASES = {
  name: ['name', 'card name', 'card', 'product name', 'title', 'item', 'item name'],
  setCode: ['set code', 'setcode', 'set abbreviation', 'edition code', 'edition', 'set id'],
  setName: ['set name', 'set', 'expansion'],
  collectorNumber: ['collector number', 'collector no', 'card number', 'number', 'card #', 'no', '#'],
  quantity: ['quantity', 'qty', 'count', 'total quantity', 'copies'],
  finish: ['foil', 'finish', 'printing', 'treatment'],
  condition: ['condition', 'cond'],
  language: ['language', 'lang'],
  price: ['price', 'my price', 'sale price', 'asking price', 'list price', 'selling price', 'store price', 'tcg marketplace price'],
  sku: ['sku', 'custom label', 'store sku', 'barcode'],
  scryfallId: ['scryfall id', 'scryfall_id', 'scryfallid'],
  tcgplayerProductId: ['tcgplayer id', 'tcgplayer product id', 'tcgplayer_id', 'product id'],
  cost: ['cost', 'purchase price', 'cost basis', 'buy price'],
  costCurrency: ['purchase price currency', 'cost currency'],
  game: ['game', 'product line', 'tcg'],
  rarity: ['rarity'],
  grader: ['grader', 'grading company', 'grading service'],
  grade: ['grade', 'grade value'],
  certNumber: ['cert number', 'cert', 'certification number', 'cert #', 'certificate number', 'cert no'],
} as const;

export const genericImporter: Importer = {
  id: 'generic',
  label: 'Any other CSV',
  conditionScale: 'generic',
  defaultGame: null,
  blankFinishIsNonfoil: false,
  conditionMayCarryFoil: false,
  detect: () => true,
  mapColumns: (headers) => mapByAliases(headers, GENERIC_ALIASES as unknown as Parameters<typeof mapByAliases>[1]),
};
