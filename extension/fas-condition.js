/* FindA.Sale -- shared condition helper for the platform scripts.
 *
 * Mirrors packages/backend/src/utils/conditionMapping.ts (normalizeCondition, normalizeGrade) rule for rule;
 * packages/backend/src/__tests__/extensionConditionParity.test.ts compares the two over a grid of inputs, so
 * change both together. Pure: no DOM, no chrome.*, no storage. Loads as a content script (attaches to
 * window.__FAS_COND__) and under Node (module.exports).
 *
 * The queue item carries item.conditionRaw (Item.condition as stored, possibly a legacy value) and
 * item.conditionGrade (Item.conditionGrade). item.condition is NOT used here: it is the Facebook-formatted
 * string and cannot tell PARTS_OR_REPAIR from USED.
 *
 * platformValue(platform, item) returns the platform's own option for that item, or null when the item carries
 * no usable condition or grade (the calling script then keeps what it did before this file existed).
 */
(function (root) {
  'use strict';

  var CANONICAL = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
  var GRADES = ['S', 'A', 'B', 'C', 'D'];

  // Same rules as normalizeCondition in conditionMapping.ts. Returns { condition, hintGrade?, changed }.
  function normalizeCondition(raw) {
    if (typeof raw !== 'string') return { condition: null, changed: false };
    var trimmed = raw.trim();
    if (trimmed.length === 0) return { condition: null, changed: false };

    var key = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
    var condition = null;
    var hintGrade;

    if (CANONICAL.indexOf(key) !== -1) {
      condition = key;
    } else if (key === 'LIKE_NEW' || key === 'EXCELLENT') {
      condition = 'USED';
      hintGrade = 'A';
    } else if (key === 'GOOD' || key === 'FAIR' || key.indexOf('USED_') === 0) {
      condition = 'USED';
    } else if (key.indexOf('NEW_') === 0) {
      condition = 'NEW';
    } else if (key === 'REFURBISHED' || /_REFURBISHED$/.test(key) || key.indexOf('REFURBISHED_') === 0) {
      condition = 'REFURBISHED';
    } else if (key === 'POOR' || key === 'PARTS' || key.indexOf('PARTS_') === 0 || key.indexOf('FOR_PARTS') === 0) {
      condition = 'PARTS_OR_REPAIR';
    }

    if (condition === null) return { condition: null, changed: false };

    var result = { condition: condition, changed: raw !== condition };
    if (hintGrade !== undefined) result.hintGrade = hintGrade;
    return result;
  }

  // Same rule as normalizeGrade in conditionMapping.ts (trim, uppercase, S stays S).
  function normalizeGrade(raw) {
    if (typeof raw !== 'string') return null;
    var key = raw.trim().toUpperCase();
    return GRADES.indexOf(key) !== -1 ? key : null;
  }

  // Reads an item: { condition, grade }. grade is A, B, C, D or null (S is retired and reads as A; a stored grade
  // wins over the hint a legacy LIKE_NEW or EXCELLENT carries). A missing or unrecognized condition with a valid
  // grade reads as USED, the way desiredEbayCondition treats it; with neither, condition is null.
  function normalize(item) {
    var n = normalizeCondition(item ? item.conditionRaw : null);
    var g = normalizeGrade(item ? item.conditionGrade : null);
    if (g === null && n.hintGrade !== undefined) g = n.hintGrade;
    if (g === 'S') g = 'A';
    var condition = n.condition;
    if (condition === null && g !== null) condition = 'USED';
    return { condition: condition, grade: g };
  }

  // Each platform's option list is the one its script already selects in the page, best used level first.
  //   used:     [A, B, C, D] option for a graded used item
  //   ungraded: option for USED with no grade (what the script used before this file)
  var PLATFORMS = {
    // fas-mercari.js CONDITION_LABELS
    mercari:    { newV: 'New', refurb: 'Like New', parts: 'Poor', ungraded: 'Good',
                  used: { A: 'Like New', B: 'Good', C: 'Good', D: 'Fair' } },
    // fas-poshmark.js CONDITION_LABELS (Poshmark has no poor level: parts reads as Fair, as before)
    poshmark:   { newV: 'New With Tags (NWT)', refurb: 'Like New', parts: 'Fair', ungraded: 'Good',
                  used: { A: 'Like New', B: 'Good', C: 'Good', D: 'Fair' } },
    // fas-vinted.js mapVintedCondition
    vinted:     { newV: 'New', refurb: 'Like new', parts: 'Needs repair (electronics only)', ungraded: 'Good',
                  used: { A: 'Like new', B: 'Very good', C: 'Good', D: 'Satisfactory' } },
    // fas-grailed.js mapGrailedCondition
    grailed:    { newV: 'New/Never Worn', refurb: 'Gently Used', parts: 'Very Worn', ungraded: 'Used',
                  used: { A: 'Gently Used', B: 'Gently Used', C: 'Used', D: 'Used' } },
    // fas-craigslist.js CL_CONDITION_MAP values (select[name="condition"]: 10 new, 20 like new, 30 excellent,
    // 40 good, 50 fair, 60 salvage)
    craigslist: { newV: '10', refurb: '20', parts: '60', ungraded: '40',
                  used: { A: '20', B: '30', C: '40', D: '50' } }
  };

  function platformValue(platform, item) {
    var table = PLATFORMS[platform];
    if (!table) return null;
    var n = normalize(item);
    switch (n.condition) {
      case 'NEW': return table.newV;
      case 'REFURBISHED': return table.refurb;
      case 'PARTS_OR_REPAIR': return table.parts;
      case 'USED': return n.grade ? table.used[n.grade] : table.ungraded;
      default: return null;
    }
  }

  var api = {
    normalizeCondition: normalizeCondition,
    normalizeGrade: normalizeGrade,
    normalize: normalize,
    platformValue: platformValue
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.__FAS_COND__ = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null));
