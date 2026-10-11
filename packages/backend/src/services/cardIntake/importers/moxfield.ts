/**
 * Moxfield collection export. Headers per ADR-134 section 4.4 (third-party converter config; Moxfield's own
 * help page returned HTTP 403 and was not read; UNVERIFIED, see V8): Count, Tradelist Count, Name, Edition,
 * Condition, Language, Foil, Tags, Last Modified, Collector Number, Alter, Proxy, Purchase Price.
 * The set code column is named "Edition" in one source and "Set Code" in another; the real header is UNVERIFIED, so both
 * are accepted (detect and mapping). Foil is blank, foil or etched. Purchase Price is not mapped in v1 (currency UNVERIFIED).
 */
import { Importer, hasAll, mapByAliases } from './shared';

export const moxfieldImporter: Importer = {
  id: 'moxfield',
  label: 'Moxfield',
  conditionScale: 'moxfield',
  defaultGame: 'MTG',
  blankFinishIsNonfoil: true,
  conditionMayCarryFoil: false,
  detect: (h) => (h.has('edition') || h.has('set code')) && hasAll(h, 'count', 'collector number', 'tradelist count'),
  mapColumns: (headers) =>
    mapByAliases(headers, {
      name: ['name'],
      setCode: ['edition', 'set code'],
      collectorNumber: ['collector number'],
      finish: ['foil'],
      quantity: ['count'],
      condition: ['condition'],
      language: ['language'],
    }),
};
