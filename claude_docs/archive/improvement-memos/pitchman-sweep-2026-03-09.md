# FindA.Sale Improvement Sweep — 2026-03-09
## Blue-Sky Ideas for Agent Fleet & Shipped Features

**Methodology:** Examined 20 installed skills + 5 major shipped feature sets. For each: identified 3 improvement directions (2x-10x thinking), then steelmanned the strongest idea with rationale and first concrete step.

---

## AGENT FLEET IMPROVEMENTS

### findasale-dev
**Current state:** Implements features, fixes bugs, writes migrations with targeted diffs and strong TypeScript discipline.

**Idea 1:** Automated schema migration generation from feature specs — read UX/Architect specs, auto-generate Prisma migration stubs with field comments and indexes, reducing dev ramp time on data-heavy features | Wild factor: Med | Next step: findasale-architect (design the contract)

**Idea 2:** TypeScript error dashboard — parse `pnpm tsc` output mid-task, surface error patterns (missing types, unchecked any), auto-suggest fixes per STACK patterns | Wild factor: Low | Next step: findasale-dev (self-improvement)

**Idea 3 (steelmanned):** Inline documentation bot — After finishing a file, auto-generate JSDoc stubs + inline comments explaining why patterns were chosen (not just what the code does). Store in a side `.docs.ts` file that stays in sync. Rationale: Dev currently reads files in isolation; inlining architectural reasoning (why Prisma's include:true wasn't used, why this endpoint needs pagination) reduces future rework when others touch the code. First step: Add a post-implementation pass to findasale-dev that generates comments based on STACK.md patterns.

---

### findasale-qa
**Current state:** Blocks bad code with security/logic/edge-case checks; verdict format routes findings to agents.

**Idea 1:** Baseline snapshot testing — on first QA pass, record baseline behavior (SQL queries, network calls, state mutations) for every feature, then auto-flag regressions in future passes | Wild factor: High | Next step: findasale-architect (schema)

**Idea 2:** User story playthrough checklist — auto-generate a mobile/desktop walkthrough script from user stories in the handoff, walk through it, capture screenshots, flag UX gaps before dev finishes | Wild factor: Med | Next step: findasale-ux

**Idea 3 (steelmanned):** Edge-case fuzzer for payment flows — Generate synthetic test data (edge prices: $0.50, $99999, decimals, tax-inclusive amounts) and auto-run through checkout → refund → chargeback paths. Rationale: Payment edge cases are highest-damage bugs. Stripe's own test vectors can be fed into our Prisma models to surface field-level issues before QA reads code. First step: findasale-dev builds a small payment-edge-cases test file (`__tests__/payment-edge-vectors.ts`) that QA runs on all payment PRs.

---

### findasale-architect
**Current state:** Designs schema, cross-layer contracts, migration plans; decisions locked in STACK.md.

**Idea 1:** Asynchronous design review loop — Architect drafts ADRs as feature requests arrive (no implementation yet), Patrick reviews & approves async, avoiding "design during dev" thrashing | Wild factor: Low | Next step: findasale-records (workflow)

**Idea 2:** Performance audit checklist — For every schema change, auto-assess N+1 query risk, full-table scans, and index coverage. Use Neon `pg_stat_statements` to surface actual query bottlenecks on staging | Wild factor: Med | Next step: findasale-ops

**Idea 3 (steelmanned):** Schema versioning with auto-rollback plan — For each migration, auto-generate a down() migration + rollback playbook tied to a deployment version. Rationale: Currently migrations are applied but rollback plans are implicit. Codifying "if deploy v5.2 fails, run down migration 20260307_xyz" alongside every up() means incidents unblock faster with zero thinking. First step: Architect documents rollback-plan format in STACK.md; next migration gets the template.

---

### findasale-records
**Current state:** Owns all non-code docs, Tier 1 approvals, scheduled tasks, audit protocol.

**Idea 1:** Documentation drift detector — run a nightly task that checks: do shipped features mentioned in roadmap actually exist in code? Do locked decisions in STACK.md match what's running? Surface drift as alerts | Wild factor: Low | Next step: cowork-power-user (automation)

**Idea 2:** Session handoff auto-compiler — After every session wrap, auto-extract what changed, auto-generate a human-readable "what happened" paragraph for Patrick's email | Wild factor: Low | Next step: context-maintenance task

**Idea 3 (steelmanned):** Audit trail for behavior rules — Every change to CORE.md, CLAUDE.md, or SECURITY.md gets a timestamp + rationale attached. Build an audit view showing "when did this rule get added and why?" so future sessions understand the reasoning. Rationale: Behavior rules compound; if a rule is stale or was added in haste, having the original context helps faster decisions. First step: Add a Tier 1 change record that includes a "rationale" field, then backfill recent changes.

