/**
 * Shared importer plumbing (ADR-134 section 4.4). Header matching is case-insensitive, trimmed and
 * BOM-stripped; unknown extra columns are ignored.
 */
import type { ColumnMapping, ImporterId, SourceField, SourceRecord } from '../types';

export type ConditionScale = 'tcgplayer' | 'manabox' | 'moxfield' | 'generic';

export interface Importer {
  id: ImporterId;
  label: string;
  conditionScale: ConditionScale;
  /** Game assumed when neither the file nor the seller says otherwise. null means "ask or default MTG with a flag". */
  defaultGame: string | null;
  /** True when a blank Foil cell means non-foil (Moxfield). */
  blankFinishIsNonfoil: boolean;
  /** True when the Condition cell may carry a trailing "Foil" marker (TCGplayer seller inventory). */
  conditionMayCarryFoil: boolean;
  /** Headers (as listed in ADR-134 section 4.4) that identify this format. */
  detect(headersLower: Set<string>): boolean;
  /** Maps canonical fields to the actual header spellings found in this file. */
  mapColumns(headers: string[]): ColumnMapping;
}

export function normHeader(h: string): string {
  return String(h ?? '').replace(/^﻿/, '').trim().toLowerCase();
}

/** Builds a field -> header mapping from a table of accepted header spellings (first listed wins). */
export function mapByAliases(headers: string[], table: Partial<Record<SourceField, string[]>>): ColumnMapping {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normHeader(h);
    if (!byNorm.has(n)) byNorm.set(n, h);
  }
  const used = new Set<string>();
  const out: ColumnMapping = {};
  for (const field of Object.keys(table) as SourceField[]) {
    for (const alias of table[field] ?? []) {
      const hit = byNorm.get(alias);
      if (hit !== undefined && !used.has(hit)) {
        out[field] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return out;
}

export function hasAll(headersLower: Set<string>, ...names: string[]): boolean {
  return names.every((n) => headersLower.has(n));
}

export type SourceRow = Partial<Record<SourceField, string>>;

/** Reads the mapped cells of a record as trimmed strings. A field with no mapped column is absent (undefined). */
export function readRow(record: SourceRecord, mapping: ColumnMapping): SourceRow {
  const out: SourceRow = {};
  for (const field of Object.keys(mapping) as SourceField[]) {
    const header = mapping[field];
    if (!header) continue;
    const raw = record[header];
    out[field] = typeof raw === 'string' ? raw.trim() : '';
  }
  return out;
}
