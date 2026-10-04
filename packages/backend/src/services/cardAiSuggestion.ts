/**
 * cardAiSuggestion (card-aware photo tagging): turns the optional `card` object that the SAME Haiku
 * tagging call returns into (a) a validated AICardResult, (b) an ItemCard row holding ONLY identity
 * fields, and (c) a condition SUGGESTION that waits for the organizer to confirm.
 *
 * Rules that matter:
 *  - No extra API call and no paid service: this module only normalizes data the tagging call already
 *    returned. It imports only the pure vocabulary constants and cardRecordService (which itself has no
 *    network or env access). It must never import cloudAIService (the CSV card intake graph stays AI-free).
 *  - Defensive: every model value is validated against the card vocabulary. An unknown game drops the
 *    whole card object (the item is then treated as a non-card). Any other bad value (condition code,
 *    grader, grade, language, finish, cert number) is dropped on its own. Nothing here throws on bad model output.
 *  - The AI NEVER writes ItemCard.conditionCode, grader, grade or certNumber. Those four fields decide whether
 *    eBay accepts the card (resolveCardCondition refuses a card with no condition and no grader and grade,
 *    CARD_CONDITION_UNRESOLVED), so leaving them null keeps publish blocked until the organizer confirms.
 *    The suggested value travels in Item.catalogSuggestions.cardSuggestion instead (no migration).
 *  - The AI never locks a field: lockedFields is left exactly as stored. An existing ItemCard value is never
 *    overwritten, and a field listed in lockedFields is never touched, so organizer input always wins.
 */
import {
  CARD_CONDITION_CODES,
  CARD_FINISHES,
  CARD_GAMES,
  CARD_GRADERS,
  CARD_GRADES,
  CARD_LANGUAGES,
  CardConditionCode,
  CardFinish,
  CardGame,
  CardGrade,
  CardGrader,
  CardLanguage,
  canonicalizeVocabValue,
} from '../constants/cardVocabulary';
import { CardDb, isCardValidationError, parseCardInput, planCardWrite } from './cardRecordService';

/** The validated `card` block of an AI tagging result. Only `game` is guaranteed. */
export interface AICardResult {
  game: CardGame;
  cardName?: string;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
  language?: CardLanguage;
  finish?: CardFinish;
  /** Ungraded card only. Never persisted to ItemCard; carried as a suggestion until the organizer confirms. */
  suggestedCardCondition?: CardConditionCode;
  /** Graded slab only (grader and grade are always present together). Same suggestion-only treatment. */
  grader?: CardGrader;
  grade?: CardGrade;
  certNumber?: string;
}

/** What is stored under Item.catalogSuggestions.cardSuggestion and shown as "Suggested, please confirm". */
export interface CardConditionSuggestion {
  conditionCode?: CardConditionCode;
  grader?: CardGrader;
  grade?: CardGrade;
  certNumber?: string;
  source: 'haiku';
  suggestedAt: string;
}

// ---------------------------------------------------------------------------
// Normalizing model output
// ---------------------------------------------------------------------------

const NOT_A_VALUE = /^(null|none|unknown|n\/a|na|nil|undefined|not visible|not shown|unreadable)$/i;

function cleanText(value: unknown, max: number): string | undefined {
  let v = value;
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return undefined;
  const text = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text === '' || NOT_A_VALUE.test(text)) return undefined;
  // Over-long text is junk for these short printed fields; drop it rather than truncate it into a wrong value.
  return text.length > max ? undefined : text;
}

/** Lowercase, accent-stripped, letters and digits only: "Pokémon TCG" -> "pokemontcg". */
function aliasKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const GAME_ALIASES: Record<string, CardGame> = {
  magic: 'MTG',
  magicthegathering: 'MTG',
  mtg: 'MTG',
  pokemon: 'POKEMON',
  pokemontcg: 'POKEMON',
  pokemoncards: 'POKEMON',
  yugioh: 'YUGIOH',
  ygo: 'YUGIOH',
  yugiohtcg: 'YUGIOH',
  lorcana: 'LORCANA',
  disneylorcana: 'LORCANA',
  onepiece: 'ONE_PIECE',
  onepiececardgame: 'ONE_PIECE',
  other: 'OTHER',
  sports: 'OTHER',
  sportscard: 'OTHER',
  sportscards: 'OTHER',
  baseball: 'OTHER',
  basketball: 'OTHER',
  football: 'OTHER',
  hockey: 'OTHER',
  soccer: 'OTHER',
  nonsports: 'OTHER',
};

const LANGUAGE_ALIASES: Record<string, CardLanguage> = {
  english: 'en',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  japanese: 'ja',
  korean: 'ko',
  russian: 'ru',
  chinesesimplified: 'zhs',
  simplifiedchinese: 'zhs',
  chinesetraditional: 'zht',
  traditionalchinese: 'zht',
};

const FINISH_ALIASES: Record<string, CardFinish> = {
  nonfoil: 'NONFOIL',
  foil: 'FOIL',
  etched: 'ETCHED',
  etchedfoil: 'ETCHED',
  holo: 'HOLO',
  holofoil: 'HOLO',
  reverseholo: 'REVERSE_HOLO',
  reverseholofoil: 'REVERSE_HOLO',
};

