/**
 * Row planner (ADR-134 sections 4.5 to 4.8, batch B4): turns spreadsheet records into PlannedRows.
 *
 * The file is streamed once. Records are normalized and resolved against the card catalog in batches
 * of 500 (the same service code as POST /api/cards/resolve, called directly, not over HTTP). Nothing
 * is written here: preview and confirm both call planFile and decide what to do with the rows.
 *
 * Rules that matter:
 *  - Nothing is guessed. An unmapped condition string never becomes Near Mint (strict mode: the row
 *    fails with CONDITION_UNMAPPED). Several matching printings or finishes need the seller's choice.
 *  - A card the catalog cannot match (including every game the catalog does not serve) is NOT an error:
 *    it imports with the details from the file and is reported as NO_CATALOG_MATCH.
 *  - The dedupKey always comes from cardRecordService.computeDedupKey, never a local formula.
 *  - Intake never imports a Vision or Haiku service and never calls the network.
 */
import {
  CARD_FIELDS,
  CardField,
  CardCreateData,
  buildCardCreateData,
  computeDedupKey,
  isCardValidationError,
} from '../cardRecordService';
import { CARD_GRADERS, CARD_GRADES, canonicalizeVocabValue, CARD_FINISHES, CARD_LANGUAGES } from '../../constants/cardVocabulary';
import type { CardConditionCode } from '../../constants/cardVocabulary';
import type { ResolveRef, ResolveResult, PrintingDto, CatalogState } from '../cardCatalog/cardCatalogLookup';
import { CatalogGame } from '../cardCatalog/types';
import { RESOLVE_BATCH_SIZE } from './config';
import { ConditionChoices, resolveCondition, conditionKey, proposeCondition, conditionLabel } from './conditionMap';
import { Importer, readRow, SourceRow } from './importers/shared';
import {
  catalogFinishToVocab,
  parseFinishCell,
  parseGameCell,
  parseLanguageCell,
  parseMoneyCell,
  parseQuantityCell,
  splitFoilFromCondition,
} from './normalizeCells';
import { ROW_ERROR_MESSAGES } from './messages';
import { streamRecords } from './parseSpreadsheet';
import type {
  CandidateDto,
  ColumnMapping,
  ConditionLine,
  PlannedRow,
  PriceSource,
  ReviewReason,
  RowDecision,
  RowErrorCode,
  RowErrorInfo,
  SourceRecord,
} from './types';

export interface PlanOptions {
  importer: Importer;
  mapping: ColumnMapping;
  /** Game used when the file has no game column and the row's game cell is blank. */
  defaultGame: string;
  priceSource: PriceSource;
  defaultCondition: CardConditionCode | null;
  conditionChoices: ConditionChoices;
  /** Confirm sets this: unresolved condition, printing or finish becomes a row error instead of a review state. */
  strict: boolean;
  decisions: Map<number, RowDecision>;
  organizerId: string | null;
  catalog: CatalogState;
  maxRows: number;
}

export interface PlanDeps {
  resolve(refs: ResolveRef[]): Promise<ResolveResult[]>;
}

export interface PlanResult {
  rowsTotal: number;
  conditionLines: ConditionLine[];
}

