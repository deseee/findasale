/**
 * digestPrefs, publicDisplayName, csvSafe (2026-09-29).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
import { isOrganizerDigestEnabled, isShopperDigestEnabled } from '../digestPrefs';
import { firstNameLastInitial, hasOptedIntoPublicName, publicShopperLabel } from '../publicDisplayName';
import { csvCell } from '../csvSafe';

describe('isOrganizerDigestEnabled', () => {
  it('defaults to on', () => {
    expect(isOrganizerDigestEnabled(null)).toBe(true);
    expect(isOrganizerDigestEnabled(undefined)).toBe(true);
    expect(isOrganizerDigestEnabled({})).toBe(true);
    expect(isOrganizerDigestEnabled('garbage')).toBe(true);
  });
  it('the new key decides when it is set, regardless of the old key', () => {
    expect(isOrganizerDigestEnabled({ emailWeeklyOrganizerDigest: false, emailWeeklyDigest: true })).toBe(false);
    expect(isOrganizerDigestEnabled({ emailWeeklyOrganizerDigest: true, emailWeeklyDigest: false })).toBe(true);
  });
  it('falls back to the old shared key so nobody silently loses or regains emails', () => {
    expect(isOrganizerDigestEnabled({ emailWeeklyDigest: false })).toBe(false);
    expect(isOrganizerDigestEnabled({ emailWeeklyDigest: true })).toBe(true);
  });
  it('a non-boolean new key is ignored', () => {
    expect(isOrganizerDigestEnabled({ emailWeeklyOrganizerDigest: 'no', emailWeeklyDigest: false })).toBe(false);
  });
});

describe('isShopperDigestEnabled', () => {
  it('is unaffected by the organizer key', () => {
    expect(isShopperDigestEnabled({ emailWeeklyOrganizerDigest: false })).toBe(true);
    expect(isShopperDigestEnabled({ emailWeeklyDigest: false })).toBe(false);
  });
});

describe('firstNameLastInitial', () => {
  it.each([
    ['Jane Doe', 'Jane D.'],
    ['  jane   van der berg ', 'jane B.'],
    ['Jane', 'Jane'],
    ['Zoë Étienne', 'Zoë É.'],
  ])('%s -> %s', (input, expected) => {
    expect(firstNameLastInitial(input)).toBe(expected);
  });
  it.each([[''], [null], [undefined], ['jane@example.com'], ['   ']])('%p -> null', (input) => {
    expect(firstNameLastInitial(input as any)).toBeNull();
  });
  it('never returns more than the first name and one letter', () => {
    const out = firstNameLastInitial('Alexander Hamilton-Montgomery')!;
    expect(out).toBe('Alexander H.');
  });
});

describe('opt-in public label', () => {
  it('is Someone unless the shopper explicitly opted in', () => {
    expect(publicShopperLabel('Jane Doe', null)).toBe('Someone');
    expect(publicShopperLabel('Jane Doe', {})).toBe('Someone');
    expect(publicShopperLabel('Jane Doe', { showNameInGoingList: false })).toBe('Someone');
    expect(publicShopperLabel('Jane Doe', { showNameInGoingList: 'true' })).toBe('Someone');
  });
  it('is first name + last initial when opted in', () => {
    expect(publicShopperLabel('Jane Doe', { showNameInGoingList: true })).toBe('Jane D.');
    expect(hasOptedIntoPublicName({ showNameInGoingList: true })).toBe(true);
  });
  it('opted in but no usable name is still Someone', () => {
    expect(publicShopperLabel(null, { showNameInGoingList: true })).toBe('Someone');
    expect(publicShopperLabel('a@b.com', { showNameInGoingList: true })).toBe('Someone');
  });
});

describe('csvCell', () => {
  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['\t=1', "'\t=1"],
    ['  =1', "'  =1"],
  ])('neutralizes formula text %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
  it('quotes and escapes after neutralizing', () => {
    expect(csvCell('=HYPERLINK("http://x","y"),z')).toBe('"\'=HYPERLINK(""http://x"",""y""),z"');
  });
  it('leaves ordinary text, numbers and empties alone', () => {
    expect(csvCell('Oak table')).toBe('Oak table');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });
});