const CONDITION_ALIASES: Record<string, CardConditionCode> = {
  nearmint: 'NM',
  lightlyplayed: 'LP',
  moderatelyplayed: 'MP',
  heavilyplayed: 'HP',
  damaged: 'DMG',
};

function mapGame(value: unknown): CardGame | undefined {
  const text = cleanText(value, 60);
  if (!text) return undefined;
  return canonicalizeVocabValue(CARD_GAMES, text) ?? GAME_ALIASES[aliasKey(text)];
}

function mapLanguage(value: unknown): CardLanguage | undefined {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  return canonicalizeVocabValue(CARD_LANGUAGES, text) ?? LANGUAGE_ALIASES[aliasKey(text)];
}

function mapFinish(value: unknown): CardFinish | undefined {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  return canonicalizeVocabValue(CARD_FINISHES, text) ?? FINISH_ALIASES[aliasKey(text)];
}

function mapCondition(value: unknown): CardConditionCode | undefined {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  return canonicalizeVocabValue(CARD_CONDITION_CODES, text) ?? CONDITION_ALIASES[aliasKey(text)];
}

function mapGrader(value: unknown): CardGrader | undefined {
  const text = cleanText(value, 40);
  return text ? canonicalizeVocabValue(CARD_GRADERS, text) : undefined;
}

function mapGrade(value: unknown): CardGrade | undefined {
  const text = cleanText(value, 40);
  return text ? canonicalizeVocabValue(CARD_GRADES, text) : undefined;
}

function mapCert(value: unknown): string | undefined {
  const text = cleanText(value, 60);
  if (!text) return undefined;
  const compact = text.replace(/\s+/g, '');
  return /^[A-Za-z0-9-]{1,30}$/.test(compact) ? compact : undefined;
}

/**
 * Validate and normalize the model's `card` value. Returns null when it is absent, not an object, or has no
 * recognizable game (the item is then handled as a non-card). Never throws.
 *
 * A card that claims to be graded (grader or grade present) keeps its grader, grade and cert number ONLY when
 * both grader and grade are valid; otherwise it carries no condition information at all, because a slab must never
 * be turned into an ungraded condition suggestion.
 */
export function normalizeAiCard(raw: unknown): AICardResult | null {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const game = mapGame(r.game);
    if (!game) return null;

    const out: AICardResult = { game };
    const cardName = cleanText(r.cardName, 200);
    if (cardName) out.cardName = cardName;
    const setName = cleanText(r.setName, 200);
    if (setName) out.setName = setName;
    const setCode = cleanText(r.setCode, 20);
    if (setCode) out.setCode = setCode.toLowerCase();
    const collectorNumber = cleanText(r.collectorNumber, 20);
    if (collectorNumber) out.collectorNumber = collectorNumber;
    const language = mapLanguage(r.language);
    if (language) out.language = language;
    const finish = mapFinish(r.finish);
    if (finish) out.finish = finish;

    const gradedClaimed = cleanText(r.grader, 40) !== undefined || cleanText(r.grade, 40) !== undefined;
    if (gradedClaimed) {
      const grader = mapGrader(r.grader);
      const grade = mapGrade(r.grade);
      if (grader && grade) {
        out.grader = grader;
        out.grade = grade;
        const cert = mapCert(r.certNumber);
        if (cert) out.certNumber = cert;
      }
    } else {
      const condition = mapCondition(r.suggestedCardCondition);
      if (condition) out.suggestedCardCondition = condition;
    }
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The suggestion (stored on Item.catalogSuggestions.cardSuggestion)
// ---------------------------------------------------------------------------

/** The condition suggestion carried by a normalized card, or null when the model offered none. */
export function buildCardConditionSuggestion(card: AICardResult, now: Date = new Date()): CardConditionSuggestion | null {
  const suggestedAt = now.toISOString();
  if (card.grader && card.grade) {
    return {
      grader: card.grader,
      grade: card.grade,
      ...(card.certNumber ? { certNumber: card.certNumber } : {}),
      source: 'haiku',
      suggestedAt,
    };
  }
  if (card.suggestedCardCondition) {
    return { conditionCode: card.suggestedCardCondition, source: 'haiku', suggestedAt };
  }
  return null;
}

/**
 * Read the suggestion back out of stored Item.catalogSuggestions JSON. Re-validates every value (stored JSON is
 * untrusted), so a hand-edited or stale blob can never surface an invalid code. Returns null when none is usable.
 */
export function readCardConditionSuggestion(catalogSuggestions: unknown): CardConditionSuggestion | null {
  if (catalogSuggestions === null || typeof catalogSuggestions !== 'object' || Array.isArray(catalogSuggestions)) return null;
  const raw = (catalogSuggestions as Record<string, unknown>).cardSuggestion;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const suggestedAt = typeof r.suggestedAt === 'string' ? r.suggestedAt : new Date(0).toISOString();
  const grader = mapGrader(r.grader);
  const grade = mapGrade(r.grade);
  if (grader && grade) {
    const cert = mapCert(r.certNumber);
    return { grader, grade, ...(cert ? { certNumber: cert } : {}), source: 'haiku', suggestedAt };
  }
  const conditionCode = mapCondition(r.conditionCode);
  if (conditionCode) return { conditionCode, source: 'haiku', suggestedAt };
  return null;
}

/** Add the suggestion to an existing catalogSuggestions blob without disturbing the enrichment keys. */
export function mergeCardSuggestionIntoCatalogSuggestions(existing: unknown, suggestion: CardConditionSuggestion): Record<string, unknown> {
  const base =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, cardSuggestion: suggestion };
}

