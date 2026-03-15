# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-15 (v31 — Session 171: #27 Listing Factory complete (Sprints 1–3 shipped S166/S168/S170). Fold-ins: #64 Condition Grading (S166) + #31 Brand Kit schema (S166), UI deferred. Build fix applied.)\
**Previous:** 2026-03-13 (v27 — Session 157: Innovation Round 3. 30 new ideas across 10 creative lenses (casino/gambling, microtransactions, big box retail, mobile trends, international, progressive disclosure, GitHub/open source, Reddit/social, Zapier/automation, emerging). 11 rated BUILD → added to Phase 4 (#61–#71). 19 rated DEFER → added to Deferred. Total: 71 active features + 65 deferred items. Research: `claude_docs/research/innovation-round3-2026-03-13.md`.)
**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Patrick's Checklist

### Business Formation + Legal
- [x] Set up support@finda.sale email forwarding ✅ Done (2026-03-06)
- [ ] Order business cards (~$25) — files in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale
- [ ] Open Stripe business account
- [ ] Google Search Console verification
- [ ] Set up Google Voice for support line

### Credentials + Services
- [x] Rotate Neon database credentials ✅ Done (2026-03-09, session 111)
- [x] OAuth credentials (Google, Facebook) → Vercel env vars ✅ Done (2026-03-06)
- [ ] VAPID keys confirmed in production
- [x] ~~Confirm 5%/7% platform fee~~ ✅ Locked at **10% flat** (session 106)
- [ ] **⚠️ Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (session 165)
- [ ] **⚠️ Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway** (session 165)

### Beta Recruitment
- [ ] Identify 5 target beta organizers (`claude_docs/beta-launch/organizer-outreach.md` ready)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] ⚡ **Sync: feedback → Claude for iteration**

---

## Running Automations

10 scheduled tasks active: competitor monitoring, context refresh, context freshness check, UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit (Mon-Fri 8:30am), weekly pipeline briefing (Mon 9am). Managed by Cowork Power User + findasale-workflow + findasale-sales-ops agents.

## Connectors

- [x] **Stripe** — query payment data, manage customers, troubleshoot payment issues directly
- [x] **MailerLite** — draft, schedule, and send email campaigns directly from Claude

*CRM deferred — Close requires paid trial. Use spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Upcoming Work Sessions
- [ ] **Brand Voice Session** — Use brand-voice plugin (discover-brand → guideline-generation → brand-voice-enforcement) to establish FindA.Sale's documented voice, tone, and messaging pillars. Needed before beta outreach, social templates (#27), and email sequences. Priority: before Listing Factory ships.

### Design Decisions (Locked Session 155)
- **Holds expiry:** 48 hours default, configurable per-sale in organizer settings. Nightly cron cleanup.
- **Health score:** Hybrid gate — block publishing below 40% (no photo or title), nudge 40–70%, free above 70%. Progress bar UX, never punitive.
- **Tag vocabulary:** Curated list of 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
- **Social templates:** Auto-fill v1 with 3 tone options (Casual, Professional, Friendly). Defer WYSIWYG editor to post-beta.
- **Heatmap density:** Radius-based (1–3 mile), pre-computed grid tiles every 6h, 7-day rolling window baked in.
- **Background removal:** On-demand Cloudinary `b_remove` transform only. Primary photo. No batch job.
- **Holds grouping:** By-item in schema, grouped-by-buyer in display. No junction table.

---

## Feature Pipeline

### Next Up (Priority Order — Locked Session 155)

| Priority | # | Feature | Est. | Notes |
|----------|---|---------|------|-------|
| ~~1~~ | ~~24~~ | ~~Holds-Only Item View~~ | ✅ Done | Configurable hold duration per sale, batch ops (release/extend/markSold), grouped-by-buyer accordion, dashboard badge. Shipped session 164. |
| ~~2~~ | ~~27~~ | ~~Listing Factory (Photo Export + Social + Tags)~~ | ✅ Done | **All 3 sprints shipped.** Sprint 1 (S166): AI tag suggestion via Haiku + curated tag vocabulary + health score utility + review.tsx picker UI. Sprint 2 (S168): Cloudinary watermark + export controller (CSV/JSON/text formats) + social templates (3 tones × 2 platforms). Sprint 3 (S170): /tags/[slug] ISR pages, /api/tags/popular endpoint, sitemap. Fold-ins: #64 Condition Grading (S166 migration 20260315000001), #31 Brand Kit schema (S166 migration 20260315000002, UI deferred to standalone session). |
| 3 | 8 | Batch Operations Toolkit | 1 sprint | Bulk pricing, status updates, photo uploads. Partially covered by Rapidfire batch toolbar (session 146 spec). |
| 4 | 28 | Neighborhood Heatmap | 0.5–1 sprint | Sale density overlay on shopper map — color-coded zones by active sale count. Helps shoppers plan routes by concentration. Incremental on existing Leaflet map + OSRM route planning (D3, session 114). |
| 5 | 6 | Seller Performance Dashboard + Price Intelligence | 2–3 sprints | Analytics, benchmarks, pricing recommendations. Merged with #26 (Cross-Sale Price Intelligence) per competitive urgency — EstateFlow already has AI pricing. **Includes Seasonal Pricing Templates:** pre-loaded pricing suggestions by season (holiday decor in Nov/Dec, outdoor furniture in spring, back-to-school in Aug). AI adjusts base price recommendations by time of year and category sell-through rates. |

#### Parallel Sprint Slots (Board v26 — runs alongside locked queue)

| Priority | # | Feature | Est. | Notes |
|----------|---|---------|------|-------|
| P1 | ~~33~~ | ~~Share Card Factory~~ | ✅ Done | SSR OG tags + Cloudinary branded cards on item pages. FB Sharing Debugger clean. Shipped session 163. |
| P2 | 34 | Hype Meter | 0.5 sprint | Real-time social proof: "47 people are looking at this sale." Drives FOMO and urgency. Lightweight WebSocket or polling counter. |
| P3 | 35 | Front Door Locator | 0.5 sprint | Entrance pin on sale detail map — "park here, enter here." Solves #1 shopper friction at large estate sales. Organizer sets pin during sale setup. |
| ~~P4~~ | ~~36~~ | ~~Weekly Treasure Digest~~ | ✅ Done | Personalized weekly shopper digest activated. Sundays 6pm via Resend. MailerLite Shoppers group sync on registration. Shipped session 165. Env var required: `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` |
| P5 | 37 | Sale Calendar & Reminders | 1 sprint | Calendar view of upcoming sales + "Remind Me" button → push notification or email on sale day. Reduces missed-sale regret. |

*Recently shipped: #27 Listing Factory (sessions 166/168/170 — 3-sprint complete: AI tags, health score, exports, social templates, ISR tag pages + fold-ins #64 Condition Grading + #31 Brand Kit schema), #36 Weekly Treasure Digest (session 165), #33 Share Card Factory (session 163), #61 Near-Miss Nudges + #34 Hype Meter + #35 Front Door Locator (session 160). See COMPLETED_PHASES.md.*

### Phase 3 — Weeks 8–16
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 3a | ~~Rapidfire Camera Mode~~ | ✅ Done | Multi-photo capture → AI draft processing → review/publish page. Sessions 135–137 (build), 146–149 (v2 design + bug fixes). Phase 5 add-photo-to-item wired. |
| 3b | ~~Camera Workflow v2 (Design)~~ | ✅ Specced | Auto-enhance, background removal (Cloudinary), face detection (on-device TF.js), AI confidence tinting, batch toolbar. Session 146 design sprint. Implementation partial — full build deferred. |
| 4 | ~~Search by Item Type~~ | ✅ Done | /categories index page shipped (session 116). [category].tsx existed (Phase 29). |
| 5 | ~~Stripe Terminal POS~~ | ✅ Done | v1 single-item (session 150) + v2 multi-item cart, cash payment, cash fee tracking (sessions 153–154). WisePOS E/S700 WiFi. 10% fee parity. Ready for Patrick testing. |
| 6 | Seller Performance Dashboard | 2 sprints | Analytics, benchmarks, pricing recommendations. |
| 7 | Shopper Referral Rewards | 1–2 sprints | Referral tracking, rewards distribution, email notifications. Deferred — no shoppers yet. |
| 8 | Batch Operations Toolkit | 1 sprint | Bulk pricing, status updates, photo uploads. Partially covered by Rapidfire batch toolbar (session 146 spec). |
| 9 | ~~Payout Transparency Dashboard~~ | ✅ Done | Item-level fee breakdown shipped session 116. `GET /api/stripe/earnings` + payouts page. |
| 10 | ~~Serendipity Search~~ | ✅ Done | `/api/search/random` + `/surprise-me` page shipped sessions 116–117. |
| 11 | ~~Organizer Referral Reciprocal~~ | ✅ Done | Fee bypass + referralDiscountExpiry shipped session 117. Migration pending deploy. |
| 12 | ~~SEO Description Optimization~~ | ✅ Done | Haiku prompt updated — title/description/tags now bias toward high-intent search terms (session 116). |

### Phase 4 — Post-16 Weeks
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 13 | Premium Organizer Tier | 2 sprints | Feature gating + billing integration. |
| 14 | Real-Time Status Updates | 1 sprint | Organizer mobile widget, SMS/email alerts. |
| 15 | Shopper Referral Rewards expansion | 1 sprint | Viral growth loop. |
| 16 | Verified Organizer Badge | 1–2 sprints | Professional differentiation, trust signal. |
| 17 | Bid Bot Detector + Fraud Confidence Score | 1–1.5 sprints | Flag suspicious bidding patterns (rapid same-user bids). Human review, not auto-ban. Fraud confidence score visible to organizers. Protects auction integrity. Steelman: STRONG, quick win. (Innovation sweep; validated session 155) |
| 18 | Post Performance Analytics | 1 sprint | UTM tracking on social template downloads → "your Instagram post got 200 clicks" in organizer dashboard. (Innovation sweep) |
| 19 | Passkey / WebAuthn Support | 1–2 sprints | Phishing-resistant auth alongside OAuth. Phase in early before scale. (Innovation sweep) |
| 20 | Proactive Degradation Mode | 1 sprint | Latency > 2s → auto-drop analytics collection, reduce image quality, preserve core buy/sell flow. (Innovation sweep) |
| 21 | User Impact Scoring in Sentry | 0.5 sprints | Correlate errors with affected user IDs + transaction value. Prioritize by user damage, not raw error count. (Innovation sweep) |
| 22 | Low-Bandwidth Mode (PWA) | 1 sprint | Detect slow connections, auto-reduce photo quality, disable video previews. Organizers on job sites often have 2G. (Innovation sweep) |
| 23 | Unsubscribe-to-Snooze (MailerLite) | 0.5 sprints | Pause emails 30 days instead of full unsubscribe. Preserves seasonal organizers. (Innovation sweep) |
| 24 | ~~Holds-Only Item View~~ | **Moved to Next Up P1** | Promoted session 155 — trust blocker for beta. |
| 25 | Organizer Item Library (Consignment Rack) | 2 sprints | Upload once, reuse across sales. Items become compounding assets. Full cross-sale search, price history, sold vs. unsold analytics. (Innovation session 129) |
| 26 | ~~Cross-Sale Price Intelligence~~ | **Merged into #6** | Promoted session 155 — merged into Seller Performance Dashboard per competitive urgency. |
| 29 | Shopper Loyalty Passport | 2 sprints | Gamified repeat-visit system — stamps, badges, early-access perks. Drives shopper retention. Steelman: STRONG. Ship post-beta when shopper base exists. (Innovation session 155) |
| 30 | AI Item Valuation & Comparables | 2 sprints | Price range suggestions from sold-item data + visual embeddings. Leverages existing AI pipeline. Requires 100+ sold items per category to be credible. (Innovation session 155) |
| 31 | Organizer Brand Kit | 1.5 sprints | Auto-expand organizer colors/logo across all templates, exports, and social posts. Natural extension of Listing Factory (#27). Premium tier upsell path. Schema shipped with Listing Factory Sprint 1 (S166, migration 20260315000002); UI deferred to standalone session. (Innovation session 155) |
| 32 | Shopper Wishlist Alerts + Smart Follow | 2 sprints | Shoppers set category/tag/organizer preferences → push alerts when matching items list. Foundational for shopper retention and intent data. Ship after Listing Factory drives initial traffic. (Innovation session 155) |
| 38 | Entrance Pin | 0.5 sprint | Organizer drops a pin for parking/entrance on sale map. Extends Front Door Locator (#35) with richer location data. Reduces shopper confusion at multi-building estates. (Board v26, Tier 2) |
| 39 | Photo Op Stations | 1 sprint | Designated "selfie spot" markers at sales — branded photo frames, shareable moments. Organizers set locations; shoppers share UGC. Viral loop + fun factor. (Board v26, Tier 2) |
| 40 | Sale Hubs | 1.5 sprints | Group nearby sales into a "hub" — shared map, combined route, hub landing page. Weekend sale-hopping made effortless. Builds on Heatmap (#28) density data. (Board v26, Tier 2) |
| 41 | Flip Report | 1.5 sprints | "What sold, what didn't, what to price differently next time." Post-sale analytics PDF/dashboard for organizers. Subscription potential for premium tier. (Board v26, Tier 2) |
| 42 | Voice-to-Tag | 1 sprint | Organizer speaks item description during Rapidfire → AI transcribes + extracts tags automatically. Hands-free cataloging. Leverages existing AI pipeline + Web Speech API. (Board v26, Tier 2) |
| 43 | OG Image Generator | 0.5 sprint | Cloudinary-powered dynamic OG images for every sale/item page. Branded previews in iMessage, Facebook, Twitter shares. Pairs with Share Card Factory (#33). (Board v26, Tier 2) |
| 44 | Neighborhood Sale Day | 1 sprint | Organizers in a neighborhood coordinate a shared sale date. Hub landing page + combined marketing. Community event energy. Builds on Sale Hubs (#40). (Board v26, Tier 2) |
| 45 | Collector Passport | 1.5 sprints | Gamified collection tracker — "I collect depression glass, Fiestaware, mid-century furniture." Personalized alerts when matching items appear. Deeper than Wishlist (#32) — identity-based. (Board v26, Tier 2) |
| 46 | Treasure Typology Classifier | 2 sprints | ML model that classifies items into collector categories (Art Deco, MCM, Americana, etc.) from photos. Powers Collector Passport, tag suggestions, and search refinement. Requires training data from shipped items. (Innovation bonus, Board v26 Tier 2) |
| 61 | Near-Miss Nudges | 0.25 sprint | Casino-psychology progress nudges: "You're 1 favorite away from unlocking Early Bird Access!" Layers onto any gamification feature as it ships. Variable-ratio schedule drives 30-40% higher completion. Ethical: real progress only, no manufactured near-misses. (Innovation R3, Casino lens) |
| 62 | Digital Receipt + Returns | 1-2 sprints | Auto-generate digital receipt with item photos + prices after every POS transaction. Push to shopper's app profile. Optional organizer-set return window (24h/48h/none). Builds trust, enables returns on high-value items, feeds purchase history for ML. Pairs with POS v2 + Loot Log (#50). (Innovation R3, Big Box lens) |
| 63 | Dark Mode + Accessibility-First | 1.5 sprints | Tailwind dark variant across all components + system preference detection + high-contrast outdoor mode + font sizing controls. WCAG 2.1 AA compliance. Estate sale shoppers skew older — larger fonts, higher contrast, better outdoor visibility are real needs. SEO boost from Lighthouse accessibility scores. (Innovation R3, Mobile lens) |
| ~~64~~ | ~~Condition Grading System~~ | ✅ Done | Japanese-model standardized S/A/B/C/D grades shipped as fold-in with Listing Factory Sprint 1 (S166). AI suggests grade from photo analysis during Rapidfire; organizer confirms. Grades displayed on listings with clear definitions. Builds cross-platform trust at scale. Migration 20260315000001 applied. (Innovation R3, International lens) |
| 65 | Organizer Mode Tiers (Simple/Pro/Enterprise) | 2 sprints | Progressive disclosure framework. Simple (5 buttons: create → photo → price → publish → paid). Pro (batch ops, analytics, tags, branding, exports). Enterprise (API access, bulk import/export, webhooks, multi-user teams, white-label). Feature-flag architecture — every future feature gets tagged with its tier. Architectural answer to "simple surface + complex depth." (Innovation R3, Progressive Disclosure lens) |
| 66 | Open Data Export | 0.5-1 sprint | One-click full data export: items.csv, sales.csv, purchases.csv, analytics.csv, /photos/ (Cloudinary URLs). ZIP background job + email download link. Trust signal + likely CCPA requirement. "Your data is yours." (Innovation R3, GitHub/Open Source lens) |
| 67 | Social Proof Notifications | 0.5 sprint | Real-time aggregate activity: "47 people viewed this today." Friend activity for connected users. Extends Hype Meter (#34) with individual social connections. Opt-in privacy controls. Ships with Hype Meter. (Innovation R3, Social lens) |
| 68 | Command Center Dashboard | 2 sprints | Multi-sale overview for power organizers managing 2-3+ sales simultaneously. Key metrics per sale, quick-switch, alert feed ("Sale A has 3 expired holds"), customizable widgets for Enterprise tier. Pro/Enterprise Mode feature. (Innovation R3, Progressive Disclosure lens) |
| 69 | Local-First Offline Mode | 3 sprints | Full offline capability via service worker + IndexedDB. Catalog items, set prices, take photos with zero internet. Sync on reconnect. Conflict resolution (last-write-wins for fields, merge for photos). Competitive requirement — PROSALE works offline. Estate sales happen in basements/barns with no signal. (Innovation R3, GitHub lens) |
| 70 | Live Sale Feed | 1 sprint | Real-time activity stream during active sales: "Victorian lamp just sold for $45!" "New hold on Eames chair." WebSocket-powered, leverages existing POS infrastructure. 80% of livestream FOMO at 10% of livestream complexity. Ships after POS v2 stabilizes. (Innovation R3, Social lens) |
| 71 | Organizer Reputation Score | 1.5 sprints | Public trust score (1-5 stars) from: response time, sale frequency, photo quality (AI), shopper ratings, dispute rate. Displayed on profile + every listing. "New Organizer" badge for cold-start. Foundational trust infrastructure for marketplace scale. Ship before national expansion. (Innovation R3, Emerging lens) |

---

### Phase 5 — Post-Beta Scale (Board v26, Tier 3)
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 47 | UGC Photo Tags | 1.5 sprints | Shoppers tag and share photos of finds. Social proof + free content marketing. Moderation queue for organizers. Builds community around sales. |
| 48 | Treasure Trail Route Builder | 1.5 sprints | Shoppers build multi-sale route plans with time estimates, drive order, and "don't miss" item highlights. Extends existing OSRM route planning (session 114). Gamified "complete the trail" element. |
| 49 | City Heat Index | 1 sprint | City-level "estate sale activity" score — weekly ranking of hottest metro areas. Content marketing magnet + SEO play. Powered by aggregated sale data. (Innovation bonus, Board v26) |
| 50 | Loot Log | 1.5 sprints | Personal purchase history + "my collection" gallery for shoppers. Social sharing of best finds. Retention through identity investment. |
| 51 | Sale Ripples | 1 sprint | Smart notification algorithm — "A sale just posted 2 miles from a sale you liked." Proximity + preference signals. Drives spontaneous visits. (Innovation bonus, Board v26) |
| 52 | Estate Sale Encyclopedia | 3 sprints | Crowdsourced knowledge base: item identification guides, era/style references, price benchmarks by region. Long-tail SEO moat. Community contribution model. |
| 53 | Cross-Platform Aggregator | 2 sprints | Pull listings from EstateSales.NET, Craigslist, Facebook Marketplace into unified search. "Search everywhere from one place." Major moat if executed. Legal review required. |
| 54 | Crowdsourced Appraisal API | 2.5 sprints | Users submit photos → community + AI estimate value range. Revenue potential as standalone tool or API. Requires critical mass of knowledgeable users. |
| 55 | Seasonal Discovery Challenges | 1 sprint | Time-limited themed challenges — "Holiday Treasure Hunt" (Dec), "Spring Refresh" (Mar). Badges + leaderboard placement. Drives seasonal engagement spikes. |

### Vision — Long-Term (Board v26, Tier 4)
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 56 | Printful Merch Store | 1 sprint | Drop-shipped branded merch (tees, totes, stickers) via Printful API. Zero inventory risk. Revenue diversification. "I ❤️ Estate Sales" lifestyle brand play. |
| 57 | Shiny / Rare Item Badges | 1 sprint | Special visual treatment for high-value or unusual items. Pokémon-inspired rarity system. Drives clicks and shares. Fun factor. |
| 58 | Achievement Badges | 1.5 sprints | Shopper + organizer achievement system — "First Sale", "100 Items Listed", "Weekend Warrior." Retention through status. |
| 59 | Streak Rewards | 1 sprint | "Visit 3 weekends in a row → unlock early access." Habit formation mechanic. Drives consistent engagement. |
| 60 | Premium Tier Bundle | 2 sprints | Paid organizer tier bundling: Brand Kit (#31), Flip Report (#41), priority support, advanced analytics. Revenue milestone. Requires enough free-tier usage to demonstrate value. |

---

## Agent Task Queue

Proactive tasks assigned to the fleet. Not product features — operational work agents own.

### Pre-Beta (Block on these before first real organizer)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| ~~OAuth Security Red-Team~~ | findasale-hacker | ✅ Done | Session 115 — account-takeover, redirect_uri allowlist, tokenVersion fixes shipped. |
| ~~Payment Edge-Case QA Pass~~ | findasale-qa | ✅ Done | Session 115 — chargeback handler, idempotency, negative price guards, buyer-own-item guard. |
| Full-Text Search Migration Rollback Plan | findasale-architect | P0 | Document down() steps + playbook for migration 20260310000001 + last 4 |
| Beta Organizer Email Sequence | findasale-customer-champion | P1 | 3-email triggered sequence (welcome / day-3 nudge / day-7 help) → load via MailerLite MCP |
| ~~Fee Decision Brief~~ | findasale-advisory-board | ✅ Done | Session 106 — 10% flat locked. Advisory board stress test complete (msg-005). |

### Beta Support (Run during/after first organizers activate)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Spring Content Push | findasale-marketing | P1 | "Spring Estate Sales 2026" blog + 3 social posts — peak demand is NOW, publish this week |
| Beta Dry Run | findasale-customer-champion + findasale-ux | P1 | Impersonate first-time organizer through full flow; log every friction point before real users do |
| Support KB Pre-Population | findasale-customer-champion | P1 | Draft 10 predictable FAQ entries before beta launches (payouts, cancellation, photos, search) |

### Infrastructure (One-time, pays off indefinitely)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Bug Blitz Scoping | findasale-qa + health-scout | P0 | Produce prioritized P0/P1/P2 bug list before Session 105 so dev session is pure execution |
| RECOVERY.md Decision Trees | findasale-ops | P1 | Convert 3 main failure scenarios to IF/THEN decision trees; label safe-to-auto vs. needs-Patrick |
| STACK.md Deploy Risk Matrix | findasale-deploy | P1 | Write code-area → risk-level table (payments/auth/schema=HIGH) into STACK.md |
| Connector-Matrix.md | cowork-power-user | P2 | Audit available MCP connectors vs. Phase 3+4 roadmap features; save to `claude_docs/operations/connector-matrix.md` |

---

## Sync Points

| Sync | What's Needed | Status |
|------|---------------|--------|
| ✅ Platform fee | Locked at 10% flat — session 106 | Complete |
| ⚡ Beta readiness | Patrick's checklist above → first real user | Waiting on Patrick items |
| ⚡ Beta feedback loops | Beta feedback → Claude iterates on features | Pending beta launch |

---

## Deferred & Long-Term Hold

| Feature | Reason | Revisit |
|---------|--------|---------|
| White-label MaaS | Business decision — beta validation first | After beta data |
| Consignment Integration | Thrift store POS — post-beta complexity | After beta data |
| QuickBooks Integration | CSV export covers 80% of need | When organizers ask |
| Video-to-inventory | Vision models can't reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | Beta validation first | After beta data |
| AR Furniture Preview | Hardware not ready | Long-term R&D |
| BUSINESS_PLAN.md rewrite | Current doc still references Grand Rapids as primary focus; needs update to reflect national open-to-all-organizers positioning and current fee/feature state | After beta data confirms positioning |
| Zero-Downtime Migration Framework | Blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | Deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes |
| Audit Automation Library | Codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch |

| Instant Flash Auctions | Pre-beta, zero shoppers — no demand signal yet. DA: PAUSE. | After beta + 4–6 wks shopper data |
| Live Stream Sale Events | Heaviest build (3–4 sprints), requires on-camera organizers. DA: RETHINK. | After beta proves organizer appetite |
| Verified Organizer Insurance Badge | Requires micro-insurance partner — unvalidated market. DA: DEFER. | After beta data + partner conversations |
| Hyper-Local Pop-Up Sale Network | Heatmap (#28) covers density; "pop-up network" is marketing layer on top. DA: RETHINK. | After Heatmap proves cluster value |

| Pokéstop-Style Sale Markers | Gamification mismatch — estate sale shoppers skew older, Pokémon framing alienates core demo. Board rejected 12-0. (Session 156) | Revisit if shopper demo shifts younger |
| Trader Network | P2P trading adds liability, moderation burden, and trust complexity. Not core to organizer value prop. Board rejected. (Session 156) | After platform scale justifies marketplace expansion |
| Egg Hatching Mechanic | Too game-y for audience. Confusing metaphor for non-gamers. Board rejected. (Session 156) | Unlikely — consider lighter gamification instead |
| Team Rivalries | Competitive team mechanics don't match collaborative sale-shopping culture. Board rejected. (Session 156) | Unlikely — revisit only if community features prove demand |
| Raid-Style Group Events | Complex coordination + real-time features for uncertain demand. Board rejected. (Session 156) | After community features prove engagement |
| Professional Certifications | Requires industry partnerships, legal review, ongoing administration. Low ROI for beta stage. Board rejected. (Session 156) | After organizer base exceeds 100+ |
| Mood Boards | Nice-to-have but no clear retention or revenue driver. Board rejected as low priority. (Session 156) | After Collector Passport (#45) proves collection-tracking demand |
| AR Item Overlay | Hardware/browser support still spotty. High build cost for novelty feature. Board rejected. (Session 156) | Late 2027+ when WebXR matures |
| QR/Barcode Item Labels | Print scannable labels during intake → POS scan for instant lookup/checkout. Patrick flagged high potential from retail experience. Pairs with POS v2 + Rapidfire. Not in board review — added manually. (Session 156) | Strong candidate for Phase 4 promotion when POS sees real usage |
| City Weekend Landing Pages (Metro Explorer) | SEO-indexed per-metro pages (/grand-rapids-estate-sales). ISR + Schema.org markup. High SEO ROI but slow payoff (6–12 wk indexing). Innovation R1 Gap #4. (Session 156) | After 10+ active sales in GR; start with Tier 2 cities |
| Featured Listings (Feature Boost) | Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. Innovation R1 Gap #6. (Session 156) | After 500+ organizer accounts + 10+ active sales |
| Auto-Markdown (Smart Clearance) | Auto-discount engine: 50% day 2, 75% day 3, configurable floor. Removes manual repricing. Innovation R1 Gap #10. (Session 156) | Week 3–4 of beta once organizers run 1–2 sales |
| Approach Notes (Arrival Assistant) | Push notification at 500m: "Parking around back, enter via side gate." Geolocation-dependent. Innovation R1 Gap #13. (Session 156) | After Front Door Locator (#35) + Entrance Pin (#38) ship |
| Crowd-Sourced Corrections (Community Intel) | Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. Innovation R1 Gap #14. (Session 156) | After 500+ concurrent shoppers exist |
| Treasure Hunt QR (In-Sale Scavenger Hunt) | Organizer prints QR stickers for unique items → shoppers collect badges by scanning. Dwell time + impulse purchase driver. Innovation R1 Gap #15. (Session 156) | After gamification scaffold (badges/XP) ships |
| Shopper Profile + Friend Network | Public mini-card showing badges, finds, friend activity. Social proof layer. Innovation R1 bonus idea. (Session 156) | After gamification + UGC features prove engagement |
| Unified Print Kit | Combined PDF: yard sign QR + item barcode stickers in one download. Attribution loop (yard scan → checkout scan). Innovation R1 bonus idea. (Session 156) | After QR/Barcode Labels promoted to active |
| Fast Pass for Sales (Priority Entry) | $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. Innovation R2. (Session 156) | After beta proves high-demand sales exist |
| Sale Grand Finale Events | Last 2 hours become live-streamed event: flash auctions, confetti, 5x XP. Requires streaming infra. Innovation R2. (Session 156) | After Live Stream Sale Events proves appetite |
| VIP Behind-the-Scenes Tours | $99–299 video shoot package with creator. Professional content for organizer marketing. Innovation R2. (Session 156) | After creator/influencer network develops |
| Buddy System (Paired Shopping) | Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. Innovation R2. (Session 156) | After gamification + social features ship |
| Restoration & Upcycling Marketplace | Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. Innovation R2. (Session 156) | After UGC Photo Tags (#47) proves community content appetite |
| Book Club & Vinyl Community Hubs | Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. Innovation R2. (Session 156) | After Collector Passport (#45) proves specialty-interest demand |
| Brand & Designer Tracking | Follow specific brands/designers (Eames, Hermès). Alerts when matching items post. Authentication partner links. Innovation R2. (Session 156) | After tag system + Wishlist Alerts (#32) ship |
| FindA.Sale Network (Tier 3 Services) | Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. Innovation R2 "Big Bet." (Session 156) | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. Innovation R2. (Session 156) | After ML pipeline + personalization data exists |
| Estate Planning Toolkit | Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. Innovation R2. (Session 156) | After core organizer features stable + appraiser partnerships |
| State of Estate Sales Report | Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence product ($199/yr). Innovation R2. (Session 156) | After enough transaction data to be credible (6+ months) |

| Mystery Box Drops | Pre-beta, zero shoppers. Needs gamification scaffold (badges/XP) + shopper base. MI gambling/sweepstakes law review needed. Innovation R3 Casino lens. (Session 157) | After badge/XP system ships + Legal clears sweepstakes compliance |
| Daily Spin Wheel | Requires reward infrastructure + shopper base. Board may flag "too gamey" — position as daily check-in reward. Innovation R3 Casino lens. (Session 157) | After badge/XP system + 500+ daily shoppers |
| Boost My Listing ($1-$5 microtx) | Zero value until 50+ active sales + 500+ daily shoppers. FTC paid placement disclosure required. Innovation R3 Microtransaction lens. (Session 157) | After 500+ daily shoppers + Legal reviews FTC disclosure |
| Instant Appraisal Token ($0.99) | Needs sold-item data to be credible. Overlaps with AI Valuations (#30). Requires 1,000+ sold items per category. Innovation R3 Microtransaction lens. (Session 157) | After AI Valuations (#30) + 6 months transaction data |
| Priority Checkout Pass ($2.99) | Requires in-person QR validation + POS integration + organizer opt-in. Only viable at high-traffic sales. Innovation R3 Microtransaction lens. (Session 157) | After POS v2 sees real usage at busy sales |
| Scan-to-Know (NFC Item Tags) | NFC tags add $0.05-$0.15/item cost. Start with QR labels first (already in Deferred). Evolution of QR/Barcode Labels. Innovation R3 Big Box lens. (Session 157) | After QR labels prove demand |
| Smart Cart (Running Total) | Only works for items with digital prices in FindA.Sale. Requires organizer adoption of digital pricing + QR/NFC infrastructure. Innovation R3 Big Box lens. (Session 157) | After QR Labels + POS established |
| Agentic AI Assistant ("Scout") | Requires Wishlist Alerts (#32) + Collector Passport (#45) + sold-item data + preference learning. XL complexity. Overlaps with AI Buying Agent Scout already in Deferred — this is the scoped-down version. Innovation R3 Mobile lens. (Session 157) | After Wishlist + Collector Passport + 6 months preference data |
| Voice Search + Navigation | Web Speech API browser-native. Nice-to-have, not a retention driver. Background noise at busy sales may degrade recognition. Innovation R3 Mobile lens. (Session 157) | After core search is fully polished |
| RaaS for Organizers (Resale-as-a-Service) | Long-term platform vision: full business management suite. Japan/EU circular economy model. Many pieces already on roadmap individually. Innovation R3 International lens. (Session 157) | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | 42M native Spanish speakers in U.S. i18n framework + professional translation + AI description translation. Important for national scale, not urgent for GR beta. Innovation R3 International lens. (Session 157) | Before national expansion push — Q1 2027 |
| API-First Organizer Toolkit | Most endpoints exist internally; need OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier (#60). Enables Zapier integration. Innovation R3 Progressive Disclosure lens. (Session 157) | After core features stabilize — Q4 2026-Q1 2027 |
| Zapier/Make.com Integration Hub | Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. Innovation R3 Zapier lens. (Session 157) | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+ items/area). TikTok Shop 4.7% conversion rate proves format. Innovation R3 Social lens. (Session 157) | After Rapidfire + Listing Factory drive photo quality up |
| Haul Post Gallery (UGC Social Proof) | Post-purchase "show off your finds" with item linking + reactions. Builds on UGC Photo Tags (#47). r/ThriftStoreHauls (3M+ members) proves format. Innovation R3 Reddit lens. (Session 157) | After UGC Photo Tags (#47) ships |
| Organizer AMAs (Reddit-Style Q&A) | Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness + minimum audience. Innovation R3 Reddit lens. (Session 157) | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations before building custom rule engine. Over-engineering trap. Innovation R3 Zapier lens. (Session 157) | Hardcoded automations Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | AI adjusts prices based on real-time demand signals (views, favorites, sell-through). Extends Auto-Markdown (already in Deferred) to mid-sale optimization. Requires transaction data + price benchmarks. Innovation R3 Zapier/AI lens. (Session 157) | After 6+ months transaction data + AI Valuations (#30) |
| Sale Soundtrack (Ambient Vibes) | AI-suggested Spotify/Apple Music playlists matched to sale type. Fun differentiator. Stick to external playlist links — zero licensing risk. Innovation R3 Emerging lens. (Session 157) | Anytime — low priority but fun marketing splash |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Infrastructure

All infra complete. Backend: Railway. DB: Neon (82 migrations applied as of 2026-03-15). Frontend: Vercel (`finda.sale`). Git: `.\ push.ps1` replaces `git push`. See `claude_docs/CORE.md` and `claude_docs/STACK.md`.

---

## Maintenance Rules

This document is updated at **every session wrap** when:
- A Patrick checklist item is completed
- A feature ships
- Beta status changes
- A deferred item is activated or cancelled

**Enforcement:** `claude_docs/CORE.md` §15(b) and `claude_docs/SESSION_WRAP_PROTOCOL.md` Step 2.
Roadmap and session-log are always updated in the same commit.
