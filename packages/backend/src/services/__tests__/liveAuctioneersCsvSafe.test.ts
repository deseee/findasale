/**
 * LiveAuctioneers CSV writer: spreadsheet formula neutralisation, numbers stay numeric.
 * Prisma is a stub (only the pure generateLiveAuctioneersCsv is exercised). NOT EXECUTED when written.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { generateLiveAuctioneersCsv } from '../liveAuctioneersExportService';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  title: 'Brass lamp',
  description: 'Nice lamp',
  price: 50,
  auctionStartPrice: null,
  auctionReservePrice: null,
  condition: 'Good',
  photoUrls: ['https://res.cloudinary.com/demo/a.jpg'],
  ...over,
});

const dataRow = (csv: string) => csv.split('\n')[1];

describe('generateLiveAuctioneersCsv formula safety', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('prefixes formula-looking free text with an apostrophe', () => {
    const { csv } = generateLiveAuctioneersCsv([
      item({ title: '=HYPERLINK("http://evil","x")', description: '+cmd|calc', condition: '@SUM(A1)' }) as any,
    ]);
    const row = dataRow(csv);
    expect(row).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(row).toContain("'+cmd|calc");
    expect(row).toContain("'@SUM(A1)");
  });

  it('leaves normal text and numeric columns untouched', () => {
    const { csv } = generateLiveAuctioneersCsv([item() as any]);
    const cells = dataRow(csv).split(',');
    expect(cells[0]).toBe('1'); // LotNum
    expect(cells[1]).toBe('Brass lamp');
    expect(cells[3]).toBe('40.00'); // LowEst
    expect(cells[4]).toBe('60.00'); // HighEst
    expect(cells[5]).toBe('50.00'); // StartPrice
    expect(csv).not.toContain("'40.00");
  });

  it('still quotes commas, quotes and newlines', () => {
    const { csv } = generateLiveAuctioneersCsv([item({ description: 'a, "b"\nc' }) as any]);
    expect(csv).toContain('"a, ""b""\nc"');
  });
});
