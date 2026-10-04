/**
 * What each created Item contains (ADR-134 section 4.7). Pure: no database, no I/O.
 *
 * Prices come from the file or stay null; nothing here estimates or suggests a price, and nothing writes
 * aiSuggestedPrice or estimatedValue. A card with no price can be created but cannot be published
 * (the publish guard lives in itemController, decision D3).
 */
import { CARD_FINISH_LABELS, CARD_GAME_LABELS, CARD_CONDITION_LABELS } from '../../constants/cardVocabulary';
import type { CardCreateData } from '../cardRecordService';
import { getPinnedCardCategory } from '../../config/cardEbayCategories';
import { classifyEbayShipping } from '../../utils/ebayShippingClassifier';

export const CARD_ITEM_CATEGORY = 'Trading Cards & Accessories';
export const TITLE_MAX = 80;

/** Same tiers as itemController.assignRarity (not exported there): 500 legendary, 75 rare, 25 uncommon. */
export function rarityForPrice(price: number | null | undefined): 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY' {
  if (!price || price < 25) return 'COMMON';
  if (price >= 500) return 'LEGENDARY';
  if (price >= 75) return 'RARE';
  return 'UNCOMMON';
}

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * `<cardName> - <setName> #<number> <finish if not NONFOIL> <conditionCode or grader grade>`, at most 80
 * characters. When it is too long the set name goes first, then the card name is shortened.
 */
export function buildCardTitle(card: Pick<CardCreateData, 'cardName' | 'setName' | 'setCode' | 'collectorNumber' | 'finish' | 'conditionCode' | 'grader' | 'grade'>): string {
  const name = (card.cardName ?? '').trim() || 'Trading card';
  const number = (card.collectorNumber ?? '').trim();
  const setText = (card.setName ?? card.setCode ?? '').trim();
  const finish = card.finish && card.finish !== 'NONFOIL' ? (CARD_FINISH_LABELS as Record<string, string>)[card.finish] ?? card.finish : '';
  const tail = card.grader ? `${card.grader} ${card.grade ?? ''}`.trim() : card.conditionCode ?? '';
  const suffix = [finish, tail].filter(Boolean).join(' ');
  const join = (parts: string[]) => parts.filter(Boolean).join(' ');

  const full = join([name, setText ? `- ${setText}` : '', number ? `#${number}` : '', suffix]);
  if (full.length <= TITLE_MAX) return full;
  const noSet = join([name, number ? `#${number}` : '', suffix]);
  if (noSet.length <= TITLE_MAX) return noSet;
  const room = TITLE_MAX - join(['', number ? `#${number}` : '', suffix]).length - 1;
  return join([trimTo(name, Math.max(room, 10)), number ? `#${number}` : '', suffix]).slice(0, TITLE_MAX).trim();
}

/** Plain template text from the card fields. No generated prose. */
export function buildCardDescription(card: CardCreateData): string {
  const lines: string[] = [];
  const game = (CARD_GAME_LABELS as Record<string, string>)[card.game] ?? card.game;
  lines.push(`${game} card.`);
  if (card.cardName) lines.push(`Name: ${card.cardName}.`);
  const set = card.setName ?? card.setCode;
  if (set) lines.push(`Set: ${set}${card.setName && card.setCode ? ` (${card.setCode})` : ''}.`);
  if (card.collectorNumber) lines.push(`Card number: ${card.collectorNumber}.`);
  if (card.rarity) lines.push(`Rarity: ${card.rarity}.`);
  if (card.language) lines.push(`Language: ${card.language}.`);
  if (card.finish) lines.push(`Finish: ${(CARD_FINISH_LABELS as Record<string, string>)[card.finish] ?? card.finish}.`);
  if (card.grader) {
    lines.push(`Graded: ${card.grader} ${card.grade ?? ''}`.trim() + '.');
    if (card.certNumber) lines.push(`Certification number: ${card.certNumber}.`);
  } else if (card.conditionCode) {
    lines.push(`Condition: ${(CARD_CONDITION_LABELS as Record<string, string>)[card.conditionCode] ?? card.conditionCode}.`);
  }
  return lines.join(' ').slice(0, 2000);
}

export interface NewItemInput {
  saleId: string;
  /** The sale's organizer id (never a client value). */
  organizerId: string;
  card: CardCreateData;
  quantity: number;
  price: number | null;
  costBasis: number | null;
  sku: string | null;
}

/** The data object for prisma.item.create, with the card row nested (one write per row). */
export function buildNewItemData(input: NewItemInput): Record<string, unknown> {
  const { card } = input;
  const pinned = getPinnedCardCategory(card);
  const data: Record<string, unknown> = {
    saleId: input.saleId,
    organizerId: input.organizerId,
    title: buildCardTitle(card),
    description: buildCardDescription(card),
    price: input.price,
    originalPrice: input.price,
    category: CARD_ITEM_CATEGORY,
    condition: 'USED',
    status: 'AVAILABLE',
    draftStatus: 'DRAFT',
    embedding: [],
    photoUrls: [],
    listingType: 'FIXED',
    rarity: rarityForPrice(input.price),
    ebayShippingClassification: classifyEbayShipping(CARD_ITEM_CATEGORY, []),
    stockTotal: input.quantity,
    costBasis: input.costBasis,
    sku: input.sku,
    card: { create: { ...card, organizerId: input.organizerId } },
  };
  if (pinned) {
    data.ebayCategoryId = pinned.id;
    if (pinned.name) data.ebayCategoryName = pinned.name;
  }
  return data;
}
