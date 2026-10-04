/**
 * ADR-135 D5.2 / batch B1 acceptance item 8: the one-door boundary.
 *
 * Only services/marketplace/etsyHttp.ts and the existing pricing adapter
 * (services/pricingEngine/adapters/etsy.ts, left unchanged until decision D-1) may mention the Etsy
 * API hosts anywhere under packages/backend/src. Test files (any __tests__ directory) are excluded
 * because they necessarily quote the hosts; they never make network calls.
 *
 * If this test fails because a new file quotes a host, route the call through etsyRequest /
 * etsyTokenRequest and refer to the host by name only in prose elsewhere.
 */

import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..'); // .../packages/backend/src
const ALLOWED = new Set(['services/marketplace/etsyHttp.ts', 'services/pricingEngine/adapters/etsy.ts']);
const ETSY_API_HOSTS = /openapi\.etsy\.com|api\.etsy\.com/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(entry.name) && !/\.test\.(ts|tsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('etsyHttp boundary (acceptance 8)', () => {
  const files = walk(SRC_ROOT).map((f) => ({ rel: path.relative(SRC_ROOT, f).split(path.sep).join('/'), full: f }));

  it('scans the real source tree (not vacuous)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.rel === 'services/marketplace/etsyHttp.ts')).toBe(true);
  });

  it('keeps both allowed files as the only mentions, and both really do mention a host', () => {
    for (const rel of ALLOWED) {
      const file = files.find((f) => f.rel === rel);
      expect(file).toBeDefined();
      expect(ETSY_API_HOSTS.test(fs.readFileSync(file!.full, 'utf8'))).toBe(true);
    }
  });

  it('finds no other source file that mentions an Etsy API host', () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(f.rel))
      .filter((f) => ETSY_API_HOSTS.test(fs.readFileSync(f.full, 'utf8')))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
