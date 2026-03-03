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
]);

// Directories shown with item count but not expanded
const TREE_COLLAPSE = new Set(['migrations', '.cache', '.aider.tags.cache.v4']);

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
      tree += `${prefix}${isLast ? '└── ' : '├── '}${file}/ (${count} migrations)\n`;
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

// Docker — preserve existing section if docker is not reachable (e.g. nightly VM runs)
let docker = null;
if (commandExists('docker')) {
  const dockerOut = runCmd('docker ps --format "table {{.Names}}\\t{{.Status}}"');
  if (!dockerOut.startsWith('[Error')) {
    docker = dockerOut || 'No Docker containers running.';
  }
}
if (docker === null) {
  const contextPath = path.join(__dirname, '..', 'context.md');
  if (fs.existsSync(contextPath)) {
    const existing = fs.readFileSync(contextPath, 'utf8');
    const match = existing.match(/## Docker\n```\n([\s\S]*?)\n```/);
    const preserved = match ? match[1] : null;
    const isStale = !preserved
      || preserved.startsWith('[Error')
      || preserved.startsWith('Docker status unavailable');
    docker = isStale
      ? 'Docker status unavailable — run update-context.js locally to capture container state'
      : preserved;
  } else {
    docker = 'Docker status unavailable — run update-context.js locally to capture container state';
  }
}

// File tree
const fileTree = getTree(path.join(__dirname, '..'));

// Session log — extract most recent entry for inline context
function getLastSessionSummary() {
  const logPath = path.join(__dirname, '..', 'claude_docs', 'session-log.md');
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
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
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
    `grep -rn "TODO\|FIXME\|HACK\|WIRE UP" "${packagesDir}" --include="*.ts" --include="*.tsx" --exclude-dir="node_modules" 2>/dev/null | head -10`,
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

const todoScan = getTodoScan();
const envDrift = getEnvDrift();

const markdown = `# Dynamic Project Context
*Generated at ${new Date().toISOString()}*

## Git Status
- **Branch:** ${gitBranch}
- **Commit:** ${gitCommit}
- **Remote:** ${gitRemote}

## Last Session
${lastSession}

## Health Status
${healthStatus}

## Docker
\`\`\`
${docker}
\`\`\`

## Signals
${envDrift ? `⚠ Env drift — in .env.example but missing from .env: ${envDrift.missing.join(', ')}` : '✓ Env: no drift detected'}
${todoScan ? `⚠ ${todoScan.count}+ TODO/FIXME markers in source (showing up to 5):\n${todoScan.samples.map(s => '  ' + s).join('\n')}` : '✓ TODOs: none found'}

## Project File Tree
\`\`\`
${fileTree}
\`\`\`

## On-Demand References
Read these files only when the task requires them — they are not loaded by default.
- Schema: \`packages/database/prisma/schema.prisma\`
- Dependencies: \`packages/*/package.json\` (and root \`package.json\`)
- Env vars: \`packages/*/.env.example\`
- Stack decisions: \`claude_docs/STACK.md\`
- Project state: \`claude_docs/STATE.md\`
- Security rules: \`claude_docs/SECURITY.md\`
- Ops procedures: \`claude_docs/OPS.md\`
- Session history: \`claude_docs/session-log.md\`
`;

fs.writeFileSync(path.join(__dirname, '..', 'context.md'), markdown);
console.log('context.md updated successfully.');
