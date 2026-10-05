/**
 * The eBay condition note (conditionDescription) is correct for every canonical condition, and the first publish,
 * the edit-sync push and the re-analyze sync all use the one builder in utils/conditionMapping.ts.
 *   NEW -> "New", no grade; REFURBISHED -> "Refurbished", no grade text; PARTS_OR_REPAIR -> "For parts or repair";
 *   USED + grade A-D -> the existing grade lines (S reads as A); USED with no grade -> no line.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ebayConditionLine, buildEbayConditionDescription, ebayDescriptionGradeLine } from '../utils/conditionMapping';

const GRADES: Array<string | null> = [null, 'S', 'A', 'B', 'C', 'D'];
const EM_DASH = String.fromCharCode(8212);
const base = { description: null, conditionNotes: null, tags: [] as string[] };

describe('ebayConditionLine', () => {
  it('NEW is "New" for every grade, never a grade line', () => {
    for (const g of GRADES) expect(ebayConditionLine('NEW', g)).toBe('New');
  });

  it('REFURBISHED is "Refurbished" for every grade, never a grade line', () => {
    for (const g of GRADES) {
      const line = ebayConditionLine('REFURBISHED', g) as string;
      expect(line).toBe('Refurbished');
      expect(line).not.toMatch(/Grade|Good|Excellent|Acceptable|Very good/);
    }
  });

  it('PARTS_OR_REPAIR is "For parts or repair" for every grade', () => {
    for (const g of GRADES) expect(ebayConditionLine('PARTS_OR_REPAIR', g)).toBe('For parts or repair');
  });

  it('USED + grade keeps the existing grade lines byte for byte (S reads as A)', () => {
    expect(ebayConditionLine('USED', 'A')).toBe('Grade A: Excellent condition');
    expect(ebayConditionLine('USED', 'B')).toBe('Grade B: Very good condition');
    expect(ebayConditionLine('USED', 'C')).toBe('Grade C: Good condition');
    expect(ebayConditionLine('USED', 'D')).toBe('Grade D: Acceptable condition');
    expect(ebayConditionLine('USED', 'S')).toBe('Grade A: Excellent condition');
    for (const g of ['S', 'A', 'B', 'C', 'D']) expect(ebayConditionLine('USED', g)).toBe(ebayDescriptionGradeLine(g));
  });

  it('USED with no grade has no line', () => {
    expect(ebayConditionLine('USED', null)).toBeUndefined();
    expect(ebayConditionLine('USED', undefined)).toBeUndefined();
    expect(ebayConditionLine('USED', '')).toBeUndefined();
  });

  it('no condition is read as used goods: by grade, or no line', () => {
    expect(ebayConditionLine(null, 'C')).toBe('Grade C: Good condition');
    expect(ebayConditionLine(null, null)).toBeUndefined();
  });

  it('legacy condition words: LIKE_NEW with no grade reads as grade A (same hint as the eBay enum), GOOD is used', () => {
    expect(ebayConditionLine('LIKE_NEW', null)).toBe('Grade A: Excellent condition');
    expect(ebayConditionLine('LIKE_NEW', 'D')).toBe('Grade D: Acceptable condition');
    expect(ebayConditionLine('GOOD', 'B')).toBe('Grade B: Very good condition');
    expect(ebayConditionLine('SELLER_REFURBISHED', 'C')).toBe('Refurbished');
    expect(ebayConditionLine('FOR_PARTS', 'C')).toBe('For parts or repair');
  });

  it('wording rules: no em dash, no "AI"', () => {
    for (const c of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']) {
      for (const g of GRADES) {
        const line = ebayConditionLine(c, g);
        if (line === undefined) continue;
        expect(line).not.toContain(EM_DASH);
        expect(line).not.toMatch(/\bAI\b/);
      }
    }
  });
});

describe('buildEbayConditionDescription', () => {
  it('REFURBISHED + grade C no longer says "Grade C" (the live QA finding)', () => {
    const out = buildEbayConditionDescription({ ...base, condition: 'REFURBISHED', conditionGrade: 'C', conditionNotes: 'New battery' }) as string;
    expect(out).toBe('Refurbished\n\nNew battery');
    expect(out).not.toMatch(/Grade C/);
    expect(out).not.toMatch(/Good condition/);
  });

  it('USED + grade C is unchanged: grade line, notes, description slice, notable tags', () => {
    const out = buildEbayConditionDescription({
      condition: 'USED',
      conditionGrade: 'C',
      conditionNotes: 'Small scratch',
      description: '<p>Brass   lamp</p>',
      tags: ['vintage', 'lamp', 'Signed'],
    });
    expect(out).toBe('Grade C: Good condition\n\nSmall scratch\n\nBrass   lamp\n\nNotes: vintage, Signed');
  });

  it('PARTS_OR_REPAIR leads with the parts line', () => {
    expect(buildEbayConditionDescription({ ...base, condition: 'PARTS_OR_REPAIR', conditionGrade: 'D', conditionNotes: 'Does not power on' }))
      .toBe('For parts or repair\n\nDoes not power on');
  });

  it('NEW and no condition send nothing (a live edit to NEW removes the old note)', () => {
    expect(buildEbayConditionDescription({ ...base, condition: 'NEW', conditionGrade: 'A', conditionNotes: 'x' })).toBeUndefined();
    expect(buildEbayConditionDescription({ ...base, condition: null, conditionGrade: 'A' })).toBeUndefined();
  });

  it('USED with no grade and nothing else sends nothing; with notes it sends only the notes', () => {
    expect(buildEbayConditionDescription({ ...base, condition: 'USED', conditionGrade: null })).toBeUndefined();
    expect(buildEbayConditionDescription({ ...base, condition: 'USED', conditionGrade: null, conditionNotes: 'Works' })).toBe('Works');
  });

  it('is capped at 1000 characters', () => {
    const out = buildEbayConditionDescription({ ...base, condition: 'USED', conditionGrade: 'B', conditionNotes: 'x'.repeat(1500) }) as string;
    expect(out).toHaveLength(1000);
  });
});

describe('every caller uses the one builder (source pins)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('first publish (ebayController) and edit-sync push and re-analyze sync all call buildEbayConditionDescription', () => {
    expect(read('controllers', 'ebayController.ts')).toContain('buildEbayConditionDescription(item)');
    expect(read('services', 'ebayItemPushService.ts')).toContain('buildEbayConditionDescription(item)');
    expect(read('services', 'reanalyzeService.ts')).toContain('buildEbayConditionDescription({');
  });

  it('no caller builds its own grade text', () => {
    for (const f of [['controllers', 'ebayController.ts'], ['services', 'ebayItemPushService.ts'], ['services', 'reanalyzeService.ts']]) {
      expect(read(...f)).not.toMatch(/Grade [A-D]:/);
    }
  });
});
