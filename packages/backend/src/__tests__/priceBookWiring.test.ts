/**
 * ADR-140 B9 wiring: index.ts mounts the price book router, gives the import path its own 2 MB JSON parser
 * BEFORE the global 1 MB parser, and the router file keeps the flag gate on every route but GET /status.
 * Reads source as text (the app cannot be imported in a unit test: it boots sockets, crons and the database).
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string): string => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const indexSrc = read('index.ts');
const routeSrc = read('routes/priceBook.ts');

function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => {
    const t = l.trimStart();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}
function codeAt(src: string, needle: string): number {
  let offset = 0;
  for (const line of src.split('\n')) {
    if (!line.trimStart().startsWith('//') && line.includes(needle)) return offset + line.indexOf(needle);
    offset += line.length + 1;
  }
  return -1;
}

describe('index.ts price book wiring (AT-32)', () => {
  it('imports the router once and mounts it once at /api/price-book', () => {
    expect(codeLines(indexSrc).filter((l) => l.includes("import priceBookRoutes from './routes/priceBook'")).length).toBe(1);
    expect(codeLines(indexSrc).filter((l) => l.includes("app.use('/api/price-book', priceBookRoutes);")).length).toBe(1);
  });

  it('mounts next to the bulk lots routes, after the global JSON parser', () => {
    const bulk = codeAt(indexSrc, "app.use('/api/bulk-lots', bulkLotRoutes);");
    const book = codeAt(indexSrc, "app.use('/api/price-book', priceBookRoutes);");
    const json = codeAt(indexSrc, 'app.use(express.json(');
    expect(bulk).toBeGreaterThan(0);
    expect(book).toBeGreaterThan(bulk);
    expect(book).toBeGreaterThan(json);
  });

  it('gives the import path a 2 MB JSON parser that comes before the global parser', () => {
    const own = codeAt(indexSrc, "app.use('/api/price-book/references/import', express.json({ limit: '2mb' }));");
    const json = codeAt(indexSrc, 'app.use(express.json(');
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(json);
  });

  it('names the flag next to the mount and never reads it at import time in index.ts', () => {
    expect(indexSrc).toContain('CARD_PRICE_BOOK_ENABLED');
    expect(codeLines(indexSrc).some((l) => l.includes('process.env.CARD_PRICE_BOOK_ENABLED'))).toBe(false);
  });
});

describe('routes/priceBook.ts gate (AT-32)', () => {
  const routeLines = codeLines(routeSrc).filter((l) => /router\.(get|post|put|patch|delete)\(/.test(l));

  it('declares routes', () => {
    expect(routeLines.length).toBeGreaterThanOrEqual(30);
  });

  it('puts the flag gate before authentication on every route except GET /status', () => {
    for (const line of routeLines) {
      if (line.includes("'/status'")) {
        expect(line.includes('flagGate')).toBe(false);
      } else {
        expect(line).toContain('flagGate');
        expect(line.indexOf('flagGate')).toBeLessThan(line.indexOf('authenticate'));
      }
    }
  });

  it('uses no tier gate', () => {
    expect(codeLines(routeSrc).some((l) => l.includes('requireTier'))).toBe(false);
  });
});