// ---------------------------------------------------------------------------
// Persisting (identity only) and storing the suggestion
// ---------------------------------------------------------------------------

/** Database surface used here: the card writer's surface plus the two Item calls for the suggestion blob. */
export interface AiCardDb extends CardDb {
  item: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface AiCardContext {
  itemId: string;
  organizerId: string | null;
}

export interface PersistAiCardResult {
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
  /** The suggestion to store, or null when the model offered none or the organizer already confirmed a condition. */
  suggestion: CardConditionSuggestion | null;
}

/** Identity fields the AI may fill. Condition, grader, grade and cert number are deliberately absent. */
const AI_IDENTITY_FIELDS = ['game', 'cardName', 'setName', 'setCode', 'collectorNumber', 'language', 'finish'] as const;

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

/**
 * Create the ItemCard (identity fields only) or fill the EMPTY, UNLOCKED identity fields of an existing one.
 * Never writes condition, grader, grade or cert number; never changes lockedFields; never overwrites a stored value.
 */
export async function persistAiCard(db: AiCardDb, ctx: AiCardContext, card: AICardResult): Promise<PersistAiCardResult> {
  const write = async (): Promise<PersistAiCardResult> => {
    const existing = await db.itemCard.findUnique({ where: { itemId: ctx.itemId } });
    const locked: string[] = Array.isArray(existing?.lockedFields) ? existing.lockedFields : [];

    const patch: Record<string, unknown> = {};
    for (const field of AI_IDENTITY_FIELDS) {
      const value = card[field];
      if (value === undefined) continue;
      if (existing && (locked.includes(field) || !isEmptyValue(existing[field]))) continue;
      patch[field] = value;
    }

    const conditionConfirmed = !!existing && (!isEmptyValue(existing.conditionCode) || !isEmptyValue(existing.grader) || !isEmptyValue(existing.grade));
    const suggestion = conditionConfirmed ? null : buildCardConditionSuggestion(card);

    if (existing && Object.keys(patch).length === 0) return { status: 'unchanged', suggestion };

    let parsed: ReturnType<typeof parseCardInput>;
    try {
      parsed = parseCardInput(patch);
    } catch (err) {
      if (isCardValidationError(err)) return { status: 'skipped', reason: 'card validation failed', suggestion: null };
      throw err;
    }
    const plan = planCardWrite(existing, parsed);

    if (!existing) {
      await db.itemCard.create({
        data: {
          itemId: ctx.itemId,
          organizerId: ctx.organizerId,
          ...plan.values,
          dedupKey: plan.dedupKey,
          // The AI never locks a field: lockedFields means "the organizer typed this".
          lockedFields: [],
        },
      });
      return { status: 'created', suggestion };
    }

    const filled: Record<string, unknown> = {};
    for (const field of Object.keys(patch)) filled[field] = (plan.values as unknown as Record<string, unknown>)[field];
    await db.itemCard.update({
      where: { itemId: ctx.itemId },
      // lockedFields is intentionally not part of this write.
      data: { ...filled, dedupKey: plan.dedupKey },
    });
    return { status: 'updated', suggestion };
  };

  try {
    return await write();
  } catch (err) {
    // Two concurrent first writes for one item: the loser hits the itemId unique index. Retry once as an update.
    if (isUniqueViolation(err)) return write();
    throw err;
  }
}

/** Re-reads the item's catalogSuggestions (so enrichment written moments earlier survives) and adds cardSuggestion. */
export async function storeCardConditionSuggestion(db: AiCardDb, itemId: string, suggestion: CardConditionSuggestion): Promise<void> {
  const fresh = await db.item.findUnique({ where: { id: itemId }, select: { catalogSuggestions: true } });
  const merged = mergeCardSuggestionIntoCatalogSuggestions(fresh?.catalogSuggestions, suggestion);
  await db.item.update({ where: { id: itemId }, data: { catalogSuggestions: merged } });
}

/**
 * Entry point for the persist paths: persist the card identity, then store the condition suggestion.
 * Never throws (a card problem must never fail the tagging job); returns the outcome for logging.
 */
export async function applyAiCardResult(
  db: AiCardDb,
  ctx: AiCardContext,
  card: AICardResult
): Promise<PersistAiCardResult | { status: 'error'; reason: string; suggestion: null }> {
  try {
    const outcome = await persistAiCard(db, ctx, card);
    if (outcome.suggestion && outcome.status !== 'skipped') {
      await storeCardConditionSuggestion(db, ctx.itemId, outcome.suggestion);
    }
    return outcome;
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err), suggestion: null };
  }
}
