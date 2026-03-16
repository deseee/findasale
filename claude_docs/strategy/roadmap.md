# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-16 (v39 — Session 180: #5 Listing Type validation confirmed done (no code changes needed), #38 Entrance Pin confirmed done, #43 OG Image Generator wired. P0-1/P0-2 security fixes shipped.)
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

- [x] **Stripe** — query payment data, manage customers, troubleshoot payment issues directly. Stripe MCP connected S172 — unlocks #6 Seller Performance Dashboard real payment data + #65 Organizer Mode Tiers subscription billing.
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

## Shipped Features

### Organizer — Core Operations [SIMPLE]

| Feature | Tier | Notes |
|---------|------|-------|
| Create / Edit / Publish / Archive Sales | [SIMPLE] | Core workflow |
| Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | [SIMPLE] | Enum validation + validation matrix (Item #5) |
| Listing Type Schema Validation | [SIMPLE] | Item #5 — backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS enum consistency |
| Sale Map with Geocoding | [SIMPLE] | `/api/geocode` |
| Entrance Pin / Front Door Locator | [SIMPLE] | Item #35 + #38 — shopper convenience, parking + entrance detail on map |
| Sale Calendar View | [SIMPLE] | Organizer + shopper views |
| Item Add / Edit / Delete / Status | [SIMPLE] | Core CRUD |
| Photo Upload (Single + Multi) | [SIMPLE] | `/api/upload` with Cloudinary |
| Rapidfire Camera Mode | [SIMPLE] | Multi-photo AI draft pipeline |
| AI Tag Suggestions + Health Score | [SIMPLE] | Haiku-powered |
| Condition Grading (S/A/B/C/D) | [SIMPLE] | AI + manual override |
| Item Holds / Reservations | [SIMPLE] | `/api/reservations` with expiry |
| Hold Duration Configuration | [SIMPLE] | Per-sale configurable |
| Holds-Only Item View (Batch Ops) | [SIMPLE] | Item #24 — grouped by buyer |
| Sale Checklist | [SIMPLE] | Per-sale custom checklist (undocumented) |
| Email Reminders to Shoppers | [SIMPLE] | `/api/reminders` |
| Push Notification Subscriptions | [SIMPLE] | `/api/push` VAPID |
| Notification Inbox | [SIMPLE] | In-app notification center (undocumented) |
| Organizer Digest Emails | [SIMPLE] | Weekly activity summaries (undocumented) |
| Basic Organizer Profile | [SIMPLE] | businessName, phone, bio, website |
| Organizer Public Profile Page | [SIMPLE] | `/organizers/[slug]` |
| Pickup Scheduling | [SIMPLE] | Organizer slots + shopper booking (undocumented) |
| Sale Waitlist | [SIMPLE] | Shopper join + organizer broadcast (undocumented) |
| Flash Deals | [SIMPLE] | Time-limited price drops (undocumented) |
| Reviews (Receive + View) | [SIMPLE] | Shopper → sale + organizer (undocumented) |
| Contact Form | [SIMPLE] | `/api/contact` |
| Stripe Terminal POS (v2) | [SIMPLE] | Multi-item + cash, 10% fee parity |
| Payout Transparency / Earnings Dashboard | [SIMPLE] | Item-level fee breakdown + PDF |
| Organizer Referral (Fee Bypass) | [SIMPLE] | Item #11 — referralDiscountExpiry |
| Tiers Backend Infrastructure | [SIMPLE] | `/api/tiers` — getMyTier, syncTier (undocumented) |
| A/B Testing Infrastructure | [SIMPLE] | Internal optimization tool (undocumented) |
| Invites | [SIMPLE] | Invite-to-sale / invite-to-platform (undocumented) |
| Disputes Management | [SIMPLE] | Trust & safety (undocumented) |

### Organizer — Analytics & Intelligence [PRO]

| Feature | Tier | Notes |
|---------|------|-------|
| Seller Performance Dashboard | [PRO] | Per-sale analytics + insights |
| Organizer Insights (Lifetime) | [PRO] | Cross-sale totals + benchmarking |
| Batch Operations Toolkit | [PRO] | Item #8 — bulk price/status/category/tag/photo |
| CSV / JSON / Text Listing Exports | [PRO] | Item #27 Sprint 2 — multi-format output |
| Open Data Export (ZIP) | [PRO] | Item #66 — items/sales/purchases CSV |
| Payout PDF Export | [PRO] | Financial reporting for tax/accounting |
| Organizer Item Library (Consignment Rack) | [PRO] | Cross-sale reuse + price history |

### Organizer — Marketing & Brand Amplification [SIMPLE/PRO mixed]

| Feature | Tier | Notes |
|---------|------|-------|
| Social Templates (3 tones × 2 platforms) | [SIMPLE] | Item #27 Sprint 2 — Instagram/Facebook copy (brand-spreading) |
| Cloudinary Watermark on Photo Exports | [SIMPLE] | Item #27 Sprint 2 — brand protection (brand-spreading) |
| CSV/JSON Listing Exports (Listing Factory) | [SIMPLE] | Item #27 Sprint 2 — multi-platform sharing (brand-spreading) |
| Brand Kit | [PRO] | Item #31 — colors, logo, socials (auto-propagates) |
| Share Card Factory (OG Tags) | [SIMPLE] | Item #33 + #43 — branded social previews, dynamic OG images via Cloudinary |
| Message Templates | [PRO] | Saved organizer reply templates (undocumented) |
| Hype Meter | [SIMPLE] | Item #34 — real-time social proof |
| Near-Miss Nudges | [SIMPLE] | Item #61 — gamification progress prompts |

### Organizer — Sales Tools & Workflow [SIMPLE/PRO mixed]

| Feature | Tier | Notes |
|---------|------|-------|
| Virtual Queue / Line Management | [SIMPLE] | Item #6 — start/call next/join line + SMS (undocumented). S176 decision: free for all organizers. |
| Sale Reminders (Calendar + Remind Me) | [SIMPLE] | Item #37 — sale alerts for shoppers |
| Neighborhood Heatmap | [SIMPLE] | Item #28 — density-based Leaflet overlay |
| Organizer Reputation Score | [SIMPLE] | Item #71 — 1-5 stars public display |

### Shopper — Discovery & Search [FREE]

| Feature | Tier | Notes |
|---------|------|-------|
| Browse Sales (Homepage + Map) | [FREE] | `/map`, `/` |
| Sale Detail Page | [FREE] | `/sales/[slug]` |
| Item Detail Page | [FREE] | `/items/[id]` |
| Full-Text Search | [FREE] | Advanced filters + location |
| Category Browsing | [FREE] | `/categories` index + `/categories/[slug]` |
| Tag Browsing | [FREE] | `/tags/[slug]` ISR pages |
| Surprise Me / Serendipity Search | [FREE] | `/surprise-me` — random item discovery |
| Sale Calendar (Upcoming) | [FREE] | `/calendar` |
| Neighborhood Heatmap | [FREE] | Item #28 — visual density map |
| City Pages | [FREE] | `/cities` + `/city/[slug]` — city-level browsing (undocumented) |
| Neighborhood Pages | [FREE] | `/neighborhoods/[slug]` — local discovery (undocumented) |
| Trending Items / Sales | [FREE] | `/trending` page + API (undocumented) |
| Activity Feed | [FREE] | `/feed` page + API (undocumented) |
| Route Planning (Multi-Sale) | [FREE] | `/api/routes` — OSRM-based (undocumented) |
| Price History Tracking | [FREE] | `/api/price-history` — price changes over time (undocumented) |

### Shopper — Engagement & Community [FREE]

| Feature | Tier | Notes |
|---------|------|-------|
| Wishlists | [FREE] | Full CRUD, distinct from favorites (undocumented) |
| Saved Searches with notifyOnNew | [FREE] | `/api/saved-searches` — auto-notify on new matches (undocumented) |
| Shopper ↔ Organizer Messaging | [FREE] | `/messages/*` — threaded conversations (undocumented) |
| Buying Pools | [FREE] | `/api/buying-pools` — group buying on items (undocumented) |
| Bounties (Item Requests) | [FREE] | `/api/bounties` — shopper want-ads (undocumented) |
| Reviews (Submit Sale / Organizer) | [FREE] | Via `/api/reviews` |
| User Profile Page | [FREE] | `/profile` |
| Shopper Public Profiles | [FREE] | `/shoppers/[slug]` — collection showcase (undocumented) |
| Favorites | [FREE] | Save items for later |
| Notification Center | [FREE] | `/notifications` page |
| Unsubscribe / Preferences | [FREE] | `/unsubscribe` + `/api/unsubscribe` |
| Weekly Treasure Digest (Email) | [FREE] | Item #36 — MailerLite Sunday 6pm |
| Contact Organizer | [FREE] | Via messaging system |
| Entrance Pin (Location Detail) | [FREE] | Item #35 — parking + entrance info |
| Condition Guide | [FREE] | `/condition-guide` — educational page |
| FAQ / Guide / Terms / Privacy | [FREE] | Legal + help pages |
| Pickup Booking (Schedule Pickup) | [FREE] | Shopper-side of item #24 (undocumented) |

### Shopper — Gamification [FREE + HUNT_PASS]

| Feature | Tier | Notes |
|---------|------|-------|
| Points System | [FREE] | 1 pt/visit/day, tier-based (undocumented) |
| Streaks (Visit / Save / Purchase) | [FREE] | Daily streak tracking (undocumented) |
| Treasure Hunt (Daily) | [FREE] | Daily clue + category matching (undocumented) |
| Leaderboard (Shoppers + Organizers) | [FREE] | Public rankings (undocumented) |
| **Hunt Pass ($4.99/30 days)** | **[PAID_ADDON]** | **2× streak multiplier, 30-day recurring subscription, Stripe live billing (undocumented)** |

### Platform & AI [FREE/SIMPLE]

| Feature | Tier | Notes |
|---------|------|-------|
| AI Sale Planner Chat | [FREE] | `/plan` page, public (no auth), rate-limited — acquisition tool (undocumented) |
| AI Tag Suggestions (Haiku) | [SIMPLE] | Part of Rapidfire, all tiers |
| AI Condition Grade Suggestions | [SIMPLE] | S/A/B/C/D from photo |
| AI SEO Description Optimization | [SIMPLE] | High-intent search term bias |
| Shopper Referral Dashboard | [FREE] | `/referral-dashboard` — referral tracking (undocumented) |

---

## Feature Pipeline

### Next Up (Priority Order)

*All priority items currently shipped. See Shipped Features section above. See COMPLETED_PHASES.md for full history.*

### Phase 3 — Weeks 8–16

All Phase 3 features shipped. See Shipped Features section above and COMPLETED_PHASES.md.

| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 7 | Shopper Referral Rewards | 1–2 sprints | [FREE] Referral tracking, rewards distribution, email notifications. Deferred — no shoppers yet. |

### Phase 4 — Post-16 Weeks
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 13 | Premium Organizer Tier | 2 sprints | [TEAMS] Infrastructure — feature gating + billing integration. |
| 14 | Real-Time Status Updates | 1 sprint | [PRO] Organizer mobile widget, SMS/email alerts. |
| 15 | Shopper Referral Rewards expansion | 1 sprint | [FREE] Viral growth loop. |
| 16 | Verified Organizer Badge | 1–2 sprints | [PRO] Professional differentiation, trust signal. |
| 17 | Bid Bot Detector + Fraud Confidence Score | 1–1.5 sprints | [PRO] Flag suspicious bidding patterns (rapid same-user bids). Human review, not auto-ban. Fraud confidence score visible to organizers. Protects auction integrity. Steelman: STRONG, quick win. (Innovation sweep; validated session 155) |
| 18 | Post Performance Analytics | 1 sprint | [PRO] UTM tracking on social template downloads → "your Instagram post got 200 clicks" in organizer dashboard. (Innovation sweep) |
| 19 | Passkey / WebAuthn Support | 1–2 sprints | [SIMPLE] Phishing-resistant auth alongside OAuth. Phase in early before scale. (Innovation sweep) |
| 20 | Proactive Degradation Mode | 1 sprint | [PRO] Latency > 2s → auto-drop analytics collection, reduce image quality, preserve core buy/sell flow. (Innovation sweep) |
| 21 | User Impact Scoring in Sentry | 0.5 sprints | Infrastructure — correlate errors with affected user IDs + transaction value. Prioritize by user damage, not raw error count. (Innovation sweep) |
| 22 | Low-Bandwidth Mode (PWA) | 1 sprint | [SIMPLE] Detect slow connections, auto-reduce photo quality, disable video previews. Organizers on job sites often have 2G. (Innovation sweep) |
| 23 | Unsubscribe-to-Snooze (MailerLite) | 0.5 sprints | [SIMPLE] Pause emails 30 days instead of full unsubscribe. Preserves seasonal organizers. (Innovation sweep) |
| 25 | Organizer Item Library (Consignment Rack) | 2 sprints | [PRO] Upload once, reuse across sales. Items become compounding assets. Full cross-sale search, price history, sold vs. unsold analytics. (Innovation session 129) |
| 29 | Shopper Loyalty Passport | 2 sprints | [FREE] Gamified repeat-visit system — stamps, badges, early-access perks. Drives shopper retention. Steelman: STRONG. Ship post-beta when shopper base exists. (Innovation session 155) |
| 30 | AI Item Valuation & Comparables | 2 sprints | [PRO] Price range suggestions from sold-item data + visual embeddings. Leverages existing AI pipeline. Requires 100+ sold items per category to be credible. (Innovation session 155) |
| 31 | Organizer Brand Kit | 1.5 sprints | [PRO] Auto-expand organizer colors/logo across all templates, exports, and social posts. Natural extension of Listing Factory (#27). Premium tier upsell path. Schema shipped with Listing Factory Sprint 1 (S166, migration 20260315000002); UI deferred to standalone session. (Innovation session 155) |
| 32 | Shopper Wishlist Alerts + Smart Follow | 2 sprints | [FREE] Shoppers set category/tag/organizer preferences → push alerts when matching items list. Foundational for shopper retention and intent data. Ship after Listing Factory drives initial traffic. (Innovation session 155) |
| 38 | Entrance Pin | 0.5 sprint | [SIMPLE] Organizer drops a pin for parking/entrance on sale map. Extends Front Door Locator (#35) with richer location data. Reduces shopper confusion at multi-building estates. (Board v26, Tier 2) |
| 39 | Photo Op Stations | 1 sprint | [PRO] Designated "selfie spot" markers at sales — branded photo frames, shareable moments. Organizers set locations; shoppers share UGC. Viral loop + fun factor. (Board v26, Tier 2) |
| 40 | Sale Hubs | 1.5 sprints | [PRO] Group nearby sales into a "hub" — shared map, combined route, hub landing page. Weekend sale-hopping made effortless. Builds on Heatmap (#28) density data. (Board v26, Tier 2) |
| 41 | Flip Report | 1.5 sprints | [PRO] "What sold, what didn't, what to price differently next time." Post-sale analytics PDF/dashboard for organizers. Subscription potential for premium tier. (Board v26, Tier 2) |
| 42 | Voice-to-Tag | 1 sprint | [PRO] Organizer speaks item description during Rapidfire → AI transcribes + extracts tags automatically. Hands-free cataloging. Leverages existing AI pipeline + Web Speech API. (Board v26, Tier 2) |
| 43 | OG Image Generator | 0.5 sprint | [SIMPLE] Cloudinary-powered dynamic OG images for every sale/item page. Branded previews in iMessage, Facebook, Twitter shares. Pairs with Share Card Factory (#33). (Board v26, Tier 2) |
| 44 | Neighborhood Sale Day | 1 sprint | [PRO] Organizers in a neighborhood coordinate a shared sale date. Hub landing page + combined marketing. Community event energy. Builds on Sale Hubs (#40). (Board v26, Tier 2) |
| 45 | Collector Passport | 1.5 sprints | [FREE] Gamified collection tracker — "I collect depression glass, Fiestaware, mid-century furniture." Personalized alerts when matching items appear. Deeper than Wishlist (#32) — identity-based. (Board v26, Tier 2) |
| 46 | Treasure Typology Classifier | 2 sprints | [PRO] ML model that classifies items into collector categories (Art Deco, MCM, Americana, etc.) from photos. Powers Collector Passport, tag suggestions, and search refinement. Requires training data from shipped items. (Innovation bonus, Board v26 Tier 2) |
| 61 | Near-Miss Nudges | 0.25 sprint | [SIMPLE] Casino-psychology progress nudges: "You're 1 favorite away from unlocking Early Bird Access!" Layers onto any gamification feature as it ships. Variable-ratio schedule drives 30-40% higher completion. Ethical: real progress only, no manufactured near-misses. (Innovation R3, Casino lens) |
| 62 | Digital Receipt + Returns | 1-2 sprints | [FREE] Auto-generate digital receipt with item photos + prices after every POS transaction. Push to shopper's app profile. Optional organizer-set return window (24h/48h/none). Builds trust, enables returns on high-value items, feeds purchase history for ML. Pairs with POS v2 + Loot Log (#50). (Innovation R3, Big Box lens) |
| 63 | Dark Mode + Accessibility-First | 1.5 sprints | [FREE] Tailwind dark variant across all components + system preference detection + high-contrast outdoor mode + font sizing controls. WCAG 2.1 AA compliance. Estate sale shoppers skew older — larger fonts, higher contrast, better outdoor visibility are real needs. SEO boost from Lighthouse accessibility scores. (Innovation R3, Mobile lens) |
| 65 | Organizer Mode Tiers (Simple/Pro/Teams) | 2 sprints | [PRO] Progressive disclosure framework. Simple (5 buttons: create → photo → price → publish → paid). Pro (batch ops, analytics, tags, branding, exports). Teams (API access, bulk import/export, webhooks, multi-user teams, white-label). Feature-flag architecture — every future feature gets tagged with its tier. Architectural answer to "simple surface + complex depth." (Innovation R3, Progressive Disclosure lens) |
| 67 | Social Proof Notifications | 0.5 sprint | [SIMPLE] Real-time aggregate activity: "47 people viewed this today." Friend activity for connected users. Extends Hype Meter (#34) with individual social connections. Opt-in privacy controls. Ships with Hype Meter. (Innovation R3, Social lens) |
| 68 | Command Center Dashboard | 2 sprints | [PRO] Multi-sale overview for power organizers managing 2-3+ sales simultaneously. Key metrics per sale, quick-switch, alert feed ("Sale A has 3 expired holds"), customizable widgets for Teams tier. Pro/Teams Mode feature. (Innovation R3, Progressive Disclosure lens) |
| 69 | Local-First Offline Mode | 3 sprints | [PRO] Full offline capability via service worker + IndexedDB. Catalog items, set prices, take photos with zero internet. Sync on reconnect. Conflict resolution (last-write-wins for fields, merge for photos). Competitive requirement — PROSALE works offline. Estate sales happen in basements/barns with no signal. (Innovation R3, GitHub lens) |
| 70 | Live Sale Feed | 1 sprint | [SIMPLE] Real-time activity stream during active sales: "Victorian lamp just sold for $45!" "New hold on Eames chair." WebSocket-powered, leverages existing POS infrastructure. 80% of livestream FOMO at 10% of livestream complexity. Ships after POS v2 stabilizes. (Innovation R3, Social lens) |
| 71 | Organizer Reputation Score | 1.5 sprints | [SIMPLE] Public trust score (1-5 stars) from: response time, sale frequency, photo quality (AI), shopper ratings, dispute rate. Displayed on profile + every listing. "New Organizer" badge for cold-start. Foundational trust infrastructure for marketplace scale. Ship before national expansion. (Innovation R3, Emerging lens) |

---

### Phase 5 — Post-Beta Scale (Board v26, Tier 3)
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 47 | UGC Photo Tags | 1.5 sprints | [FREE] Shoppers tag and share photos of finds. Social proof + free content marketing. Moderation queue for organizers. Builds community around sales. |
| 48 | Treasure Trail Route Builder | 1.5 sprints | [FREE] Shoppers build multi-sale route plans with time estimates, drive order, and "don't miss" item highlights. Extends existing OSRM route planning (session 114). Gamified "complete the trail" element. |
| 49 | City Heat Index | 1 sprint | [FREE] City-level "estate sale activity" score — weekly ranking of hottest metro areas. Content marketing magnet + SEO play. Powered by aggregated sale data. (Innovation bonus, Board v26) |
| 50 | Loot Log | 1.5 sprints | [FREE] Personal purchase history + "my collection" gallery for shoppers. Social sharing of best finds. Retention through identity investment. |
| 51 | Sale Ripples | 1 sprint | [FREE] Smart notification algorithm — "A sale just posted 2 miles from a sale you liked." Proximity + preference signals. Drives spontaneous visits. (Innovation bonus, Board v26) |
| 52 | Estate Sale Encyclopedia | 3 sprints | [FREE] Crowdsourced knowledge base: item identification guides, era/style references, price benchmarks by region. Long-tail SEO moat. Community contribution model. |
| 53 | Cross-Platform Aggregator | 2 sprints | [TEAMS] Pull listings from EstateSales.NET, Craigslist, Facebook Marketplace into unified search. "Search everywhere from one place." Major moat if executed. Legal review required. |
| 54 | Crowdsourced Appraisal API | 2.5 sprints | [PAID_ADDON] Users submit photos → community + AI estimate value range. Revenue potential as standalone tool or API. Requires critical mass of knowledgeable users. |
| 55 | Seasonal Discovery Challenges | 1 sprint | [FREE] Time-limited themed challenges — "Holiday Treasure Hunt" (Dec), "Spring Refresh" (Mar). Badges + leaderboard placement. Drives seasonal engagement spikes. |

### Vision — Long-Term (Board v26, Tier 4)
| # | Feature | Est. | Notes |
|---|---------|------|-------|
| 56 | Printful Merch Store | 1 sprint | [FREE/PAID_ADDON] Drop-shipped branded merch (tees, totes, stickers) via Printful API. Zero inventory risk. Revenue diversification. "I ❤️ Estate Sales" lifestyle brand play. |
| 57 | Shiny / Rare Item Badges | 1 sprint | [FREE] Special visual treatment for high-value or unusual items. Pokémon-inspired rarity system. Drives clicks and shares. Fun factor. |
| 58 | Achievement Badges | 1.5 sprints | [FREE] Shopper + organizer achievement system — "First Sale", "100 Items Listed", "Weekend Warrior." Retention through status. |
| 59 | Streak Rewards | 1 sprint | [FREE] "Visit 3 weekends in a row → unlock early access." Habit formation mechanic. Drives consistent engagement. |
| 60 | Premium Tier Bundle | 2 sprints | [PRO] Paid organizer tier bundling: Brand Kit (#31), Flip Report (#41), priority support, advanced analytics. Revenue milestone. Requires enough free-tier usage to demonstrate value. |

---

## Agent Task Queue

Proactive tasks assigned to the fleet. Not product features — operational work agents own.

### Pre-Beta — All Done ✅

OAuth Security Red-Team, Payment Edge-Case QA, Full-Text Search Migration Rollback Plan, Beta Organizer Email Sequence, and Fee Decision Brief all complete. See COMPLETED_PHASES.md.

### Beta Support — All Done ✅

Spring Content Push, Beta Dry Run, and Support KB Pre-Population all complete. See `claude_docs/archive/marketing/` and `claude_docs/beta-launch/`.

### Infrastructure (One-time, pays off indefinitely)
| Task | Agent | Priority | Brief |
|------|-------|----------|-------|
| Bug Blitz Scoping | findasale-qa + health-scout | P0 | Produce prioritized P0/P1/P2 bug list before Session 105 so dev session is pure execution |
| ~~RECOVERY.md Decision Trees~~ | findasale-ops | ✅ Done | Decision trees section live in `claude_docs/RECOVERY.md` with safe-to-auto vs. needs-Patrick labels. |
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
|---------|--------|--------|
| White-label MaaS | [Tier: TEAMS] Business decision — beta validation first | After beta data |
| Consignment Integration | [Tier: PRO] Thrift store POS — post-beta complexity | After beta data |
| QuickBooks Integration | [Tier: SIMPLE] CSV export covers 80% of need | When organizers ask |
| Video-to-inventory | [Tier: FUTURE] Vision models can't reliably segment rooms yet | Late 2026+ |
| Multi-metro expansion | [Tier: SIMPLE] Beta validation first | After beta data |
| AR Furniture Preview | [Tier: FUTURE] Hardware not ready | Long-term R&D |
| BUSINESS_PLAN.md rewrite | [Tier: TBD] Current doc still references Grand Rapids as primary focus; needs update to reflect national open-to-all-organizers positioning and current fee/feature state | After beta data confirms positioning |
| Zero-Downtime Migration Framework | Infrastructure — blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | Infrastructure — deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes |
| Audit Automation Library | Infrastructure — codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch |

| Instant Flash Auctions | [Tier: PRO] Pre-beta, zero shoppers — no demand signal yet. DA: PAUSE. | After beta + 4–6 wks shopper data |
| Live Stream Sale Events | [Tier: PRO] Heaviest build (3–4 sprints), requires on-camera organizers. DA: RETHINK. | After beta proves organizer appetite |
| Verified Organizer Insurance Badge | [Tier: TEAMS] Requires micro-insurance partner — unvalidated market. DA: DEFER. | After beta data + partner conversations |
| Hyper-Local Pop-Up Sale Network | [Tier: FREE] Heatmap (#28) covers density; "pop-up network" is marketing layer on top. DA: RETHINK. | After Heatmap proves cluster value |

| Pokéstop-Style Sale Markers | [Tier: FREE] Gamification mismatch — estate sale shoppers skew older, Pokémon framing alienates core demo. Board rejected 12-0. (Session 156) | Revisit if shopper demo shifts younger |
| Trader Network | [Tier: TEAMS] P2P trading adds liability, moderation burden, and trust complexity. Not core to organizer value prop. Board rejected. (Session 156) | After platform scale justifies marketplace expansion |
| Egg Hatching Mechanic | [Tier: FREE] Too game-y for audience. Confusing metaphor for non-gamers. Board rejected. (Session 156) | Unlikely — consider lighter gamification instead |
| Team Rivalries | [Tier: FREE] Competitive team mechanics don't match collaborative sale-shopping culture. Board rejected. (Session 156) | Unlikely — revisit only if community features prove demand |
| Raid-Style Group Events | [Tier: FREE] Complex coordination + real-time features for uncertain demand. Board rejected. (Session 156) | After community features prove engagement |
| Professional Certifications | [Tier: TEAMS] Requires industry partnerships, legal review, ongoing administration. Low ROI for beta stage. Board rejected. (Session 156) | After organizer base exceeds 100+ |
| Mood Boards | [Tier: FREE] Nice-to-have but no clear retention or revenue driver. Board rejected as low priority. (Session 156) | After Collector Passport (#45) proves collection-tracking demand |
| AR Item Overlay | [Tier: TEAMS] Hardware/browser support still spotty. High build cost for novelty feature. Board rejected. (Session 156) | Late 2027+ when WebXR matures |
| QR/Barcode Item Labels | [Tier: SIMPLE] Print scannable labels during intake → POS scan for instant lookup/checkout. Patrick flagged high potential from retail experience. Pairs with POS v2 + Rapidfire. Not in board review — added manually. (Session 156) | Strong candidate for Phase 4 promotion when POS sees real usage |
| City Weekend Landing Pages (Metro Explorer) | [Tier: FREE] SEO-indexed per-metro pages (/grand-rapids-estate-sales). ISR + Schema.org markup. High SEO ROI but slow payoff (6–12 wk indexing). Innovation R1 Gap #4. (Session 156) | After 10+ active sales in GR; start with Tier 2 cities |
| Featured Listings (Feature Boost) | [Tier: PAID_ADDON] Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. Innovation R1 Gap #6. (Session 156) | After 500+ organizer accounts + 10+ active sales |
| Auto-Markdown (Smart Clearance) | [Tier: PRO] Auto-discount engine: 50% day 2, 75% day 3, configurable floor. Removes manual repricing. Innovation R1 Gap #10. (Session 156) | Week 3–4 of beta once organizers run 1–2 sales |
| Approach Notes (Arrival Assistant) | [Tier: SIMPLE] Push notification at 500m: "Parking around back, enter via side gate." Geolocation-dependent. Innovation R1 Gap #13. (Session 156) | After Front Door Locator (#35) + Entrance Pin (#38) ship |
| Crowd-Sourced Corrections (Community Intel) | [Tier: FREE] Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. Innovation R1 Gap #14. (Session 156) | After 500+ concurrent shoppers exist |
| Treasure Hunt QR (In-Sale Scavenger Hunt) | [Tier: FREE] Organizer prints QR stickers for unique items → shoppers collect badges by scanning. Dwell time + impulse purchase driver. Innovation R1 Gap #15. (Session 156) | After gamification scaffold (badges/XP) ships |
| Shopper Profile + Friend Network | [Tier: FREE] Public mini-card showing badges, finds, friend activity. Social proof layer. Innovation R1 bonus idea. (Session 156) | After gamification + UGC features prove engagement |
| Unified Print Kit | [Tier: SIMPLE] Combined PDF: yard sign QR + item barcode stickers in one download. Attribution loop (yard scan → checkout scan). Innovation R1 bonus idea. (Session 156) | After QR/Barcode Labels promoted to active |
| Fast Pass for Sales (Priority Entry) | [Tier: PAID_ADDON] $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. Innovation R2. (Session 156) | After beta proves high-demand sales exist |
| Sale Grand Finale Events | [Tier: PRO] Last 2 hours become live-streamed event: flash auctions, confetti, 5x XP. Requires streaming infra. Innovation R2. (Session 156) | After Live Stream Sale Events proves appetite |
| VIP Behind-the-Scenes Tours | [Tier: PAID_ADDON] $99–299 video shoot package with creator. Professional content for organizer marketing. Innovation R2. (Session 156) | After creator/influencer network develops |
| Buddy System (Paired Shopping) | [Tier: FREE] Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. Innovation R2. (Session 156) | After gamification + social features ship |
| Restoration & Upcycling Marketplace | [Tier: FREE] Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. Innovation R2. (Session 156) | After UGC Photo Tags (#47) proves community content appetite |
| Book Club & Vinyl Community Hubs | [Tier: FREE] Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. Innovation R2. (Session 156) | After Collector Passport (#45) proves specialty-interest demand |
| Brand & Designer Tracking | [Tier: FREE] Follow specific brands/designers (Eames, Hermès). Alerts when matching items post. Authentication partner links. Innovation R2. (Session 156) | After tag system + Wishlist Alerts (#32) ship |
| FindA.Sale Network (Tier 3 Services) | [Tier: FUTURE] Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. Innovation R2 "Big Bet." (Session 156) | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | [Tier: PRO] Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. Innovation R2. (Session 156) | After ML pipeline + personalization data exists |
| Estate Planning Toolkit | [Tier: TEAMS] Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. Innovation R2. (Session 156) | After core organizer features stable + appraiser partnerships |
| State of Estate Sales Report | [Tier: PAID_ADDON] Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence product ($199/yr). Innovation R2. (Session 156) | After enough transaction data to be credible (6+ months) |

| Mystery Box Drops | [Tier: FREE] Pre-beta, zero shoppers. Needs gamification scaffold (badges/XP) + shopper base. MI gambling/sweepstakes law review needed. Innovation R3 Casino lens. (Session 157) | After badge/XP system ships + Legal clears sweepstakes compliance |
| Daily Spin Wheel | [Tier: FREE] Requires reward infrastructure + shopper base. Board may flag "too gamey" — position as daily check-in reward. Innovation R3 Casino lens. (Session 157) | After badge/XP system + 500+ daily shoppers |
| Boost My Listing ($1-$5 microtx) | [Tier: PAID_ADDON] Zero value until 50+ active sales + 500+ daily shoppers. FTC paid placement disclosure required. Innovation R3 Microtransaction lens. (Session 157) | After 500+ daily shoppers + Legal reviews FTC disclosure |
| Instant Appraisal Token ($0.99) | [Tier: PAID_ADDON] Needs sold-item data to be credible. Overlaps with AI Valuations (#30). Requires 1,000+ sold items per category. Innovation R3 Microtransaction lens. (Session 157) | After AI Valuations (#30) + 6 months transaction data |
| Priority Checkout Pass ($2.99) | [Tier: PAID_ADDON] Requires in-person QR validation + POS integration + organizer opt-in. Only viable at high-traffic sales. Innovation R3 Microtransaction lens. (Session 157) | After POS v2 sees real usage at busy sales |
| Scan-to-Know (NFC Item Tags) | [Tier: SIMPLE] NFC tags add $0.05-$0.15/item cost. Start with QR labels first (already in Deferred). Evolution of QR/Barcode Labels. Innovation R3 Big Box lens. (Session 157) | After QR labels prove demand |
| Smart Cart (Running Total) | [Tier: SIMPLE] Only works for items with digital prices in FindA.Sale. Requires organizer adoption of digital pricing + QR/NFC infrastructure. Innovation R3 Big Box lens. (Session 157) | After QR Labels + POS established |
| Agentic AI Assistant ("Scout") | [Tier: PRO] Requires Wishlist Alerts (#32) + Collector Passport (#45) + sold-item data + preference learning. XL complexity. Overlaps with AI Buying Agent Scout already in Deferred — this is the scoped-down version. Innovation R3 Mobile lens. (Session 157) | After Wishlist + Collector Passport + 6 months preference data |
| Voice Search + Navigation | [Tier: SIMPLE] Web Speech API browser-native. Nice-to-have, not a retention driver. Background noise at busy sales may degrade recognition. Innovation R3 Mobile lens. (Session 157) | After core search is fully polished |
| RaaS for Organizers (Resale-as-a-Service) | [Tier: FUTURE] Long-term platform vision: full business management suite. Japan/EU circular economy model. Many pieces already on roadmap individually. Innovation R3 International lens. (Session 157) | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | [Tier: SIMPLE] 42M native Spanish speakers in U.S. i18n framework + professional translation + AI description translation. Important for national scale, not urgent for GR beta. Innovation R3 International lens. (Session 157) | Before national expansion push — Q1 2027 |
| API-First Organizer Toolkit | [Tier: TEAMS] Most endpoints exist internally; need OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier (#60). Enables Zapier integration. Innovation R3 Progressive Disclosure lens. (Session 157) | After core features stabilize — Q4 2026-Q1 2027 |
| Zapier/Make.com Integration Hub | [Tier: TEAMS] Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. Innovation R3 Zapier lens. (Session 157) | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | [Tier: FREE] Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+ items/area). TikTok Shop 4.7% conversion rate proves format. Innovation R3 Social lens. (Session 157) | After Rapidfire + Listing Factory drive photo quality up |
| Haul Post Gallery (UGC Social Proof) | [Tier: FREE] Post-purchase "show off your finds" with item linking + reactions. Builds on UGC Photo Tags (#47). r/ThriftStoreHauls (3M+ members) proves format. Innovation R3 Reddit lens. (Session 157) | After UGC Photo Tags (#47) ships |
| Organizer AMAs (Reddit-Style Q&A) | [Tier: FREE] Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness + minimum audience. Innovation R3 Reddit lens. (Session 157) | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | [Tier: PRO] Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations before building custom rule engine. Over-engineering trap. Innovation R3 Zapier lens. (Session 157) | Hardcoded automations Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | [Tier: PRO] AI adjusts prices based on real-time demand signals (views, favorites, sell-through). Extends Auto-Markdown (already in Deferred) to mid-sale optimization. Requires transaction data + price benchmarks. Innovation R3 Zapier/AI lens. (Session 157) | After 6+ months transaction data + AI Valuations (#30) |
| Sale Soundtrack (Ambient Vibes) | [Tier: FREE] AI-suggested Spotify/Apple Music playlists matched to sale type. Fun differentiator. Stick to external playlist links — zero licensing risk. Innovation R3 Emerging lens. (Session 157) | Anytime — low priority but fun marketing splash |

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

**Archival Log:**
- pricing-strategy.md archived 2026-03-15 — superseded by pricing-and-tiers-overview-2026-03-15.md
