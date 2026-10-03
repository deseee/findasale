/**
 * Progressive-disclosure relevance helpers for the item form.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApparelDetailsDisclosure,
  getProductIdsDisclosure,
  hasAnyValue,
  isApparelDetailsRelevant,
  isIsbnRelevant,
  isMpnUpcRelevant,
  normalizeCategoryText,
} from '../itemFieldRelevance';

test('normalizeCategoryText lowercases, joins and decodes &amp;', () => {
  assert.equal(normalizeCategoryText('Musical Instruments &amp; Gear', 'Electric  Guitars'), 'musical instruments & gear electric guitars');
  assert.equal(normalizeCategoryText(null, undefined), '');
});

test('ISBN is relevant for book, magazine, comic and media categories only', () => {
  assert.equal(isIsbnRelevant('Books & Magazines'), true);
  assert.equal(isIsbnRelevant('', 'Comic Books & Memorabilia'), true);
  assert.equal(isIsbnRelevant('Entertainment', 'Media Mail Supplies'), true);
  assert.equal(isIsbnRelevant('Clothing, Shoes & Accessories'), false);
  assert.equal(isIsbnRelevant('', ''), false);
});

test('size/color/material is relevant for apparel-style categories', () => {
  assert.equal(isApparelDetailsRelevant('Clothing, Shoes & Accessories'), true);
  assert.equal(isApparelDetailsRelevant('', "Women's Dresses"), true);
  assert.equal(isApparelDetailsRelevant('', 'Handbags & Purses'), true);
  assert.equal(isApparelDetailsRelevant('Jewelry & Watches'), true);
  assert.equal(isApparelDetailsRelevant('Books & Magazines'), false);
  // whole-word matching avoids furniture false positives
  assert.equal(isApparelDetailsRelevant('Furniture', 'Dressers & Chests'), false);
});

test('MPN/UPC is relevant for electronics, tools, computers, video games, cameras, musical', () => {
  assert.equal(isMpnUpcRelevant('Consumer Electronics'), true);
  assert.equal(isMpnUpcRelevant('Business & Industrial', 'Hand Tools'), true);
  assert.equal(isMpnUpcRelevant('Computers/Tablets & Networking'), true);
  assert.equal(isMpnUpcRelevant('Video Games & Consoles'), true);
  assert.equal(isMpnUpcRelevant('Cameras & Photo'), true);
  assert.equal(isMpnUpcRelevant('Musical Instruments & Gear'), true);
  assert.equal(isMpnUpcRelevant('Home & Garden', 'Bar Stools'), false);
  assert.equal(isMpnUpcRelevant('Clothing, Shoes & Accessories'), false);
});

test('a field that already has a value is always shown expanded, even when irrelevant', () => {
  const d = getProductIdsDisclosure({ category: 'Clothing, Shoes & Accessories', mpn: 'ABC-1' });
  assert.equal(d.relevant, false);
  assert.equal(d.hasValue, true);
  assert.equal(d.open, true);

  const a = getApparelDetailsDisclosure({ category: 'Books & Magazines', color: 'Blue' });
  assert.equal(a.open, true);
});

test('irrelevant and empty groups collapse, and showAll reaches them', () => {
  const d = getProductIdsDisclosure({ category: 'Home & Garden', mpn: '', upc: '  ', isbn: null });
  assert.equal(d.open, false);
  assert.equal(getProductIdsDisclosure({ category: 'Home & Garden', showAll: true }).open, true);

  const a = getApparelDetailsDisclosure({ category: 'Consumer Electronics' });
  assert.equal(a.open, false);
  assert.equal(getApparelDetailsDisclosure({ category: 'Consumer Electronics', showAll: true }).open, true);
});

test('relevant groups are open by default', () => {
  assert.equal(getProductIdsDisclosure({ category: 'Books & Magazines' }).open, true);
  assert.equal(getApparelDetailsDisclosure({ ebayCategoryName: "Men's Shoes" }).open, true);
});

test('hasAnyValue counts zero but not blank strings', () => {
  assert.equal(hasAnyValue('', '  ', null, undefined), false);
  assert.equal(hasAnyValue('', 0), true);
});
