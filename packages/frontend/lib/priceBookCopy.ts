/**
 * priceBookCopy (ADR-140 batch B6): every string a person can read in the Price Book screens and in the price book
 * lines of the item editor and scan queue. Section 11.7 of the ADR holds the starting wording.
 *
 * No React, no axios, no env reads, no network: plain data and functions, covered by
 * lib/__tests__/priceBookCopy.test.ts (copy lint: banned words, dashes, placeholder text).
 * Run: npm test   (node:test through tsx)
 *
 * Copy rules (ADR-140 section 11.7): plain short words, no vendor names in defaults or templates, the shop is always in
 * charge of the final price, and nothing here says where a number came from except the label the server sent.
 */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Look a key up in a plain record without ever reaching the prototype ("constructor", "__proto__"). */
export function lookupWord(table: Record<string, string>, key: string | null | undefined, fallback = ''): string {
  return typeof key === 'string' && hasOwn(table, key) ? table[key] : fallback;
}

// ---------------------------------------------------------------------------
// Label tables
// ---------------------------------------------------------------------------

/** ADR-140 section 5.6: what the screen says about where a number came from. */
export const PRICE_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Your typed price',
  SHOP_SOLD_HISTORY: 'Your recent sales',
  SHOP_BENCHMARK: 'Your benchmark for this kind of card',
  CATALOG_REFERENCE: 'Catalog estimate (marketplace data carried by Scryfall)',
  LICENSED_FEED: 'Licensed price feed',
  RATE_CARD: 'Your bulk rate card',
  FIXED_RULE: 'Fixed price in your rule',
  COST: 'Your cost plus your margin',
};

/** The same sources as they read inside a rule sentence ("start from your typed price or your recent sales"). */
export const SOURCE_PHRASES: Record<string, string> = {
  MANUAL: 'your typed price',
  SHOP_SOLD_HISTORY: 'your recent sales',
  SHOP_BENCHMARK: 'your benchmark for this kind of card',
  CATALOG_REFERENCE: 'the catalog estimate',
  LICENSED_FEED: 'your licensed price feed',
};

export const TAB_LABELS: Record<string, string> = {
  prices: 'Prices',
  bulk: 'Bulk rates',
  cards: 'Card prices',
  changes: 'Changes',
};

export const FAMILY_LABELS: Record<string, string> = {
  RETAIL: 'Selling',
  BUYLIST: 'Buying',
};

export const TIER_LABELS: Record<string, string> = {
  COMMON: 'Commons',
  UNCOMMON: 'Uncommons',
  COMMON_UNCOMMON: 'Commons and uncommons',
  RARE: 'Rares',
  MYTHIC: 'Mythics',
  SPECIAL: 'Special',
  LAND: 'Basic lands',
  MIXED: 'Mixed bulk',
};

export const UNIT_LABELS: Record<string, string> = {
  PER_1000: 'Per 1,000',
  PER_CARD: 'Per card',
};

export const DIRECTION_LABELS: Record<string, string> = {
  SELL: 'We sell',
  BUY: 'We pay (cash)',
};

export const RARITY_CLASS_LABELS: Record<string, string> = {
  COMMON: 'Common',
  UNCOMMON: 'Uncommon',
  RARE: 'Rare',
  MYTHIC: 'Mythic',
  SPECIAL: 'Special',
  UNKNOWN: 'Not rated',
};

export const FINISH_LABELS: Record<string, string> = {
  ANY: 'Any finish',
  NONFOIL: 'Non-foil',
  FOIL: 'Foil',
  ETCHED: 'Etched',
  HOLO: 'Holo',
  REVERSE_HOLO: 'Reverse holo',
};

/** The five condition codes the book prices (Settings, Try it). A server label never replaces these. */
export const CONDITION_LABELS: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

export const VARIANT_LABELS: Record<string, string> = {
  NONE: 'No edition mark',
  FIRST_EDITION: '1st Edition',
  SHADOWLESS: 'Shadowless',
  UNLIMITED: 'Unlimited',
  STAMPED: 'Stamped',
};

export const BASIS_LABELS: Record<string, string> = {
  REFERENCE: 'A price from your book',
  COST_PLUS: 'Your cost plus a margin',
  BULK_RATE: 'Your bulk rate card',
  FIXED_CENTS: 'A fixed price',
  RETAIL_PRICE: 'Your shelf price',
};

export const ROUNDING_MODE_LABELS: Record<string, string> = {
  NONE: 'Do not round',
  TIERED: 'By price range',
  NEAREST_5C: 'Nearest 5 cents',
  NEAREST_25C: 'Nearest 25 cents',
  NEAREST_DOLLAR: 'Nearest dollar',
  ENDING_99: 'Ending in 99 cents',
  KEYSTONE_49_99: 'Ending in 49 or 99 cents',
};

export const ROUNDING_DIRECTION_LABELS: Record<string, string> = {
  NEAREST: 'Nearest',
  UP: 'Up',
  DOWN: 'Down',
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  PREVIEW: 'Preview',
  APPLYING: 'Applying',
  APPLIED: 'Applied',
  PARTIAL: 'Partly applied',
  UNDONE: 'Undone',
  EXPIRED: 'Expired',
  CANCELLED: 'Discarded',
};

export const RUN_KIND_LABELS: Record<string, string> = {
  SINGLE: 'One card',
  BULK: 'Cards',
  LOT: 'Bulk lots',
};

/** Why a card was left out of a run (ADR-140 sections 2.2, 10.2 and 12.4). */
export const SKIP_REASON_LABELS: Record<string, string> = {
  LOCKED: 'Locked by you',
  RECENT_EDIT: 'You changed this recently',
  MARKED_DOWN: 'Marked down',
  EBAY_LIVE: 'Listed on eBay',
  NO_REFERENCE: 'No price to base on',
  NO_RULE: 'No rule matches',
  NO_RATE: 'No rate set',
  GRADED: 'Graded card, price it by hand',
  NOT_AVAILABLE: 'Not available to sell',
  UNCHANGED: 'Price stays the same',
};

