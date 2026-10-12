/**
 * Resolves what a photo (or Delver, or a manual add) says about a card to a catalog printing (ADR-138 section 3.4).
 *
 * The reading is never trusted alone. A printing is pre-selected (EXACT) only when two independent facts agree:
 * the printed set code plus collector number, and the printed name. Any disagreement becomes a list of candidates
 * for the organizer to pick from. An id supplied by the source (a Scryfall id from Delver) is an exact match by
 * itself. Finish and condition are never produced here: this module has no field for either.
 *
 * Pure apart from the injected `resolve` function (the catalog lookup, called with at most 500 refs at a time).
 * Nothing here imports the database, the network or a recognizer.
 */
import type { CatalogGame } from '../cardCatalog/types';
import type { CatalogState, PrintingDto, ResolveRef, ResolveResult } from '../cardCatalog/cardCatalogLookup';
import { collectorNumbersMatch } from '../cardCatalog/normalize';
import { RESOLVE_BATCH_SIZE } from '../cardIntake/config';
import { MAX_CANDIDATES } from './config';
import { namesAgree } from './nameAgreement';
import type { CandidateDto, CardObservation, ObservationResolution, ResolutionAgreement, ResolutionNote } from './types';

export type ResolveFn = (refs: ResolveRef[]) => Promise<ResolveResult[]>;

export interface ResolveObservationContext {
  catalog: Pick<CatalogState, 'enabled' | 'readyGames'>;
  resolve: ResolveFn;
}

export function toCandidateDto(p: PrintingDto): CandidateDto {
  return {
    printingId: p.id,
    name: p.name,
    setCode: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    finishes: p.finishes,
    releaseYear: p.releaseYear,
    imageSmallUrl: p.imageSmallUrl,
  };
}

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function unmatched(note: ResolutionNote | null): ObservationResolution {
  return { status: 'UNMATCHED', printingId: null, candidates: [], truncated: false, agreement: 'NONE', note };
}

function exact(printing: PrintingDto, agreement: ResolutionAgreement, note: ResolutionNote | null): ObservationResolution {
  return { status: 'EXACT', printingId: printing.id, candidates: [toCandidateDto(printing)], truncated: false, agreement, note };
}

/** Candidates are deduplicated by printing id, kept in the order given, and cut to MAX_CANDIDATES. */
function ambiguous(lists: PrintingDto[][], truncatedByLookup: boolean, note: ResolutionNote | null): ObservationResolution {
  const seen = new Set<string>();
  const merged: PrintingDto[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
  }
  return {
    status: 'AMBIGUOUS',
    printingId: null,
    candidates: merged.slice(0, MAX_CANDIDATES).map(toCandidateDto),
    truncated: truncatedByLookup || merged.length > MAX_CANDIDATES,
    agreement: 'NONE',
    note,
  };
}

/** True when the printing carries the set code and collector number that were read. */
function pairMatches(printing: PrintingDto, obs: CardObservation): boolean {
  const setCode = text(obs.setCode).toLowerCase();
  return setCode !== '' && printing.setCode.toLowerCase() === setCode && collectorNumbersMatch(printing.collectorNumber, obs.collectorNumber);
}

/** Why the catalog cannot be asked about this observation at all, or null when it can. */
function notServedNote(obs: CardObservation, catalog: ResolveObservationContext['catalog']): ResolutionNote | null {
  if (!catalog.enabled) return 'CATALOG_OFF';
  if (!(catalog.readyGames as readonly string[]).includes(obs.game)) return 'GAME_NOT_SERVED';
  return null;
}

