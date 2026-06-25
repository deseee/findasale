# Infra / Cost / Security Audit — 2026-06-24

All findings tool-verified this session. Single source of truth for the CI-billing incident,
the deploy-stranding, the secret exposure, and the Actions-cost optimization.

## 1. CI failure root cause — GitHub Actions ACCOUNT billing block (verified)
ci-typecheck runs #35/#36 die in ~5s: "the job was not started because recent account payments
have failed or your spending limit needs to be increased." 2,000 free Linux min/mo exhausted +
$0 default spending limit on GitHub Free. NOT a code problem — application code at HEAD is clean
(Vercel state=READY on HEAD + last 4 commits). Fix = Patrick: GitHub → Settings → Billing & plans.
2026 pricing: 2,000 free Linux min/mo, then $0.006/min (2-core). Repo burns ~3,300–4,000 min/mo.

## 2. Backend deploy stranding (verified + fix shipped)
Railway `backend` last SUCCESS = ff80636 @02:41Z; every push since SKIPPED. Cause: Railway deploys
only on watchPatterns ["/packages/backend/**"] evaluated against the PUSH TIP; recent tips were
docs/frontend commits → backend changes (scraper fix 9b27c9f) stranded ~13h. NO "Wait for CI" gate
exists in Railway (contradicts S1023). Fix: Dockerfile.production cache-bump pushblock (delivered;
Patrick pushed). Guardrail added: CLAUDE.md §10c + ci-sentry-health Step 9 deploy-freshness check.

## 3. Secret exposure audit (verified)
- Committed repo tree (current HEAD): CLEAN — no plaintext secrets. GitGuardian remediations held.
- Global-instructions DB password: STALE / already rotated (auth FAILED against prod). Not a live
  exposure; just scrub the dead value from the master global file.
- LIVE plaintext secrets that should be rotated: GitHub PAT, Sentry token, GitGuardian token,
  internal scraper key — hardcoded in local scheduled-task SKILL.md files, and surfaced in this
  session's transcript. GitHub Actions workflows themselves use encrypted ${{ secrets.* }} (OK).
- Severity: "rotate prudently" (local files + transcript), NOT actively-public-leaking.

### Rotation runbook
ROTATION ITSELF IS PATRICK-ONLY (a new token only exists once generated while signed into the
provider; production credential changes are out of scope for the agent). Steps:
1. GitHub PAT — regenerate at Settings → Developer settings → Tokens; make it fine-grained + expiring.
2. Sentry token — regenerate in Sentry settings.
3. GitGuardian token — regenerate in GitGuardian settings.
4. Internal scraper key — set new value in GitHub Actions secret INTERNAL_SCRAPER_KEY + Railway
   backend env (same value both places).
5. DB password — already rotated; no action beyond scrubbing the dead value from the master file.
AGENT CLEANUP (after Patrick regenerates): strip old values from every scheduled-task SKILL.md,
re-wire to a single gitignored local secrets file (stop hardcoding), update docs. No re-hardcoding.

## 4. Actions-cost audit (14-day data)
Total ~3,300–4,000 min/mo (~$12/mo overage). Waste, by impact:
- Per-job 1-minute rounding — ~507 min/mo. 317 of 489 runs finish <1 min, each bills a full minute.
- "Pipeline — Outreach Emails" fires ~5×/day (68 runs/14d) while outreach is PAUSED (cap=1) — ~146/mo.
- CI runs on docs-only commits (~9 of 37) — ~40/mo. Fix: paths-ignore [claude_docs/**, '**.md']
  (must NOT exclude .github/workflows/** or auth paths — security gate).
- Failed-run minutes ~440/mo (harness now deleted; one 60-min OSM run that then failed).

## 5. Scraper cadence — CORRECTED (earlier 14-day projection over-counted infrequent runs)
- PublicSurplus: cron `0 8 * * 2` = WEEKLY, 194 min/run → ~840/mo. REAL recurring heavyweight.
  It discovers government AGENCIES (stable institutions; dedupes by org-id, skips known) — not
  time-sensitive listings. Weekly is overkill; monthly captures ~all new agencies. → monthly.
- OSM Overpass: weekly, 39 min → ~170/mo. Modest, keep.
- EstateSales.org: `0 8 1 */3 *` = QUARTERLY (+annual). ~53/mo avg. LEAVE ALONE (earlier 340/mo was wrong).
- SwapmeetDirectory: quarterly/annual. ~19/mo. LEAVE ALONE.
- Geocode Ungeocoded Sales: 3×/day backlog-clearing mode. Backlog now ~165 (was 15,792) → cut to
  1×/day now (it loops batches; handles ~785/day steady intake). Stays on Actions (Railway costs more).
- 53 license/registry scrapers: near-identical (pnpm install + prisma generate + import one
  run<State>Phase2Scraper). Batch into ONE weekly job, setup once, run all sequentially with
  per-state try/catch + a per-state pass/fail summary written to $GITHUB_STEP_SUMMARY + exit(1) on
  any failure (preserves failure isolation + visibility). ~−230/mo. VERIFY each writes same rows
  before deleting the 53 originals — requires Actions live (blocked until billing fixed).

Projected savings (PublicSurplus→monthly, geocode 3×→1×, batch licenses, paths-ignore, outreach
cadence): ~−1,450 min/mo → back under the free 2,000 (≈$0), no Railway move, no data lost.

## 6. Cost-per-value
Live sales feeds (last 7d, via /api/internal/pipeline-health): GarageSaleFinder 4,751 /
EstateSalesNet 2,479 / Facebook Events 2,655. These are the real daily value — keep cadence.
License/directory scrapers produce organizer LEADS (not sales); a per-source lead kill-list needs
live DB read access — BLOCKED this session (global DB password stale; Railway CLI not provisioned
in the workspace). Unblock: provide current DATABASE_URL or re-provision the Railway CLI binary.

## 7. All-provider spend visibility — GAP
Railway $ and Vercel $ are NOT exposed via their APIs (dashboard-only → Patrick). GitHub Actions is
the only programmatically-visible spend, and per Investor/Architect it's likely the SMALLEST bill;
Railway always-on compute + metered APIs (Anthropic/Cloudinary/Serper) are probably larger and
currently unmonitored. Recommend a Patrick-populated monthly cost one-pager + a "just pay the $12
overage" floor (don't spend dev effort to save <$ the effort costs).

## 8. Agent wishlist (synthesis — what to instrument next)
- Total infra spend across ALL providers + cost-per-1,000-sales / per-lead (measure before optimizing).
- Security: rotate the 4 live secrets; lock the PAT to fine-grained+expiring; pin action SHAs; audit
  workflow_dispatch / pull_request_target; ensure paths-ignore never excludes workflows/auth.
- DB connection-pool watch during batched-scraper windows (avoid trading cost for an outage).
- /health should assert freshness (deployed SHA == HEAD, last job-run ts), not just liveness.
- Sentry as post-change regression tripwire after each cadence/batch ship.
- INFRA_MAP single-source-of-truth + provenance stamps + "infra-vs-code triage first" default + monthly re-audit.