/** Row states in a run table. */
export const RUN_ITEM_STATE_LABELS: Record<string, string> = {
  PENDING: 'Ready to apply',
  APPLIED: 'Applied',
  SKIPPED: 'Skipped',
  CHANGED_SINCE_PREVIEW: 'Changed after the preview',
  UNDONE: 'Undone',
  UNDO_SKIPPED: 'Left alone on undo',
  FAILED: 'Could not apply',
};

/** Reasons a changed price needs a look (ADR-140 section 6.7). LARGE_MOVE is built by reviewReasonText. */
export const REVIEW_REASON_WORDING: Record<string, string> = {
  HIT_FLOOR: 'The price hit your lowest allowed price. Take a look before you apply it.',
  HIT_CEILING: 'The price hit your highest allowed price. Take a look before you apply it.',
  BELOW_COST: 'This price is below your cost. Take a look before you apply it.',
  REFERENCE_MOVED: 'The price this is based on moved a lot since the last run. Take a look before you apply it.',
  LOW_SAMPLE: 'Based on only a few sales. Take a look before you apply it.',
  REFERENCE_OLD: 'The price this is based on is old. Check it still looks right.',
};

/** Wording for warning codes, used only when the server sent no message for the code. */
export const WARNING_WORDING: Record<string, string> = {
  BELOW_CARD_MINIMUM: 'Card payments need at least $0.99. Cash sales have no minimum.',
  REFERENCE_OLD: 'The price this is based on is old. Check it still looks right.',
  CATALOG_ESTIMATE: 'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.',
  FLOOR_APPLIED: 'Your lowest allowed price was used.',
  CEILING_APPLIED: 'Your highest allowed price was used.',
  RANGE_CONFLICT: 'The lowest and highest prices in this rule do not fit together, so the lowest price was used.',
  PACK_BELOW_CARD_MINIMUM: 'This pack would be under $0.99, so it cannot be sold online by card.',
  EBAY_BUNDLES_FOLLOW: 'The eBay bundle price will follow this change.',
};

/** Why there is no number (the engine codes of ADR-140 section 6.1). */
export const SUGGESTION_FAILURE_WORDING: Record<string, string> = {
  NO_REFERENCE: 'No suggestion yet. Add a price for this card in your price book.',
  NO_RULE: 'No suggestion yet. None of your rules fit this card.',
  NO_COST: 'No suggestion yet. This rule needs the cost of the card.',
  NO_RATE: 'No suggestion yet. Set a rate for this kind of bulk in your rate card.',
  GRADED_NOT_SUPPORTED: 'There is no price book support for graded cards yet. Enter your own price.',
  UNSUPPORTED_PRODUCT: 'The price book only prices single cards for now. Enter your own price.',
  INVALID_INPUT: 'We could not read the details of this card. Check the finish, condition and language.',
  BELOW_MIN_OFFER: 'Below your minimum buy price. No offer.',
};

/** Plain wording for every code the /api/price-book routes can send (ADR-140 section 10.3) plus failures that never reach it. */
export const PRICE_BOOK_ERROR_WORDING: Record<string, string> = {
  PRICE_BOOK_DISABLED: 'The price book is not turned on yet. You can still set every price by hand.',
  VALIDATION: 'Some of what you entered does not fit. Check the marked fields and try again.',
  FOREIGN_PRICE_COLUMN: 'This file has price columns from another site. Use your own prices only.',
  SCOPE_TOO_LARGE: 'That is too many cards for one run. Narrow it down by sale, game or set and try again.',
  VERSION_CONFLICT: 'Your price book changed somewhere else. Reload the page and try again.',
  BOOK_CHANGED: 'Your rules changed after this preview. Preview again.',
  PREVIEW_EXPIRED: 'This preview is out of date. Preview again.',
  COUNT_MISMATCH: 'The number of selected prices changed. Preview again.',
  NOTHING_SELECTED: 'Tick at least one price to apply.',
  ALREADY_APPLIED: 'These prices were already applied.',
  TEMPLATE_NEEDS_EMPTY: 'A starting point can only be added when there are no rules yet.',
  RUN_NOT_PREVIEW: 'This run is not a preview any more.',
  LIMIT_REACHED: 'You have reached the limit for this. Remove one first.',
  NOT_FOUND: 'We could not find that. Reload the page and try again.',
  RATE_LIMITED: 'Too many requests in a short time. Wait a moment and try again.',
  SERVER_ERROR: 'Something went wrong on our side. Try again in a moment.',
  UNAUTHORIZED: 'Please sign in again.',
  FORBIDDEN: 'Only the shop owner can change the price book.',
  NETWORK_ERROR: 'We could not reach the server. Check your connection and try again.',
  BAD_RESPONSE: 'The server sent something we could not read. Try again.',
  UNKNOWN: 'Something went wrong. Try again.',
};

/** Words that build a rule sentence (describeRule in priceBookRules.ts). */
export const RULE_RARITY_WORDS: Record<string, string> = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  MYTHIC: 'mythic',
  SPECIAL: 'special',
};

export const RULE_FINISH_WORDS: Record<string, string> = {
  NONFOIL: 'non-foil',
  FOIL: 'foil',
  ETCHED: 'etched',
  HOLO: 'holo',
  REVERSE_HOLO: 'reverse holo',
};

export const RULE_VARIANT_WORDS: Record<string, string> = {
  FIRST_EDITION: '1st Edition',
  SHADOWLESS: 'Shadowless',
  UNLIMITED: 'Unlimited',
  STAMPED: 'stamped',
};

