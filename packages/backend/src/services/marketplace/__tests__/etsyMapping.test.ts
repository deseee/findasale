/**
 * ADR-135 batch E-B2, acceptance 4 (mapping) and 5 (condition grade labels): title, tag and
 * material sanitizers, description builder, quantity, and the createDraftListing payload builder.
 * Pure functions, no mocks needed.
 */

import {
  buildEtsyConditionLine,
  buildEtsyDescription,
  buildEtsyDraftPayload,
  computeEtsyQuantity,
  encodeEtsyForm,
  ETSY_ARRAY_FIELD_SEPARATOR,
  ETSY_CARD_CONDITION_LABELS,
  ETSY_CONDITION_LABELS,
  ETSY_GRADE_LABELS,
  ETSY_MAX_MATERIALS,
  ETSY_MAX_MATERIAL_LEN,
  ETSY_MAX_QUANTITY,
  ETSY_MAX_TAGS,
  ETSY_MAX_TAG_LEN,
  ETSY_MAX_TITLE_LEN,
  ETSY_PAYLOAD_PROBLEM_MESSAGES,
  ETSY_PRICE_IN_MINOR_UNITS,
  EtsyDraftAttestation,
  EtsyDraftItemInput,
  sanitizeEtsyDescriptionText,
  sanitizeEtsyMaterials,
  sanitizeEtsyTags,
  sanitizeEtsyTitle,
} from '../etsyMapping';

describe('named constants (UNVERIFIED pending live test T4)', () => {
  it('carry the ADR values', () => {
    expect(ETSY_MAX_TITLE_LEN).toBe(140);
    expect(ETSY_MAX_TAGS).toBe(13);
    expect(ETSY_MAX_TAG_LEN).toBe(20);
    expect(ETSY_MAX_MATERIALS).toBe(13);
    expect(ETSY_MAX_MATERIAL_LEN).toBe(45);
    expect(ETSY_MAX_QUANTITY).toBe(999);
    expect(ETSY_PRICE_IN_MINOR_UNITS).toBe(false);
    expect(ETSY_ARRAY_FIELD_SEPARATOR).toBe(',');
  });
});