function err(code: RowErrorCode, field: string | null): RowErrorInfo {
  return { code, field, message: ROW_ERROR_MESSAGES[code] };
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const SCRYFALL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function cleanText(v: string | undefined): string {
  return (v ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

function toCandidate(p: PrintingDto): CandidateDto {
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

/** A card field is locked (seller-owned) when its value came from the file or the seller's decision. */
function lockedFor(card: CardCreateData, fromCatalog: ReadonlySet<CardField>): string[] {
  return (CARD_FIELDS as readonly CardField[]).filter((field) => {
    if (field === 'productType') return false;
    if (fromCatalog.has(field)) return false;
    const value = (card as unknown as Record<string, unknown>)[field];
    return value !== null && value !== undefined;
  });
}

interface Prepared {
  row: number;
  record: SourceRecord;
  src: SourceRow;
  game: string;
  name: string;
  quantity: number;
  price: number | null;
  costBasis: number | null;
  sku: string | null;
  fileFinish: ReturnType<typeof parseFinishCell>;
  conditionCode: CardConditionCode | null;
  conditionBlank: boolean;
  conditionSource: string;
  language: ReturnType<typeof parseLanguageCell>;
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  warnings: string[];
}

type PrepareResult = { ok: true; value: Prepared } | { ok: false; error: RowErrorInfo };

function prepareRow(
  streamed: { row: number; record: SourceRecord; tooLong: boolean },
  opts: PlanOptions,
  conditionTally: Map<string, ConditionLine>
): PrepareResult {
  const { row, record } = streamed;
  if (streamed.tooLong) return { ok: false, error: err('ROW_TOO_LONG', null) };
  const src = readRow(record, opts.mapping);
  const warnings: string[] = [];

  const name = cleanText(src.name);
  if (!name) return { ok: false, error: err('MISSING_NAME', 'name') };

  let quantity = 1;
  if (opts.mapping.quantity) {
    const q = parseQuantityCell(src.quantity ?? '');
    if (!q.ok) return { ok: false, error: err('BAD_QUANTITY', 'quantity') };
    quantity = q.value;
  }

  let price: number | null = null;
  if (opts.priceSource === 'FILE' && opts.mapping.price) {
    const p = parseMoneyCell(src.price ?? '');
    if (p !== null && Number.isNaN(p)) return { ok: false, error: err('BAD_PRICE', 'price') };
    price = p;
  }

  let costBasis: number | null = null;
  if (opts.mapping.cost) {
    const currencyOk = !opts.mapping.costCurrency || (src.costCurrency ?? '').trim().toUpperCase() === 'USD';
    if (currencyOk) {
      const c = parseMoneyCell(src.cost ?? '');
      costBasis = c === null || Number.isNaN(c) ? null : c;
    }
  }

  let sku: string | null = null;
  if (opts.mapping.sku) {
    const s = cleanText(src.sku);
    if (s.length > 100) return { ok: false, error: err('ROW_TOO_LONG', 'sku') };
    sku = s || null;
  }

  const gameCell = parseGameCell(src.game);
  const game = gameCell ?? opts.importer.defaultGame ?? opts.defaultGame;

  // Condition cell (TCGplayer seller exports may carry a trailing Foil marker).
  let conditionText = src.condition ?? '';
  let foilFromCondition = false;
  if (opts.importer.conditionMayCarryFoil && conditionText) {
    const split = splitFoilFromCondition(conditionText);
    conditionText = split.condition;
    foilFromCondition = split.foil;
  }
  let fileFinish = parseFinishCell(opts.mapping.finish ? src.finish : undefined, opts.importer.blankFinishIsNonfoil);
  if (foilFromCondition && fileFinish.kind === 'absent') fileFinish = { kind: 'value', finish: 'FOIL' };

  // Grading (generic files only). A graded card is described by grader and grade, never by a condition.
  let grader: string | null = null;
  let grade: string | null = null;
  let certNumber: string | null = null;
  const graderText = cleanText(src.grader);
  const gradeText = cleanText(src.grade);
  const certText = cleanText(src.certNumber);
  if (graderText) {
    const g = canonicalizeVocabValue(CARD_GRADERS, graderText);
    if (!g) return { ok: false, error: err('INVALID_CARD_DATA', 'grader') };
    if (!gradeText) return { ok: false, error: err('GRADED_MISSING_GRADE', 'grade') };
    const gr = canonicalizeVocabValue(CARD_GRADES, gradeText);
    if (!gr) return { ok: false, error: err('INVALID_CARD_DATA', 'grade') };
    if (certText.length > 30) return { ok: false, error: err('CERT_TOO_LONG', 'certNumber') };
    grader = g;
    grade = gr;
    certNumber = certText || null;
  } else if (gradeText) {
    return { ok: false, error: err('GRADED_MISSING_GRADE', 'grader') };
  }

  let conditionCode: CardConditionCode | null = null;
  let conditionBlank = false;
  if (!grader) {
    const res = resolveCondition(opts.importer.conditionScale, conditionText, opts.conditionChoices, opts.defaultCondition, opts.strict);
    if (!res.ok) return { ok: false, error: err('CONDITION_UNMAPPED', 'condition') };
    conditionCode = res.code;
    conditionBlank = res.blank;
    if (res.blank && res.code === null) warnings.push('MISSING_CONDITION');
    const trimmed = conditionText.trim();
    if (trimmed) {
      const key = conditionKey(trimmed);
      const line = conditionTally.get(key);
      if (line) line.rowCount += 1;
      else conditionTally.set(key, { sourceValue: trimmed, rowCount: 1, proposed: null, proposedLabel: null, confidence: 'REVIEW' });
    }
  }

  const language = parseLanguageCell(opts.mapping.language ? src.language : undefined);
  if (language.kind === 'unknown') warnings.push('UNKNOWN_LANGUAGE');

  return {
    ok: true,
    value: {
      row,
      record,
      src,
      game,
      name,
      quantity,
      price,
      costBasis,
      sku,
      fileFinish,
      conditionCode,
      conditionBlank,
      conditionSource: conditionText.trim(),
      language,
      grader,
      grade,
      certNumber,
      warnings,
    },
  };
}

function rowTemplate(prepared: Prepared | null, streamed: { row: number; record: SourceRecord }, name = ''): PlannedRow {
  return {
    row: streamed.row,
    status: 'OK',
    resolution: 'UNMATCHED',
    review: null,
    noCatalogMatch: false,
    candidates: [],
    truncatedCandidates: false,
    quantity: prepared?.quantity ?? 0,
    price: prepared?.price ?? null,
    costBasis: prepared?.costBasis ?? null,
    sku: prepared?.sku ?? null,
    warnings: prepared ? [...prepared.warnings] : [],
    source: streamed.record,
    display: {
      name: prepared?.name ?? name,
      setCode: prepared?.src.setCode ? cleanText(prepared.src.setCode).toLowerCase() : null,
      collectorNumber: prepared?.src.collectorNumber ? cleanText(prepared.src.collectorNumber) : null,
    },
  };
}

function finishRank(list: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of list) {
    const v = catalogFinishToVocab(f);
    if (v) out.add(v);
  }
  return out;
}

function buildPlanned(
  prepared: Prepared,
  resolved: ResolveResult | null,
  decision: RowDecision | undefined,
  opts: PlanOptions
): PlannedRow {
  const planned = rowTemplate(prepared, { row: prepared.row, record: prepared.record });
  const fail = (e: RowErrorInfo): PlannedRow => {
    planned.status = 'ERROR';
    planned.error = e;
    return planned;
  };

  // 1. Which printing, if any.
  let printing: PrintingDto | null = null;
  let candidates: PrintingDto[] = [];
  if (resolved) {
    planned.resolution = resolved.status;
    candidates = resolved.candidates;
    planned.candidates = candidates.map(toCandidate);
    planned.truncatedCandidates = resolved.truncated;
  }
  const decidedPrintingId = decision?.printingId;
  if (decidedPrintingId !== undefined) {
    const picked = candidates.find((c) => c.id === decidedPrintingId);
    if (!picked) return fail(err('INVALID_DECISION', 'printingId'));
    printing = picked;
  } else if (resolved?.status === 'EXACT') {
    printing = candidates[0];
  }
  const printingReview = !printing && resolved?.status === 'AMBIGUOUS';
  planned.noCatalogMatch = !printing && !printingReview;

  // 2. Finish. The seller's decision wins, then the file, then the catalog when it has exactly one finish.
  let finish: string | null = null;
  let finishFromSeller = false;
  let finishReview = false;
  if (decision?.finish !== undefined) {
    const f = canonicalizeVocabValue(CARD_FINISHES, decision.finish);
    if (!f) return fail(err('INVALID_DECISION', 'finish'));
    finish = f;
    finishFromSeller = true;
  } else if (prepared.fileFinish.kind === 'value') {
    finish = prepared.fileFinish.finish;
    finishFromSeller = true;
  } else if (prepared.fileFinish.kind === 'unrecognized') {
    finishReview = true;
  } else if (printing) {
    const available = finishRank(printing.finishes);
    if (available.size === 1) finish = Array.from(available)[0];
    else if (available.size > 1) finishReview = true;
  }
  // Precedence: several printings, then finish, then "no catalog match" (which never blocks the import).
  const review: ReviewReason | null = printingReview
    ? 'AMBIGUOUS_PRINTING'
    : finishReview
      ? 'FINISH_AMBIGUOUS'
      : planned.noCatalogMatch
        ? 'NO_CATALOG_MATCH'
        : null;
  planned.review = review;

  // 3. Review states become errors only in strict mode (confirm). NO_CATALOG_MATCH never does.
  if (review === 'AMBIGUOUS_PRINTING' || review === 'FINISH_AMBIGUOUS') {
    if (opts.strict) {
      return review === 'AMBIGUOUS_PRINTING' ? fail(err('AMBIGUOUS_PRINTING', 'printing')) : fail(err('UNKNOWN_FINISH', 'finish'));
    }
    // Preview: the row cannot be keyed yet. It is counted and shown for review, not written.
    return planned;
  }

  // 4. Language: the file's value, else the printing's own language, else blank.
  let language: string | null = null;
  let languageFromFile = false;
  if (prepared.language.kind === 'value') {
    language = prepared.language.code;
    languageFromFile = true;
  } else if (printing) {
    language = canonicalizeVocabValue(CARD_LANGUAGES, printing.language) ?? null;
  }

  // 5. The card columns, through the single card writer's validator.
  const fromCatalog = new Set<CardField>();
  const input: Record<string, unknown> = {
    game: printing ? printing.game : prepared.game,
    productType: 'SINGLE',
    language,
    finish,
    conditionCode: prepared.grader ? null : prepared.conditionCode,
    grader: prepared.grader,
    grade: prepared.grade,
    certNumber: prepared.certNumber,
  };
  if (printing) {
    Object.assign(input, {
      cardName: printing.name,
      setCode: printing.setCode,
      setName: printing.setName,
      collectorNumber: printing.collectorNumber,
      rarity: printing.rarity,
      releaseYear: printing.releaseYear,
      scryfallId: printing.scryfallId,
      tcgplayerProductId: printing.tcgplayerProductId,
      cardmarketId: printing.cardmarketId,
    });
    for (const f of ['game', 'cardName', 'setCode', 'setName', 'collectorNumber', 'rarity', 'releaseYear', 'scryfallId', 'tcgplayerProductId', 'cardmarketId'] as CardField[]) {
      fromCatalog.add(f);
    }
    if (!languageFromFile) fromCatalog.add('language');
    if (!finishFromSeller) fromCatalog.add('finish');
  } else {
    const scryfallId = cleanText(prepared.src.scryfallId);
    const tcg = Number(cleanText(prepared.src.tcgplayerProductId));
    Object.assign(input, {
      cardName: prepared.name,
      setCode: cleanText(prepared.src.setCode) || null,
      setName: cleanText(prepared.src.setName) || null,
      collectorNumber: cleanText(prepared.src.collectorNumber) || null,
      rarity: cleanText(prepared.src.rarity) || null,
      scryfallId: SCRYFALL_ID_RE.test(scryfallId) ? scryfallId : null,
      tcgplayerProductId: Number.isInteger(tcg) && tcg > 0 ? tcg : null,
    });
  }

  let card: CardCreateData;
  try {
    card = buildCardCreateData(input, opts.organizerId);
  } catch (e) {
    if (isCardValidationError(e)) {
      const first = e.issues[0];
      const field = first?.path || null;
      if (field === 'certNumber') return fail(err('CERT_TOO_LONG', field));
      if (first && /characters or fewer/i.test(first.message)) return fail(err('ROW_TOO_LONG', field));
      return fail(err('INVALID_CARD_DATA', field));
    }
    throw e;
  }
  const catalogPrintingId = printing ? printing.id : null;
  card = {
    ...card,
    catalogPrintingId,
    lockedFields: lockedFor(card, fromCatalog),
    dedupKey: computeDedupKey({ ...card, catalogPrintingId }),
  };
  planned.card = card;
  planned.dedupKey = card.dedupKey;
  planned.display.name = card.cardName ?? prepared.name;
  planned.display.setCode = card.setCode;
  planned.display.collectorNumber = card.collectorNumber;
  return planned;
}

export type RowVisitor = (row: PlannedRow) => void | Promise<void>;

/**
 * Streams the file, plans every row in file order and hands each PlannedRow to the visitor.
 * Throws IntakeFileError (TOO_MANY_ROWS, PARSE_ERROR, NOT_A_CSV_FILE) from the reader.
 */
export async function planFile(
  filePath: string,
  opts: PlanOptions,
  deps: PlanDeps,
  visitor: RowVisitor
): Promise<PlanResult> {
  const conditionTally = new Map<string, ConditionLine>();
  let rowsTotal = 0;
  let batch: Array<{ row: number; record: SourceRecord; tooLong: boolean }> = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const items = batch;
    batch = [];

    interface Entry {
      streamed: { row: number; record: SourceRecord; tooLong: boolean };
      skip: boolean;
      prep: PrepareResult | null;
    }
    const entries: Entry[] = items.map((streamed) => {
      const skip = opts.decisions.get(streamed.row)?.skip === true;
      return { streamed, skip, prep: skip ? null : prepareRow(streamed, opts, conditionTally) };
    });

    // Resolve only rows that prepared cleanly, are not skipped, and belong to a game the catalog serves.
    const refs: ResolveRef[] = [];
    for (const e of entries) {
      if (!e.prep || !e.prep.ok) continue;
      const v = e.prep.value;
      if (!opts.catalog.readyGames.includes(v.game as CatalogGame)) continue;
      const scryfallText = cleanText(v.src.scryfallId);
      const tcgId = Number(cleanText(v.src.tcgplayerProductId));
      refs.push({
        ref: String(v.row),
        game: v.game as CatalogGame,
        scryfallId: SCRYFALL_ID_RE.test(scryfallText) ? scryfallText : null,
        tcgplayerProductId: Number.isInteger(tcgId) && tcgId > 0 ? tcgId : null,
        setCode: v.src.setCode ? cleanText(v.src.setCode).toLowerCase() : null,
        collectorNumber: v.src.collectorNumber ? cleanText(v.src.collectorNumber) : null,
        name: v.name,
        language: v.language.kind === 'value' ? v.language.code : null,
        finish: null,
      });
    }
    const resolvedByRow = new Map<string, ResolveResult>();
    for (let i = 0; i < refs.length; i += RESOLVE_BATCH_SIZE) {
      const results = await deps.resolve(refs.slice(i, i + RESOLVE_BATCH_SIZE));
      for (const r of results) resolvedByRow.set(r.ref, r);
    }

    for (const e of entries) {
      rowsTotal += 1;
      const rowName = cleanText(readRow(e.streamed.record, opts.mapping).name);
      let planned: PlannedRow;
      if (e.skip) {
        planned = rowTemplate(null, e.streamed, rowName);
        planned.status = 'SKIP';
      } else if (!e.prep || !e.prep.ok) {
        planned = rowTemplate(null, e.streamed, rowName);
        planned.status = 'ERROR';
        planned.error = e.prep && !e.prep.ok ? e.prep.error : err('INVALID_CARD_DATA', null);
      } else {
        const resolved = resolvedByRow.get(String(e.prep.value.row)) ?? null;
        planned = buildPlanned(e.prep.value, resolved, opts.decisions.get(e.streamed.row), opts);
      }
      await visitor(planned);
    }
  };

  for await (const streamed of streamRecords(filePath, { maxRows: opts.maxRows })) {
    batch.push(streamed);
    if (batch.length >= RESOLVE_BATCH_SIZE) await flush();
  }
  await flush();

  const conditionLines: ConditionLine[] = Array.from(conditionTally.values()).map((line) => {
    const proposal = proposeFor(opts, line.sourceValue);
    return { ...line, proposed: proposal.proposed, proposedLabel: proposal.label, confidence: proposal.confidence };
  });
  return { rowsTotal, conditionLines };
}

function proposeFor(opts: PlanOptions, sourceValue: string) {
  const choice = opts.conditionChoices.get(conditionKey(sourceValue));
  if (opts.conditionChoices.has(conditionKey(sourceValue))) {
    return { proposed: choice ?? null, label: conditionLabel(choice ?? null), confidence: 'REVIEW' as const };
  }
  const p = proposeCondition(opts.importer.conditionScale, sourceValue);
  return { proposed: p.proposed, label: conditionLabel(p.proposed), confidence: p.confidence };
}