export const RULE_GAME_WORDS: Record<string, string> = {
  MTG: 'Magic',
  POKEMON: 'Pokemon',
  LORCANA: 'Lorcana',
  YUGIOH: 'Yu-Gi-Oh',
};

export const RULE_LANGUAGE_WORDS: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ko: 'Korean',
  ru: 'Russian',
  zh: 'Chinese',
};

const ROUND_STEP_WORDS: Record<string, { near: string; up: string; down: string }> = {
  NEAREST_5C: { near: 'round to the nearest 5 cents', up: 'round up to the next 5 cents', down: 'round down to a 5 cent step' },
  NEAREST_25C: { near: 'round to the nearest 25 cents', up: 'round up to the next 25 cents', down: 'round down to a 25 cent step' },
  NEAREST_DOLLAR: { near: 'round to the nearest dollar', up: 'round up to a whole dollar', down: 'round down to a whole dollar' },
  TIERED: {
    near: 'round in steps that grow with the price',
    up: 'round up in steps that grow with the price',
    down: 'round down in steps that grow with the price',
  },
  ENDING_99: { near: 'end prices in 99 cents', up: 'round up to a price ending in 99 cents', down: 'round down to a price ending in 99 cents' },
  KEYSTONE_49_99: {
    near: 'end prices in 49 or 99 cents',
    up: 'round up to a price ending in 49 or 99 cents',
    down: 'round down to a price ending in 49 or 99 cents',
  },
};

/** The rounding clause of a rule sentence. A rule with no mode uses the book default. */
export function roundPhrase(mode: string | null | undefined, direction: string | null | undefined): string {
  if (!mode) return 'use your usual rounding';
  if (mode === 'NONE') return 'do not round';
  if (!hasOwn(ROUND_STEP_WORDS, mode)) return 'use your usual rounding';
  const words = ROUND_STEP_WORDS[mode];
  if (direction === 'UP') return words.up;
  if (direction === 'DOWN') return words.down;
  return words.near;
}

// ---------------------------------------------------------------------------
// Screen copy
// ---------------------------------------------------------------------------