describe('sanitizeEtsyTitle', () => {
  it('leaves an ordinary title alone', () => {
    expect(sanitizeEtsyTitle('Vintage Fenton Glass Vase, 1960s (Blue)')).toBe('Vintage Fenton Glass Vase, 1960s (Blue)');
  });

  it('removes characters the spec regex disallows (emoji, currency and modifier symbols)', () => {
    expect(sanitizeEtsyTitle('Vase 🌸 Blue')).toBe('Vase Blue');
    expect(sanitizeEtsyTitle('$5 coin')).toBe('5 coin');
    expect(sanitizeEtsyTitle('Café éclaire ☕')).toBe('Café éclaire');
  });

  it('keeps the trademark, copyright and registered marks', () => {
    expect(sanitizeEtsyTitle('Brand™ Thing© Maker®')).toBe('Brand™ Thing© Maker®');
  });

  it('keeps each of % : & + at most once, extra ones become spaces', () => {
    expect(sanitizeEtsyTitle('50% off: 100% real & fun & more + extra + more : again')).toBe(
      '50% off: 100 real & fun more + extra more again'
    );
    expect(sanitizeEtsyTitle('A&B&C&D')).toBe('A&B C D');
    expect(sanitizeEtsyTitle('1+1+1')).toBe('1+1 1');
  });

  it('turns tabs and newlines into single spaces so words do not fuse', () => {
    expect(sanitizeEtsyTitle('Line one\nLine\ttwo\r\nthree')).toBe('Line one Line two three');
  });

  it('caps at the title length constant and never ends with a space', () => {
    const long = 'word '.repeat(60);
    const out = sanitizeEtsyTitle(long);
    expect(Array.from(out).length).toBeLessThanOrEqual(ETSY_MAX_TITLE_LEN);
    expect(out.endsWith(' ')).toBe(false);
    expect(sanitizeEtsyTitle('a'.repeat(200))).toHaveLength(ETSY_MAX_TITLE_LEN);
  });

  it('caps by code point, never splitting a surrogate pair', () => {
    const astralLetter = '\u{1D49C}'; // MATHEMATICAL SCRIPT CAPITAL A, a letter (\p{L})
    const out = sanitizeEtsyTitle(astralLetter.repeat(150));
    expect(Array.from(out)).toHaveLength(ETSY_MAX_TITLE_LEN);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('returns an empty string for null, undefined or all-disallowed input', () => {
    expect(sanitizeEtsyTitle(null)).toBe('');
    expect(sanitizeEtsyTitle(undefined)).toBe('');
    expect(sanitizeEtsyTitle('🌸🌸')).toBe('');
  });
});

describe('sanitizeEtsyTags', () => {
  it('keeps letters, numbers, hyphen and apostrophe, removes other punctuation, de-duplicates case-insensitively', () => {
    expect(sanitizeEtsyTags(['Mid-Century', "Rock 'n' Roll", 'Glass!', 'glass', 'Glass'])).toEqual([
      'Mid-Century',
      "Rock 'n' Roll",
      'Glass',
    ]);
  });

  it('normalizes curly apostrophes to straight ones', () => {
    expect(sanitizeEtsyTags(['Rock ’n’ Roll'])).toEqual(["Rock 'n' Roll"]);
  });

  it('turns separators into spaces instead of fusing words', () => {
    expect(sanitizeEtsyTags(['Art/Craft, Vintage'])).toEqual(['Art Craft Vintage']);
  });

  it('keeps the trademark, copyright and registered marks and drops empty results', () => {
    expect(sanitizeEtsyTags(['Brand™', '$$$', '   ', null, undefined])).toEqual(['Brand™']);
  });

  it('caps each tag at the tag length constant', () => {
    const out = sanitizeEtsyTags(['abcdefghijklmnopqrstuvwxyz']);
    expect(out).toEqual(['abcdefghijklmnopqrst']);
    expect(out[0]).toHaveLength(ETSY_MAX_TAG_LEN);
  });

  it('caps the number of tags at the tag count constant', () => {
    const many = Array.from({ length: 30 }, (_v, i) => `tag${i}`);
    const out = sanitizeEtsyTags(many);
    expect(out).toHaveLength(ETSY_MAX_TAGS);
    expect(out[0]).toBe('tag0');
  });

  it('returns an empty list for null or undefined', () => {
    expect(sanitizeEtsyTags(null)).toEqual([]);
    expect(sanitizeEtsyTags(undefined)).toEqual([]);
  });
});

describe('sanitizeEtsyMaterials', () => {
  it('keeps letters, numbers and spaces only; hyphens and commas become spaces; de-duplicates', () => {
    expect(sanitizeEtsyMaterials(['Cotton, blend', 'Glass-Ceramic', 'glass ceramic', '100% wool'])).toEqual([
      'Cotton blend',
      'Glass Ceramic',
      '100 wool',
    ]);
  });

  it('caps length and count', () => {
    expect(sanitizeEtsyMaterials(['x'.repeat(100)])[0]).toHaveLength(ETSY_MAX_MATERIAL_LEN);
    const many = Array.from({ length: 30 }, (_v, i) => `mat${i}`);
    expect(sanitizeEtsyMaterials(many)).toHaveLength(ETSY_MAX_MATERIALS);
  });

  it('returns an empty list for null, undefined or nothing usable', () => {
    expect(sanitizeEtsyMaterials(null)).toEqual([]);
    expect(sanitizeEtsyMaterials(['!!!'])).toEqual([]);
  });
});

describe('sanitizeEtsyDescriptionText', () => {
  const dirty =
    'Nice vase. See https://example.com/x?y=1 or www.foo.com and mail me@mail.com. Also visit mystore.com now. ' +
    'Find us on FindA.Sale and findasale and FINDASALE too. Ask at http://a.b/c?e=x@y.com please.';

  it('removes URLs, emails and the FindA.Sale brand', () => {
    const out = sanitizeEtsyDescriptionText(dirty);
    expect(out).not.toMatch(/https?:/i);
    expect(out).not.toMatch(/www\./i);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/\.com/i);
    expect(out).not.toMatch(/finda/i);
    expect(out).toContain('Nice vase.');
  });

  it('keeps ordinary text such as measurements and abbreviations', () => {
    expect(sanitizeEtsyDescriptionText('Measures 3.5 x 4.25 in. Made in U.S.A. circa 1965.')).toBe(
      'Measures 3.5 x 4.25 in. Made in U.S.A. circa 1965.'
    );
  });

  it('normalizes line breaks and keeps at most one blank line', () => {
    expect(sanitizeEtsyDescriptionText('One\r\nTwo\n\n\n\nThree  \n  Four')).toBe('One\nTwo\n\nThree\nFour');
  });

  it('strips control characters and handles null', () => {
    expect(sanitizeEtsyDescriptionText('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeEtsyDescriptionText(null)).toBe('');
  });
});

describe('buildEtsyDescription and the condition line (ADR-135 D3.2)', () => {
  it('prints the description, a blank line, then Condition and Grade', () => {
    expect(buildEtsyDescription({ description: 'Nice vase.', condition: 'USED', conditionGrade: 'A' })).toBe(
      'Nice vase.\n\nCondition: Pre-owned. Grade: A (Excellent).'
    );
  });

  it('uses the fixed condition table', () => {
    expect(ETSY_CONDITION_LABELS).toEqual({
      NEW: 'New',
      USED: 'Pre-owned',
      REFURBISHED: 'Refurbished',
      PARTS_OR_REPAIR: 'For parts or repair',
    });
    expect(buildEtsyConditionLine({ condition: 'NEW' })).toBe('Condition: New.');
    expect(buildEtsyConditionLine({ condition: 'REFURBISHED' })).toBe('Condition: Refurbished.');
    expect(buildEtsyConditionLine({ condition: 'PARTS_OR_REPAIR' })).toBe('Condition: For parts or repair.');
  });

  it('mirrors the existing frontend grade label map (S Like New, A Excellent, B Good, C Fair, D Poor)', () => {
    expect(ETSY_GRADE_LABELS).toEqual({ S: 'Like New', A: 'Excellent', B: 'Good', C: 'Fair', D: 'Poor' });
    expect(buildEtsyConditionLine({ conditionGrade: 'S' })).toBe('Grade: S (Like New).');
    expect(buildEtsyConditionLine({ conditionGrade: 'D' })).toBe('Grade: D (Poor).');
  });

  it('shows the grade letter as stored, and a bare letter when it has no label', () => {
    expect(buildEtsyConditionLine({ conditionGrade: 'a' })).toBe('Grade: a (Excellent).');
    expect(buildEtsyConditionLine({ conditionGrade: 'Z' })).toBe('Grade: Z.');
  });

  it('drops the condition label when the value is unknown or empty', () => {
    expect(buildEtsyConditionLine({ condition: 'MYSTERY' })).toBe('');
    expect(buildEtsyConditionLine({ condition: null, conditionGrade: null })).toBe('');
  });

  it('has no leading blank lines when the description is empty, and is empty when there is nothing to say', () => {
    expect(buildEtsyDescription({ description: null, condition: 'USED' })).toBe('Condition: Pre-owned.');
    expect(buildEtsyDescription({ description: '   ' })).toBe('');
  });

  it('removes URLs and emails from the description body', () => {
    const out = buildEtsyDescription({ description: 'Buy at https://shop.example.com or me@x.com', condition: 'USED' });
    expect(out).not.toMatch(/https?:|@|\.com/);
    expect(out.endsWith('Condition: Pre-owned.')).toBe(true);
  });

  it('adds a card sentence when the card relation is loaded', () => {
    expect(buildEtsyConditionLine({ card: { grader: 'PSA', grade: '10' } })).toBe('Graded by PSA, grade 10.');
    expect(buildEtsyConditionLine({ card: { conditionCode: 'NM' } })).toBe('Card condition: Near Mint.');
    expect(buildEtsyConditionLine({ condition: 'USED', card: { conditionCode: 'LP' } })).toBe(
      'Condition: Pre-owned. Card condition: Lightly Played.'
    );
    expect(buildEtsyConditionLine({ card: { conditionCode: 'ZZ' } })).toBe('');
    expect(ETSY_CARD_CONDITION_LABELS).toEqual({
      NM: 'Near Mint',
      LP: 'Lightly Played',
      MP: 'Moderately Played',
      HP: 'Heavily Played',
      DMG: 'Damaged',
    });
  });
});

describe('computeEtsyQuantity', () => {
  it('is 1 when stockTotal is null, undefined, 0 or 1', () => {
    expect(computeEtsyQuantity({ stockTotal: null })).toBe(1);
    expect(computeEtsyQuantity({})).toBe(1);
    expect(computeEtsyQuantity({ stockTotal: 0 })).toBe(1);
    expect(computeEtsyQuantity({ stockTotal: 1, stockSold: 0 })).toBe(1);
  });

  it('is stockTotal minus stockSold when stockTotal is above 1', () => {
    expect(computeEtsyQuantity({ stockTotal: 5, stockSold: 2 })).toBe(3);
    expect(computeEtsyQuantity({ stockTotal: 5 })).toBe(5);
    expect(computeEtsyQuantity({ stockTotal: 5, stockSold: null })).toBe(5);
  });

  it('is 0 when everything is sold, never negative', () => {
    expect(computeEtsyQuantity({ stockTotal: 5, stockSold: 5 })).toBe(0);
    expect(computeEtsyQuantity({ stockTotal: 5, stockSold: 9 })).toBe(0);
  });

  it('is capped at the quantity constant', () => {
    expect(computeEtsyQuantity({ stockTotal: 5000, stockSold: 0 })).toBe(ETSY_MAX_QUANTITY);
  });

  it('never reads Item.quantity (the "set of N" lot size)', () => {
    const withLot: any = { stockTotal: 5, stockSold: 2, quantity: 8 };
    expect(computeEtsyQuantity(withLot)).toBe(3);
    const single: any = { stockTotal: null, quantity: 8 };
    expect(computeEtsyQuantity(single)).toBe(1);
  });
});

function baseItem(overrides: Partial<EtsyDraftItemInput> = {}): EtsyDraftItemInput {
  return {
    title: 'Vintage Fenton Vase',
    price: 24.5,
    description: 'Hand painted.',
    condition: 'USED',
    conditionGrade: 'B',
    tags: ['glass', 'vase'],
    material: 'Glass',
    stockTotal: 1,
    stockSold: 0,
    packageWeightOz: 24,
    packageLengthIn: { toString: () => '6.50' },
    packageWidthIn: { toString: () => '4.00' },
    packageHeightIn: { toString: () => '3.00' },
    ...overrides,
  };
}

const goodAttestation: EtsyDraftAttestation = { whenMade: '1960s', isSupply: false, taxonomyId: 1234 };

describe('buildEtsyDraftPayload', () => {
  it('builds the full urlencoded string payload', () => {
    const r = buildEtsyDraftPayload(baseItem(), goodAttestation, {
      shippingProfileId: 111,
      returnPolicyId: '222',
      readinessStateId: BigInt(333),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).toEqual({
      quantity: '1',
      title: 'Vintage Fenton Vase',
      description: 'Hand painted.\n\nCondition: Pre-owned. Grade: B (Good).',
      price: '24.50',
      who_made: 'someone_else',
      when_made: '1960s',
      taxonomy_id: '1234',
      is_supply: 'false',
      type: 'physical',
      should_auto_renew: 'false',
      shipping_profile_id: '111',
      return_policy_id: '222',
      readiness_state_id: '333',
      tags: 'glass,vase',
      materials: 'Glass',
      item_weight: '24',
      item_weight_unit: 'oz',
      item_length: '6.5',
      item_width: '4',
      item_height: '3',
      item_dimensions_unit: 'in',
    });
    for (const v of Object.values(r.fields)) expect(typeof v).toBe('string');
    expect(r.body.split('&')).toHaveLength(Object.keys(r.fields).length);
    expect(r.body).toContain('type=physical');
    expect(r.body).toContain('should_auto_renew=false');
    expect(r.body).toContain('who_made=someone_else');
    expect(r.body).toContain('description=Hand%20painted.%0A%0ACondition');
  });

  it('omits nulls: a minimal item only sends the required fields plus the constants', () => {
    const r = buildEtsyDraftPayload({ title: 'Plain Cup', price: 5 }, goodAttestation);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.fields).sort()).toEqual(
      [
        'quantity', 'title', 'description', 'price', 'who_made', 'when_made', 'taxonomy_id',
        'is_supply', 'type', 'should_auto_renew',
      ].sort()
    );
    // Required description falls back to the title when there is nothing else to say.
    expect(r.fields.description).toBe('Plain Cup');
    expect(r.body).not.toMatch(/null|undefined/);
  });

  it('sends dimensions only when all three are above 0, and weight only when above 0', () => {
    const two = buildEtsyDraftPayload(baseItem({ packageHeightIn: null, packageWeightOz: 0 }), goodAttestation);
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(two.fields).not.toHaveProperty('item_length');
    expect(two.fields).not.toHaveProperty('item_dimensions_unit');
    expect(two.fields).not.toHaveProperty('item_weight');
    expect(two.fields).not.toHaveProperty('item_weight_unit');
  });

  it('always sends type=physical, should_auto_renew=false and who_made=someone_else', () => {
    const r = buildEtsyDraftPayload(baseItem(), { whenMade: '2020_2026', isSupply: true, taxonomyId: '77' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.type).toBe('physical');
    expect(r.fields.should_auto_renew).toBe('false');
    expect(r.fields.who_made).toBe('someone_else');
    expect(r.fields.is_supply).toBe('true');
    expect(r.fields.when_made).toBe('2020_2026');
  });

  it('takes quantity from stockTotal minus stockSold, never from Item.quantity', () => {
    const item: any = baseItem({ stockTotal: 5, stockSold: 2 });
    item.quantity = 8;
    const r = buildEtsyDraftPayload(item, goodAttestation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.quantity).toBe('3');
  });

  it('formats price in dollars with two decimals', () => {
    const fmt = (price: number) => {
      const r = buildEtsyDraftPayload(baseItem({ price }), goodAttestation);
      return r.ok ? r.fields.price : null;
    };
    expect(fmt(10)).toBe('10.00');
    expect(fmt(0.1 + 0.2)).toBe('0.30');
    expect(fmt(1234.5)).toBe('1234.50');
  });

  it('splits Item.material on commas and semicolons into separate materials', () => {
    const r = buildEtsyDraftPayload(baseItem({ material: 'Cotton, wool; Brass' }), goodAttestation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.materials).toBe('Cotton,wool,Brass');
  });

  it('sanitizes the title inside the payload', () => {
    const r = buildEtsyDraftPayload(baseItem({ title: 'Vase 🌸 A&B&C' }), goodAttestation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.title).toBe('Vase A&B C');
  });

  it('ignores invalid shop setting ids', () => {
    const r = buildEtsyDraftPayload(baseItem(), goodAttestation, {
      shippingProfileId: 'abc',
      returnPolicyId: 0,
      readinessStateId: '12.5',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).not.toHaveProperty('shipping_profile_id');
    expect(r.fields).not.toHaveProperty('return_policy_id');
    expect(r.fields).not.toHaveProperty('readiness_state_id');
  });

  describe('blocking problems', () => {
    const problemCodes = (item: EtsyDraftItemInput, attestation = goodAttestation) => {
      const r = buildEtsyDraftPayload(item, attestation);
      return r.ok ? [] : r.problems.map((p) => p.code);
    };

    it('an empty or all-disallowed title blocks', () => {
      expect(problemCodes(baseItem({ title: '🌸' }))).toEqual(['TITLE_EMPTY']);
      expect(problemCodes(baseItem({ title: null }))).toEqual(['TITLE_EMPTY']);
    });

    it('a null, zero, negative or NaN price blocks', () => {
      for (const price of [null, 0, -1, Number.NaN]) {
        expect(problemCodes(baseItem({ price }))).toEqual(['PRICE_MISSING']);
      }
    });

    it('a fully sold multi-unit item blocks', () => {
      expect(problemCodes(baseItem({ stockTotal: 3, stockSold: 3 }))).toEqual(['QUANTITY_ZERO']);
    });

    it('an invalid era blocks', () => {
      expect(problemCodes(baseItem(), { ...goodAttestation, whenMade: 'bogus' })).toEqual(['WHEN_MADE_INVALID']);
      expect(problemCodes(baseItem(), { ...goodAttestation, whenMade: null })).toEqual(['WHEN_MADE_INVALID']);
    });

    it('a missing or invalid taxonomy id blocks', () => {
      for (const taxonomyId of [null, undefined, 0, 'abc', '12.5']) {
        expect(problemCodes(baseItem(), { ...goodAttestation, taxonomyId })).toEqual(['TAXONOMY_MISSING']);
      }
    });

    it('reports every problem at once, in a fixed order, with the fixed messages', () => {
      const r = buildEtsyDraftPayload(
        baseItem({ title: '', price: null, stockTotal: 2, stockSold: 2 }),
        { whenMade: null, isSupply: false, taxonomyId: null }
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.problems.map((p) => p.code)).toEqual([
        'TITLE_EMPTY', 'PRICE_MISSING', 'QUANTITY_ZERO', 'WHEN_MADE_INVALID', 'TAXONOMY_MISSING',
      ]);
      for (const p of r.problems) expect(p.message).toBe(ETSY_PAYLOAD_PROBLEM_MESSAGES[p.code]);
    });
  });
});

describe('encodeEtsyForm', () => {
  it('percent-encodes keys and values', () => {
    expect(encodeEtsyForm({ a: 'x y', 'b c': '1&2=3' })).toBe('a=x%20y&b%20c=1%262%3D3');
    expect(encodeEtsyForm({})).toBe('');
  });
});

describe('Etsy mapping copy lint', () => {
  const strings: string[] = [
    ...Object.values(ETSY_PAYLOAD_PROBLEM_MESSAGES),
    ...Object.values(ETSY_CONDITION_LABELS),
    ...Object.values(ETSY_GRADE_LABELS),
    ...Object.values(ETSY_CARD_CONDITION_LABELS),
    buildEtsyDescription({ description: 'Hand painted.', condition: 'USED', conditionGrade: 'A', card: { grader: 'PSA', grade: '10' } }),
    buildEtsyDescription({ condition: 'REFURBISHED', card: { conditionCode: 'NM' } }),
  ];

  it('scans a non-trivial set of strings', () => {
    expect(strings.length).toBeGreaterThan(15);
  });

  it.each(strings.map((s, i) => [i, s] as [number, string]))('string %i has no banned copy', (_i, text) => {
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/estate sale/i);
    expect(text).not.toMatch(/finda/i);
    expect(text).not.toMatch(/founder/i);
  });
});
