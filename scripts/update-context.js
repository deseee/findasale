const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options }).trim();
  } catch (e) {
    return `[Error: ${e.message}]`;
  }
}

function commandExists(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Directories/files excluded entirely from the tree
const TREE_EXCLUDE = new Set([
  'node_modules', '.git', 'context.md', '.next', 'venv',
  'aider', 'pnpm-lock.yaml', '__pycache__', 'uploads',
  'tsconfig.tsbuildinfo', 'output.css',
]);

// Directories shown with item count but not expanded (avoids token bloat)
const TREE_COLLAPSE = new Set([
  // Build / tooling
  'migrations', '.cache', '.aider.tags.cache.v4',
  // Backend source — collapse leaf directories, keep package structure visible
  'controllers', 'routes', 'services', 'jobs', 'middleware', 'models', 'utils', 'lib',
  // Frontend source
  'components', 'pages', 'hooks', 'styles', 'types', 'context', 'contexts',
  // Frontend public assets
  'icons', 'images', 'public',
  // claude_docs subdirectories — show dir name + count, not every file
  'archive', 'beta-launch', 'brand', 'competitor-intel', 'feature-notes', 'guides',
  'health-reports', 'improvement-memos', 'logs', 'operations', 'research',
  'self-healing', 'skills-package', 'strategy', 'workflow-retrospectives',
]);

function getTree(dir = '.', prefix = '') {
  let tree = '';
  const entries = fs.readdirSync(dir).filter(f =>
    !TREE_EXCLUDE.has(f) &&
    !f.startsWith('.aider') &&
    !f.endsWith('.skill')
  );
  entries.forEach((file, index) => {
    const isLast = index === entries.length - 1;
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    const isDir = stats.isDirectory();

    if (isDir && TREE_COLLAPSE.has(file)) {
      const count = fs.readdirSync(fullPath).length;
      const label = file === 'migrations' ? 'migrations' : 'files';
      tree += `${prefix}${isLast ? '└── ' : '├── '}${file}/ (${count} ${label})\n`;
    } else {
      tree += `${prefix}${isLast ? '└── ' : '├── '}${file}${isDir ? '/' : ''}\n`;
      if (isDir) {
        tree += getTree(fullPath, `${prefix}${isLast ? '    ' : '│   '}`);
      }
    }
  });
  return tree;
}

// Git info — gracefully handle unavailable git (common in VM/Windows mount environments)
const gitEnv = { ...process.env, GIT_DISCOVERY_ACROSS_FILESYSTEM: '1' };
const rawBranch = runCmd('git branch --show-current', { env: gitEnv });
const rawCommit = runCmd('git rev-parse --short HEAD', { env: gitEnv });
const rawRemote = runCmd('git remote get-url origin', { env: gitEnv });
const gitBranch = rawBranch.startsWith('[Error') ? '(run git locally)' : rawBranch;
const gitCommit = rawCommit.startsWith('[Error') ? '(run git locally)' : rawCommit;
const gitRemote = rawRemote.startsWith('[Error') ? '(run git locally)' : rawRemote;

// File tree
const fileTree = getTree(path.join(__dirname, '..'));

// Session log — extract most recent entry for inline context
function getLastSessionSummary() {
  const logPath = path.join(__dirname, '..', 'claude_docs', 'logs', 'session-log.md');
  if (!fs.existsSync(logPath)) return 'No session log found.';
  // Normalize CRLF → LF (file lives on Windows-mounted drive)
  const content = fs.readFileSync(logPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Extract the first ### block (most recent session)
  const dateMatch = content.match(/### (\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return 'No recent session found in log.';
  const match = content.match(/### \d{4}-\d{2}-\d{2}[^\n]*\n([\s\S]*?)(?=\n### |\n---)/);
  if (!match) return 'No recent session found in log.';
  return `### ${dateMatch[1]}\n${match[1].trim()}`;
}

const lastSession = getLastSessionSummary();

// Health report — surface most recent report date and top concern
function getHealthStatus() {
  const reportsDir = path.join(__dirname, '..', 'claude_docs', 'health-reports');
  if (!fs.existsSync(reportsDir)) return 'No health reports yet — run health-scout skill.';
  const reports = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();
  if (!reports.length) return 'No health reports yet — run health-scout skill.';
  const latest = reports[0];
  const latestDate = latest.replace('.md', '');
  const content = fs.readFileSync(path.join(reportsDir, latest), 'utf8').replace(/\r\n/g, '\n');
  // Extract summary line
  const summaryMatch = content.match(/## Summary\n([\s\S]*?)(?=\n##)/);
  const summary = summaryMatch ? summaryMatch[1].trim().split('\n')[0] : 'See report for details.';
  // Check if stale (>7 days)
  const reportDate = new Date(latestDate);
  const daysSince = Math.floor((Date.now() - reportDate.getTime()) / 86400000);
  const staleNote = daysSince > 7 ? ` ⚠ Report is ${daysSince} days old — run health-scout.` : '';
  return `Last scan: ${latestDate}${staleNote}\n${summary}`;
}

const healthStatus = getHealthStatus();


// TODO/FIXME scan — surface unfinished work markers in source
function getTodoScan() {
  const packagesDir = path.join(__dirname, '..', 'packages');
  if (!fs.existsSync(packagesDir)) return null;
  const result = runCmd(
    `grep -rn "TODO\\|FIXME\\|HACK\\|WIRE UP" "${packagesDir}" --include="*.ts" --include="*.tsx" --exclude-dir="node_modules" 2>/dev/null | head -10`,
    {}
  );
  if (!result || result.startsWith('[Error')) return null;
  const lines = result.split('\n').filter(Boolean);
  if (!lines.length) return null;
  return { count: lines.length, samples: lines.slice(0, 5) };
}

// Env drift — vars in .env.example but missing from .env
function getEnvDrift() {
  const envExample = path.join(__dirname, '..', 'packages', 'backend', '.env.example');
  const envActual = path.join(__dirname, '..', 'packages', 'backend', '.env');
  if (!fs.existsSync(envExample) || !fs.existsSync(envActual)) return null;
  const parseKeys = (file) =>
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean);
  const exampleKeys = new Set(parseKeys(envExample));
  const actualKeys = new Set(parseKeys(envActual));
  const missing = [...exampleKeys].filter(k => !actualKeys.has(k));
  const extra = [...actualKeys].filter(k => !exampleKeys.has(k));
  if (!missing.length && !extra.length) return null;
  return { missing, extra };
}

// Environment capabilities — key CLI tools
function getEnvironmentStatus() {
  const lines = [];

  // GitHub CLI auth (note: GitHub MCP is separate and checked at session start)
  const ghStatus = runCmd('gh auth status 2>&1');
  if (ghStatus.startsWith('[Error') || ghStatus.includes('not logged')) {
    lines.push('- GitHub CLI: ✗ not authenticated (not required when GitHub MCP is active — check MCP tools at session start)');
  } else {
    const accountMatch = ghStatus.match(/Logged in to [^\s]+ account ([^\s]+)/);
    const account = accountMatch ? accountMatch[1] : 'authenticated';
    lines.push(`- GitHub CLI: ✓ ${account}`);
  }

  // Key CLI tools
  const tools = [
    { cmd: 'gh --version', label: 'gh' },
    { cmd: 'node --version', label: 'node' },
    { cmd: 'pnpm --version', label: 'pnpm' },
  ];
  const available = tools.filter(t => {
    try { execSync(t.cmd, { stdio: 'ignore' }); return true; } catch { return false; }
  }).map(t => t.label);
  lines.push(`- CLI tools: ${available.join(', ') || 'none detected'}`);

  return lines.join('\n');
}

const todoScan = getTodoScan();
const envDrift = getEnvDrift();
const envStatus = getEnvironmentStatus();

const markdown = `# Dynamic Project Context
*Generated at ${new Date().toISOString()}*
*Run \`node scripts/update-context.js\` on Windows to refresh.*

## Last Session
${lastSession}

## Health Status
${healthStatus}

## Environment
${envStatus}
- Dev stack: native (backend/frontend/postgres run natively on Windows — no Docker)

## Signals
${envDrift ? `⚠ Env drift — in .env.example but missing from .env: ${envDrift.missing.join(', ')}` : '✓ Env: no drift detected'}
${todoScan ? `⚠ ${todoScan.count}+ TODO/FIXME markers in source (showing up to 5):\n${todoScan.samples.map(s => '  ' + s).join('\n')}` : '✓ TODOs: none found'}

## Project File Tree
\`\`\`
${fileTree}
\`\`\`

## Tool & Skill Tree
MCP tools are injected at session start — check active tools before assuming availability.
\`\`\`
MCP Connectors (check at session start):
├── mcp__github__*          — GitHub file push, PR, issues (repo: deseee/findasale)
├── mcp__Claude_in_Chrome__ — Browser automation, screenshots, form filling
├── mcp__scheduled-tasks__  — Cron scheduling for recurring tasks
├── mcp__cowork__           — File access, directory requests, file presentation
├── mcp__afd283e9__*        — Stripe (payments, subscriptions, customers)
└── mcp__mcp-registry__     — Search/suggest additional connectors

Skills (loaded on demand — full fleet in Cowork sidebar):
├── conversation-defaults   — Session behavior rules (always active)
├── dev-environment         — Env/DB/Prisma reference (load before shell commands)
├── context-maintenance     — Session wrap protocol (load at session end)
├── health-scout            — Code scanning (load before deploys)
├── findasale-{dev,architect,qa,ops,deploy,records,workflow} — Core dev fleet
├── findasale-{marketing,cx,support,legal,ux,rd} — Business fleet
├── skill-creator / cowork-power-user — Meta skills
└── docx / xlsx / pptx / pdf / schedule — Document + task skills

Self-Healing Skills: see \`claude_docs/self-healing/self_healing_skills.md\`
\`\`\`

## On-Demand References
Read these files only when the task requires them — they are not loaded by default.
- Schema: \`packages/database/prisma/schema.prisma\`
- Dependencies: \`packages/*/package.json\` (and root \`package.json\`)
- Env vars: \`packages/*/.env.example\`
- Stack decisions: \`claude_docs/STACK.md\`
- Project state: \`claude_docs/STATE.md\`
- Security rules: \`claude_docs/SECURITY.md\`
- Ops procedures: \`claude_docs/operations/OPS.md\`
- Session history: \`claude_docs/logs/session-log.md\`
- Self-healing: \`claude_docs/self-healing/self_healing_skills.md\`
`;

fs.writeFileSync(path.join(__dirname, '..', 'context.md'), markdown);
console.log('context.md updated successfully.');
