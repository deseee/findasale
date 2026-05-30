/**
 * Feature #4: Category listing page — /categories
 * Displays all available item categories with counts, linking to /categories/[category].
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatCategoryLabel } from '../../lib/itemConstants';

const CATEGORY_ICONS: Record<string, string> = {
  // --- Generic / top-level fallbacks ---
  furniture: '🪑',
  decor: '🏺',
  vintage: '🕰️',
  textiles: '🧵',
  collectibles: '🏆',
  art: '🎨',
  antiques: '⚱️',
  jewelry: '💎',
  books: '📚',
  tools: '🔧',
  electronics: '💻',
  clothing: '👗',
  home: '🏠',
  other: '📦',

  // --- Comics & pop culture ---
  comics: '🦸',
  'comics & graphic novels': '🦸',
  'graphic novels': '🦸',
  'comic books': '🦸',
  'manga & anime': '⛩️',
  'trading cards': '🃏',
  'sports trading cards': '🃏',
  'non-sport trading cards': '🃏',
  'ccg individual cards': '🃏',
  'ccg sets & collections': '🃏',
  'action figures': '🤖',
  'action figures & accessories': '🤖',
  'diecast & toy vehicles': '🚗',
  'toy vehicles': '🚗',

  // --- Toys & games ---
  toys: '🧸',
  'dolls & bears': '🧸',
  'dolls & doll playsets': '🧸',
  'stuffed animals': '🧸',
  'plush figures': '🧸',
  'board games': '🎲',
  'board & traditional games': '🎲',
  'puzzles': '🧩',
  'jigsaw puzzles': '🧩',
  'vintage & antique toys': '🪀',
  'building sets': '🧱',
  'lego sets': '🧱',

  // --- Video games & gaming ---
  'video games': '🎮',
  'video game consoles': '🎮',
  'video game accessories': '🎮',
  'retro gaming': '🕹️',
  'pc games': '🎮',
  gaming: '🎮',

  // --- Clothing & accessories ---
  "men's clothing": '👔',
  "women's clothing": '👗',
  "children's clothing": '👕',
  "kids' clothing": '👕',
  'shoes': '👟',
  "men's shoes": '👞',
  "women's shoes": '👠',
  'boots': '🥾',
  'hats': '🎩',
  'caps & hats': '🧢',
  'sunglasses': '🕶️',
  'scarves': '🧣',
  'gloves': '🧤',
  'handbags': '👜',
  'purses & handbags': '👜',
  'wallets': '👛',
  'belts': '👔',
  'vintage clothing': '👗',
  'vintage accessories': '🕶️',
  'coats & jackets': '🧥',

  // --- Jewelry ---
  'rings': '💍',
  'necklaces': '📿',
  'necklaces & pendants': '📿',
  'bracelets': '⌚',
  'earrings': '👂',
  'brooches & pins': '📌',
  'watches': '⌚',
  'pocket watches': '⌚',
  'vintage watches': '⌚',
  'fine jewelry': '💎',
  'costume jewelry': '💫',
  'men\'s jewelry': '💎',

  // --- Kitchen & home ---
  'kitchen': '🍳',
  'cookware': '🍳',
  'bakeware': '🧁',
  'flatware': '🍴',
  'silverware & flatware': '🍴',
  'dishware': '🍽️',
  'dishes & serving dishes': '🍽️',
  'glassware & drinkware': '🥂',
  'glasses & drinkware': '🥂',
  'small kitchen appliances': '🔌',
  'kitchen appliances': '🔌',
  'mixing bowls': '🥣',
  'kitchen tools': '🥄',
  'pots & pans': '🍳',
  'cast iron': '🍳',

  // --- Coins & stamps ---
  'coins': '💰',
  'us coins': '💰',
  'world coins': '💰',
  'coin collections': '💰',
  'stamps': '✉️',
  'us stamps': '✉️',
  'world stamps': '✉️',
  'postcards': '🗺️',
  'ephemera': '📜',
  'paper money': '💵',
  'us paper money': '💵',

  // --- Textiles & soft furnishings ---
  'rugs': '🏠',
  'area rugs': '🏠',
  'curtains': '🪟',
  'window treatments': '🪟',
  'bedding': '🛏️',
  'bed linens': '🛏️',
  'comforters': '🛏️',
  'pillows': '🛋️',
  'throw pillows': '🛋️',
  'blankets': '🛏️',
  'quilts': '🧵',
  'tapestries': '🧵',
  'tablecloths': '🍽️',

  // --- Electronics ---
  'cameras': '📷',
  'cameras & photography': '📷',
  'film cameras': '📷',
  'digital cameras': '📷',
  'camera lenses': '🔭',
  'phones': '📱',
  'cell phones': '📱',
  'smartphones': '📱',
  'tablets': '📱',
  'computers': '💻',
  'laptops': '💻',
  'desktops': '🖥️',
  'monitors': '🖥️',
  'audio': '🔊',
  'home audio': '🔊',
  'speakers': '🔊',
  'headphones': '🎧',
  'radios': '📻',
  'televisions': '📺',
  'tvs': '📺',
  'vcrs': '📼',
  'dvd players': '📀',
  'vintage electronics': '📻',
  'ham radio': '📻',

  // --- Sports & fitness ---
  'sports': '⚽',
  'sports equipment': '⚽',
  'exercise & fitness': '🏋️',
  'fitness equipment': '🏋️',
  'camping & outdoor': '⛺',
  'camping & hiking': '⛺',
  'fishing': '🎣',
  'hunting': '🏹',
  'golf': '⛳',
  'golf clubs': '⛳',
  'bicycles': '🚲',
  'bikes': '🚲',
  'skiing & snowboarding': '⛷️',

  // --- Music & media ---
  'vinyl records': '🎵',
  'records': '🎵',
  '33 rpm': '🎵',
  '45 rpm': '🎵',
  '78 rpm': '🎵',
  'cds': '💿',
  'dvds': '📀',
  'blu-ray': '📀',
  'vhs': '📼',
  'cassette tapes': '📼',
  'music': '🎵',
  'music memorabilia': '🎵',

  // --- Musical instruments ---
  'musical instruments': '🎸',
  'guitar': '🎸',
  'guitars': '🎸',
  'piano': '🎹',
  'keyboards': '🎹',
  'drums': '🥁',
  'drum sets': '🥁',
  'brass instruments': '🎺',
  'woodwind instruments': '🎷',
  'string instruments': '🎻',
  'violin': '🎻',

  // --- Art & décor ---
  'paintings': '🖼️',
  'prints': '🖼️',
  'art prints': '🖼️',
  'sculptures': '🗿',
  'photography': '📷',
  'fine art photography': '📷',
  'mirrors': '🪞',
  'frames': '🖼️',
  'picture frames': '🖼️',
  'wall art': '🖼️',
  'lamps': '💡',
  'lighting': '💡',
  'floor lamps': '💡',
  'table lamps': '💡',
  'chandeliers': '💡',
  'light fixtures': '💡',

  // --- Books & paper ---
  'hardcover books': '📚',
  'paperback books': '📖',
  'fiction books': '📖',
  'nonfiction': '📚',
  'children\'s books': '📖',
  'cookbooks': '📚',
  'magazines': '📰',
  'newspapers': '📰',
  'maps': '🗺️',
  'antique maps': '🗺️',
  'globes': '🌍',

  // --- Holidays & seasonal ---
  'holiday': '🎄',
  'christmas': '🎄',
  'christmas décor': '🎄',
  'holiday décor': '🎄',
  'halloween': '🎃',
  'halloween décor': '🎃',
  'easter': '🐰',
  'thanksgiving': '🦃',
  'seasonal décor': '🎄',

  // --- Garden & outdoor ---
  'garden': '🌿',
  'gardening': '🌿',
  'garden tools': '🌿',
  'yard tools': '🌿',
  'lawn equipment': '🌱',
  'outdoor décor': '🌸',
  'planters': '🪴',
  'patio furniture': '🪑',
  'outdoor furniture': '🪑',

  // --- Automotive ---
  'cars': '🚗',
  'automobiles': '🚗',
  'motorcycles': '🏍️',
  'auto parts': '🔩',
  'car parts': '🔩',
  'automotive': '🚗',

  // --- Dolls, figurines & porcelain ---
  'dolls': '🧸',
  'figurines': '🏺',
  'porcelain figurines': '🏺',
  'ceramic figurines': '🏺',
  'glass figurines': '🏺',
  'vintage dolls': '🧸',
  'barbie': '🧸',

  // --- Military & western ---
  'military': '🎖️',
  'militaria': '🎖️',
  'military surplus': '🎖️',
  'western': '🤠',
  'cowboy': '🤠',

  // --- Sewing, crafts & hobbies ---
  'sewing': '🧵',
  'quilting': '🧵',
  'crafts': '✂️',
  'craft supplies': '✂️',
  'knitting': '🧶',
  'yarn': '🧶',
  'scrapbooking': '✂️',
  'art supplies': '🎨',

  // --- Scientific & optical ---
  'scientific instruments': '🔬',
  'telescopes': '🔭',
  'microscopes': '🔬',
  'binoculars': '🔭',

  // --- Furniture subcategories ---
  'sofas': '🛋️',
  'chairs': '🪑',
  'tables': '🪑',
  'dressers': '🪑',
  'bookcases': '📚',
  'bookshelves': '📚',
  'desks': '🖥️',
  'beds': '🛏️',
  'bedroom furniture': '🛏️',
  'dining furniture': '🍽️',

  // --- Pottery, glass & ceramics ---
  'pottery': '🏺',
  'ceramics': '🏺',
  'glassware': '🥂',
  'crystal': '🥂',
  'stoneware': '🏺',

  // --- L-002: long-tail leaf names that previously fell through to 📦 ---
  'pipe fittings': '🔧',
  'tins': '🥫',
  'ashtrays': '🚬',
  'signs': '📢',
  'manuals, inserts & box art': '📄',
  'manuals & inserts': '📄',
  'box art': '📄',
  'other retail store ads': '📢',
  'retail store ads': '📢',
  'tracksuits & sets': '🩳',
  'tracksuits': '🩳',
  'other us politics collectibles': '🎗️',
  'us politics collectibles': '🎗️',
  'political memorabilia': '🎗️',
  'coins & currency': '💰',
};

/**
 * L-002: Per-parent fallback icons. When a leaf label has no exact match in
 * CATEGORY_ICONS, we look at the parent segment(s) of the original eBay path
 * (colon-delimited) and fall back to a sensible parent icon instead of the
 * generic 📦 box. Keys are lowercase substrings tested against the full raw
 * category path.
 */
