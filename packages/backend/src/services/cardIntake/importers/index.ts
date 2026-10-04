/** Importer registry and format detection (ADR-134 section 4.4). */
import type { ColumnMapping, ImporterId } from '../types';
import { SOURCE_FIELDS } from '../types';
import { Importer, normHeader } from './shared';
import { manaboxImporter } from './manabox';
import { moxfieldImporter } from './moxfield';
import { tcgplayerSellerImporter } from './tcgplayerSeller';
import { tcgplayerAppImporter } from './tcgplayerApp';
import { genericImporter } from './generic';

export * from './shared';

/** Detection order matters: the most specific header sets first, generic last. */
export const IMPORTERS: readonly Importer[] = [
  manaboxImporter,
  moxfieldImporter,
  tcgplayerSellerImporter,
  tcgplayerAppImporter,
  genericImporter,
];

export function getImporter(id: ImporterId): Importer {
  const found = IMPORTERS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown importer ${id}`);
  return found;
}

export function detectImporter(headers: string[]): Importer {
  const lower = new Set(headers.map(normHeader));
  return IMPORTERS.find((i) => i.detect(lower)) ?? genericImporter;
}

export type ColumnMappingCheck = { ok: true; mapping: ColumnMapping } | { ok: false };

/**
 * Applies a seller-supplied override (field -> header) on top of the importer's mapping. Every header
 * must exist in the file and every field must be a known field; anything else is rejected.
 * An empty-string header removes the field.
 */
export function applyColumnOverride(base: ColumnMapping, override: unknown, headers: string[]): ColumnMappingCheck {
  if (override === undefined || override === null) return { ok: true, mapping: { ...base } };
  if (typeof override !== 'object' || Array.isArray(override)) return { ok: false };
  const mapping: ColumnMapping = { ...base };
  const headerSet = new Set(headers);
  for (const [field, header] of Object.entries(override as Record<string, unknown>)) {
    if (!(SOURCE_FIELDS as readonly string[]).includes(field)) return { ok: false };
    if (header === '' || header === null) {
      delete (mapping as Record<string, unknown>)[field];
      continue;
    }
    if (typeof header !== 'string' || !headerSet.has(header)) return { ok: false };
    (mapping as Record<string, string>)[field] = header;
  }
  return { ok: true, mapping };
}