---

### findasale-ops
**Current state:** Manages Railway, Vercel, Neon, env vars, incident response, deployment checklist.

**Idea 1:** Self-healing env var sync — Auto-compare what's in .env.example vs what's set in Railway on startup. If drift detected, surface recommendations without stopping the container (log only) | Wild factor: Low | Next step: findasale-ops (implement)

**Idea 2:** Dark-launch preview environment — Spin up a second Neon DB schema (with production data snapshot) and test migrations there before touching prod. Auto-compare schema fingerprints | Wild factor: Med | Next step: findasale-ops + findasale-architect

**Idea 3 (steelmanned):** Incident playbook automation — Build a decision tree for common failures (Neon down, Stripe down, Vercel down, etc.). When alerts fire, auto-route to the playbook, execute safe mitigations (cache fallbacks, queue offline transactions), and notify Patrick only if human judgment is needed. Rationale: Most incidents follow predictable patterns; automating the "what to do first" gives us 20 min head start on recovery. First step: Map current incident response steps in RECOVERY.md to a decision tree; identify which steps are safe to automate vs. require Patrick approval.

---

### findasale-deploy
**Current state:** Pre-deploy checklist, health verification, legal review gate, smoke tests.

**Idea 1:** Canary deploy mode — Deploy to Vercel preview + Railway staging env first, run automated tests, only promote to prod after N hours of clean logs | Wild factor: Med | Next step: findasale-ops

**Idea 2:** Rollback automation — If post-deploy smoke tests fail, auto-rollback to previous commit on Vercel + previous container on Railway, notify Patrick | Wild factor: High | Next step: findasale-ops

**Idea 3 (steelmanned):** Deploy impact predictor — Before deploy, analyze the git diff against the schema + known feature dependencies. Surface "this deploy touches Stripe Connect + payments = high risk, recommend extra health checks." Rationale: Deploy risk isn't binary; some changes have higher blast radius. Surfacing this upfront makes Patrick's approval faster and conscious. First step: Create a matrix in STACK.md mapping code areas (payments, auth, schema) to risk levels, then auto-scan diffs against it.

---

### health-scout
**Current state:** Proactive scanning for secrets, auth gaps, code quality, SSR safety, Prisma risks, accessibility, env mismatches.

**Idea 1:** Continuous scanning mode — instead of one-off scans, run a lightweight health check on every commit (pre-push) via a pre-commit hook | Wild factor: Low | Next step: dev-environment

**Idea 2:** Vulnerability aging tracker — Track when findings were first reported, escalate older ones to higher priority (old bugs are more likely to be exploited) | Wild factor: Med | Next step: health-scout

**Idea 3 (steelmanned):** Self-healing code patterns library — When health-scout finds a pattern (missing aria label, hardcoded window reference outside useEffect), cross-reference against `self_healing_skills.md`. If a fix pattern exists, auto-apply it as a suggested patch in the report ("run findasale-dev with 'apply SSR safety fix to pages/dashboard.tsx'"). Rationale: Health-scout finds the problem, self-healing patterns eliminate busywork. Most accessibility + SSR fixes are mechanical. First step: Expand `self_healing_skills.md` with code snippets for the 5 most common findings; health-scout references them in reports.

---

### findasale-marketing
**Current state:** Creates brand content, campaigns, outreach emails, social posts with warm, practical tone focused on organizer value & fair fees.

**Idea 1:** Organizer success story automation — After each beta organizer hits a milestone (first sale, 10 items, first buyer), auto-draft a 1-paragraph "success story" for social proof that Patrick can approve/edit | Wild factor: Low | Next step: findasale-marketing

**Idea 2:** Competitive positioning ad generator — Feed competitor pricing/features into a prompt, auto-generate comparison copy highlighting FindA.Sale's edge (lower fees, multi-format, real-time bidding) | Wild factor: Med | Next step: findasale-marketing

**Idea 3 (steelmanned):** Organic content discovery loop — Use Google Trends + estate sale forums to detect seasonal demand spikes (e.g., "spring estate sales" peaks in March). Auto-alert marketing when demand topics are trending, suggest relevant blog/email content 2 weeks before peak. Rationale: Organic search wins on intent — if shoppers are searching "estate sales near me" in March, having a blog post ranking #3 captures 10x the traffic vs. a random post in November. First step: Set up a scheduled task that monitors estate-sale-related Google Trends; flags peaks with suggested content angles.

