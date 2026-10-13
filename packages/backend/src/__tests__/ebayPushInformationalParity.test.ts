/**
 * The informational push code list exists twice: backend (lib/ebayPushInformational.ts) and frontend
 * (lib/marketplaceImpact.ts, which cannot import backend or shared code). This test fails when they drift.
 */
import fs from 'fs';
import path from 'path';
import { INFORMATIONAL_PUSH_CODES } from '../lib/ebayPushInformational';

const FRONTEND_FILE = path.resolve(__dirname, '../../../frontend/lib/marketplaceImpact.ts');

function literalsIn(source: string, constName: string): string[] {
  const m = source.match(new RegExp('const ' + constName + '[^=]*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) throw new Error(constName + ' not found in marketplaceImpact.ts');
  return Array.from(m[1].matchAll(/'([A-Z0-9_]+)'/g)).map((x) => x[1]);
}

describe('informational push codes: backend and frontend lists are identical', () => {
  it('same codes in both places', () => {
    const src = fs.readFileSync(FRONTEND_FILE, 'utf8');
    const pkg = literalsIn(src, 'PACKAGE_DETAIL_CODES');
    const all = literalsIn(src, 'INFORMATIONAL_PUSH_CODES'); // the spread of the package codes is not a literal, so add them
    const frontend = Array.from(new Set([...pkg, ...all])).sort();
    expect(frontend.length).toBeGreaterThan(0);
    expect(frontend).toEqual([...INFORMATIONAL_PUSH_CODES].sort());
  });
});
