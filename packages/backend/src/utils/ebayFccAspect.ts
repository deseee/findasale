/**
 * Shared eBay "FCC ID" item-specific logic (eBay requirement effective 2026-10-13).
 *
 * One implementation used by BOTH the first-publish path (ebayController) and the live-listing edit push
 * (services/ebayItemPushService), so the two can never disagree. The aspect is sent ONLY when
 *   - the FCC ID is non-empty after normalizeFccId (never an empty string, never an invented value), AND
 *   - the category's aspect list (Commerce Taxonomy, via the cached getRequiredAspectsForCategory) contains an
 *     aspect named "FCC ID" (case-insensitive name match; the taxonomy's own spelling is used as the key).
 * A failed taxonomy lookup is reported, never thrown: callers log it and carry on with everything else.
 */

import { normalizeFccId } from './fccId';

export interface AspectSpecLike {
  name: string;
}

export type FccAspectResult =
  | { status: 'applied'; aspectName: string; value: string }
  | { status: 'unchanged'; aspectName: string; value: string } // the aspect already carries this value
  | { status: 'kept_existing'; aspectName: string } // publish path: an aspect already set from tags wins
  | { status: 'empty' } // no usable FCC ID: nothing to send
  | { status: 'unsupported' } // the category has no "FCC ID" aspect: nothing to send
  | { status: 'lookup_failed'; error: string }; // taxonomy lookup failed or returned nothing: skip, non-fatal

/** The taxonomy's own spelling of the FCC ID aspect for a category, or null when the category does not take one. */
export function findFccAspectName(spec: ReadonlyArray<AspectSpecLike> | null | undefined): string | null {
  if (!spec) return null;
  return spec.find((a) => typeof a?.name === 'string' && a.name.trim().toLowerCase() === 'fcc id')?.name ?? null;
}

/**
 * Set aspects['FCC ID'] = [normalized fccId] when allowed (see file header). Mutates `aspects`.
 *   overwrite=false (first publish): an "FCC ID" key already present (for example from tags) is kept.
 *   overwrite=true  (live edit push): the organizer's edited value replaces the existing one under its existing key.
 * `lookup` is the cached getRequiredAspectsForCategory (injected so callers and tests share one code path).
 */
export async function applyFccIdAspect(
  aspects: Record<string, string[]>,
  fccId: unknown,
  categoryId: string,
  lookup: (categoryId: string) => Promise<ReadonlyArray<AspectSpecLike> | null>,
  opts: { overwrite: boolean }
): Promise<FccAspectResult> {
  const value = normalizeFccId(fccId);
  if (!value) return { status: 'empty' };

  let spec: ReadonlyArray<AspectSpecLike> | null;
  try {
    spec = await lookup(categoryId);
  } catch (err) {
    return { status: 'lookup_failed', error: (err as Error)?.message ?? 'lookup failed' };
  }
  if (!spec) return { status: 'lookup_failed', error: 'no aspect data returned for the category' };

  const aspectName = findFccAspectName(spec);
  if (!aspectName) return { status: 'unsupported' };

  const existingKey = Object.keys(aspects).find((k) => k.toLowerCase() === 'fcc id');
  if (existingKey) {
    if (!opts.overwrite) return { status: 'kept_existing', aspectName: existingKey };
    const cur = aspects[existingKey];
    if (Array.isArray(cur) && cur.length === 1 && cur[0] === value) return { status: 'unchanged', aspectName: existingKey, value };
    aspects[existingKey] = [value];
    return { status: 'applied', aspectName: existingKey, value };
  }
  aspects[aspectName] = [value];
  return { status: 'applied', aspectName, value };
}