export const PRICE_BOOK_COPY = {
  // Page and header (ADR-140 sections 11.1 and 11.7)
  title: 'Price book',
  headerIntro: 'Set your own pricing rules. Prices are suggestions until you apply them.',
  pageIntro: 'Set your own pricing rules. Prices are suggestions until you apply them. You are always in charge of the final price.',
  disabled: 'The price book is not turned on yet. You can still set every price by hand.',
  bookSwitchLabel: 'Price book',
  bookOn: 'On',
  bookOff: 'Off',
  settings: 'Settings',
  linkLabel: 'Price book',
  loading: 'Loading your price book',
  loadError: 'We could not load your price book right now.',
  retry: 'Try again',

  // Start card
  startHeading: 'Get started',
  startStepCurrent: 'Use my current prices as my starting point',
  startStepRule: 'Add a starting rule',
  startStepOn: 'Turn on',
  startOptional: 'Each step is optional. Nothing is turned on until the last step.',
  starterLabel: 'Starting point, set your own.',
  addStarter: 'Add a starting point',

  // Prices tab
  sellingHeading: 'Selling',
  buyingHeading: 'Buying',
  noRules: 'No rules yet. Until you add one, the price book uses your default percent on the price it finds.',
  ruleEdit: 'Edit',
  ruleUp: 'Move up',
  ruleDown: 'Move down',
  ruleTurnOff: 'Turn off',
  ruleTurnOn: 'Turn on',
  ruleOffBadge: 'Turned off',
  ruleDelete: 'Delete',
  ruleAdd: 'Add a rule',
  ruleDefault: 'Your default rule',
  tryItHeading: 'Try it',
  tryIt: 'Try it',
  tryItHelp: 'Pick a card, choose finish, condition and language, and see the price your rules give. Nothing is changed.',
  groupWhichCards: 'Which cards',
  groupStartFrom: 'Start from',
  groupThen: 'Then',
  groupRound: 'Round',
  groupPay: 'Pay',

  // Sources and notes
  sourceCatalogLong: 'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.',
  cardMinimum: 'Card payments need at least $0.99. Cash sales have no minimum.',
  locked: 'Locked by you, so the price book will not change it.',
  lockedNotApplied: 'Locked, so the price book will not change it.',
  recentEditNoDate: 'You changed this price recently, so the price book will not change it.',
  markedDown: 'This card is marked down, so it was left alone.',
  ebayLive: 'This card is listed on eBay, so it was left alone.',
  rateNoteHelp: "Type what you see if you want to compare. We do not look up other shops' rates.",
  foreignFile: 'This file has price columns from another site. Use your own prices only.',
  catalogSettingHelp:
    'Magic only. These numbers come from marketplace data carried by Scryfall. They can be a day old and are a guide, not a quote. Off by default.',
  catalogSettingLabel: 'Use catalog estimates for Magic when I have no price of my own',
  noReferenceRow: 'No price to base on',
  noSuggestion: 'No suggestion yet. Add a price for this card in your price book.',

  // Why this price (ADR-140 section 11.6)
  whyButton: 'Why this price',
  whyBasedOn: 'Based on',
  whyRule: 'Rule',
  whySteps: 'Steps',
  whyWarnings: 'Things to know',
  pinLock: 'Keep my price',
  pinUnlock: 'Let the price book suggest again',

  // Bulk rates tab (ADR-140 section 11.3)
  bulkHeading: 'Bulk rates',
  weSellHeading: 'We sell',
  weBuyHeading: 'We pay (cash)',
  noteColumn: 'Note',
  saveRates: 'Save rates',
  moveAllRates: 'Move all sell rates',
  applyToLots: 'Apply to my bulk lots',
  buyCalcHeading: 'Buy calculator',
  buyCalcCash: 'Cash',
  buyCalcCredit: 'Store credit',

  // Card prices tab
  cardPricesHeading: 'Card prices',
  useCurrentPrices: 'Use my current prices',
  importList: 'Import a price list',
  addPrice: 'Add a price',
  benchmarksHeading: 'Typical value for this kind of card',

  // Changes tab (ADR-140 section 11.5)
  changesHeading: 'Reprice my cards',
  includeMarkedDown: 'Include marked down cards',
  includeEbayLive: 'Include cards listed on eBay',
  needsALook: 'Needs a look',
  tabChanges: 'Changes',
  tabSkipped: 'Skipped',
  tabUnchanged: 'Unchanged',
  undo: 'Undo these changes',
  previewStale: 'This preview is out of date. Preview again.',
  previewButton: 'Preview',
  historyHeading: 'Recent runs',

  // Functions that take values
  oldReference: (date: string): string => `This price was set on ${date}. Check it still looks right.`,
  largeMove: (percent: number | string): string =>
    `This is ${percent} percent away from the current price. Take a look before you apply it.`,
  lowSample: (n: number): string => `Based on only ${n} ${plural(n, 'sale', 'sales')}.`,
  recentEdit: (date: string): string => `You changed this price on ${date}, so it was left alone.`,
  previewSummary: (changes: number, unchanged: number, skipped: number, review: number): string =>
    `${changes} ${plural(changes, 'price will', 'prices will')} change, ` +
    `${unchanged} ${plural(unchanged, 'stays', 'stay')} the same, ` +
    `${skipped} ${plural(skipped, 'is', 'are')} skipped, ` +
    `${review} ${plural(review, 'needs', 'need')} a look.`,
  apply: (n: number): string => `Apply ${n} ${plural(n, 'price', 'prices')}`,
  applyConfirm: (n: number): string => `This changes the price on ${n} ${plural(n, 'card', 'cards')}. You can undo for 7 days.`,
  applied: (n: number): string => `Applied ${n} ${plural(n, 'price', 'prices')}.`,
  changedSince: (n: number): string =>
    n === 1
      ? '1 card changed after the preview, so we left it alone.'
      : `${n} cards changed after the preview, so we left them alone.`,
  undoSkipped: (n: number): string =>
    n === 1
      ? '1 card was changed by hand since, so we left it alone.'
      : `${n} cards were changed by hand since, so we left them alone.`,
  undone: (n: number): string => `Undid ${n} ${plural(n, 'price', 'prices')}.`,
  failedRows: (n: number): string => `${n} ${plural(n, 'card', 'cards')} could not be changed.`,
  rateGap: (you: string, them: string, unitWords: string, date: string, percent: string, direction: string): string =>
    `You: ${you} ${unitWords}. Noted: ${them} ${unitWords}${date ? ` (${date})` : ''}. You are ${percent} percent ${direction}.`,
  rateGapSame: (you: string, them: string, unitWords: string, date: string): string =>
    `You: ${you} ${unitWords}. Noted: ${them} ${unitWords}${date ? ` (${date})` : ''}. You match the rate you noted.`,
  ratesSaved: (n: number): string => `Saved. ${n} ${plural(n, 'rate', 'rates')} changed.`,
  rateJump: (label: string, from: string, to: string): string =>
    `${label} goes from ${from} to ${to}. Check that is what you meant.`,
  headline: (priceText: string): string => `Suggested price: ${priceText}`,
  basedOnLine: (label: string, date: string): string => (date ? `${label} (${date})` : label),
  referenceWorth: (priceText: string): string => `Worth ${priceText} at Near Mint`,
  provenanceSet: (label: string, date: string): string => (date ? `${label}, ${date}.` : `${label}.`),
  startsFromLabel: (n: number): string => `${n} ${plural(n, 'card', 'cards')}`,
  lotRowChange: (title: string, from: string, to: string): string => `${title}: ${from} per 1,000 to ${to} per 1,000`,
  // After a card import or scan save (ADR-140 section 12.4, batch B8)
  repriceUnpricedLine: (n: number): string =>
    n === 1 ? 'Price the card without a price from my price book' : `Price the ${n} cards without a price from my price book`,
};

// ---------------------------------------------------------------------------
// Rule sentence atoms
// ---------------------------------------------------------------------------

