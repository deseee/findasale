/* eslint-disable */
// Hard guard: backend jest suites must NEVER write to a production database.
// Incident 2026-10-14: DB-writing suites ran against production (42 fake organizers,
// 65 @findasale.test users). Used as BOTH jest `globalSetup` (parent process, runs once)
// and `setupFiles` (every worker, before any test module / Prisma client loads).
//
// Rules:
//  - Railway hosts (*.rlwy.net, *.railway.internal, *.railway.app) are blocked unconditionally.
//  - localhost / 127.0.0.1 / ::1 are always allowed (CI uses localhost:5432/findasale_test).
//  - Any other host is blocked unless ALLOW_REMOTE_TEST_DB=1.
//  - If DATABASE_URL / DIRECT_URL is unset, it is pinned to an unreachable local sentinel so
//    Prisma's and dotenv's .env auto-loading (they never override an already-set variable)
//    cannot pull a production URL from packages/database/.env or packages/backend/.env.
'use strict';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const RAILWAY_RE = /(^|\.)(rlwy\.net|railway\.internal|railway\.app)$/i;
const SENTINEL = 'postgresql://blocked:blocked@127.0.0.1:1/jest_blocked_no_test_database_configured';

function hostOf(url) {
  // Take everything after the LAST '@' so passwords containing special chars cannot confuse parsing.
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:.*@)?(\[[^\]]+\]|[^:/?#]+)/i.exec(String(url).trim());
  if (!m) return null;
  return m[1].replace(/^\[|\]$/g, '').toLowerCase();
}

function fail(name, host, why) {
  const lines = [
    '',
    '================ JEST DATABASE GUARD ================',
    'Refusing to run backend tests: ' + name + ' host "' + (host || 'unparseable') + '" ' + why + '.',
    'Backend tests write real rows. Point ' + name + ' at a LOCAL test database, e.g.',
    '  postgresql://findasale:findasale@localhost:5432/findasale_test',
    'Railway/production hosts can never be used for tests (ALLOW_REMOTE_TEST_DB does not override this).',
    '=====================================================',
    '',
  ];
  process.stderr.write(lines.join('\n'));
  process.exit(1);
}

function check() {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const val = process.env[name];
    if (val === undefined || val === '') {
      if (name === 'DATABASE_URL') {
        process.env[name] = SENTINEL;
        process.stderr.write('[jest-guard] DATABASE_URL not set; pinned to unreachable sentinel (DB tests will fail to connect, mocked tests unaffected).\n');
      } else {
        delete process.env[name];
      }
      continue;
    }
    const host = hostOf(val);
    if (!host) fail(name, host, 'could not be parsed');
    if (RAILWAY_RE.test(host)) fail(name, host, 'is a Railway/production host');
    if (LOCAL_HOSTS.has(host)) continue;
    if (process.env.ALLOW_REMOTE_TEST_DB === '1') {
      process.stderr.write('[jest-guard] ALLOW_REMOTE_TEST_DB=1: allowing non-local ' + name + ' host "' + host + '".\n');
      continue;
    }
    fail(name, host, 'is not localhost/127.0.0.1/::1 (set ALLOW_REMOTE_TEST_DB=1 only for a disposable non-Railway test DB)');
  }
  // Prisma schema uses DATABASE_URL for both url and directUrl; keep DIRECT_URL from leaking a different target.
}

check();
module.exports = async function globalSetup() { check(); };
