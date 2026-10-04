/**
 * conditionMapping (item editor unification, Wave 1.0A, U4). NOT EXECUTED when written (jest cannot run on
 * the authoring device); CI is the first real run. Pure functions, no mocks needed.
 *
 * Contains: the unified table parity test, normalizeCondition legacy coverage, and snapshot copies of the two
 * CURRENT mappers (first push and edit-sync) so the intentional behavior changes are documented and pinned.
 * The snapshot copies below are NOT imports: the originals are module-private and must not be edited here.
 */
import {
  CANONICAL_CONDITIONS,
  CONDITION_GRADES,
  EBAY_CONDITION_ENUMS,
  desiredEbayCondition,
  normalizeCondition,
  normalizeGrade,
} from '../conditionMapping';

// ── Snapshot of ebayController.ts mapGradeToInventoryCondition (first push), as of main a15edc464 ──
function legacyFirstPush(grade: string | null | undefined, condition?: string | null): string {
  const gradeUpper = (grade || '').toUpperCase();
  if (gradeUpper === 'S' && (condition === 'USED' || condition === 'REFURBISHED')) {
    return 'USED_EXCELLENT';
  }
  switch (gradeUpper) {
    case 'S': return 'NEW';
    case 'A': return 'USED_VERY_GOOD';
    case 'B': return 'USED_VERY_GOOD';
    case 'C': return 'USED_GOOD';
    case 'D': return 'FOR_PARTS_OR_NOT_WORKING';
    default: return 'USED_GOOD';
  }
}

// ── Snapshot of itemController.ts edit-sync condMap (condition-driven, ignores grade) ──
const LEGACY_EDIT_SYNC_MAP: Record<string, string> = {
  NEW: 'NEW',
  USED: 'USED_GOOD',
  REFURBISHED: 'SELLER_REFURBISHED',
  PARTS_OR_REPAIR: 'FOR_PARTS_OR_NOT_WORKING',
};
function legacyEditSync(condition: string): string {
  return LEGACY_EDIT_SYNC_MAP[condition] ?? 'USED_GOOD';
}

type Row = [condition: string | null, grade: string | null, expected: string];

// The unified table, every (condition, grade) combination.
const UNIFIED_TABLE: Row[] = [
  // NEW: any grade
  ['NEW', null, 'NEW'],
  ['NEW', 'S', 'NEW'],
  ['NEW', 'A', 'NEW'],
  ['NEW', 'B', 'NEW'],
  ['NEW', 'C', 'NEW'],
  ['NEW', 'D', 'NEW'],
  // PARTS_OR_REPAIR: any grade
  ['PARTS_OR_REPAIR', null, 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'S', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'A', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'B', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'C', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'D', 'FOR_PARTS_OR_NOT_WORKING'],
  // REFURBISHED: any grade
  ['REFURBISHED', null, 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'S', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'A', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'B', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'C', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'D', 'SELLER_REFURBISHED'],
  // USED: by grade
  ['USED', null, 'USED_GOOD'],
  ['USED', 'S', 'USED_VERY_GOOD'],
  ['USED', 'A', 'USED_VERY_GOOD'],
  ['USED', 'B', 'USED_VERY_GOOD'],
  ['USED', 'C', 'USED_GOOD'],
  ['USED', 'D', 'USED_ACCEPTABLE'],
  // null condition: behaves like USED
  [null, null, 'USED_GOOD'],
  [null, 'S', 'USED_VERY_GOOD'],
  [null, 'A', 'USED_VERY_GOOD'],
  [null, 'B', 'USED_VERY_GOOD'],
  [null, 'C', 'USED_GOOD'],
  [null, 'D', 'USED_ACCEPTABLE'],
];

describe('constants', () => {
  it('exposes the canonical vocabularies', () => {
    expect([...CANONICAL_CONDITIONS]).toEqual(['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']);
    expect([...CONDITION_GRADES]).toEqual(['S', 'A', 'B', 'C', 'D']);
  });

  it('every table value is a listed eBay enum', () => {
    for (const [, , expected] of UNIFIED_TABLE) {
      expect((EBAY_CONDITION_ENUMS as readonly string[]).includes(expected)).toBe(true);
    }
  });
});

