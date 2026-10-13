/**
 * Suggestions (ADR-140 sections 6 and 10.1): resolves each card, asks the active reference providers for candidates, calls the
 * pure engine and returns the engine's result block (priceSource, asOf, trace, warnings, why) for every card.
 *
 * Nothing is written here and no item changes. Tenant rule: the book is found from ctx.organizerId, every provider query
 * carries the book or the organizer, and an item id must belong to the organizer (a foreign or unknown item id is a not found
 * error, the same answer as for a missing id).
 *
 * The per card key used for candidates is cardKey|finish|language (cardKey.ts lookupKey).
 */
import { PriceBookError, dollarsToCents, notFoundError, validationError } from './db';
import type { CardPrintingRow, ItemCardRow, ItemRow, ProviderCard, ServiceCtx } from './db';
import { findBook, isBookUsable, loadEngineRules, toBookSettings } from './bookService';
import { quoteBuylist } from './buylist';
import { lookupKey } from './cardKey';
import { suggestPrice } from './engine';
import { lastAppliedReferences, resolveLocks } from './lockService';
import { activeProviders } from './providers/registry';
import type { PriceBookProvider } from './providers/registry';
import { identityFromItemCard, identityFromPrinting, identityFromTyped, loadBulkRates, toBulkRate } from './referenceService';
import type { CardIdentity } from './referenceService';
import type { BookSettings, CardInput, ReferenceCandidate, PriceSuggestion } from './types';
import { FINISHES } from './vocabulary';
import type { ReferenceKind } from './vocabulary';

export const MAX_SUGGEST_CARDS = 100;
/** Mirrors MIN_CARD_SALE_CENTS in utils/feeCalculator.ts (a test pins them together); the caller may inject its own. */
export const DEFAULT_MIN_CARD_SALE_CENTS = 99;

export interface TypedSuggestCard {
  setCode?: string | null;
  collectorNumber?: string | null;
  cardName?: string | null;
  setName?: string | null;
  rarity?: string | null;
}

export interface SuggestCardInput {
  /** The caller's own label for this card, echoed back. */
  ref?: string | null;
  itemId?: string | null;
  printingId?: string | null;
  typed?: TypedSuggestCard | null;
  game?: string | null;
  finish?: string | null;
  conditionCode?: string | null;
  language?: string | null;
  quantity?: number | null;
  graded?: boolean | null;
  /** Used only when there is no itemId. */
  costCents?: number | null;
  /** Used only when there is no itemId. */
  currentPriceCents?: number | null;
}

export interface SuggestOptions {
  family: 'RETAIL' | 'BUYLIST';
  minCardSaleCents?: number;
  catalogStaleHours?: number;
  /** Tests only; production uses the registry. */
  providers?: readonly PriceBookProvider[];
}

export interface SuggestCardInfo {
  cardKey: string | null;
  game: string | null;
  finish: string | null;
  language: string | null;
  conditionCode: string | null;
  rarityClass: string | null;
  graded: boolean;
}

export interface SuggestRow {
  ref: string | null;
  itemId: string | null;
  card: SuggestCardInfo;
  suggestion: PriceSuggestion;
}