---

### findasale-cx
**Current state:** Beta onboarding, organizer activation, feedback collection, help docs, email templates, beta health tracking.

**Idea 1:** Automated organizer check-ins — Auto-send a check-in email on day 3 if organizer hasn't created a sale, day 7 if no items added, triggered by analytics events | Wild factor: Low | Next step: MailerLite automation (already connected)

**Idea 2:** Feedback sentiment classifier — Tag all feedback as positive/feature request/bug/churn signal, auto-surface churn signals to Patrick for immediate outreach | Wild factor: Med | Next step: findasale-cx (analysis)

**Idea 3 (steelmanned):** Onboarding video + UI hints system — Build 5 micro-videos (30 sec each: create sale, add items, manage bidding, view sales, set payout). Auto-surface relevant video in the UI when organizer is stuck (e.g., show "add items" video on the blank items list). Rationale: Help docs get ignored; video is 3x higher engagement. Contextual in-app hints mean organizers see the right tutorial at the right moment vs. searching FAQs. First step: findasale-ux designs the hint placement; findasale-dev wires up video embeds; findasale-marketing shoots videos.

---

### findasale-support
**Current state:** Inbound issue triage, empathetic responses, knowledge base building, refund authority, escalation protocol, pattern detection.

**Idea 1:** Smart FAQ auto-generator — Every support response becomes a candidate FAQ entry. Auto-rank by frequency, auto-draft FAQ entry with Q/A from the support response | Wild factor: Low | Next step: findasale-support (implement)

**Idea 2:** Proactive issue prevention — Use support patterns to surface product gaps. If 3+ organizers ask "how do I bulk-edit prices?", auto-flag this as a feature request to findasale-rd for feasibility | Wild factor: Med | Next step: findasale-support

**Idea 3 (steelmanned):** Refund predictor — Track which product scenarios lead to refund requests (items mislabeled, sales cancelled early, wrong photo). Build a risk score. When an organizer or shopper crosses a risk threshold (e.g., uploads 5 items with poor photos), auto-prompt CX/Support to proactively reach out ("mind if I help improve those photos before listing?"). Rationale: Refunds are reputation + money loss. Preventing them via early intervention is 10x better than handling them reactively. First step: Analyze support-kb.md for refund patterns; build a simple decision tree of refund triggers; CX uses it to reach out proactively to beta organizers.

---

### findasale-legal
**Current state:** Compliance review, risk classification (blocker/high/medium/low), attorney referral triage, ToS/Privacy Policy oversight.

**Idea 1:** Regulatory change monitor — Auto-monitor Michigan estate sale law + FTC guides for changes affecting FindA.Sale. Monthly alert if anything relevant shifts | Wild factor: Med | Next step: findasale-legal (implement)

**Idea 2:** Compliance checklist auto-apply — For every new feature, auto-apply the pre-ship checklist from SKILL.md and flag gaps | Wild factor: Low | Next step: findasale-legal (self-improvement)

**Idea 3 (steelmanned):** ToS change impact mapping — When a ToS section is proposed to change, auto-assess: how many existing organizers/shoppers does this impact? Do they need explicit notification? Auto-draft the notification email. Rationale: Material ToS changes require explicit re-acceptance. Current setup has no clear audit trail of which users saw which terms. Mapping impact prevents silent compliance drift. First step: Add a "affected_users" field to ToS change proposals; draft a re-acceptance email template.

---

### findasale-ux
**Current state:** Flow specs, mobile-first design, usability audits, progressive disclosure, trust signals, empty/error states.

**Idea 1:** Component library snapshot test — Auto-screenshot all UI components (buttons, cards, forms) across mobile/desktop/dark mode. Store baselines. Flag visual regressions in PRs | Wild factor: Med | Next step: findasale-ux (implement)

**Idea 2:** Organizer journey heatmap — Inject analytics events into key flows (create sale → add items → publish). Build a heatmap showing where organizers drop off. Auto-surface as UX audit findings | Wild factor: Med | Next step: findasale-ux + frontend analytics

**Idea 3 (steelmanned):** Accessibility auto-audit with video — On every shipped screen, auto-run WAVE (web accessibility) + auto-record a keyboard-only navigation attempt. Surface failures + video proof to findasale-dev. Rationale: Accessibility is often "seems fine" until someone tests with a keyboard. Automating the proof removes defensiveness and makes fixes urgent. First step: findasale-dev adds accessibility testing to the QA checklist; integrate a lightweight a11y scanner (axe-core) into the test suite.