describe('desiredEbayCondition: unified table parity', () => {
  it('covers every (condition, grade) combination (5 conditions x 6 grades)', () => {
    expect(UNIFIED_TABLE).toHaveLength(30);
  });

  it.each(UNIFIED_TABLE)('condition %p, grade %p -> %s', (condition: string | null, grade: string | null, expected: string) => {
    expect(desiredEbayCondition(condition, grade)).toBe(expected);
  });

  it('treats an empty or whitespace grade as no grade', () => {
    expect(desiredEbayCondition('USED', '')).toBe('USED_GOOD');
    expect(desiredEbayCondition('USED', '   ')).toBe('USED_GOOD');
  });

  it('is case-insensitive and trims for both inputs', () => {
    expect(desiredEbayCondition(' used ', ' b ')).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition('new', 'd')).toBe('NEW');
    expect(desiredEbayCondition('parts_or_repair', 'a')).toBe('FOR_PARTS_OR_NOT_WORKING');
  });

  it('completely unknown or empty condition with no grade is USED_GOOD', () => {
    expect(desiredEbayCondition(undefined, undefined)).toBe('USED_GOOD');
    expect(desiredEbayCondition(null, null)).toBe('USED_GOOD');
    expect(desiredEbayCondition('', '')).toBe('USED_GOOD');
    expect(desiredEbayCondition('SOMETHING_ELSE', null)).toBe('USED_GOOD');
  });

  it('unknown condition with a grade is decided by the grade (used-goods path)', () => {
    expect(desiredEbayCondition('SOMETHING_ELSE', 'C')).toBe('USED_GOOD');
    expect(desiredEbayCondition('SOMETHING_ELSE', 'D')).toBe('USED_ACCEPTABLE');
  });

  it('ignores an unrecognized grade letter', () => {
    expect(desiredEbayCondition('USED', 'Z')).toBe('USED_GOOD');
  });

  it('accepts legacy condition strings', () => {
    expect(desiredEbayCondition('GOOD', 'C')).toBe('USED_GOOD');
    expect(desiredEbayCondition('POOR', null)).toBe('FOR_PARTS_OR_NOT_WORKING');
    expect(desiredEbayCondition('SELLER_REFURBISHED', null)).toBe('SELLER_REFURBISHED');
    expect(desiredEbayCondition('NEW_OTHER', null)).toBe('NEW');
  });

  it('legacy LIKE_NEW and EXCELLENT read as USED with hint grade A when no grade is stored', () => {
    expect(desiredEbayCondition('LIKE_NEW', null)).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition('EXCELLENT', undefined)).toBe('USED_VERY_GOOD');
  });

  it('a stored grade wins over the legacy hint grade', () => {
    expect(desiredEbayCondition('LIKE_NEW', 'C')).toBe('USED_GOOD');
    expect(desiredEbayCondition('EXCELLENT', 'D')).toBe('USED_ACCEPTABLE');
  });
});

