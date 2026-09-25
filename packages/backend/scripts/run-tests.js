#!/usr/bin/env node
/**
 * Local/CI-safe test runner (2026-09-25).
 *
 * WHY THIS EXISTS: `pnpm --filter backend test` (plain `jest`) was hitting the developer's
 * real local dev database instead of an isolated one, because packages/backend/.env's
 * DATABASE_URL points at `findasale` (the actual dev DB, with real local data in it) --
 * there is no test-specific override anywhere in the chain. Two concrete failures came from
 * this: (1) fixture helpers that create rows with a fixed id (e.g. `cashfee-shopper`) collide
 * on `Unique constraint failed` the second time the suite runs, since nothing resets the DB
 * between local runs; (2) count/behavior assertions in e2e suites like weeklyDigest.e2e.test.ts
 * are meaningless against a DB that already has hundreds of real sales in it.
 *
 * CI (.github/workflows/ci-typecheck.yml) never hits this because its "Backend tests" step
 * sets DATABASE_URL to a disposable `findasale_test` database (created fresh every run) and
 * SOCIAL_TOKEN_ENC_KEY to a documented throwaway (non-secret) value, as step-level env vars.
 * This script gives local runs the same defaults WITHOUT ever touching the real dev DB or
 * .env: it only fills in a value when one isn't already present in the environment, so:
 *
 *   - On CI, both vars are already set before this runs -> the `||` below is a no-op ->
 *     behavior is unchanged.
 *   - Locally, with neither set, this defaults to `findasale_test` (a separate database from
 *     the real `findasale` dev DB -- see claude_docs or ask Patrick for the one-time
 *     `CREATE DATABASE` + `prisma migrate deploy` setup) and CI's documented throwaway
 *     SOCIAL_TOKEN_ENC_KEY.
 *   - Anyone who deliberately sets DATABASE_URL themselves (e.g. to point at something else
 *     on purpose) is respected -- this never overrides an already-set value.
 *
 * Plain Node + child_process, no new dependency (no cross-env) -- works identically from
 * PowerShell, bash, or CI's runner without any shell-specific env-var syntax.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://findasale:findasale@localhost:5432/findasale_test';
process.env.SOCIAL_TOKEN_ENC_KEY =
  process.env.SOCIAL_TOKEN_ENC_KEY ||
  '0000000000000000000000000000000000000000000000000000000000000000';

const { spawnSync } = require('child_process');
const jestBin = require.resolve('jest/bin/jest.js');
const result = spawnSync(process.execPath, [jestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status === null ? 1 : result.status);
