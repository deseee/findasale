# G-Batch Cowork Platform Research — Rerun
**Date:** 2026-03-09
**Audience:** Patrick (Cowork desktop user)
**Scope:** Evaluating Cowork desktop capabilities vs. Claude Code CLI features

**CRITICAL DISTINCTION:** Patrick uses **Cowork desktop app**, not Claude Code CLI. This research focuses on what's available in Cowork, not CLI-only features.

---

## G2: GitHub Actions CI Integration via `anthropics/claude-code-action`

**Cowork-compatible: CLI-only**

### What It Does
The `anthropics/claude-code-action` is a GitHub Actions workflow that integrates Claude into CI pipelines. It enables:
- Responding to `@claude` mentions in PRs and issues
- Auto-fixing linting/test failures
- Scheduled code generation and reporting
- Full MCP support in workflows

### How to Access
This feature is **Claude Code CLI only**. It requires:
1. Running `claude /install-github-app` (CLI command)
2. Setting `ANTHROPIC_API_KEY` as a GitHub secret
3. Writing `.github/workflows/*.yml` files

**Not available in Cowork desktop.**

### Assessment for FindA.Sale
- Sentry is already connected from a prior session (confirmed in CLAUDE.md).
- GitHub MCP (`mcp__github__*`) is active and lets Claude read/write files and manage branches.
- GitHub Actions CI would **add** automated code review/generation in workflows, but:
  - Requires CLI setup (not Cowork)
  - Adds API token cost (each workflow run = Claude API call)
  - Needs careful cost controls to prevent runaway spending

### Recommended Action
**Skip for now.** FindA.Sale doesn't currently use automated code generation in CI. If future sprints require this, Patrick would need to switch to Claude Code CLI or use a separate CI runner. Focus on deployment monitoring (Vercel, Railway) instead.

---

## G3: /rewind (Checkpointing)

**Cowork-compatible: No**

### What It Does in Claude Code CLI
`/rewind` (or Escape-Escape) is a checkpointing system that lets you:
- Roll back to any earlier conversation state
- Undo file changes selectively
- Compress conversation history
- Try alternative paths without losing the main thread

### How to Access
This is **Claude Code CLI only**. The Cowork desktop app does **not** expose `/rewind` as a slash command, keyboard shortcut, or UI button.

### What Cowork Offers Instead
- **Git history:** Full git commit history via GitHub MCP. Check out any previous commit.
- **File versioning:** Create branches, experiment, revert via git if needed.
- **Session recovery:** Follow RECOVERY.md protocol to reload STATE.md and resume.

### Recommended Action
**Not applicable.** For rollback, rely on git. Cowork does not support session-level checkpointing. If this becomes a workflow bottleneck, Patrick can switch to Claude Code CLI, but it's not necessary now.

---

## G4: /context Diagnostic

**Cowork-compatible: No equivalent**

### What It Does in Claude Code CLI
`/context` is a slash command that shows:
- Total context fill rate (%) and warning if >80%
- Which skills are excluded due to space
- Conversation size breakdown

### How to Access in Cowork
The Cowork desktop app does **not** expose a `/context` command or detailed diagnostic UI.

### What Cowork Offers Instead
- **Context indicator:** Top-right corner shows a rough percentage bar of remaining context.
- **No per-item breakdown:** You cannot see which files/skills consume the most tokens.
- **Manual estimation:** Read file sizes and estimate token usage yourself.

### Workaround for Patrick
Before large batches:
1. Note the context percentage in the Cowork UI.
2. Read critical files to estimate tokens (large files = ~4 tokens per 1 character).
3. If approaching 80%, document state in STATE.md and wrap the session.

### Recommended Action
**Cowork limitation, not addressable.** Patrick should wrap sessions proactively when context drops below 20%. Already documented in SESSION SAFEGUARDS.

---

## G5: Status Line / Session Cost Visibility

**Cowork-compatible: No**

### What It Does in Claude Code CLI
`~/.claude/settings.json` configures the CLI terminal status bar to display:
- Context usage (% and tokens)
- Session cost ($)
- Model name
- Git branch
- Custom metrics (via scripts)

### How to Access in Cowork
The Cowork desktop app does **not** read `~/.claude/settings.json`. Settings are managed entirely within the Cowork UI.

### What Cowork Offers
- **Session indicator:** Top-right percentage bar.
- **No cost tracking:** Cowork does not show per-session token cost or spend alerts.
- **No customization:** Cannot add custom status items or scripts.

### Recommended Action
**Not applicable.** Cowork has no CLI-based settings file and no cost dashboard. Patrick should monitor context visually and be aware that Cowork lacks cost-per-session visibility. (This is a Cowork limitation, not an improvement opportunity.)

---

## G6: MCP Registry — Deployment & Database Coverage

Active in **this Cowork session:** `mcp__github__*`, `mcp__afd283e9__*` (Stripe), `mcp__Claude_in_Chrome__*`, `mcp__scheduled-tasks__*`, `mcp__cowork__*`.

### Vercel (Frontend Deployment)