export interface SuggestOutput {
  bookVersion: number;
  results: SuggestRow[];
  /** Provider kinds that failed while answering; their numbers are missing from every result. */
  unavailable: ReferenceKind[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const centsOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

interface Resolved {
  input: SuggestCardInput;
  item: ItemRow | null;
  identity: CardIdentity | null;
  card: CardInput;
  providerCard: ProviderCard | null;
}

function checkInputs(cards: unknown): SuggestCardInput[] {
  if (!Array.isArray(cards) || cards.length === 0) throw validationError('Send at least one card.', { field: 'cards' });
  if (cards.length > MAX_SUGGEST_CARDS) throw validationError(`Send at most ${MAX_SUGGEST_CARDS} cards at a time.`, { field: 'cards' });
  for (const c of cards) {
    if (typeof c !== 'object' || c === null || Array.isArray(c)) throw validationError('Each card must be an object.', { field: 'cards' });
  }
  return cards as SuggestCardInput[];
}

/** An invalid card: the engine answers INVALID_INPUT for an empty finish, so the wording stays in one place. */
function unresolvedCard(): CardInput {
  return {
    cardKey: '',
    game: '',
    rarityClass: 'UNKNOWN',
    finish: '',
    language: 'en',
    conditionCode: null,
    variantTokens: [],
    graded: false,
  };
}

async function loadContext(ctx: ServiceCtx, inputs: SuggestCardInput[]) {
  const itemIds = Array.from(new Set(inputs.map((c) => str(c.itemId)).filter((v): v is string => v !== null)));
  const items = new Map<string, ItemRow>();
  const itemCards = new Map<string, ItemCardRow>();
  if (itemIds.length > 0) {
    for (const it of await ctx.db.item.findMany({ where: { id: { in: itemIds }, organizerId: ctx.organizerId, deletedAt: null } })) items.set(it.id, it);
    for (const id of itemIds) {
      if (!items.has(id)) throw notFoundError('Item not found.');
    }
    const rows = await ctx.db.itemCard.findMany({ where: { itemId: { in: itemIds }, organizerId: ctx.organizerId }, orderBy: { id: 'asc' } });
    for (const r of rows) if (!itemCards.has(r.itemId)) itemCards.set(r.itemId, r);
  }
  const printingIds = new Set<string>();
  for (const c of inputs) {
    const item = str(c.itemId);
    const id = str(c.printingId) ?? (!c.typed && item ? itemCards.get(item)?.catalogPrintingId ?? null : null);
    if (id) printingIds.add(id);
  }
  const printings = new Map<string, CardPrintingRow>();
  if (printingIds.size > 0) {
    for (const p of await ctx.db.cardPrinting.findMany({ where: { id: { in: Array.from(printingIds) } } })) printings.set(p.id, p);
  }
  return { items, itemCards, printings };
}

function resolveCard(input: SuggestCardInput, loaded: Awaited<ReturnType<typeof loadContext>>): Resolved {
  const itemId = str(input.itemId);
  const item = itemId ? loaded.items.get(itemId) ?? null : null;
  const ic = itemId ? loaded.itemCards.get(itemId) ?? null : null;

  let identity: CardIdentity | null = null;
  const explicitPrinting = str(input.printingId);
  if (explicitPrinting) {
    const p = loaded.printings.get(explicitPrinting);
    identity = p ? identityFromPrinting(p) : null;
  } else if (input.typed && typeof input.typed === 'object') {
    const game = str(input.game) ?? ic?.game ?? null;
    if (game) {
      identity = identityFromTyped({
        game,
        setCode: str(input.typed.setCode),
        collectorNumber: str(input.typed.collectorNumber),
        cardName: str(input.typed.cardName),
        setName: str(input.typed.setName),
        rarity: str(input.typed.rarity),
      });
    }
  } else if (ic) {
    const p = ic.catalogPrintingId ? loaded.printings.get(ic.catalogPrintingId) ?? null : null;
    identity = identityFromItemCard(ic, p);
  }

  if (identity === null) {
    return { input, item, identity: null, card: unresolvedCard(), providerCard: null };
  }

  const finish = (str(input.finish) ?? ic?.finish ?? '').trim().toUpperCase();
  const language = ((str(input.language) ?? ic?.language ?? 'en').trim().toLowerCase()) || 'en';
  const graded = typeof input.graded === 'boolean' ? input.graded : Boolean(ic && ic.grader && ic.grader.trim() !== '');
  const conditionRaw = str(input.conditionCode) ?? ic?.conditionCode ?? null;
  const conditionCode = graded ? null : conditionRaw ? conditionRaw.toUpperCase() : null;
  const quantity = typeof input.quantity === 'number' ? input.quantity : 1;

  const currentPriceCents = item ? dollarsToCents(item.price) : centsOrNull(input.currentPriceCents);
  const costCents = item ? dollarsToCents(item.costBasis) : centsOrNull(input.costCents);

  const card: CardInput = {
    cardKey: identity.cardKey,
    game: identity.game,
    setCode: identity.setCode,
    rarityText: identity.rarityText,
    rarityClass: identity.rarityClass,
    finish,
    language,
    conditionCode,
    variantTokens: identity.variantTokens,
    graded,
    productType: ic?.productType ?? 'SINGLE',
    quantity,
    costCents,
    currentPriceCents,
  };
  const providerCard: ProviderCard | null =
    graded || !(FINISHES as readonly string[]).includes(finish)
      ? null
      : {
          cardKey: identity.cardKey,
          finish,
          language,
          catalogPrintingId: identity.catalogPrintingId,
          game: identity.game,
          setCode: identity.setCode,
          collectorNumber: identity.collectorNumber,
          cardName: identity.cardName,
          rarityClass: identity.rarityClass,
          graded: false,
        };
  return { input, item, identity, card, providerCard };
}

/**
 * Prices the cards for one family. Throws a not found error when the organizer has no book, or when an item id is not the
 * organizer's. Does not check the organizer switch (see suggestForRoute for the callers that must).
 */
export async function suggest(ctx: ServiceCtx, cardsRaw: unknown, options: SuggestOptions): Promise<SuggestOutput> {
  if (options.family !== 'RETAIL' && options.family !== 'BUYLIST') throw validationError('family must be RETAIL or BUYLIST.', { field: 'family' });
  const inputs = checkInputs(cardsRaw);
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) throw notFoundError('Your price book is not set up yet.');
  const settings: BookSettings = toBookSettings(book);

  const loaded = await loadContext(ctx, inputs);
  const resolved = inputs.map((c) => resolveCard(c, loaded));

  // Providers, once for all cards.
  const wanted = new Map<string, ProviderCard>();
  for (const r of resolved) {
    if (r.providerCard) wanted.set(lookupKey(r.providerCard.cardKey, r.providerCard.finish, r.providerCard.language), r.providerCard);
  }
  const providers = options.providers ? activeProviders(ctx.env, settings, options.providers) : activeProviders(ctx.env, settings);
  const byKey = new Map<string, ReferenceCandidate[]>();
  const unavailable: ReferenceKind[] = [];
  if (wanted.size > 0) {
    const pctx = { db: ctx.db, organizerId: ctx.organizerId, bookId: book.id, now: ctx.now, env: ctx.env, book: settings };
    for (const provider of providers) {
      try {
        const got = await provider.fetch(pctx, Array.from(wanted.values()));
        for (const [key, list] of got) {
          const into = byKey.get(key) ?? [];
          into.push(...list);
          byKey.set(key, into);
        }
      } catch (e) {
        if (e instanceof PriceBookError) throw e;
        unavailable.push(provider.kind);
      }
    }
  }

  // Locks and the last applied reference, only for cards that name an item.
  const ownedIds = resolved.map((r) => r.item?.id ?? null).filter((v): v is string => v !== null);
  const locks = await resolveLocks(ctx.db, { organizerId: ctx.organizerId, bookId: book.id, manualLockDays: settings.manualLockDays, now: ctx.now }, ownedIds);
  const previous = await lastAppliedReferences(ctx.db, book.id, ownedIds);

  const rules = await loadEngineRules(ctx.db, book.id);
  const rates = (await loadBulkRates(ctx.db, book.id)).map(toBulkRate);
  const config = {
    now: ctx.now,
    minCardSaleCents: options.minCardSaleCents ?? DEFAULT_MIN_CARD_SALE_CENTS,
    ...(options.catalogStaleHours !== undefined ? { catalogStaleHours: options.catalogStaleHours } : {}),
  };

  const results: SuggestRow[] = resolved.map((r) => {
    const itemId = r.item ? r.item.id : null;
    const card: CardInput = {
      ...r.card,
      lock: itemId ? locks.get(itemId) ?? null : null,
      previousReferenceCents: itemId ? previous.get(itemId) ?? null : null,
    };
    const candidates = r.providerCard ? byKey.get(lookupKey(card.cardKey, card.finish, card.language)) ?? [] : [];
    const engineInput = { card, candidates, rules, book: settings, rates, config };
    const suggestion = options.family === 'BUYLIST' ? quoteBuylist(engineInput) : suggestPrice({ ...engineInput, config: { ...config, family: 'RETAIL' } });
    return {
      ref: str(r.input.ref),
      itemId,
      card: {
        cardKey: r.identity ? card.cardKey : null,
        game: r.identity ? card.game : null,
        finish: r.identity ? card.finish : null,
        language: r.identity ? card.language : null,
        conditionCode: r.identity ? card.conditionCode : null,
        rarityClass: r.identity ? card.rarityClass : null,
        graded: card.graded,
      },
      suggestion,
    };
  });
  return { bookVersion: settings.version, results, unavailable };
}

/**
 * For the callers that fall back to their own answer (the legacy suggested price route): null when the organizer has no book
 * or the book is not usable (platform switch or organizer switch off). Otherwise the same as suggest().
 */
export async function suggestForRoute(ctx: ServiceCtx, cards: unknown, options: SuggestOptions): Promise<SuggestOutput | null> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!isBookUsable(ctx.env, book)) return null;
  return suggest(ctx, cards, options);
}

/** One card, for the item editor and the scan queue. */
export async function suggestOne(ctx: ServiceCtx, card: SuggestCardInput, options: SuggestOptions): Promise<SuggestRow> {
  const out = await suggest(ctx, [card], options);
  const row = out.results[0];
  if (!row) throw notFoundError();
  return row;
}
