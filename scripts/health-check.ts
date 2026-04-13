#!/usr/bin/env npx tsx
/**
 * FindA.Sale Health Check — Sprint T1
 * Run: npx tsx scripts/health-check.ts
 *
 * Checks beyond stress-test.js:
 *  1. Dead routes     — imported controller functions that don't exist as exports
 *  2. Console.log     — unguarded console.log in all controllers
 *  3. Schema drift    — Prisma models missing from migration SQL
 *  4. Stale doc refs  — STATE.md file paths that don't exist on disk
 *  5. Orphaned migs   — migration dirs with empty/minimal SQL
 *  6. Auth coverage   — POST/PUT/DELETE routes missing authenticate
 *  7. TODO/FIXME      — markers left in controllers
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
let warned = 0;
const issues: { level: 'ERROR' | 'WARN'; label: string; detail: string }[] = [];

function check(label: string, fn: () => true | string, level: 'ERROR' | 'WARN' = 'ERROR') {
  try {
    const result = fn();
    if (result === true) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      const icon = level === 'WARN' ? '⚠️ ' : '  ❌';
      console.log(`${icon} ${label}: ${result}`);
      issues.push({ level, label, detail: result });
      level === 'WARN' ? warned++ : failed++;
    }
  } catch (e: any) {
    console.log(`  ❌ ${label}: ${e.message}`);
    issues.push({ level: 'ERROR', label, detail: e.message });
    failed++;
  }
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}
function exists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}
function listDir(relPath: string): string[] {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readdirSync(full) : [];
}

// ─── 1. Dead Route Detection ──────────────────────────────────────────────────
console.log('\n🛣️  Dead Route Detection');

const routeDir = path.join(ROOT, 'packages/backend/src/routes');
const controllerDir = path.join(ROOT, 'packages/backend/src/controllers');

const routeFiles = listDir('packages/backend/src/routes').filter(f => f.endsWith('.ts'));

for (const routeFile of routeFiles) {
  const content = fs.readFileSync(path.join(routeDir, routeFile), 'utf8');

  // Match: import { fn1, fn2 } from '../controllers/someController'
  const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/controllers\/(\w+)['"]/);
  if (!importMatch) continue;

  const importedFns = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  const controllerFile = importMatch[2] + '.ts';
  const controllerPath = path.join(controllerDir, controllerFile);

  if (!fs.existsSync(controllerPath)) {
    check(`${routeFile}: controller ${controllerFile} exists`, () => `Controller file not found`);
    continue;
  }

  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  const missingExports = importedFns.filter(fn => {
    // Check for export const fn or export async function fn or export function fn
    return !new RegExp(`export\\s+(const|async\\s+function|function)\\s+${fn}\\b`).test(controllerContent);
  });

  check(
    `${routeFile}: all imported controller functions exported`,
    () => missingExports.length === 0 || `Missing exports: ${missingExports.join(', ')} in ${controllerFile}`
  );
}

// ─── 2. Console.log Stubs in Controllers ──────────────────────────────────────
console.log('\n🪵  Console.log Stubs in Controllers');

const controllerFiles = listDir('packages/backend/src/controllers').filter(f => f.endsWith('.ts'));

for (const ctrlFile of controllerFiles) {
  const content = fs.readFileSync(path.join(controllerDir, ctrlFile), 'utf8');
  const lines = content.split('\n');

  const unguardedLogs: string[] = [];
  let inCatchBlock = false;
  let braceDepth = 0;
  let catchBraceDepth = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('} catch')) { inCatchBlock = true; catchBraceDepth = braceDepth; }
    braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (inCatchBlock && braceDepth <= catchBraceDepth) { inCatchBlock = false; }

    if (line.includes('console.log') && !inCatchBlock) {
      // Allow: initialisation logs (✅ ⚠️ ❌), NODE_ENV guards, and the initTwilio pattern
      const isAllowed =
        line.includes('✅') || line.includes('⚠️') || line.includes('❌') ||
        line.includes('NODE_ENV') || line.includes('process.env.NODE_ENV');
      if (!isAllowed) {
        unguardedLogs.push(`L${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    }
  }

  check(
    `${ctrlFile}: no unguarded console.log stubs`,
    () => unguardedLogs.length === 0 || unguardedLogs.slice(0, 3).join(' | '),
    'WARN'
  );
}

// ─── 3. Schema Drift: Models vs Migrations ────────────────────────────────────
console.log('\n📋 Schema Drift: Models vs Migrations');

const schemaContent = readFile('packages/database/prisma/schema.prisma');
const modelNames: string[] = [];
const modelRegex = /^model\s+(\w+)\s*\{/gm;
let match;
while ((match = modelRegex.exec(schemaContent)) !== null) {
  modelNames.push(match[1]);
}

// Collect all migration SQL content
const migDir = path.join(ROOT, 'packages/database/prisma/migrations');
let allMigrationSQL = '';
if (fs.existsSync(migDir)) {
  const migFolders = fs.readdirSync(migDir).filter(d =>
    fs.statSync(path.join(migDir, d)).isDirectory()
  );
  for (const folder of migFolders) {
    const sqlPath = path.join(migDir, folder, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      allMigrationSQL += fs.readFileSync(sqlPath, 'utf8').toUpperCase();
    }
  }
}

for (const model of modelNames) {
  const tablePattern = new RegExp(`CREATE\\s+TABLE\\s+["']?${model.toUpperCase()}["']?`, 'i');
  const altPattern = new RegExp(`"${model}"`, 'i');
  check(
    `Model ${model} has migration`,
    () => (tablePattern.test(allMigrationSQL) || altPattern.test(allMigrationSQL)) || `No CREATE TABLE for "${model}" found in migrations`
  );
}

// ─── 4. Orphaned Migrations ───────────────────────────────────────────────────
console.log('\n🗃️  Orphaned Migrations');

if (fs.existsSync(migDir)) {
  const migFolders = fs.readdirSync(migDir).filter(d =>
    fs.statSync(path.join(migDir, d)).isDirectory()
  );

  for (const folder of migFolders) {
    const sqlPath = path.join(migDir, folder, 'migration.sql');
    check(
      `Migration ${folder}: has SQL file`,
      () => fs.existsSync(sqlPath) || 'migration.sql missing'
    );
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8').trim();
      check(
        `Migration ${folder}: non-empty SQL`,
        () => sql.length > 20 || `SQL is too short (${sql.length} chars) — possible empty migration`,
        'WARN'
      );
    }
  }
}

// ─── 5. Stale Doc References ──────────────────────────────────────────────────
console.log('\n📝 Stale Doc References');

const stateContent = readFile('claude_docs/STATE.md');
const pathPattern = /`(packages\/[^\s`]+|claude_docs\/[^\s`]+|scripts\/[^\s`]+)`/g;
const referencedPaths = new Set<string>();
let pathMatch;
while ((pathMatch = pathPattern.exec(stateContent)) !== null) {
  referencedPaths.add(pathMatch[1]);
}

for (const refPath of referencedPaths) {
  if (refPath.endsWith('/') || refPath.includes('*')) continue;
  if (!refPath.includes('.')) continue;
  check(
    `STATE.md ref: ${refPath}`,
    () => exists(refPath) || `Referenced file not found on disk`,
    'WARN'
  );
}

// ─── 6. Auth Coverage on Mutation Routes ──────────────────────────────────────
console.log('\n🔒 Auth Coverage on Mutation Routes');

for (const routeFile of routeFiles) {
  const content = fs.readFileSync(path.join(routeDir, routeFile), 'utf8');
  const lines = content.split('\n');

  const mutationPattern = /router\.(post|put|patch|delete)\s*\(/i;
  const authPattern = /authenticate/;
  const publicExceptions = [
    'track-scan', 'calendar.ics', 'contact', 'auth', 'webhook',
    'geocode', 'upload'
  ];

  const isExempt = publicExceptions.some(ex => routeFile.includes(ex));
  if (isExempt) continue;

  const unprotectedMutations: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (mutationPattern.test(line) && !authPattern.test(line)) {
      const context = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
      if (!authPattern.test(context)) {
        unprotectedMutations.push(`L${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    }
  }

  check(
    `${routeFile}: all mutations protected by authenticate`,
    () => unprotectedMutations.length === 0 || unprotectedMutations.slice(0, 2).join(' | ')
  );
}

// ─── 7. TODO/FIXME in Controllers ────────────────────────────────────────────
console.log('\n📌 TODO / FIXME Markers in Controllers');

const allTodos: string[] = [];
for (const ctrlFile of controllerFiles) {
  const content = fs.readFileSync(path.join(controllerDir, ctrlFile), 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/TODO|FIXME/i.test(lines[i])) {
      allTodos.push(`${ctrlFile}:L${i + 1}: ${lines[i].trim().slice(0, 80)}`);
    }
  }
}

check(
  'No TODO/FIXME markers in controllers',
  () => allTodos.length === 0 || allTodos.slice(0, 5).join('\n     '),
  'WARN'
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} errors, ${warned} warnings\n`);

if (issues.length > 0) {
  const errors = issues.filter(i => i.level === 'ERROR');
  const warnings = issues.filter(i => i.level === 'WARN');

  if (errors.length > 0) {
    console.log('🚨 Errors (must fix before deploy):');
    errors.forEach(({ label, detail }) => console.log(`   • ${label}: ${detail}`));
    console.log('');
  }
  if (warnings.length > 0) {
    console.log('⚠️  Warnings (should fix before launch):');
    warnings.forEach(({ label, detail }) => console.log(`   • ${label}: ${detail}`));
    console.log('');
  }
}

// Write JSON report to health-reports/
const reportDate = new Date().toISOString().split('T')[0];
const reportPath = path.join(ROOT, `claude_docs/health-reports/${reportDate}-health-check.json`);
try {
  fs.writeFileSync(reportPath, JSON.stringify({
    date: new Date().toISOString(),
    passed,
    failed,
    warned,
    issues,
  }, null, 2));
  console.log(`📄 Report saved: claude_docs/health-reports/${reportDate}-health-check.json\n`);
} catch {
  // Non-fatal if report dir doesn't exist
}

if (failed > 0) {
  console.log(`❌ ${failed} error(s) found. Fix before deploying.\n`);
  process.exit(1);
} else {
  console.log('✅ No errors. Codebase is healthy.\n');
  process.exit(0);
}