**Cowork-compatible: Yes**

**Status:** Vercel MCP exists in registry; **not currently connected**.

**What it does:**
- `list_projects`, `get_project` — View project details
- `list_deployments`, `get_deployment` — Check deployment status and history
- `get_deployment_events` — Trace build logs and deployment events
- `search_vercel_documentation` — Search Vercel docs in context

**Value for FindA.Sale:**
FindA.Sale frontend deploys to Vercel. Vercel MCP would enable:
- "Is the latest frontend deploy live?"
- "What's the build status?"
- "Show me deployment logs for the last 3 hours"

**Effort:** 2 minutes (connect MCP in Cowork UI, authorize with Vercel API token).

**Recommended action:** **Connect Vercel MCP.** High value, minimal friction. Would eliminate context-switching to vercel.com dashboard during debugging.

---

### Railway (Backend Deployment)

**Cowork-compatible: No native MCP**

**Status:** No dedicated Railway MCP found in registry.

**Workaround:** Railway.app dashboard is available in browser. Claude in Chrome could theoretically navigate Railway UI, but no structured MCP exists.

**Value for FindA.Sale:**
Limited. Patrick would need to open railway.app manually to check backend build status or logs. Not worth the effort to implement a workaround.

**Recommended action:** **Skip.** Continue using railway.app dashboard directly. No MCP available.

---

### Neon (Production PostgreSQL)

**Cowork-compatible: No native Neon MCP**

**Status:** No dedicated Neon MCP in registry.

**Related options found:**
- **PlanetScale MCP** — Authenticated Postgres/MySQL access, run read queries, check schema
- **Supabase MCP** — Full database management
- **MotherDuck MCP** — Analyze data with natural language

**Why no Neon MCP:** Neon is a managed Postgres service, not a full platform. The ecosystem hasn't published a Neon-specific connector.

**Value for FindA.Sale:**
Neon DB access via Claude could enable schema inspection and diagnostic queries. But FindA.Sale uses Prisma for migrations, which is already integrated in the codebase.

**Recommended action:** **Not needed.** Prisma schema is in-repo and readable via GitHub MCP. Avoid direct DB access in development (unnecessary risk). Rely on:
- Prisma schema (in codebase, readable)
- Neon dashboard for production queries (manual, safer)
- Backend logs for migration status (Railway + Sentry)

---

### PostgreSQL (Generic)

**Cowork-compatible: No robust MCP**

**Status:** PlanetScale offers Postgres support, but is a managed platform, not generic access.

**Value for FindA.Sale:** Minimal. Direct Postgres access adds risk without benefit. Prisma schema is already in-repo.

**Recommended action:** **Skip.** Use Prisma definitions as the source of truth for schema.

---

## Summary: Deployment & Database MCPs

| Service | MCP Available | Connected | Value for FindA.Sale | Recommendation |
|---------|---|---|---|---|
| **Vercel** | Yes | No | High (frontend status) | **Connect** |
| **Railway** | No | N/A | Medium (but no MCP) | Use dashboard |
| **Neon** | No | N/A | Low (Prisma already in-repo) | Skip |
| **Postgres** | Partial (PlanetScale) | No | Low | Skip |
| **Sentry** | Yes | Yes (confirmed) | High | Already done |

---

## Top 2 Actions for Patrick

### 1. **Connect Vercel MCP** (Immediate Value)
**What:** Link Vercel account to this Cowork session via MCP registry.
**Why:** Eliminates context-switching to vercel.com for frontend deployment status. Takes 2 minutes. High-value for debugging production issues.
**How:** In Cowork, find the MCP registry sidebar, search "Vercel", click Connect, authorize with Vercel API token.

### 2. **Clarify Cowork Limitations in Documentation** (Operational)
**What:** Update SESSION SAFEGUARDS to note that Cowork desktop lacks:
- `/rewind` checkpointing
- `/context` diagnostics
- Cost-per-session visibility
- Status line customization

**Why:** Prevents confusion when Patrick compares Cowork to Claude Code CLI docs. Sets expectations.
**Where:** Add a "Cowork Desktop Limitations" section to `claude_docs/operations/session-safeguards.md`.

---

## Summary Table

| Item | Cowork-compatible | Status | Recommendation |
|------|---|---|---|
| G2: GitHub Actions CI | CLI-only | N/A | Skip (requires CLI) |
| G3: /rewind | No equivalent | N/A | Use git instead |
| G4: /context | No equivalent | N/A | Wrap at 20% context |
| G5: Status line config | No equivalent | N/A | Monitor via UI |
| G6a: Vercel MCP | Yes | Not connected | **Connect now** |
| G6b: Railway MCP | No native MCP | N/A | Use dashboard |
| G6c: Neon MCP | No native MCP | N/A | Use Prisma schema |
| G6d: Postgres MCP | Partial | N/A | Skip |
| Sentry MCP | Yes | Connected | Already done |

---

**Status:** G-batch research complete. Findings reflect Cowork desktop UI and MCP registry as of 2026-03-09.