export const RULE_COPY = {
  allCards: 'all cards',
  cardsNoun: 'cards',
  noVariant: 'with no edition mark',
  fromSet: (setCode: string): string => `from set ${setCode}`,
  inLanguage: (languageName: string): string => `in ${languageName}`,
  worthBetween: (min: string, max: string): string => `worth ${min} to ${max}`,
  worthAtLeast: (min: string): string => `worth ${min} or more`,
  worthUpTo: (max: string): string => `worth up to ${max}`,
  startFromList: (list: string): string => `start from ${list}`,
  startFromFirst: 'start from the first price your book finds',
  startFromShelf: 'start from your shelf price',
  startFromCost: 'start from your cost',
  startFromRateCard: 'start from your bulk rate card',
  fixedPrice: (price: string): string => `use a fixed price of ${price}`,
  payFixed: (price: string): string => `pay a fixed ${price} per card`,
  priceAt: (percent: string): string => `price at ${percent} percent`,
  payAt: (percent: string): string => `pay ${percent} percent`,
  addAmount: (money: string): string => `add ${money}`,
  takeOffAmount: (money: string): string => `take off ${money}`,
  marginAtLeast: (percent: string): string => `keep at least ${percent} percent over your cost`,
  neverBelow: (money: string): string => `never go below ${money}`,
  neverAbove: (money: string): string => `never go above ${money}`,
  creditAt: (percent: string): string => `pay store credit at ${percent} percent of cash`,
  minOffer: (money: string): string => `make no offer below ${money}`,
  listJoin: (items: string[]): string => {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, items.length - 1).join(', ')} or ${items[items.length - 1]}`;
  },
};

// ---------------------------------------------------------------------------
// Screen words (ADR-140 batch B7): labels, help lines and messages of the Price Book components
// ---------------------------------------------------------------------------

export const PRICE_BOOK_UI = {
  // Shared
  backToDashboard: 'Back to your dashboard',
  tabsLabel: 'Price book sections',
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  saving: 'Saving',
  working: 'Working',
  done: 'Done',
  goBack: 'Back',
  loadMore: 'Show more',
  anyOption: 'Any',
  anyGame: 'Any game',
  allFinishes: 'All finishes',
  allSales: 'All my sales',
  addOption: 'Add',
  takeOffOption: 'Take off',
  usualRounding: 'Use my usual rounding',

  // Field labels
  fieldGame: 'Game',
  fieldFinish: 'Finish',
  fieldLanguage: 'Language',
  fieldCondition: 'Condition',
  fieldRarity: 'Rarity',
  fieldRarityText: 'Rarity as printed (optional)',
  fieldVariant: 'Edition mark',
  fieldSetCode: 'Set code',
  fieldSetName: 'Set name (optional)',
  fieldCardName: 'Card name',
  fieldCollectorNumber: 'Card number',
  fieldNearMintPrice: 'Near Mint price',
  fieldAsOf: 'Price as of (optional)',
  fieldNote: 'Note (optional)',
  fieldNotedOn: 'Noted on (optional)',
  fieldTheirRate: 'A rate you noted (optional)',
  fieldTier: 'Kind of bulk',
  fieldCards: 'Cards',
  fieldWhichRates: 'Which rates',
  fieldChangePercent: 'Change by percent',
  fieldRuleName: 'Rule name',
  fieldWorthFrom: 'Worth from',
  fieldWorthTo: 'Worth up to',
  fieldBasis: 'Where the number starts',
  fieldSources: 'Prices this rule may use',
  fieldPercent: 'Percent',
  fieldAddOrTakeOff: 'Add or take off',
  fieldAddAmount: 'Amount',
  fieldFixedPrice: 'Fixed price',
  fieldMargin: 'Keep at least this percent over my cost (optional)',
  fieldNeverBelow: 'Never go below',
  fieldNeverAbove: 'Never go above',
  fieldRoundingMode: 'Round to',
  fieldRoundingDirection: 'Round',
  fieldCredit: 'Store credit percent (optional)',
  fieldMinOffer: 'Smallest offer I will make',
  tryFamily: 'Prices for',
  scopeSale: 'Which sale',

  // Rules
  sellingIntro: 'Rules for the prices you charge. The first rule that fits a card is used.',
  buyingIntro: 'Rules for what you pay when you buy cards. The first rule that fits a card is used.',
  defaultRuleCaption: 'Used when none of your rules fits a card. Change it in Settings.',
  deleteRuleTitle: 'Delete this rule?',
  newRuleHeading: (family: string): string => `Add a rule: ${family}`,
  editRuleHeading: 'Change this rule',
  saveRule: 'Save rule',
  ruleSays: 'This rule says',
  sourcesHelp: 'Tick the kinds of price this rule may start from. Leave them all empty to use your usual order.',
  marginHelp: 'The price never goes below your cost plus this percent.',
  creditHelp: 'Store credit is paid as a percent of the cash offer. 120 means $12.00 of credit for $10.00 of cash. Allowed: 100 to 300.',
  fixMarked: 'Fix the marked fields and try again.',
  ruleLimit: (n: number): string => `You have reached the limit of ${n} rules here.`,
  deleteRuleMessage: (name: string): string =>
    `Delete "${name}"? Your item prices do not change. The price book will use the next rule that fits.`,
  ruleAction: (action: string, name: string): string => `${action}: ${name}`,

  // Try it
  tryFailed: 'We could not work out a price. Try again.',
  tryNothingChanged: 'Nothing was changed.',
  pickHow: 'How do you want to pick the card?',
  modeCatalog: 'Find it in the card catalog',
  modeTyped: 'Type it myself',
  changeCard: 'Change card',
  errorPickCard: 'Find your card first, or choose to type it yourself.',
  errorTypedCard: 'Type the card name, or the set code and card number.',
  errorFinish: 'Choose a finish.',

  // Settings
  groupConditions: 'Condition percents',
  conditionsHelp: 'Each number is a percent of the Near Mint price.',
  groupReview: 'When to take a look',
  groupBuying: 'Buying',
  groupSources: 'Which price to use',
  groupSold: 'Your recent sales',
  settingCondNm: 'Near Mint, percent of Near Mint',
  settingCondLp: 'Lightly Played, percent of Near Mint',
  settingCondMp: 'Moderately Played, percent of Near Mint',
  settingCondHp: 'Heavily Played, percent of Near Mint',
  settingCondDmg: 'Damaged, percent of Near Mint',
  settingNonEnglish: 'Cards not in English, percent of the English price',
  settingMovement: 'Ask me to look when a price moves more than (percent)',
  settingLockDays: 'Do not change prices I changed in the last (days)',
  settingCredit: 'Store credit, percent of cash',
  settingRetailPercent: 'Default percent of the price found',
  settingFloor: 'Never go below (default)',
  settingCeiling: 'Never go above (default, leave empty for no limit)',
  settingWarnDays: 'Warn me when a typed price is older than (days)',
  settingMaxDays: 'Stop using a typed price older than (days)',
  settingSoldMin: 'Fewest recent sales to use',
  settingSoldMax: 'Most recent sales to use',
  settingSoldWindow: 'Look back this far for sales (days)',
  settingOrderHelp: 'The price book looks for a price in this order and uses the first one it finds.',
  catalogPlatformOff: 'Catalog estimates are not available right now.',
  settingsSaved: 'Settings saved.',
  settingsFixMarked: 'Fix the marked fields and try again.',
  discardQuestion: 'Close without saving your changes?',
  discardYes: 'Close without saving',
  discardNo: 'Keep editing',
  rangePercent: (min: number, max: number): string => `From ${min} to ${max} percent.`,
  rangeDays: (min: number, max: number): string => `From ${min} to ${max} days.`,
  rangeCount: (min: number, max: number): string => `From ${min} to ${max}.`,
  orderItem: (n: number, word: string): string => `${n}. ${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  errorField: (label: string): string => `Check the number in "${label}".`,
  errorRange: (low: string, high: string): string => `"${high}" cannot be lower than "${low}".`,
  errorRuleName: 'Give the rule a name.',
  errorRuleNameLong: (max: number): string => `Keep the name to ${max} characters.`,
  errorCreditRange: 'Store credit must be from 100 to 300 percent.',
  errorPercentRange: (min: number, max: number): string => `Use a percent from ${min} to ${max}.`,
  errorPrice: 'Type a price of at least $0.01, for example 12.50.',
  errorDate: 'Use a real date, for example 2026-10-12.',
  errorRate: (label: string): string => `Type a rate for ${label}, for example 8.00.`,
  errorTheirRate: (label: string): string => `Type the rate you noted for ${label} as a number, for example 10.00.`,

  // Start card
  startStepNumber: (n: number, label: string): string => `${n}. ${label}`,
  startStarterDone: 'Added a starting rule. You can change it in the Prices tab.',

  // Bulk rates
  gameTab: (game: string): string => lookupWord(RULE_GAME_WORDS, game, game),
  tooManyRates: 'That is too many rates to save at once.',
  saveBeforeMove: 'Save your rates before you move them all.',
  switchGameTitle: 'Switch game?',
  switchGameMessage: 'You have rates that are not saved. If you switch games they are left out.',
  switchGameYes: 'Switch anyway',
  checkRatesTitle: 'Check these rates',
  saveAnyway: 'Save anyway',
  moveAllHelp: 'Move your rates up or down by a percent. You see the new rates before anything is saved.',
  moveAllNothing: 'No rates would change.',
  moveAllPreviewCaption: 'New rates after the change',
  previewChanges: 'Preview',
  applyChanges: 'Apply these changes',
  creditShownAt: (percent: string): string => `Store credit is shown at ${percent} percent of cash.`,
  creditRateSet: (money: string): string => `Store credit rate is set to ${money}.`,
  usesAnyRate: 'Using your rate for any finish.',
  buyCalcHelp:
    'Type how many cards of each kind a customer brings. You see what you would pay in cash and in store credit. Nothing is saved.',
  cardsHint: 'Type a whole number of cards on every line.',
  addLine: 'Add another line',
  removeLine: 'Remove',
  quoteFailed: 'We could not work out that quote. Try again.',

  // Card prices
  nearMintHelp: 'The price for a Near Mint copy. Other conditions follow your condition percents.',
  searchPrices: 'Search your prices',
  onlyOlder: (days: number): string => `Only prices older than ${days} days`,
  olderBadge: (days: number): string => `Older than ${days} days`,
  noOldPrices: 'No old prices. Everything was set recently.',
  noPricesYet: 'No prices yet. Add one, or use your current prices as a starting point.',
  referenceOrderLine: (words: string): string => `The price book looks for a price in this order: ${words}.`,
  colCard: 'Card',
  colFinish: 'Finish',
  colLanguage: 'Language',
  colPrice: 'Near Mint price',
  colAsOf: 'As of',
  colNote: 'Note',
  colActions: 'Actions',
  editPriceHeading: 'Change a price',
  deletePriceTitle: 'Delete this price?',
  deletePriceMessage: 'Delete this price? Prices on your items do not change.',
  stockHelp: 'Reads the prices on your items and saves them as your own Near Mint prices. Your items do not change.',
  stockOverwrite: 'Replace prices I already typed',
  stockConfirmTitle: 'Replace typed prices?',
  stockConfirmMessage: 'This replaces prices you typed before with your current item prices. Continue?',
  stockConfirmYes: 'Replace',
  stockDoneGeneric: 'Your current prices were added to your price book.',
  stockDone: (n: number): string => `Added ${n} ${plural(n, 'price', 'prices')} from your items.`,
  stockSkipped: (n: number): string => `${n} ${plural(n, 'item was', 'items were')} left out because ${plural(n, 'it has', 'they have')} no price.`,
  benchmarkHelp:
    'A benchmark is the Near Mint value you usually see for one kind of card, such as a rare foil. The price book uses it when you have no price for the exact card.',
  benchmarkEmpty: 'No benchmarks yet.',
  benchmarkFormLabel: 'Add or change a benchmark',
  benchmarkSave: 'Save benchmark',
  clearForm: 'Clear',
  deleteBenchmarkTitle: 'Delete this benchmark?',
  deleteBenchmarkMessage: 'Delete this benchmark? Prices on your items do not change.',
  benchmarkRowTitle: (game: string, rarity: string, finish: string): string => `${game}, ${rarity}, ${finish}`,

  // Import
  importHelp:
    'Import your own price list. Use columns for the card, finish, language and your Near Mint price. Check it first: nothing is saved until you press Import.',
  importChoose: 'Choose a file (CSV)',
  importPaste: 'Or paste the list here',
  importCheck: 'Check the file',
  importRun: 'Import',
  importTooBig: 'That file is too big. Keep it under 2 MB.',
  importReadFailed: 'We could not read that file. Try a CSV file.',
  importWillCreate: (n: number): string => `${n} new ${plural(n, 'price', 'prices')} will be added.`,
  importWillUpdate: (n: number): string => `${n} ${plural(n, 'price', 'prices')} will be updated.`,
  importUnresolved: (n: number): string => `${n} ${plural(n, 'row', 'rows')} could not be matched to a card.`,
  importRejected: (n: number): string => `${n} ${plural(n, 'row was', 'rows were')} left out because of a problem.`,
  importRow: (row: number, reason: string): string => `Row ${row}: ${reason}`,
  importDone: (created: number, updated: number): string => `Imported. ${created} new, ${updated} updated.`,

  // Locks
  pinnedToast: 'Your price is kept.',
  unpinnedToast: 'The price book can suggest again.',

  // Changes tab
  changesIntro:
    'Look at new prices for your cards before anything changes. You pick which ones to apply, and you can undo for 7 days.',
  repriceLots: 'Reprice my bulk lots',
  repriceLotsHeading: 'Reprice my bulk lots',
  lotScopeHelp: 'Lots are priced per 1,000 cards from your bulk rates. Pick one sale, or leave it on all sales.',
  onlyUnpriced: 'Only cards without a price',
  stepsLabel: 'Steps',
  stepScope: 'Scope',
  stepPreview: 'Preview',
  stepApply: 'Apply',
  stepDone: 'Done',
  stepNumber: (n: number, label: string): string => `${n}. ${label}`,
  previewAgain: 'Preview again',
  previewFailed: 'We could not make a preview. Try again.',
  viewsLabel: 'Which rows to show',
  viewWithCount: (label: string, n: number): string => `${label} (${n})`,
  tickAll: 'Tick all changes',
  untickAll: 'Untick all',
  tickReview: 'Tick the ones that need a look',
  untickReview: 'Untick the ones that need a look',
  tickRow: (title: string): string => `Apply the new price for ${title}`,
  previewTableCaption: 'Prices that would change',
  colBefore: 'Current price',
  colAfter: 'New price',
  colChange: 'Change',
  colSource: 'Source',
  colStatus: 'Status',
  colCurrentPer1000: 'Current per 1,000',
  colRateCardPer1000: 'Rate card per 1,000',
  nothingToChange: 'No prices would change.',
  nothingInView: 'Nothing here.',
  nothingSelected: 'No prices are ticked. Go back and tick the ones you want to change.',
  continueToApply: 'Review and apply',
  applyProgress: (done: number, left: number): string => `${done} done, ${left} to go.`,
  finishedHeading: 'All done',
  noRunsYet: 'No runs yet.',
  historyTitle: (kind: string, date: string): string => (kind && date ? `${kind}, ${date}` : kind || date),
  historyDetail: (status: string, extra: string): string => (extra ? `${status}. ${extra}` : status),
  undoConfirmTitle: 'Undo these changes?',
  undoConfirmMessage: 'This puts back the old prices from this run. Prices you changed by hand since stay as they are.',
};

