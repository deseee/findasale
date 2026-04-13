# Model Routing Guide — FindA.Sale

Decision matrix for choosing session model and sub-agent routing.
Loaded on demand. Referenced by CORE.md §11.

---

## Session Model Selection

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Novel architecture, cross-cutting refactors, design systems | **Opus** | Deep reasoning, fewer repair loops on ambiguous tasks |
| Feature sprints (schema + backend + frontend), bug fixes, code review | **Sonnet** | Best cost/quality ratio for structured implementation |
| File exploration, log parsing, grep-heavy audits, health scans | **Haiku** | 3x cheaper, fast, sufficient for read-only work |
| Research sessions, competitor intel, documentation | **Sonnet** | Needs web search + synthesis; Haiku too shallow |
| Session wrap, context updates, next-session-prompt | **Sonnet** | Moderate reasoning needed for accurate summaries |

**Default:** Sonnet. Escalate to Opus only when the task has multiple valid approaches and the wrong choice costs a full session to undo.

---

## Sub-Agent Model Routing

The Task tool accepts a `model` parameter: `"opus"`, `"sonnet"`, or `"haiku"`.

### Route to Haiku (cheap, fast)
- Codebase exploration (`subagent_type: "Explore"`)
- File search, pattern matching, grep operations
- Health check scanning (read-only audits)
- Log and error message parsing
- Data extraction from structured files (JSON, CSV, env)
- Generating boilerplate from established patterns

### Route to Sonnet (balanced)
- Feature implementation sub-agents
- Code review and PR analysis
- Documentation synthesis
- Test writing
- Research with web search

### Route to Opus (expensive, high-accuracy)
- Architecture planning where multiple approaches exist
- Security audits requiring nuanced judgment
- Complex multi-file refactors (5+ files, cross-package)
- Debugging subtle issues after 2+ failed Sonnet attempts
- Schema design with business logic implications

---

## Cost Estimation

| Model | Input (1M tokens) | Output (1M tokens) |
|-------|-------------------|---------------------|
| Haiku 4.5 | $1 | $5 |
| Sonnet 4.6 | $3 | $15 |
| Opus 4.6 | $5 | $25 |

**Target split:** 60% Sonnet / 30% Haiku sub-agents / 10% Opus sessions.
Compared to all-Sonnet, this saves ~40% on sub-agent costs.

---

## When to Escalate

Escalate from Sonnet → Opus when:
1. Same error has repeated 3+ times with different fix attempts
2. Task requires choosing between 3+ valid architectural approaches
3. Patrick explicitly asks for Opus-level analysis
4. Cross-package contract changes that affect 3+ packages

Escalate from Haiku → Sonnet when:
1. Sub-agent needs to write code (not just read)
2. Task requires judgment beyond pattern matching
3. Web search + synthesis is needed

---

## Cloud vs Local AI

**Current approach:** Cloud APIs only. No local Ollama/Docker overhead in production.

- **Image tagging:** Google Vision API (labels) + Claude Haiku (descriptions) — production pipeline since session 81
- **Embeddings:** TODO (Pinecone or similar if needed for semantic search)
- **Text classification:** Claude Haiku (cost-effective for interactive work)

The standalone image-tagger service (FastAPI/Docker) was retired in session 81. The cloud pipeline is simpler, faster to debug, and requires no ops overhead.

---

Last Updated: 2026-03-05 (Opus research session)
