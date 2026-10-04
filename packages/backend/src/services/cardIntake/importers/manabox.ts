/**
 * ManaBox collection export. Headers per ADR-134 section 4.4 (third-party converter config; UNVERIFIED
 * against a real export, see V8): Name, Set code, Set name, Collector number, Foil, Rarity, Quantity,
 * ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered, Condition, Language, Purchase price currency.
 * Foil values: normal, foil, etched. Condition values: mint, near_mint, excellent, good, light_played, played, poor.
 */
import { Importer, hasAll, mapByAliases } from './shared';

export const manaboxImporter: Importer = {
  id: 'manabox',
  label: 'ManaBox',
  conditionScale: 'manabox',
  defaultGame: 'MTG',
  blankFinishIsNonfoil: false,
  conditionMayCarryFoil: false,
  detect: (h) => hasAll(h, 'scryfall id', 'set code', 'collector number', 'manabox id'),
  mapColumns: (headers) =>
    mapByAliases(headers, {
      name: ['name'],
      setCode: ['set code'],
      setName: ['set name'],
      collectorNumber: ['collector number'],
      finish: ['foil'],
      rarity: ['rarity'],
      quantity: ['quantity'],
      scryfallId: ['scryfall id'],
      cost: ['purchase price'],
      costCurrency: ['purchase price currency'],
      condition: ['condition'],
      language: ['language'],
    }),
};