describe('current mappers versus the unified table (documented behavior changes)', () => {
  const CONDITIONS_TESTED: Array<string | null> = [null, 'NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
  const GRADES_TESTED: Array<string | null> = [null, 'S', 'A', 'B', 'C', 'D'];

  const unified = (c: string | null, g: string | null) => desiredEbayCondition(c, g);

  it('first push (mapGradeToInventoryCondition): the exact set of cells that change', () => {
    const changed: string[] = [];
    for (const c of CONDITIONS_TESTED) {
      for (const g of GRADES_TESTED) {
        const before = legacyFirstPush(g, c);
        const after = unified(c, g);
        if (before !== after) changed.push(`${c}|${g}: ${before} -> ${after}`);
      }
    }
    expect(changed).toEqual([
      // No condition: S was NEW (the retired grade), D was FOR_PARTS
      'null|S: NEW -> USED_VERY_GOOD',
      'null|D: FOR_PARTS_OR_NOT_WORKING -> USED_ACCEPTABLE',
      // NEW items stay NEW whatever the grade (first push used to ignore the condition)
      'NEW|null: USED_GOOD -> NEW',
      'NEW|A: USED_VERY_GOOD -> NEW',
      'NEW|B: USED_VERY_GOOD -> NEW',
      'NEW|C: USED_GOOD -> NEW',
      'NEW|D: FOR_PARTS_OR_NOT_WORKING -> NEW',
      // USED: S retired (treated as A); D no longer FOR_PARTS
      'USED|S: USED_EXCELLENT -> USED_VERY_GOOD',
      'USED|D: FOR_PARTS_OR_NOT_WORKING -> USED_ACCEPTABLE',
      // REFURBISHED follows the condition field
      'REFURBISHED|null: USED_GOOD -> SELLER_REFURBISHED',
      'REFURBISHED|S: USED_EXCELLENT -> SELLER_REFURBISHED',
      'REFURBISHED|A: USED_VERY_GOOD -> SELLER_REFURBISHED',
      'REFURBISHED|B: USED_VERY_GOOD -> SELLER_REFURBISHED',
      'REFURBISHED|C: USED_GOOD -> SELLER_REFURBISHED',
      'REFURBISHED|D: FOR_PARTS_OR_NOT_WORKING -> SELLER_REFURBISHED',
      // PARTS_OR_REPAIR follows the condition field (only grade D already agreed)
      'PARTS_OR_REPAIR|null: USED_GOOD -> FOR_PARTS_OR_NOT_WORKING',
      'PARTS_OR_REPAIR|S: NEW -> FOR_PARTS_OR_NOT_WORKING',
      'PARTS_OR_REPAIR|A: USED_VERY_GOOD -> FOR_PARTS_OR_NOT_WORKING',
      'PARTS_OR_REPAIR|B: USED_VERY_GOOD -> FOR_PARTS_OR_NOT_WORKING',
      'PARTS_OR_REPAIR|C: USED_GOOD -> FOR_PARTS_OR_NOT_WORKING',
    ]);
  });

  it('first push: used goods with grades A, B, C and no grade are unchanged', () => {
    for (const [g, expected] of [
      ['A', 'USED_VERY_GOOD'],
      ['B', 'USED_VERY_GOOD'],
      ['C', 'USED_GOOD'],
      [null, 'USED_GOOD'],
    ] as Array<[string | null, string]>) {
      expect(legacyFirstPush(g, 'USED')).toBe(expected);
      expect(unified('USED', g)).toBe(expected);
    }
  });

  it('edit-sync (itemController condMap): the exact set of cells that change', () => {
    const changed: string[] = [];
    for (const c of CONDITIONS_TESTED) {
      if (c === null) continue; // the edit-sync block only runs when the item has a condition
      for (const g of GRADES_TESTED) {
        const before = legacyEditSync(c);
        const after = unified(c, g);
        if (before !== after) changed.push(`${c}|${g}: ${before} -> ${after}`);
      }
    }
    expect(changed).toEqual([
      // A and B used items were first pushed USED_VERY_GOOD then DOWNGRADED to USED_GOOD on the first edit save
      'USED|S: USED_GOOD -> USED_VERY_GOOD',
      'USED|A: USED_GOOD -> USED_VERY_GOOD',
      'USED|B: USED_GOOD -> USED_VERY_GOOD',
      // D used
      'USED|D: USED_GOOD -> USED_ACCEPTABLE',
    ]);
  });

  it('edit-sync: NEW (with any grade), REFURBISHED, PARTS_OR_REPAIR and used C or no grade are unchanged', () => {
    for (const g of GRADES_TESTED) {
      expect(unified('NEW', g)).toBe(legacyEditSync('NEW'));
      expect(unified('REFURBISHED', g)).toBe(legacyEditSync('REFURBISHED'));
      expect(unified('PARTS_OR_REPAIR', g)).toBe(legacyEditSync('PARTS_OR_REPAIR'));
    }
    expect(unified('USED', 'C')).toBe(legacyEditSync('USED'));
    expect(unified('USED', null)).toBe(legacyEditSync('USED'));
  });
});

describe('normalizeCondition', () => {
  it('leaves canonical values unchanged', () => {
    for (const c of CANONICAL_CONDITIONS) {
      expect(normalizeCondition(c)).toEqual({ condition: c, changed: false });
    }
  });

  it('is case-insensitive and trims, flagging the rewrite', () => {
    expect(normalizeCondition('used')).toEqual({ condition: 'USED', changed: true });
    expect(normalizeCondition('  New ')).toEqual({ condition: 'NEW', changed: true });
    expect(normalizeCondition('parts_or_repair')).toEqual({ condition: 'PARTS_OR_REPAIR', changed: true });
  });

  it('reads spaces and hyphens like underscores', () => {
    expect(normalizeCondition('Like New')).toEqual({ condition: 'USED', hintGrade: 'A', changed: true });
    expect(normalizeCondition('like-new')).toEqual({ condition: 'USED', hintGrade: 'A', changed: true });
    expect(normalizeCondition('For Parts')).toEqual({ condition: 'PARTS_OR_REPAIR', changed: true });
  });

  it('LIKE_NEW and EXCELLENT map to USED with hint grade A (Patrick D4)', () => {
    expect(normalizeCondition('LIKE_NEW')).toEqual({ condition: 'USED', hintGrade: 'A', changed: true });
    expect(normalizeCondition('EXCELLENT')).toEqual({ condition: 'USED', hintGrade: 'A', changed: true });
    expect(normalizeCondition('excellent')).toEqual({ condition: 'USED', hintGrade: 'A', changed: true });
  });

  it('GOOD, FAIR and USED_* map to USED without a hint', () => {
    for (const raw of ['GOOD', 'Good', 'FAIR', 'USED_GOOD', 'USED_VERY_GOOD', 'USED_ACCEPTABLE', 'USED_EXCELLENT']) {
      const result = normalizeCondition(raw);
      expect(result.condition).toBe('USED');
      expect(result.hintGrade).toBeUndefined();
      expect(result.changed).toBe(true);
    }
  });

  it('POOR, PARTS and FOR_PARTS* map to PARTS_OR_REPAIR', () => {
    for (const raw of ['POOR', 'PARTS', 'FOR_PARTS', 'FOR_PARTS_OR_NOT_WORKING', 'PARTS_OR_NOT_WORKING']) {
      expect(normalizeCondition(raw)).toEqual({ condition: 'PARTS_OR_REPAIR', changed: true });
    }
  });

  it('NEW_* maps to NEW', () => {
    for (const raw of ['NEW_OTHER', 'NEW_WITH_DEFECTS', 'new_with_tags']) {
      expect(normalizeCondition(raw)).toEqual({ condition: 'NEW', changed: true });
    }
  });

  it('REFURBISHED and SELLER_REFURBISHED map to REFURBISHED', () => {
    expect(normalizeCondition('SELLER_REFURBISHED')).toEqual({ condition: 'REFURBISHED', changed: true });
    expect(normalizeCondition('Seller Refurbished')).toEqual({ condition: 'REFURBISHED', changed: true });
    expect(normalizeCondition('refurbished')).toEqual({ condition: 'REFURBISHED', changed: true });
    expect(normalizeCondition('CERTIFIED_REFURBISHED')).toEqual({ condition: 'REFURBISHED', changed: true });
  });

  it('unknown, empty and non-string input returns condition null and changed false', () => {
    for (const raw of ['BANANA', '', '   ', 'A', 'S', null, undefined, 42, {}, []]) {
      expect(normalizeCondition(raw)).toEqual({ condition: null, changed: false });
    }
  });
});

describe('normalizeGrade', () => {
  it('accepts S, A, B, C, D in any case with surrounding whitespace', () => {
    expect(normalizeGrade('a')).toBe('A');
    expect(normalizeGrade(' s ')).toBe('S');
    for (const g of CONDITION_GRADES) expect(normalizeGrade(g)).toBe(g);
  });

  it('returns null for everything else', () => {
    for (const raw of ['', ' ', 'E', 'AA', 'NEW', null, undefined, 1]) {
      expect(normalizeGrade(raw)).toBeNull();
    }
  });
});