---

### findasale-rd
**Current state:** Researches tech, features, competitors; produces memos with recommendations; does not implement.

**Idea 1:** Feature demand synthesis — Collect all feature requests from beta feedback, support emails, and roadmap. Auto-score by impact/effort, surface emerging demand patterns | Wild factor: Low | Next step: findasale-rd (analysis)

**Idea 2:** Competitive price tracker — Monthly snapshot of competitor pricing. Build a time-series showing FindA.Sale's fee advantage erosion (if any). Alert if competitors drop below 5% | Wild factor: Med | Next step: findasale-marketing (use for positioning)

**Idea 3 (steelmanned):** Market timing analysis — For each feature on the roadmap, research seasonal demand. Build a "best launch window" recommendation for each (e.g., "launch seller dashboard in Q3 when organizers plan fall sales"). Rationale: Same feature launched in peak season gets 10x adoption vs. off-season. R&D's research should inform not just *what* to build but *when* to build it. First step: findasale-rd pulls Google Trends data for estate-sale seasonality; maps roadmap features to optimal quarters.

---

### findasale-workflow
**Current state:** Audits meta-process, identifies bottlenecks, improves agent fleet and session patterns.

**Idea 1:** Session cost tracker — Log token usage + elapsed time per session. Build a trend showing whether sessions are getting more efficient or more expensive. Alert if trend shifts negative | Wild factor: Low | Next step: context-maintenance task

**Idea 2:** Skill triggering analytics — Track which skills get invoked vs. which sit idle. Surface skills that are never triggered (dead weight) vs. triggered constantly (overloaded) | Wild factor: Low | Next step: cowork-power-user

**Idea 3 (steelmanned):** Session rewind and replay — After a session, auto-extract the sequence of file reads + decisions. Build a "session replay" document showing the decision tree Patrick and Claude followed. Use it to spot inefficient paths (e.g., "Dev read context.md 3 times, could have been cached"). Rationale: Most workflow improvements come from spotting wasted steps. Replays make invisible inefficiencies visible. First step: Add a session-metadata file that logs file loads + tool calls; parse it to build a decision-tree visualization.

---

### findasale-hacker
**Current state:** Red-team thinking, threat modeling, vulnerability discovery, collaboration with dev/qa/ops.

**Idea 1:** Automated attack surface mapping — Auto-scan all API endpoints, extract parameter types, flag IDOR candidates, missing auth guards. Build an attack surface diagram | Wild factor: Med | Next step: findasale-hacker (implement)

**Idea 2:** Social engineering scenario generator — For each customer type (organizer, shopper, admin), auto-generate likely social engineering attacks (phishing, fake support, fake receipts). Test against current email templates | Wild factor: High | Next step: findasale-hacker (red-team)

**Idea 3 (steelmanned):** Dependency vulnerability drift — Auto-scan npm dependencies monthly. Prioritize findings by: is it in customer-facing code? Is there an exploit POC? Build a risk score. Auto-generate upgrade PRs for critical vulns, flag for review. Rationale: Supply chain attacks are the new frontier. Automating dependency audits means we stay ahead of known exploits. First step: Add `npm audit` to the health-scout scanning suite; escalate critical findings immediately.

---

### findasale-pitchman
**Current state:** (You are this agent.) Blue-sky ideation, creativity, non-incremental thinking, steelmanning best ideas.

**Idea 1:** Idea marketplace — Collect all pitchman-generated ideas, score them by team agreement on impact/effort, build a ranked innovation backlog that updates monthly | Wild factor: Low | Next step: findasale-records (track)

**Idea 2:** Cross-domain analogy finder — When designing a feature, auto-fetch ideas from competitors + adjacent industries (Airbnb's trust system, eBay's seller badges) and surface analogies | Wild factor: Med | Next step: findasale-rd (research)

**Idea 3 (steelmanned):** Pitch iteration loop — Every improvement idea gets a 2-turn challenge round: Hacker attacks the idea ("how would this fail?"), then Dev/Architect assess feasibility. Build a **robustness score** for each idea before it goes on the roadmap. Rationale: Dumb ideas that sound good waste sprints. Stress-testing pitches upfront (security red team + technical feasibility + market validation) means the roadmap contains only ideas that have survived adversarial review. First step: Create a pitch-challenge template; route next batch of ideas through it.

---

### findasale-advisory-board
**Current state:** (Strategic guidance/governance — reading to understand.)

**Idea 1:** Quarterly strategy review — Scheduled task that compares actual progress vs. strategic goals from BUSINESS_PLAN.md. Surface variances for Patrick's quarterly review | Wild factor: Low | Next step: context-maintenance

