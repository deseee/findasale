#!/usr/bin/env node
/**
 * FindA.Sale Stress Test Suite
 * Checks: schema drift, dead migrations, stale docs, env consistency, route coverage
 * Run: node scripts/stress-test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const issues = [];

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}: ${result}`);
      issues.push({ label, detail: result });
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`);
    issues.push({ label, detail: e.message });
    failed++;
  }
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function fileAgeDays(relPath) {
  const stat = fs.statSync(path.join(ROOT, relPath));
  return (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
}

// ─── 1. Schema drift ──────────────────────────────────────────────────────────
console.log('\n📋 Schema Drift');

check('schema.prisma exists', () => fileExists('packages/database/prisma/schema.prisma'));

check('All Organizer reputation fields present in schema', () => {
  const schema = readFile('packages/database/prisma/schema.prisma');
  const missing = ['reputationTier', 'avgRating', 'totalReviews', 'totalSales'].filter(f => !schema.includes(f));
  return missing.length === 0 || `Missing fields: ${missing.join(', ')}`;
});

check('Review model present in schema', () => {
  const schema = readFile('packages/database/prisma/schema.prisma');
  return schema.includes('model Review') || 'Review model missing from schema';
});

check('PointsTransaction model present in schema', () => {
  const schema = readFile('packages/database/prisma/schema.prisma');
  return schema.includes('model PointsTransaction') || 'PointsTransaction model missing';
});

check('Follow model present in schema', () => {
  const schema = readFile('packages/database/prisma/schema.prisma');
  return schema.includes('model Follow') || 'Follow model missing from schema';
});

// ─── 2. Migration files ───────────────────────────────────────────────────────
console.log('\n🗃️  Migrations');

check('Migrations directory exists', () => fileExists('packages/database/prisma/migrations'));

check('At least 10 migrations exist (maturity check)', () => {
  const migDir = path.join(ROOT, 'packages/database/prisma/migrations');
  const dirs = fs.readdirSync(migDir).filter(d =>
    fs.statSync(path.join(migDir, d)).isDirectory()
  );
  return dirs.length >= 10 || `Only ${dirs.length} migrations found`;
});

check('reputationTier migration exists', () => {
  const migDir = path.join(ROOT, 'packages/database/prisma/migrations');
  const dirs = fs.readdirSync(migDir);
  return dirs.some(d => d.includes('reputation')) || 'No reputation migration found — schema may be ahead of migrations';
});

// ─── 3. Route coverage ────────────────────────────────────────────────────────
console.log('\n🛣️  Route Coverage');

const expectedRoutes = [
  'packages/backend/src/routes/auth.ts',
  'packages/backend/src/routes/sales.ts',
  'packages/backend/src/routes/items.ts',
  'packages/backend/src/routes/users.ts',
  'packages/backend/src/routes/favorites.ts',
  'packages/backend/src/routes/notifications.ts',
  'packages/backend/src/routes/push.ts',
  'packages/backend/src/routes/feed.ts',
  'packages/backend/src/routes/points.ts',
  'packages/backend/src/routes/search.ts',
  'packages/backend/src/routes/reviews.ts',
];

for (const route of expectedRoutes) {
  check(`Route file: ${path.basename(route)}`, () => fileExists(route) || `Missing: ${route}`);
}

check('All routes registered in index.ts', () => {
  const index = readFile('packages/backend/src/index.ts');
  const missing = [
    ['/api/reviews', 'reviewRoutes'],
    ['/api/points', 'pointsRoutes'],
    ['/api/search', 'searchRoutes'],
    ['/api/feed', 'feedRoutes'],
    ['/api/push', 'pushRoutes'],
  ].filter(([path]) => !index.includes(path));
  return missing.length === 0 || `Missing registrations: ${missing.map(m => m[0]).join(', ')}`;
});

// ─── 4. Environment consistency ───────────────────────────────────────────────
console.log('\n🔑 Environment');

check('Backend .env.example exists', () => fileExists('packages/backend/.env.example'));
check('Frontend .env.local.example exists', () => fileExists('packages/frontend/.env.local.example'));

check('No hardcoded secrets in backend routes', () => {
  const routeDir = path.join(ROOT, 'packages/backend/src/routes');
  const files = fs.readdirSync(routeDir).filter(f => f.endsWith('.ts'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(routeDir, file), 'utf8');
    if (/(['"`])[a-f0-9]{32,}\1/.test(content)) {
      return `Possible hardcoded secret in ${file}`;
    }
  }
  return true;
});

check('No hardcoded secrets in backend controllers', () => {
  const ctrlDir = path.join(ROOT, 'packages/backend/src/controllers');
  const files = fs.readdirSync(ctrlDir).filter(f => f.endsWith('.ts'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(ctrlDir, file), 'utf8');
    if (/(['"`])[a-f0-9]{32,}\1/.test(content)) {
      return `Possible hardcoded secret in ${file}`;
    }
  }
  return true;
});

// ─── 5. Documentation freshness ───────────────────────────────────────────────
console.log('\n📝 Documentation Freshness');

check('STATE.md exists', () => fileExists('claude_docs/STATE.md'));
check('context.md exists', () => fileExists('context.md'));
check('roadmap.md exists', () => fileExists('claude_docs/roadmap.md'));
check('CLAUDE.md exists', () => fileExists('CLAUDE.md'));

check('STATE.md updated within 7 days', () => {
  const age = fileAgeDays('claude_docs/STATE.md');
  return age <= 7 || `STATE.md is ${Math.round(age)} days old — consider refreshing`;
});

check('context.md updated within 3 days', () => {
  const age = fileAgeDays('context.md');
  return age <= 3 || `context.md is ${Math.round(age)} days old — run update-context.js`;
});

// ─── 6. Security spot-checks ──────────────────────────────────────────────────
console.log('\n🔒 Security');

check('No console.log of tokens in auth routes', () => {
  const auth = readFile('packages/backend/src/routes/auth.ts');
  const lines = auth.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('console.log') && (line.includes('token') || line.includes('resetUrl'))) {
      const prevLines = lines.slice(Math.max(0, i - 3), i).join('\n');
      if (!prevLines.includes('NODE_ENV')) {
        return `Line ${i + 1}: possible unguarded token log`;
      }
    }
  }
  return true;
});

check('Auth middleware exists', () => fileExists('packages/backend/src/middleware/auth.ts'));

check('Rate limiter applied to auth routes in index.ts', () => {
  const index = readFile('packages/backend/src/index.ts');
  return index.includes('authLimiter') || 'authLimiter not applied — brute force risk';
});

check('CORS uses allowedOrigins list', () => {
  const index = readFile('packages/backend/src/index.ts');
  return index.includes('allowedOrigins') || 'CORS is not using allowedOrigins';
});

// ─── 7. Component completeness ────────────────────────────────────────────────
console.log('\n🧩 Frontend Components');

const expectedComponents = [
  'StarRating.tsx',
  'ReviewsSection.tsx',
  'ReputationTier.tsx',
  'TierBadge.tsx',
  'PointsBadge.tsx',
  'FollowButton.tsx',
  'PhotoLightbox.tsx',
  'OnboardingModal.tsx',
  'RapidCapture.tsx',
];

for (const comp of expectedComponents) {
  check(`Component: ${comp}`, () =>
    fileExists(`packages/frontend/components/${comp}`) || `Missing component: ${comp}`
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (issues.length > 0) {
  console.log('🚨 Issues to address:');
  issues.forEach(({ label, detail }) => {
    console.log(`   • ${label}: ${detail}`);
  });
  console.log('');
}

if (failed === 0) {
  console.log('✅ All checks passed. Codebase is healthy.\n');
} else {
  console.log(`⚠️  ${failed} check(s) failed. Review issues above before deploying.\n`);
  process.exit(1);
}