const PARENT_FALLBACK_ICONS: Array<[RegExp, string]> = [
  [/coin|numismat|currency|paper money|bullion/i, '💰'],
  [/stamp/i, '✉️'],
  [/comic|graphic novel|manga/i, '🦸'],
  [/card/i, '🃏'],
  [/politic|campaign|election/i, '🎗️'],
  [/advertis|\bads?\b|sign|poster/i, '📢'],
  [/book|magazine|manual|paper|ephemera/i, '📚'],
  [/jewelry|jewellery|ring|necklace|bracelet|earring/i, '💎'],
  [/cloth|apparel|shirt|pant|dress|tracksuit|jacket|coat/i, '👕'],
  [/shoe|sneaker|boot|footwear/i, '👟'],
  [/toy|doll|figure|lego|game/i, '🧸'],
  [/kitchen|cookware|dish|glass|flatware/i, '🍳'],
  [/electronic|camera|phone|computer|audio|video/i, '💻'],
  [/furniture|chair|table|sofa|desk|dresser/i, '🪑'],
  [/tool|hardware|fitting|fastener/i, '🔧'],
  [/military|militaria/i, '🎖️'],
  [/art|painting|print|sculpture/i, '🎨'],
  [/tin|canister/i, '🥫'],
];

/**
 * L-003: Hyper-specific numismatic / grading leaf labels (e.g. coin-year ranges
 * like "Eisenhower (1971-78)") should not surface as top-level categories next
 * to clean labels like "Comics". We roll them up under a "Coins & Currency"
 * parent. Detection: a year-range in parentheses "(YYYY-YY)" or "(YYYY-YYYY)",
 * or known numismatic series names paired with a parenthetical date.
 *
 * Returns the rollup label if the leaf should be rolled up, otherwise null.
 */