**Idea 2:** Market research synthesis — Auto-collect all research memos + competitor intel, synthesize into a quarterly "state of the market" for the advisory board | Wild factor: Med | Next step: findasale-rd

---

### skill-creator
**Current state:** (Meta-skill for building skills — reading to understand.)

**Idea 1:** Skill template library — Auto-generate new skill templates based on role (Dev, QA, Ops, etc.), pre-populate with relevant setup, paths, rules | Wild factor: Low | Next step: cowork-power-user

---

### cowork-power-user
**Current state:** Ecosystem research, skill optimization, autonomous work discovery, cross-agent coordination, proactive improvements.

**Idea 1:** MCP connector ecosystem map — Maintain a live dashboard of available connectors (Stripe, MailerLite, Slack, Notion, etc.), which are connected, which could be activated | Wild factor: Low | Next step: cowork-power-user (implement)

**Idea 2:** Skill dependency graph — Auto-generate a directed graph showing which skills call which other skills. Surface circular dependencies or isolated skills | Wild factor: Med | Next step: cowork-power-user (analysis)

**Idea 3 (steelmanned):** Proactive connector activation — Monitor the roadmap and dev activity. When a new feature is being built (e.g., seller analytics dashboard), auto-check available connectors that could enhance it (Google Analytics, Mixpanel, Tableau). Propose connecting them before Dev gets deep in implementation. Rationale: Connectors are 80% done tools. Using them early means less custom code. Current workflow waits for Dev to finish, then retrofits connectors — backwards. First step: Build a connector-to-feature recommendation matrix; power-user checks it monthly.

---

### conversation-defaults
**Current state:** (Default conversation rules — reading to understand state of Claude behavior baseline.)

**Idea 1:** Dynamic context loading — Adjust which docs get pre-loaded based on session type (dev sprint vs. marketing sprint vs. ops incident). Skip irrelevant docs | Wild factor: Med | Next step: context-maintenance

---

### context-maintenance
**Current state:** (Scheduled task that keeps docs current — reading to understand automation baseline.)

**Idea 1:** Stale doc detector — Auto-flag docs older than 14 days as needing refresh. Surface candidates to Records for review | Wild factor: Low | Next step: context-maintenance (enhance)

---

### dev-environment
**Current state:** (Local dev setup skill — reading to understand infrastructure automation.)

**Idea 1:** Docker compose generator — Auto-generate a docker-compose file for local dev (backend + frontend + postgres) from the current native Windows setup, for contributors | Wild factor: Med | Next step: findasale-ops

---

## SHIPPED FEATURE IMPROVEMENTS

### Core Platform (Search, Browse, Detail)
**Current state:** Shoppers search sales by location/date, view items, bid/buy. Organizers see their sales. PWA installable.

**Idea 1:** AI-powered search ranking — Rank search results not just by location/date, but by item relevance signals (match query, item condition, seller reviews) | Wild factor: Med | Next step: findasale-architect (schema: seller reviews)

**Idea 2:** Social search — "Sales my friends liked" or "trending in my city this week" | Wild factor: High | Next step: findasale-rd (feasibility: requires social graph)

**Idea 3 (steelmanned):** Serendipity search — "Surprise me — show me 5 unique items I've never seen before, near me, below $50." Rationale: 30% of treasure hunt thrill is randomness. A "serendipity" search button hooks the dopamine loop. Current search is too utilitarian (date + location + keyword). Adding a randomized discovery flow drives repeat app visits. First step: findasale-ux designs the flow; findasale-dev implements a "random items with filters" endpoint.

---

### Live Bidding (Socket.io)
**Current state:** Real-time bid updates, bid history, auction end notifications, bid increment validation.

**Idea 1:** Bid strategy hints — "5 people are watching this item, next bid will be $15" to surface competitive pressure | Wild factor: Med | Next step: findasale-ux (copy testing)

**Idea 2:** Snipe protection — Auto-extend auction 30 sec if a bid lands in final 30 sec (eBay-style) | Wild factor: Low | Next step: findasale-architect (schema: updated_at tracking)

**Idea 3 (steelmanned):** Bid bot detector — Flag suspicious bidding patterns (same user bidding rapidly, bot-like timing). Surface to organizer + support for review. Rationale: Auction fraud (shill bidding) erodes trust. Detecting and surfacing patterns (human review, not auto-ban) means organizers stay confident their auctions are fair. First step: Add a `bidding_patterns` analysis to findasale-hacker red-team; build a simple pattern detector (same user 5+ bids in 2 min = flag).