function buildRefs(index: number, obs: CardObservation): ResolveRef[] {
  const game = obs.game as CatalogGame;
  const refs: ResolveRef[] = [];
  const scryfallId = text(obs.scryfallId);
  const tcgId = obs.tcgplayerProductId;
  const hasTcgId = typeof tcgId === 'number' && Number.isInteger(tcgId) && tcgId > 0;
  if (scryfallId !== '' || hasTcgId) {
    // Carries ONLY ids, so a miss cannot fall through to a name match by accident.
    refs.push({ ref: `${index}:ID`, game, scryfallId: scryfallId !== '' ? scryfallId : null, tcgplayerProductId: hasTcgId ? (tcgId as number) : null });
  }
  const setCode = text(obs.setCode).toLowerCase();
  const number = text(obs.collectorNumber);
  const name = text(obs.cardName);
  if (setCode !== '' && number !== '') {
    refs.push({ ref: `${index}:SN`, game, setCode, collectorNumber: number, name: name !== '' ? name : null });
  }
  if (name !== '') {
    refs.push({ ref: `${index}:NM`, game, name });
  }
  return refs;
}

function decide(obs: CardObservation, id: ResolveResult | undefined, sn: ResolveResult | undefined, nm: ResolveResult | undefined): ObservationResolution {
  // 1. An exact id supplied by the source: no name comparison needed.
  if (id && id.status === 'EXACT' && id.candidates.length === 1) return exact(id.candidates[0], 'FULL', null);

  // 2. Set code plus collector number.
  if (sn && sn.status === 'EXACT' && sn.candidates.length > 0) {
    const pick = sn.candidates[0];
    const nameOk = namesAgree(obs.cardName, pick.name);
    if (nameOk && pairMatches(pick, obs)) return exact(pick, 'FULL', null);
    // The number did not match but the name is unique inside the read set: matched by name only.
    if (nameOk) return exact(pick, 'PARTIAL', 'NAME_ONLY');
    // The pair points at a printing whose name differs from the one read: never pre-select.
    const note: ResolutionNote | null = text(obs.cardName) !== '' ? 'NAME_MISMATCH' : null;
    return ambiguous([[pick], nm ? nm.candidates : []], nm ? nm.truncated : false, note);
  }
  if (sn && sn.status === 'AMBIGUOUS') return ambiguous([sn.candidates], sn.truncated, null);

  // 3. Name only.
  if (nm && nm.status === 'EXACT' && nm.candidates.length > 0) {
    const pick = nm.candidates[0];
    if (namesAgree(obs.cardName, pick.name)) return exact(pick, 'PARTIAL', 'NAME_ONLY');
    return ambiguous([[pick]], false, null);
  }
  if (nm && nm.status === 'AMBIGUOUS') return ambiguous([nm.candidates], nm.truncated, null);

  return unmatched(null);
}

/**
 * Resolves many observations with as few catalog calls as possible (each call carries at most RESOLVE_BATCH_SIZE
 * refs). The result array is in the same order as the input. An observation whose game the catalog does not serve
 * is answered without any catalog call.
 */
export async function resolveObservations(observations: readonly CardObservation[], ctx: ResolveObservationContext): Promise<ObservationResolution[]> {
  const out: Array<ObservationResolution | null> = observations.map(() => null);
  const refs: ResolveRef[] = [];
  observations.forEach((obs, index) => {
    const note = notServedNote(obs, ctx.catalog);
    if (note) {
      out[index] = unmatched(note);
      return;
    }
    refs.push(...buildRefs(index, obs));
  });

  const results = new Map<string, ResolveResult>();
  for (let start = 0; start < refs.length; start += RESOLVE_BATCH_SIZE) {
    const answers = await ctx.resolve(refs.slice(start, start + RESOLVE_BATCH_SIZE));
    for (const answer of answers) results.set(answer.ref, answer);
  }

  return observations.map((obs, index) => {
    const done = out[index];
    if (done) return done;
    return decide(obs, results.get(`${index}:ID`), results.get(`${index}:SN`), results.get(`${index}:NM`));
  });
}

export async function resolveObservation(obs: CardObservation, ctx: ResolveObservationContext): Promise<ObservationResolution> {
  const [resolution] = await resolveObservations([obs], ctx);
  return resolution;
}
