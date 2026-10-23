/**
 * authRewrites: every backend /api/auth/* route must have a beforeFiles rewrite in next.config.js.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * Why: pages/api/auth/[...nextauth].ts is a dynamic catch-all, so any /api/auth/* request that is not listed in
 * next.config.js beforeFiles goes to NextAuth and comes back as a 400, never reaching the backend. This has shipped
 * three times (register-challenge 2026-07-19, exit-impersonation 2026-09-25, socket-token 2026-10-17). This test
 * reads the backend router source and the rewrite list as text and fails when a route has no matching rewrite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONTEND = join(__dirname, '..', '..');
const BACKEND_ROUTES = join(FRONTEND, '..', 'backend', 'src', 'routes');

// Paths NextAuth itself serves under /api/auth. A backend route with one of these names could never be rewritten
// without breaking NextAuth, so it must be renamed instead.
const NEXTAUTH_PATHS = ['session', 'csrf', 'providers', 'callback', 'signin', 'signout', 'error', '_log'];

function backendRoutes(file: string, prefix: string): string[] {
  const src = readFileSync(join(BACKEND_ROUTES, file), 'utf8');
  const out: string[] = [];
  const re = /router\.(?:get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(`/api/auth${prefix}${m[1]}`);
  return out;
}

function beforeFilesSources(): RegExp[] {
  const src = readFileSync(join(FRONTEND, 'next.config.js'), 'utf8');
  const start = src.indexOf('beforeFiles:');
  const end = src.indexOf('afterFiles:', start);
  assert.ok(start > 0 && end > start, 'could not find the beforeFiles block in next.config.js');
  const block = src.slice(start, end);
  const out: RegExp[] = [];
  const re = /source:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const pattern = m[1]
      .split('/')
      .map((seg) => (/^:\w+\*$/.test(seg) ? '.*' : /^:\w+$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    out.push(new RegExp(`^${pattern}$`));
  }
  return out;
}

test('every backend /api/auth route is listed in next.config.js beforeFiles', () => {
  const routes = [...backendRoutes('auth.ts', ''), ...backendRoutes('passkey.ts', '/passkey')];
  assert.ok(routes.length >= 20, `expected the backend auth routers to define at least 20 routes, found ${routes.length}`);
  const sources = beforeFilesSources();
  const missing = routes.filter((r) => !sources.some((s) => s.test(r)));
  assert.deepEqual(missing, [], `add a beforeFiles rewrite in next.config.js for: ${missing.join(', ')}`);
});

test('the socket token and exit impersonation routes are rewritten to the backend', () => {
  const sources = beforeFilesSources();
  for (const path of ['/api/auth/socket-token', '/api/auth/exit-impersonation']) {
    assert.ok(sources.some((s) => s.test(path)), `${path} has no beforeFiles rewrite`);
  }
});

test('no beforeFiles rewrite shadows a path NextAuth needs', () => {
  const sources = beforeFilesSources();
  for (const name of NEXTAUTH_PATHS) {
    const path = `/api/auth/${name}`;
    assert.ok(!sources.some((s) => s.test(path)), `${path} belongs to NextAuth but is rewritten to the backend`);
  }
});