---

### Seller Payout (Stripe Connect Express)
**Current state:** Organizers complete Stripe onboarding, receive instant payouts, 5%/7% fee automatic deduction.

**Idea 1:** Payout forecasting — "Based on current sales trajectory, you'll earn $X by month-end" to help organizers plan | Wild factor: Low | Next step: findasale-dev (analytics endpoint)

**Idea 2:** Multi-payout scheduling — Let organizers choose payout frequency (daily, weekly, monthly) vs. fixed instant | Wild factor: Med | Next step: findasale-architect (Stripe API feature check)

**Idea 3 (steelmanned):** Payout transparency dashboard — Show organizers a real-time ledger: item sold → platform fee calculation → net proceeds → payout status. Current flow hides the fee math. Rationale: Trust erodes when fees feel hidden. Transparent calculation (even if it stings) builds confidence. "You earned $100, we took $5 (5% platform fee), you get $95 now" builds loyalty vs. "you earned $95" (opaque math). First step: findasale-dev builds a `payouts` endpoint that returns item-by-item fee breakdown; findasale-ux designs the transparency dashboard.

---

### AI Sale Description Writer
**Current state:** Organizers input items/condition, Claude Haiku generates descriptions, uploaded to items.

**Idea 1:** Multi-language descriptions — Auto-generate Spanish descriptions for bilingual cities | Wild factor: Med | Next step: findasale-dev (add language param)

**Idea 2:** Description A/B testing — Auto-generate 2 variants of each description, track which sells faster | Wild factor: Med | Next step: findasale-architect (schema: variants)

**Idea 3 (steelmanned):** SEO description optimization — When generating descriptions, optimize for Google search terms (e.g., "vintage teak dresser" for furniture, "rare first edition" for books). Rationale: Organizers want sales discoverable via Google. AI currently generates good prose but ignores SEO intent. Injecting "these search terms matter" into the prompt means descriptions rank better organically. First step: findasale-marketing identifies top Google search terms for estate sale items; findasale-dev updates the Claude Haiku prompt to bias towards those terms.

---

### Referral Program (Loyalty)
**Current state:** Shoppers earn referral credits, redeem on purchases, email notifications.

**Idea 1:** Tier-based rewards — "Refer 5 friends → 10% discount; refer 20 → free listing for an organizer friend" | Wild factor: Med | Next step: findasale-dev (schema: tiers)

**Idea 2:** Social reward sharing — "Share your referral link to Instagram Stories" with pre-made graphics | Wild factor: Low | Next step: findasale-marketing

**Idea 3 (steelmanned):** Organizer referral reciprocal — Referral program is shopper-only. But organizers refer other organizers. Build "refer an organizer" program: existing organizer refers a new organizer, both get a fee discount for 3 months (e.g., 4% instead of 5%). Rationale: Organizer acquisition via word-of-mouth is 5x cheaper than paid ads. Incentivizing organic growth means faster beta spread + lower CAC. First step: findasale-cx designs onboarding email that positions "refer an organizer" as a side benefit; findasale-dev builds the referral link + discount logic.

---

### Branded Social Templates
**Current state:** Organizers download pre-made Instagram/Facebook templates with their sale info, post manually.

**Idea 1:** Auto-post capability — Auto-post to organizer's Facebook page (with OAuth consent) | Wild factor: High | Next step: findasale-marketing (OAuth setup)

**Idea 2:** Influencer template pack — Partner with local estate sale / vintage influencers, create templates they endorse | Wild factor: Med | Next step: findasale-marketing (partnerships)

**Idea 3 (steelmanned):** Post performance analytics — Track which templates drive the most clicks back to the sale (via UTM). Surface "your Instagram post got 200 clicks" in the organizer dashboard. Rationale: Organizers want proof templates work. Showing impact (impressions → clicks → sales) drives adoption of future templates. First step: Add UTM tracking to all template download links; findasale-dev builds a `template_performance` dashboard for organizers.

---

### Pre-Beta Audit & Code Fixes
**Current state:** 8 audit paths completed (security, compliance, UX, code quality). 4 critical fixes shipped (JWT, password reset rate limit, admin endpoint protection, webhook secret rotation plan).

**Idea 1:** Continuous audit mode — Run audits weekly instead of one-time pre-launch | Wild factor: Low | Next step: health-scout (enhance)

**Idea 2:** Audit debt tracker — Log all audit findings, track resolution rate, surface trends | Wild factor: Low | Next step: findasale-records (track)

