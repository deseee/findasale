/**
 * Moxfield collection export. Headers per ADR-134 section 4.4 (third-party converter config; Moxfield's own
 * help page returned HTTP 403 and was not read; UNVERIFIED, see V8): Count, Tradelist Count, Name, Edition,
 * Condition, Language, Foil, Tags, Last Modified, Collector Number, Alter, Proxy, Purchase Price.
 * Edition is the set code. Foil is blank, foil or etched. Purchase Price is not mapped in v1 (currency UNVERIFIED).
 */
import { Importer, hasAll, mapByAliases } from './shared';

export const moxfieldImporter: Importer = {
  id: 'moxfield',
  label: 'Moxfield',
  conditionScale: 'moxfield',
  defaultGame: 'MTG',
  blankFinishIsNonfoil: true,
  conditionMayCarryFoil: false,
  detect: (h) => hasAll(h, 'count', 'edition', 'collector number', 'tradelist count'),
  mapColumns: (headers) =>
    mapByAliases(headers, {
      name: ['name'],
      setCode: ['edition'],
      collectorNumber: ['collector number'],
      finish: ['foil'],
      quantity: ['count'],
      condition: ['condition'],
      language: ['language'],
    }),
};