const COIN_YEAR_RANGE = /\(\s*\d{4}\s*[-–]\s*\d{2,4}\s*\)/;
const NUMISMATIC_SERIES = /(eisenhower|morgan|peace dollar|sacagawea|kennedy half|franklin half|walking liberty|barber|seated liberty|mercury dime|roosevelt dime|washington quarter|standing liberty|buffalo nickel|jefferson nickel|lincoln cent|wheat (cent|penny)|indian head|flying eagle|liberty head|saint[- ]gaudens|double eagle|gold eagle|silver eagle|draped bust|capped bust|large cent|half cent|two cent|three cent|twenty cent|trade dollar)/i;

interface Rollup {
  label: string;
  /** Where the rolled-up card should link, since no single raw category holds all members. */
  href: string;
}

function rollupLabel(rawCategory: string, formattedLabel: string): Rollup | null {
  // A parenthetical year-range is the strongest grading/series signal; a known
  // coin series name (with or without a date) is also numismatic noise at top level.
  if (
    COIN_YEAR_RANGE.test(formattedLabel) ||
    COIN_YEAR_RANGE.test(rawCategory) ||
    NUMISMATIC_SERIES.test(formattedLabel) ||
    NUMISMATIC_SERIES.test(rawCategory)
  ) {
    // No single raw DB category aggregates every coin series, so link the
    // rolled-up parent card to a full-text search that surfaces all of them.
    return { label: 'Coins & Currency', href: '/search?q=coins' };
  }
  return null;
}

/**
 * M-008: Normalize a label for dedupe/grouping. Trims, lowercases, and collapses
 * internal whitespace so "Tins", "tins ", and "Tins  " all map to one group.
 */