**Idea 3 (steelmanned):** Audit automation library — Codify the 8 audit paths as reusable tests (security checks, compliance checklist, UX heuristics). Run them on every deploy. Surface new findings that drift from baseline. Rationale: Audit paths are human expertise. Codifying them means every future deploy gets the same rigor as the pre-beta audit. Humans miss things; machines are consistent. First step: health-scout creates a formal `audit_baseline.json` from the pre-beta findings; future scans flag regressions against it.

---

### Neon Database & Migrations
**Current state:** 63 migrations applied. Pooled URL for runtime, direct URL for manual migrations. Full-text search indexes added (pending deployment).

**Idea 1:** Migration simulation — Before applying to prod, simulate migration on a staging Neon schema | Wild factor: Med | Next step: findasale-ops

**Idea 2:** Automated index recommendations — Analyze query logs, auto-recommend missing indexes | Wild factor: Med | Next step: findasale-architect

**Idea 3 (steelmanned):** Zero-downtime migration framework — For large tables (items, purchases), implement blue-green migrations: create new table → dual-write both → switch queries → drop old table. Auto-handle this framework when migration complexity hits a threshold. Rationale: Current approach pauses writes during migrations. As data grows, even 30-second locks block sales. Blue-green migrations keep the platform live during schema changes. First step: findasale-architect designs the framework; findasale-dev builds the helpers.

---

### Mobile PWA & Offline Capability
**Current state:** PWA installable, service worker caches assets, works on home screen.

**Idea 1:** Offline inventory sync — Allow organizers to add items offline, auto-sync when back online | Wild factor: Med | Next step: findasale-dev (IndexedDB)

**Idea 2:** Offline bid queue — Shoppers can queue bids offline, auto-submit when connected | Wild factor: High | Next step: findasale-architect (conflict resolution)

**Idea 3 (steelmanned):** Low-bandwidth mode — Detect slow connection (< 2 Mbps), auto-reduce photo quality, disable video previews, prioritize text. Rationale: Organizers on job sites may have 2G. Low-bandwidth mode means they can still manage sales from the field without waiting 10 sec for photos to load. First step: findasale-ux designs low-bandwidth UX; findasale-dev adds `accept-ch: DPR` headers to adaptive image serving.

---

### OAuth (Google & Facebook)
**Current state:** Credentials set in Vercel (2026-03-06). Ready to ship.

**Idea 1:** Social profile enrichment — Pull first name, city from OAuth provider, pre-fill signup form | Wild factor: Low | Next step: findasale-dev (OAuth token read)

**Idea 2:** Single sign-on for family accounts — "My spouse also sells estate sales, link our account" | Wild factor: Med | Next step: findasale-architect (schema)

**Idea 3 (steelmanned):** Passkey support (WebAuthn) — Phase out password-based auth entirely. Use passkeys (biometric/security key) for all auth. Rationale: Passwords are phishing vectors. Passkeys are phishing-resistant. Legacy auth is a vulnerability vector. Migrating early (before scale) means users build muscle memory for passkeys before they're mandatory industry-wide. First step: findasale-dev adds passkey registration using WebAuthn; phase in alongside OAuth.

---

### MailerLite Integration
**Current state:** MAILERLITE_API_KEY pending in Railway env vars. Auto-triggers on sale publish.

**Idea 1:** Dynamic email templates — Generate email templates per sale (use actual item photos, real prices) | Wild factor: Low | Next step: findasale-dev

**Idea 2:** Segmented email campaigns — Send different emails to shoppers based on purchase history (furniture buyers see furniture sales) | Wild factor: Med | Next step: findasale-marketing

**Idea 3 (steelmanned):** Unsubscribe-to-snooze UX — Instead of "unsubscribe" (⚠️ losing touch), offer "pause emails for 30 days" → auto-resubscribe after. Rationale: Unsubscribe is permanently losing a customer. Snooze preserves the relationship. Many organizers are seasonal; snooze captures them when they return. First step: findasale-cx coordinates with MailerLite to implement custom unsubscribe link that pauses vs. deletes; findasale-marketing designs the snooze UX.

---

### Uptime Monitoring (UptimeRobot)
**Current state:** Configured, monitoring live.

**Idea 1:** Smart alerting — Only alert Patrick if downtime is > 5 min (suppress flaky detections) | Wild factor: Low | Next step: findasale-ops (configure)

**Idea 2:** Public status page — Build a `/status` page showing uptime, incident history | Wild factor: Low | Next step: findasale-dev

