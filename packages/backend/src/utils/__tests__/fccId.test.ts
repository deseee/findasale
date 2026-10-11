/**
 * extractFccIdFromText / normalizeFccId. Fixed strings only, no network. NOT EXECUTED when written
 * (jest cannot run on the authoring device); CI is the first real run.
 */
import { extractFccIdFromText, normalizeFccId, normalizeFccIdStrict } from '../fccId';

describe('extractFccIdFromText', () => {
  it('extracts a labelled FCC ID', () => {
    expect(extractFccIdFromText('FCC ID: A3LSMG991U')).toBe('A3LSMG991U');
  });

  it('extracts from a "Contains FCC ID" label with a hyphenated 5 character grantee code', () => {
    expect(extractFccIdFromText('Contains FCC ID: 2AB7C-XYZ123')).toBe('2AB7C-XYZ123');
  });

  it('extracts from a multi-line rear label and tolerates spacing and lowercase', () => {
    const ocr = 'Model: SM-G991U\nIC: 649E-G991U\nFCC ID : a3lsmg991u\nMade in Vietnam';
    expect(extractFccIdFromText(ocr)).toBe('A3LSMG991U');
  });

  it('extracts a value wrapped onto the next line after a colon', () => {
    expect(extractFccIdFromText('FCC ID:\nBCGA2345')).toBe('BCGA2345');
  });

  it('extracts without a colon', () => {
    expect(extractFccIdFromText('FCC ID A3LSMG991U')).toBe('A3LSMG991U');
  });

  it('stops at punctuation that follows the token', () => {
    expect(extractFccIdFromText('Contains FCC ID: 2AB7C-XYZ123, IC: 1234A-5678')).toBe('2AB7C-XYZ123');
  });

  it('skips a false first candidate and returns the next valid one', () => {
    expect(extractFccIdFromText('FCC ID number: see FCC ID: A3LSMG991U')).toBe('A3LSMG991U');
  });

  it('rejects model numbers with no FCC label', () => {
    expect(extractFccIdFromText('Model SM-G991U')).toBeNull();
    expect(extractFccIdFromText('M/N: XR500 Part No. 12345')).toBeNull();
  });

  it('rejects "FCC" alone and a label with no token', () => {
    expect(extractFccIdFromText('FCC')).toBeNull();
    expect(extractFccIdFromText('This device complies with part 15 of the FCC rules.')).toBeNull();
    expect(extractFccIdFromText('FCC ID:')).toBeNull();
    expect(extractFccIdFromText('FCC ID is printed on the box')).toBeNull();
  });

  it('rejects random alphanumerics without an FCC ID label', () => {
    expect(extractFccIdFromText('A3LSMG991U')).toBeNull();
    expect(extractFccIdFromText('Serial 2AB7CXYZ123 Lot 77Q')).toBeNull();
  });

  it('rejects ISBN, UPC and EAN digits, even right after the label', () => {
    expect(extractFccIdFromText('ISBN 978-1-4197-5691-7')).toBeNull();
    expect(extractFccIdFromText('UPC 012345678905')).toBeNull();
    expect(extractFccIdFromText('FCC ID: 012345678905')).toBeNull();
  });

  it('rejects tokens that are too short, too long, or letters only', () => {
    expect(extractFccIdFromText('FCC ID: A3L12')).toBeNull();
    expect(extractFccIdFromText('FCC ID: A3L' + 'X1'.repeat(15))).toBeNull();
    expect(extractFccIdFromText('FCC ID: ABCDEFGH')).toBeNull();
  });

  it('handles empty and non-string input', () => {
    expect(extractFccIdFromText('')).toBeNull();
    expect(extractFccIdFromText(null)).toBeNull();
    expect(extractFccIdFromText(undefined)).toBeNull();
  });
});

describe('normalizeFccId', () => {
  it('trims, uppercases and strips punctuation', () => {
    expect(normalizeFccId('  a3l-smg 991u! ')).toBe('A3L-SMG991U');
  });
  it('returns null for empty or non-string input', () => {
    expect(normalizeFccId('   ')).toBeNull();
    expect(normalizeFccId(42)).toBeNull();
    expect(normalizeFccId(undefined)).toBeNull();
  });
  it('caps at 20 characters', () => {
    expect(normalizeFccId('A'.repeat(30))).toHaveLength(20);
  });
});

describe('normalizeFccIdStrict', () => {
  it('accepts well-formed IDs', () => {
    expect(normalizeFccIdStrict('a3lsmg991u')).toBe('A3LSMG991U');
    expect(normalizeFccIdStrict('2AB7C-XYZ123')).toBe('2AB7C-XYZ123');
  });
  it('rejects model-like, digit-only, letter-only, short and over-long values', () => {
    expect(normalizeFccIdStrict('12345678')).toBeNull();
    expect(normalizeFccIdStrict('ABCDEFGH')).toBeNull();
    expect(normalizeFccIdStrict('A3L12')).toBeNull();
    expect(normalizeFccIdStrict('A3L' + 'X1'.repeat(15))).toBeNull();
    expect(normalizeFccIdStrict(null)).toBeNull();
    expect(normalizeFccIdStrict('')).toBeNull();
  });
});