/** Sample arguments for every function in PRICE_BOOK_UI, so the copy lint reads what the screens can say. */
export const PRICE_BOOK_UI_SAMPLES: Record<string, unknown[][]> = {
  newRuleHeading: [['Selling']],
  ruleLimit: [[100]],
  deleteRuleMessage: [['Rares over $5']],
  ruleAction: [['Edit', 'Rares over $5']],
  rangePercent: [[1, 200]],
  rangeDays: [[1, 3650]],
  rangeCount: [[1, 20]],
  orderItem: [[1, 'your typed price']],
  errorField: [['Never go below']],
  errorRange: [['Never go below', 'Never go above']],
  errorRuleNameLong: [[80]],
  errorPercentRange: [[-90, 500]],
  errorRate: [['Bulk commons, per 1,000']],
  errorTheirRate: [['Bulk commons, per 1,000']],
  startStepNumber: [[1, 'Turn on']],
  gameTab: [['MTG'], ['POKEMON']],
  creditShownAt: [['120']],
  creditRateSet: [['$10.00']],
  onlyOlder: [[90]],
  olderBadge: [[90]],
  referenceOrderLine: [['your typed price, your recent sales']],
  stockDone: [[0], [1], [12]],
  stockSkipped: [[1], [3]],
  benchmarkRowTitle: [['Magic', 'Rare', 'Foil']],
  importWillCreate: [[1], [4]],
  importWillUpdate: [[1], [4]],
  importUnresolved: [[1], [4]],
  importRejected: [[1], [4]],
  importRow: [[3, 'No price on this row.']],
  importDone: [[4, 2]],
  stepNumber: [[2, 'Preview']],
  viewWithCount: [['Changes', 128]],
  tickRow: [['Lightning Bolt (M11)']],
  applyProgress: [[200, 119]],
  historyTitle: [['Cards', 'Oct 12, 2026'], ['', 'Oct 12, 2026']],
  historyDetail: [['Applied', 'Applied 119 prices.'], ['Preview', '']],
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function sourceLabel(source: string | null | undefined): string {
  return lookupWord(PRICE_SOURCE_LABELS, source);
}

export function skipReasonText(code: string | null | undefined): string {
  return lookupWord(SKIP_REASON_LABELS, code, '');
}

/** "No rate set for Bulk commons" when the tier is known (ADR-140 section 8.5), else the plain label. */
export function noRateText(tierLabel: string | null | undefined): string {
  return tierLabel ? `No rate set for ${tierLabel}` : SKIP_REASON_LABELS.NO_RATE;
}

export function reviewReasonText(reason: string, movePercent?: number | null): string {
  if (reason === 'LARGE_MOVE') {
    const p = typeof movePercent === 'number' && Number.isFinite(movePercent) ? Math.round(Math.abs(movePercent)) : null;
    return p === null ? 'This price moved a lot from the current price. Take a look before you apply it.' : PRICE_BOOK_COPY.largeMove(p);
  }
  return lookupWord(REVIEW_REASON_WORDING, reason, '');
}

export function warningText(code: string, serverMessage?: string | null): string {
  if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) return serverMessage.trim();
  return lookupWord(WARNING_WORDING, code, '');
}