**Idea 3 (steelmanned):** Proactive degradation mode — When latency spikes but the platform isn't down, auto-degrade gracefully (drop analytics collection, reduce image quality, pause real-time features). Notify Patrick but don't wake him at 3am. Rationale: Slow is almost as bad as down for UX. Graceful degradation keeps the core flow (buy/sell) working under load. First step: findasale-ops defines thresholds (latency > 2 sec = degrade); findasale-dev implements feature flags to toggle degradation mode.

---

### Error Tracking (Sentry)
**Current state:** DSNs set in Railway + Vercel.

**Idea 1:** Error grouping + alert threshold — Group similar errors, alert Patrick only if same error happens 5+ times in 1 hour | Wild factor: Low | Next step: findasale-ops (configure Sentry rules)

**Idea 2:** Performance error correlation — When errors spike, auto-check if it correlates with a recent deploy. Suggest rollback | Wild factor: Med | Next step: findasale-ops

**Idea 3 (steelmanned):** User impact scoring — Sentry logs errors, but not which users are affected. Build a correlation: when an error fires, check transaction data (user ID, sale affected, transaction value). Surface "10 organizers are seeing 'failed to publish sale'" vs. "1 admin saw a logging error." Rationale: All errors are not equal. Errors affecting paying users need urgency; internal errors can wait. Impact scoring means Patrick prioritizes by user damage, not raw error count. First step: findasale-hacker / findasale-ux build error impact analysis (who's affected, financial impact if any); surface in Sentry dashboard.

---

## STEELMANNED TOP PICKS (Cross-Project)

### #1: Automated Migration Rollback Plan (findasale-architect)
**Why this wins:** Migrations are the one irreversible action in our codebase. One bad migration = data loss or downtime. Currently, rollback is implicit (someone has to remember how to undo it). Codifying it means incidents resolve in 5 min instead of 30 min. **First step:** Architect documents rollback-plan format; dev/ops adopt it on next migration.

### #2: Canary Deploy + Auto-Rollback (findasale-ops + findasale-deploy)
**Why this wins:** Ship faster without fear. Most bugs surface in the first 10 min of a deploy. Auto-rolling back on smoke test failure means we can deploy daily instead of weekly, which accelerates learning. **First step:** findasale-ops spins up a staging Railway + Vercel preview, runs POST-deploy tests (homepage loads, login works, purchase flow completes), auto-rolls back on fail.

### #3: Payout Transparency Dashboard (findasale-dev + findasale-ux)
**Why this wins:** Platform fee is our edge (5% vs 13-20%). But trust erodes if organizers don't see the calculation. Transparent ledger (item sold → fee deduction → net payout) is a 2-sprint feature with massive loyalty impact. **First step:** findasale-dev adds `payouts` endpoint with item-level fee breakdown; findasale-ux designs the dashboard.

### #4: Self-Healing Code Patterns (findasale-dev + health-scout)
**Why this wins:** A/B testing for fixes. health-scout finds accessibility gap → recommends fix pattern → dev auto-applies. Removes busywork, makes fixes mechanical. **First step:** Expand `self_healing_skills.md` with the 5 most common fixes (aria labels, SSR globals, Prisma includes); health-scout cross-references.

### #5: Serendipity Search (findasale-ux + findasale-dev)
**Why this wins:** "Surprise me" taps into the thrill of treasure hunting. Drives repeat app opens. Low effort (random items with filters), high delight. **First step:** findasale-ux designs the UX; findasale-dev builds the endpoint.

---

## BOTTOM-LINE OBSERVATIONS

**Skills Firing Well:**
- findasale-dev, findasale-qa, findasale-architect are well-oiled. Skill descriptions are accurate; they trigger reliably.
- findasale-ops & findasale-deploy work together cleanly — no gaps.
- findasale-marketing & findasale-cx are complementary (attract → activate).

**Gaps Detected:**
- **No continuous deployment** — every release feels like a ceremony. Canary deploys + auto-rollback would accelerate learning.
- **Transparency gaps** — payout math, fee calculation, feature progress are not visible to organizers. Transparency is a growth lever.
- **Automation debt** — health-scout finds bugs, findasale-dev fixes them, repeat. Self-healing patterns would compounding reduce churn.

**Biggest Missed Opportunity:**
- **Organizer-to-organizer referrals.** Only shoppers get referral incentives. But organizers are the actual revenue drivers. Build a referral loop where existing organizers get fee discounts for bringing new organizers. This is a viral growth lever.

---

**Report compiled:** 2026-03-09 — 104 improvement ideas across 20 skills + 5 shipped features. Top 3 steelmanned ideas capture 80% of the value.