function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Resolve the emoji for a grouped category, with per-parent fallback (L-002). */
function resolveIcon(displayLabel: string, normalizedDisplay: string, rawCategory: string): string {
  const direct =
    CATEGORY_ICONS[normalizeKey(displayLabel)] ??
    CATEGORY_ICONS[normalizedDisplay] ??
    CATEGORY_ICONS[normalizeKey(rawCategory)];
  if (direct) return direct;
  // Per-parent fallback: test the full raw eBay path (carries parent segments).
  for (const [pattern, icon] of PARENT_FALLBACK_ICONS) {
    if (pattern.test(rawCategory) || pattern.test(displayLabel)) return icon;
  }
  return '📦';
}

interface GroupedCategory {
  displayLabel: string;
  count: number;
  href: string; // fully-resolved href (already path-encoded) for the card link
  icon: string;
}

/**
 * Shorter display names for verbose eBay leaf node labels.
 * Keys are the LOWERCASE formatted label (after formatCategoryLabel).
 */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'comics & graphic novels': 'Comics',
  'action figures & accessories': 'Action Figures',
  'diecast & toy vehicles': 'Toy Vehicles',
  'board & traditional games': 'Board Games',
  'silverware & flatware': 'Flatware',
  'glasses & drinkware': 'Glassware',
  'dishes & serving dishes': 'Dishware',
  'small kitchen appliances': 'Kitchen Appliances',
  'cameras & photography': 'Cameras',
  'fine art photography': 'Art Photography',
  'exercise & fitness': 'Fitness',
  'camping & hiking': 'Camping',
  'camping & outdoor': 'Outdoors',
  'necklaces & pendants': 'Necklaces',
  'purses & handbags': 'Handbags',
  'caps & hats': 'Hats',
  'coats & jackets': 'Outerwear',
  'vintage & antique toys': 'Vintage Toys',
  'brooches & pins': 'Brooches',
  'porcelain figurines': 'Figurines',
  'ceramic figurines': 'Figurines',
  'glass figurines': 'Figurines',
  'golf clubs': 'Golf',
  'skiing & snowboarding': 'Ski & Snow',
  'window treatments': 'Curtains',
  'sports trading cards': 'Sports Cards',
  'non-sport trading cards': 'Trading Cards',
  'ccg individual cards': 'Card Games',
  'ccg sets & collections': 'Card Sets',
  'manga & anime': 'Manga',
  'music memorabilia': 'Music Merch',
  'vintage electronics': 'Vintage Electronics',
  'military surplus': 'Military',
  'art supplies': 'Art Supplies',
  'craft supplies': 'Crafts',
  'scientific instruments': 'Scientific',
  'antique maps': 'Antique Maps',
  'picture frames': 'Frames',
  'light fixtures': 'Lighting',
  'outdoor décor': 'Outdoor Décor',
  'bedroom furniture': 'Bedroom',
  'dining furniture': 'Dining',
  'outdoor furniture': 'Outdoor Furniture',
  'patio furniture': 'Patio',
  'hardcover books': 'Books',
  'paperback books': 'Books',
  'fiction books': 'Fiction',
  'children\'s books': "Kids' Books",
  "men's clothing": "Men's Clothing",
  "women's clothing": "Women's Clothing",
  "children's clothing": "Kids' Clothing",
  "kids' clothing": "Kids' Clothing",
  "men's shoes": "Men's Shoes",
  "women's shoes": "Women's Shoes",
};


const CategoriesIndexPage = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => {
      const res = await api.get('/items/categories');
      return res.data as { categories: Record<string, number> };
    },
    staleTime: 5 * 60_000,
  });

  // M-008 + L-003: Dedupe identical leaf names (case/whitespace) and roll up
  // hyper-specific numismatic/grading labels under a "Coins & Currency" parent.
  // Group by a normalized key, sum counts, keep a clean display label, and pick
  // a representative raw category for the detail-page link.
  const grouped = new Map<string, GroupedCategory>();

  if (data) {
    for (const [rawCat, count] of Object.entries(data.categories)) {
      const label = formatCategoryLabel(rawCat);
      const normalizedLabel = normalizeKey(label);
      // Apply display-name override, then check for numismatic rollup (L-003).
      const overridden = DISPLAY_NAME_OVERRIDES[normalizedLabel] ?? label;
      const rolledUp = rollupLabel(rawCat, overridden);
      const displayLabel = rolledUp ? rolledUp.label : overridden;
      const groupKey = normalizeKey(displayLabel);
      // Rolled-up groups link to an aggregate search; normal cards link to the
      // raw category detail page (matched case-insensitively by the backend).
      const href = rolledUp ? rolledUp.href : `/categories/${encodeURIComponent(rawCat)}`;

      const existing = grouped.get(groupKey);
      if (existing) {
        // M-008: identical leaf names (case/whitespace) merge into one card
        // with a summed