export function failureText(code: string | null | undefined): string {
  return lookupWord(SUGGESTION_FAILURE_WORDING, code, PRICE_BOOK_COPY.noSuggestion);
}

/** Plain wording for an error code. Unknown codes and prototype names fall back to the generic message. */
export function wordingForPriceBookError(code: string | null | undefined): string {
  if (typeof code === 'string' && hasOwn(PRICE_BOOK_ERROR_WORDING, code)) return PRICE_BOOK_ERROR_WORDING[code];
  return PRICE_BOOK_ERROR_WORDING.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Copy lint support
// ---------------------------------------------------------------------------

/** Every string a person can read in this module, for the copy lint test (AT-17, frontend half). */
export function allPriceBookCopy(): string[] {
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
  };
  const tables: Array<Record<string, string>> = [
    PRICE_SOURCE_LABELS,
    SOURCE_PHRASES,
    TAB_LABELS,
    FAMILY_LABELS,
    TIER_LABELS,
    UNIT_LABELS,
    DIRECTION_LABELS,
    RARITY_CLASS_LABELS,
    FINISH_LABELS,
    VARIANT_LABELS,
    CONDITION_LABELS,
    BASIS_LABELS,
    ROUNDING_MODE_LABELS,
    ROUNDING_DIRECTION_LABELS,
    RUN_STATUS_LABELS,
    RUN_KIND_LABELS,
    SKIP_REASON_LABELS,
    RUN_ITEM_STATE_LABELS,
    REVIEW_REASON_WORDING,
    WARNING_WORDING,
    SUGGESTION_FAILURE_WORDING,
    PRICE_BOOK_ERROR_WORDING,
    RULE_RARITY_WORDS,
    RULE_FINISH_WORDS,
    RULE_VARIANT_WORDS,
    RULE_GAME_WORDS,
    RULE_LANGUAGE_WORDS,
  ];
  tables.forEach((t) => Object.keys(t).forEach((k) => push(t[k])));

  const modes = Object.keys(ROUND_STEP_WORDS).concat(['NONE']);
  modes.forEach((m) => ['NEAREST', 'UP', 'DOWN'].forEach((d) => push(roundPhrase(m, d))));
  push(roundPhrase(null, null));

  push(noRateText('Bulk commons'));
  push(noRateText(null));
  [-38, 0, 38].forEach((p) => push(reviewReasonText('LARGE_MOVE', p)));
  push(reviewReasonText('LARGE_MOVE', null));

  // Functions that take something other than one number get their own sample arguments.
  const customSamples: Record<string, unknown[][]> = {
    oldReference: [['Oct 3, 2026']],
    largeMove: [[38], ['38']],
    recentEdit: [['Oct 3, 2026']],
    previewSummary: [[128, 311, 24, 9], [1, 1, 1, 1], [0, 0, 0, 0]],
    rateGap: [['$8.00', '$10.00', 'per 1,000', 'Oct 12', '20', 'lower'], ['$0.25', '$0.20', 'per card', '', '25', 'higher']],
    rateGapSame: [['$8.00', '$8.00', 'per 1,000', 'Oct 12'], ['$8.00', '$8.00', 'per 1,000', '']],
    rateJump: [['Commons', '$8.00', '$800.00']],
    headline: [['$10.25']],
    basedOnLine: [['Your typed price', 'Oct 3'], ['Your typed price', '']],
    referenceWorth: [['$12.00']],
    provenanceSet: [['Your typed price', 'Oct 3'], ['Your typed price', '']],
    lotRowChange: [['Bulk commons', '$8.00', '$9.00']],
  };
  const numberSamples: unknown[][] = [[0], [1], [2], [119]];
  const copy = PRICE_BOOK_COPY as unknown as Record<string, unknown>;
  Object.keys(copy).forEach((k) => {
    const v = copy[k];
    if (typeof v === 'string') {
      out.push(v);
    } else if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown;
      const samples = hasOwn(customSamples, k) ? customSamples[k] : numberSamples;
      samples.forEach((args) => {
        try {
          push(fn(...args));
        } catch {
          /* a sample that does not fit this function */
        }
      });
    }
  });

  const rule = RULE_COPY as unknown as Record<string, unknown>;
  const ruleSamples: Record<string, unknown[][]> = {
    fromSet: [['LEA']],
    inLanguage: [['Japanese']],
    worthBetween: [['$1.00', '$9.99']],
    worthAtLeast: [['$1.00']],
    worthUpTo: [['$9.99']],
    startFromList: [['your typed price or your recent sales']],
    fixedPrice: [['$5.00']],
    payFixed: [['$0.10']],
    priceAt: [['95']],
    payAt: [['50']],
    addAmount: [['$0.10']],
    takeOffAmount: [['$0.10']],
    marginAtLeast: [['10']],
    neverBelow: [['$0.99']],
    neverAbove: [['$50.00']],
    creditAt: [['120']],
    minOffer: [['$0.25']],
    listJoin: [[['a', 'b', 'c']], [['a', 'b']], [['a']]],
  };
  Object.keys(rule).forEach((k) => {
    const v = rule[k];
    if (typeof v === 'string') {
      out.push(v);
    } else if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown;
      (hasOwn(ruleSamples, k) ? ruleSamples[k] : []).forEach((args) => {
        try {
          push(fn(...args));
        } catch {
          /* a sample that does not fit this function */
        }
      });
    }
  });

  const ui = PRICE_BOOK_UI as unknown as Record<string, unknown>;
  Object.keys(ui).forEach((k) => {
    const v = ui[k];
    if (typeof v === 'string') {
      out.push(v);
    } else if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown;
      (hasOwn(PRICE_BOOK_UI_SAMPLES, k) ? PRICE_BOOK_UI_SAMPLES[k] : []).forEach((args) => {
        try {
          push(fn(...args));
        } catch {
          /* a sample that does not fit this function */
        }
      });
    }
  });
  return out;
}
