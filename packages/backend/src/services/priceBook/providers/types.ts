/**
 * The reference provider seam (ADR-140 section 5.1): the interface every price reference source implements and the pure
 * guard that decides which providers may be used. The engine never fetches anything; the services ask the active providers
 * and hand the engine a list of candidates per card.
 *
 * Terms are enforced in code, not by a settings screen: a NOT_CLEARED provider is never returned, whatever the environment
 * says. Making LICENSED_FEED usable takes a code change that records the written agreement (ADR-140 section 5.1).
 */
import type { BookSettings, EnvLike, ReferenceCandidate } from '../types';
import type { ReferenceKind } from '../vocabulary';

export type { BookSettings, EnvLike, ReferenceCandidate, ReferenceKind };

export interface ProviderTerms {
  status: 'CLEARED' | 'CONDITIONAL' | 'NOT_CLEARED';
  /** ISO date of the last legal review, null if never. */
  reviewedOn: string | null;
  /** Where the basis is written down (ADR section, agreement id). */
  reference: string;
  /** For CONDITIONAL: the environment switch that must be on. */
  switchName?: string;
  /** For CONDITIONAL: what an unset switch means. Default false (off). The catalog switch is true (unset means on). */
  switchDefaultOn?: boolean;
}

/** One card at one finish and language, as a provider is asked about it. */
export interface CardRefKey {
  cardKey: string;
  finish: string;
  language: string;
  catalogPrintingId?: string | null;
  game: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  cardName?: string | null;
}

export interface ProviderCtx<Db = unknown> {
  db: Db;
  organizerId: string;
  bookId: string;
  now: Date;
  env: EnvLike;
  book: BookSettings;
}

export interface ReferenceProvider<Db = unknown> {
  kind: ReferenceKind;
  terms: ProviderTerms;
  isActive(ctx: { env: EnvLike; book: BookSettings }): boolean;
  /** Key of the returned map: cardKey|finish|language. */
  fetch(ctx: ProviderCtx<Db>, cards: CardRefKey[]): Promise<Map<string, ReferenceCandidate[]>>;
  /** Required before a LICENSED_FEED provider can be CLEARED (termination purge). */
  purge?(ctx: ProviderCtx<Db>): Promise<void>;
}

const ON_WORDS = ['true', '1', 'yes', 'on'];
const OFF_WORDS = ['false', '0', 'no', 'off'];

/** Reads a switch: an explicit on word is on, an explicit off word is off, anything else (including unset) is the default. */
export function isSwitchOn(env: EnvLike, name: string, defaultOn: boolean): boolean {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (ON_WORDS.includes(raw)) return true;
  if (OFF_WORDS.includes(raw)) return false;
  return defaultOn;
}

/** The terms check alone (no isActive): CLEARED passes, CONDITIONAL needs its switch, everything else never. */
export function termsAllow(terms: ProviderTerms | undefined, env: EnvLike): boolean {
  if (!terms) return false;
  if (terms.status === 'CLEARED') return true;
  if (terms.status === 'CONDITIONAL') {
    if (!terms.switchName) return false;
    return isSwitchOn(env, terms.switchName, terms.switchDefaultOn === true);
  }
  return false;
}

/**
 * The only way the services obtain providers. Returns, in the order of book.referenceOrder, the providers that pass the terms
 * check and report themselves active. A NOT_CLEARED provider is never returned, even with every switch on. A kind that is
 * not in the book's order is not used.
 */
export function getActiveProviders<P extends ReferenceProvider>(env: EnvLike, book: BookSettings, providers: readonly P[]): P[] {
  const out: P[] = [];
  for (const kind of book.referenceOrder) {
    for (const provider of providers) {
      if (provider.kind !== kind || out.includes(provider)) continue;
      if (!termsAllow(provider.terms, env)) continue;
      let active = false;
      try {
        active = provider.isActive({ env, book }) === true;
      } catch {
        active = false;
      }
      if (active) out.push(provider);
    }
  }
  return out;
}

/** The only catalog source whose price rows may be used as a reference. TCGCSV rows (and anything else) are refused. */
export function isAllowedCatalogOrigin(source: string | null | undefined): boolean {
  return String(source ?? '').trim().toUpperCase() === 'SCRYFALL';
}

/** Name of the platform switch for catalog numbers; unset means on (ADR-140 D2). */
export const CATALOG_REFERENCE_SWITCH = 'CARD_CATALOG_PRICE_REFERENCE_ENABLED';

/** Terms descriptor for the catalog provider: CONDITIONAL on the platform switch (default on) and the book's own opt-in. */
export const CATALOG_REFERENCE_TERMS: ProviderTerms = {
  status: 'CONDITIONAL',
  reviewedOn: null,
  reference: 'ADR-140 section 5.2 and section 14',
  switchName: CATALOG_REFERENCE_SWITCH,
  switchDefaultOn: true,
};

/** The pure part of the catalog provider's isActive: the platform switch is not off AND the book opted in. */
export function isCatalogReferenceActive(env: EnvLike, book: Pick<BookSettings, 'allowCatalogReference'>): boolean {
  return isSwitchOn(env, CATALOG_REFERENCE_SWITCH, true) && book.allowCatalogReference === true;
}
