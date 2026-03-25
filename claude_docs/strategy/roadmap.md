# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-25 (v69 — S271–S278: #72 dual-role schema, #73 two-channel notifications, #74 consent flow, #75 tier lapse, #87 brand tracking, #88 haul posts, #122 Explorer's Guild rebrand, #123 XP economy, #125 CSV export, #127 POS tiers, #128 support stack, #131 share templates, #132 à la carte fee, #134 plan-a-sale card, auction close flow, platform safety P1–P2 (#93–#98) all shipped. 42 items total confirmed deployed since S266. Roadmap reflects true shipped state as of S279 audit.)

**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Product Summary

FindA.Sale is a PWA for sale organizers and shoppers, reducing manual work and improving inventory visibility across the sale lifecycle.
The platform currently ships **95+ features across 4 tiers** (FREE, SIMPLE, PRO, TEAMS) and
supports organizer-side operations, analytics, marketing, and
shopper-side discovery, engagement, and gamification.
Production MVP launched Q1 2026. Full auction lifecycle (bidding + close flow + Stripe winner checkout) live.

---

## Formatting Rules (Agents Must Read Before Editing)

**STOP. Read this section before making any changes to this file. This is binding on all agents. Violations will be flagged by findasale-records.**

1. **No session-specific notes in this file.** Do not add QA audit results, bug lists, session numbers, or work-session plans to the roadmap. Those belong in:
   - Session-specific findings → `claude_docs/session-log.md` or `claude_docs/audits/`
   - QA results → `claude_docs/health-reports/`
   - Work queues → `claude_docs/STATE.md` or `claude_docs/next-session-prompt.md`
   - Operational tasks → `claude_docs/operations/`

2. **Session numbers must not appear in Notes.** Write "QA confirmed" not "QA re-confirmed S201". Write "P0 race condition fixed" not "P0 FIX S199".

3. **Column format is locked.** Shipped feature tables must use exactly these columns: `# | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes`. Do not add or remove columns without Patrick's approval.

4. **Status markers:** ✅ = confirmed working, 📋 = pending/not tested, 📋PEND = pending QA, ⚠️ = issues found, 🔧 = fix in progress, N/A = not human-testable (infrastructure/internal only).

5. **Deferred section:** Keep all deferred items — even rejected ideas may spark good ones. Use format: `Feature | Tier | Reason | Revisit Trigger`.

6. **When adding a new shipped feature:** Add it to the correct section table with all 11 columns filled. Set Chrome/Nav/Human to 📋 unless already verified.

7. **When updating status:** Only change the specific column that changed. Do not rewrite the Notes column or other feature rows.

---

## Patrick's Checklist

### Business Formation + Legal
- [x] File Michigan LLC with LARA ✅
- [x] Get EIN from IRS.gov ✅
- [x] Open business bank account ✅
- [x] Set up support@finda.sale email forwarding ✅ (2026-03-06)
- [ ] Order business cards (~$25) — files in `claude_docs/brand/`
- [ ] Create Google Business Profile for FindA.Sale
- [ ] Open Stripe business account
- [ ] Google Search Console verification
- [ ] Set up Google Voice for support line

### Credentials + Services
- [x] Google Cloud account + Vision API key ✅ (2026-03-05)
- [x] Anthropic API key (for Claude Haiku) ✅ (2026-03-05)
- [x] UptimeRobot monitoring ✅ (2026-03-05)
- [x] Rotate Neon database credentials ✅ (2026-03-09)
- [x] OAuth credentials (Google, Facebook) → Vercel env vars ✅ (2026-03-06)
- [x] Platform fee locked at 10% flat ✅ (session 106)
- [ ] VAPID keys confirmed in production
- [ ] **⚠️ Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway**
- [ ] **⚠️ Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Railway**

### Beta Recruitment
- [ ] Identify 5 target beta organizers — outreach template ready (`claude_docs/beta-launch/organizer-outreach.md`)
- [ ] Schedule 1-on-1 onboarding sessions
- [ ] Hand-hold first 3 sales
- [ ] Collect structured feedback
- [ ] Sync: feedback → Claude for iteration

### Pre-Beta Prep
- [ ] Brand Voice Session — use brand-voice plugin to establish documented voice, tone, and messaging pillars before beta outreach and email sequences
- [ ] Trademark filing — see backlog item #82

### Human Verification (Patrick must run)
- [ ] **Auction E2E — Stripe test mode:** Set auction end time on a test item → click End Auction button → confirm winner notification sent → open Stripe checkout link → complete checkout → confirm organizer close notification fires. (Documented S279; feature shipped S278.)

---

## Feature Inventory — Shipped

### Organizer — Core Operations [SIMPLE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Create / Edit / Publish / Archive Sales | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Core workflow |
| — | Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Enum validation + validation matrix |
| 5 | Listing Type Schema Validation | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS |
| — | Sale Map with Geocoding | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | `/api/geocode` |
| 35 | Entrance Pin / Front Door Locator | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Shopper convenience, parking + entrance detail |
| — | Sale Calendar View | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Organizer + shopper views |
| — | Item Add / Edit / Delete / Status | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅S125 | ✅ | 📋 | Core CRUD |
| — | Photo Upload (Single + Multi) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/upload` with Cloudinary |
| — | Rapidfire Camera Mode | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Multi-photo AI draft pipeline |
| — | AI Tag Suggestions + Health Score | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅S124 | ✅ | 📋 | Haiku-powered, part of intake |
| — | Condition Grading (S/A/B/C/D) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | AI + manual override |
| — | Item Holds / Reservations | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/reservations` with expiry |
| — | Hold Duration Configuration | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Per-sale configurable |
| 24 | Holds-Only Item View (Batch Ops) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Grouped by buyer |
| — | Sale Checklist | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Per-sale custom checklist |
| — | Email Reminders to Shoppers | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/reminders` |
| — | Push Notification Subscriptions | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/push` VAPID |
| — | Notification Inbox | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | In-app notification center |
| — | Organizer Digest Emails | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Weekly activity summaries |
| — | Basic Organizer Profile | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | businessName, phone, bio, website |
| — | Organizer Public Profile Page | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/organizers/[slug]` |
| — | Password Reset Flow | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Email-based password recovery |
| — | Refund Policy Configuration | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Per-organizer configurable refund window |
| — | Pickup Scheduling | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Organizer slots + shopper booking |
| — | Sale Waitlist | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Shopper join + organizer broadcast |
| — | Flash Deals | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Time-limited price drops |
| — | Reviews (Receive + View) | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Shopper → sale + organizer |
| — | Contact Form | PUB | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/contact` |
| — | Stripe Terminal POS (v2) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Multi-item + cash, 10% fee parity |
| — | Payout Transparency / Earnings Dashboard | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Item-level fee breakdown + PDF |
| 11 | Organizer Referral (Fee Bypass) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | referralDiscountExpiry |
| — | Tiers Backend Infrastructure | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | N/A | `/api/tiers` — getMyTier, syncTier |
| 65 | Organizer Mode Tiers (Simple/Pro/Teams) | ORG | PRO | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | 📋 | Full infrastructure: SubscriptionTier enum, tierGate.ts, requireTier, Stripe billing, Progressive Disclosure UI |
| 71 | Organizer Reputation Score | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | 1-5 star public score + reputation.tsx frontend |
| 22 | Low-Bandwidth Mode (PWA) | BOTH | SIMPLE | — | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Network API detection, localStorage, LowBandwidthContext |
| 19 | Passkey / WebAuthn Login | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | QA confirmed, clear to deploy |
| — | A/B Testing Infrastructure | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | N/A | Internal optimization tool |
| — | Invites | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Invite-to-sale / invite-to-platform |
| — | Disputes Management | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Trust & safety |
| 72 | Dual-Role Account Schema | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | JWT roles[] array, auth middleware updated. Enables organizer + shopper in same account |
| 73 | Two-Channel Notification System | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | OPERATIONAL (organizer) + DISCOVERY (shopper) channels. Inbox tabs. Migration applied |
| 74 | Role-Aware Registration Consent | BOTH | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Opt-in checkboxes at signup. Attorney review of consent copy required before launch |
| 75 | Tier Lapse State Logic | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | 8am warning + 11pm lapse cron. Dashboard banner. Suspends ORG features, retains SHO features |
| 127 | POS Value Unlock Tiers | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Dual-gate (tx+revenue). 3 tiers at 5/20/50 tx. /api/organizer/pos-tiers + PosTierGates.tsx |
| 131 | Share & Promote Templates | ORG | SIMPLE | — | — | ✅ | ✅ | 📋 | — | 📋 | SharePromoteModal: 4 templates (social post, flyer, email invite, neighborhood post) |
| 135 | Social Templates Expansion | ORG | SIMPLE | — | — | ✅ | ✅ | 📋 | — | 📋 | SharePromoteModal extended: TikTok, Pinterest, Threads, Nextdoor tabs added. Shipped S280. |
| 89 | Unified Print Kit | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/organizer/print-kit/[saleId]` — yard sign (QR + address + dates) + per-item price tags (6/page, photo + QR + price + condition). Print CSS included. Shipped S280. |
| 132 | À La Carte Single-Sale Fee ($9.99) | ORG | PAID_ADDON | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Sale.purchaseModel + alaCarte + alaCarteFeePaid. Stripe checkout. AlaCartePublishModal for SIMPLE tier |
| 134 | Plan a Sale Dashboard Card | ORG | SIMPLE | — | — | ✅ | ✅ | 📋 | ✅ | 📋 | "Coming Soon" card on organizer dashboard overview tab |

### Organizer — Analytics & Intelligence [PRO]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Seller Performance Dashboard | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Per-sale analytics + insights |
| — | Organizer Insights (Lifetime) | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Cross-sale totals + benchmarking |
| 8 | Batch Operations Toolkit | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Bulk price/status/category/tag/photo |
| — | CSV Listing Import | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Bulk upload item lists from CSV |
| 27 | CSV / JSON / Text Listing Exports | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Multi-format output (Listing Factory) |
| 66 | Open Data Export (ZIP) | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Items/sales/purchases CSV |
| — | Payout PDF Export | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Financial reporting for tax/accounting |
| — | Stripe Connect Setup | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Payout bank account linking + verification |
| 25 | Organizer Item Library (Consignment Rack) | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Upload once, reuse; cross-sale search, price history |
| 42 | Voice-to-Tag | ORG | PRO | — | ✅ | ✅ | ✅ | ✅S202 | — | 📋 | VoiceTagButton.tsx + useVoiceTag.ts complete. Web Speech API integration |
| 18 | Post Performance Analytics | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | UTM tracking on social template downloads |
| 41 | Flip Report | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Item resale potential scoring |
| 17 | Bid Bot Detector + Fraud Score | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | FraudBadge on holds page, fraud-signals.tsx |
| 13 | TEAMS Workspace | ORG | TEAMS | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 📋 | Multi-user workspace, role management |
| 68 | Command Center Dashboard | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 📋 | Per-sale widget dashboard |
| 125 | Inventory Syndication CSV Export | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | exportService.ts + csvExportController.ts. PRO/TEAMS gate. eBay/Amazon/Facebook pre-formatted |

### Organizer — Marketing & Brand Amplification [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 27 | Social Templates (3 tones × 2 platforms) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Instagram/Facebook copy |
| 27 | Cloudinary Watermark on Photo Exports | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Brand protection |
| 27 | CSV/JSON Listing Exports (Listing Factory) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Multi-platform sharing |
| 31 | Brand Kit | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Colors, logo, socials (auto-propagates) |
| 33 | Share Card Factory (OG Tags) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Branded social previews, dynamic OG images |
| — | Message Templates | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | Saved organizer reply templates |
| 34 | Hype Meter | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Real-time social proof |
| 63 | Dark Mode + Accessibility | BOTH | FREE | — | ✅ | ✅ | ✅ | ⚠️ | — | 📋 | Tailwind dark variants, WCAG 2.1 AA, high-contrast outdoor mode |
| 67 | Social Proof Notifications | BOTH | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Engagement aggregation (favorites, bids, holds) |

### Organizer — Sales Tools & Workflow [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 6 | Virtual Queue / Line Management | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Start/call next/join line + SMS; free for all |
| — | Auction Mechanics + Close Flow | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | Countdown timer, bid modal, auto-bid, cron closing, manual end-auction button, auctionEndTime field, winner Stripe checkout link, organizer close notification, admin bid-review queue |
| 37 | Sale Reminders (Calendar + Remind Me) | SHO | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Sale alerts for shoppers |
| 28 | Neighborhood Heatmap | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Density-based Leaflet overlay |
| 14 | Real-Time Status Updates | BOTH | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | — | 📋 | Organizer widget, SMS/email alerts, SaleStatusWidget |
| 20 | Proactive Degradation Mode | BOTH | PRO | — | ✅ | ✅ | ✅ | ✅S202 | — | 📋 | DegradationBanner + middleware for offline |
| 30 | AI Item Valuation & Comparables | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | ValuationWidget (PRO-gated) on add-items page |
| 39 | Photo Op Stations | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | PhotoOpMarker on map, rate-limited |
| 40 | Sale Hubs | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Hub pages + membership UI |
| 16 | Verified Organizer Badge | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | VerifiedBadge on sales detail + SaleCard |
| — | Coupons (PERCENT/FIXED) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Post-purchase coupon issuance + validation. Rate-limited |

### Shopper — Discovery & Search [FREE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Browse Sales (Homepage + Map) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | `/map`, `/` |
| — | Sale Detail Page | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | `/sales/[slug]` |
| — | Item Detail Page | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/items/[id]` |
| — | Full-Text Search | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Advanced filters + location |
| — | Category Browsing | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/categories` index + `/categories/[slug]` |
| — | Tag Browsing | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/tags/[slug]` ISR pages |
| — | Surprise Me / Serendipity Search | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | `/surprise-me` random discovery |
| — | Sale Calendar (Upcoming) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/calendar` |
| — | iCal / Calendar Export | SHO | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Download .ics file for sales + items |
| — | QR Code Signs (Yard + Item Labels) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Printable QR codes linking to sales/items |
| — | QR Scan Analytics | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Tracking + insights on QR scans |
| — | City Pages | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ⚠️ | — | 📋 | `/cities` + `/city/[slug]` city-level browsing |
| — | Neighborhood Pages | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | `/neighborhoods/[slug]` local discovery |
| 92 | City Weekend Landing Pages (Metro Explorer) | SHO | FREE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/city/[city].tsx` ISR pages with Schema.org JSON-LD. Grand Rapids pre-generated. Confirmed live in code (S280). |
| 78 | Inspiration Page — Item Gallery | SHO | FREE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/inspiration` masonry grid of items from active/upcoming sales. Confirmed live in code (S280). |
| 90 | Sale Soundtrack (Ambient Vibes) | SHO | FREE | — | — | ✅ | ✅ | 📋 | — | 📋 | Spotify + Apple Music playlist suggestions per sale type on sale detail page. External links only. Shipped S280. |
| — | Trending Items / Sales | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S194 | — | 📋 | `/trending` page + API |
| — | Activity Feed | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S194 | — | 📋 | `/feed` page + API |
| — | Route Planning (Multi-Sale) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/routes` OSRM-based |
| — | Price History Tracking | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/price-history` price trends |
| 49 | City Heat Index | SHO | FREE | ⚠️ | ✅ | ⚠️ | ✅ | ✅S194 | ✅ | 📋 | Weekly "hottest metro" ranking; aggregated sale data |

### Shopper — Engagement & Community [FREE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Wishlists | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ⚠️ | — | 📋 | Full CRUD, distinct from favorites |
| — | Saved Searches with notifyOnNew | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Auto-notify on new matches |
| — | Shopper ↔ Organizer Messaging | BOTH | FREE | ✅ | ✅ | ✅ | ✅ | ⚠️ | — | 📋 | Threaded conversations |
| — | Buying Pools | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Group buying on items |
| — | Bounties (Item Requests) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Shopper want-ads |
| — | Reviews (Submit Sale / Organizer) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Via `/api/reviews` |
| — | User Profile Page | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/profile` |
| — | Shopper Public Profiles | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/shoppers/[slug]` collection showcase |
| — | Favorites | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Save items for later |
| — | Notification Center | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/notifications` page |
| — | Email + SMS Validation (Twilio) | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Phone number verification via SMS |
| — | Unsubscribe / Preferences | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/unsubscribe` + `/api/unsubscribe` |
| 36 | Weekly Treasure Digest (Email) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | MailerLite Sunday 6pm |
| — | Contact Organizer | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Via messaging system |
| — | Condition Guide | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/condition-guide` educational page |
| — | FAQ / Guide / Terms / Privacy | PUB | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Legal + help pages |
| — | Pickup Booking (Schedule Pickup) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Shopper-side scheduling |
| 29 | Shopper Loyalty Passport | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Stamps, badges, early-access perks |
| 32 | Shopper Wishlist Alerts + Smart Follow | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Category/tag/organizer alerts on new items |
| 62 | Digital Receipt + Returns | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Auto-generated receipt post-POS, return window |
| 45 | Collector Passport | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Specialty collection tracking + achievement path |
| 50 | Loot Log | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Personal purchase history with photos + prices |
| 87 | Brand & Designer Tracking | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | — | 📋 | BrandFollow table. Follow brands → alerts on matching items. 4 endpoints + notification trigger on item publish |
| 88 | Haul Post Gallery (UGC Social Proof) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | UGCPhoto extended (isHaulPost, linkedItemIds, likeCount) + UGCPhotoReaction model. /hauls page live |

### Shopper — Gamification [FREE + HUNT_PASS]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Points System | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | 1 pt/visit/day, tier-based |
| — | Streaks (Visit / Save / Purchase) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Daily streak tracking |
| — | Treasure Hunt (Daily) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Daily clue + category matching |
| — | Leaderboard (Shoppers + Organizers) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Public rankings |
| — | **Hunt Pass ($4.99/30 days)** | SHO | **PAID_ADDON** | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | **2× streak multiplier, recurring Stripe billing** |
| 61 | Near-Miss Nudges | SHO | FREE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Variable-ratio casino psychology; 4 types |
| 23 | Unsubscribe-to-Snooze (MailerLite) | SHO | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Intercept unsubscribe → 30-day snooze via MailerLite custom fields |
| 59 | Streak Rewards | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Visit/save/purchase streaks wired to Layout |
| 58 | Achievement Badges | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/shopper/achievements` page |
| 57 | Shiny / Rare Item Badges | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | RarityBadge wired to item cards |
| 48 | Treasure Trail Route Builder | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Trail pages + share token, multi-sale routing |
| 55 | Seasonal Discovery Challenges | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Rotating challenges by season/category |
| 122 | Explorer's Guild Phase 1 (Rebrand + Copy) | SHO | FREE | — | — | ✅ | ✅ | 📋 | — | 📋 | Collector→Explorer labels, collect→explore language throughout. Rank names updated. No schema changes |
| 123 | Explorer's Guild Phase 2 (XP Economy + Loot Legend) | SHO | FREE/PAID_ADDON | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | User.guildXp + User.explorerRank + RarityBoost table. XP sinks (coupon-gen, rarity boost, Hunt Pass discount). Loot Legend portfolio. Full schema + endpoints |
| 126 | Gamification Legacy Cleanup | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | — | N/A | User.points removed, pointsService deleted, points routes deleted. All awardPoints() calls removed. QA confirmed no pts refs live |

### Wave 5 — Advanced Intelligence Features [PRO/FREE/PAID_ADDON]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 46 | Treasure Typology Classifier | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 📋 | AI item classification; useTypology.ts, TypologyBadge.tsx |
| 51 | Sale Ripples | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Social proof activity tracking. RippleIndicator auto-records. ripples.tsx analytics. **Neon migration pending.** |
| 52 | Estate Sale Encyclopedia | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 📋 | Wiki-style knowledge base; EncyclopediaCard.tsx |
| 54 | Crowdsourced Appraisal (Base) | BOTH | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Request/submit/vote appraisals; AI Sprint 3 deferred |
| 60 | Premium Tier Bundle | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 📋 | Tier landing page + comparison matrix + upgrade CTA. Sprint 2 frontend complete. |
| 69 | Local-First Offline Mode | BOTH | PRO | — | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Service worker sync queue; offline catalog |
| 70 | Live Sale Feed | SHO | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Real-time sale activity feed. Redis adapter + JWT socket auth + LiveFeedTicker on sale detail page. Redis live on Railway. Chrome verify pending (sale detail page). |
| 47 | UGC Photo Tags | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Shopper-submitted item photos + moderation |
| 7 | Shopper Referral Rewards | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Referral tracking + rewards distribution |

### Platform & AI [FREE/SIMPLE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | AI Sale Planner Chat | PUB | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/plan` page, public rate-limited acquisition tool |
| — | AI Tag Suggestions (Haiku) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Part of Rapidfire, all tiers |
| — | AI Condition Grade Suggestions | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | S/A/B/C/D from photo |
| — | AI SEO Description Optimization | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | High-intent search term bias |
| 21 | User Impact Scoring in Sentry | BOTH | FREE | — | ✅ | ✅ | ✅ | 📋 | — | N/A | Error prioritization by tier/points/hunt-pass status |
| 128 | Automated Support Stack (5-Layer) | PLATFORM | ALL | — | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | /support page, fuse.js FAQ (L1), Claude API chat PRO/TEAMS (L2), community forum TEAMS (L3), smart escalation (L4). Zero human support for L1-L3 |

---

## In Progress

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 54 | Crowdsourced Appraisal AI | BOTH | PAID_ADDON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Sprint 2 frontend built. Sprint 3 (Stripe billing + Claude Haiku vision) deferred |
| 60 | Premium Tier Bundle | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Tier landing page + comparison matrix + upgrade CTA. Sprint 2 complete |

---

## Blocked

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 53 | Cross-Platform Aggregator | ORG | TEAMS | — | — | — | — | — | — | — | Legal review required — ToS risk with EstateSales.NET/Facebook scraping. ADR written |

---

## Backlog — Prioritized

### Parallel Batch A — Quick Wins + Cleanup (No Dependencies Between Items)
_All items can be dispatched simultaneously to separate subagents._

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 76 | Skeleton Loaders — Item Grids | BOTH | FREE | — | — | — | — | — | — | — | Replace spinners with ghost card layouts across all item/sale grids. No schema changes — reads existing `Item.photoUrls[]`, `Item.title`, `Item.price`. UI-only. Highest perceived-performance ROI. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 77 | Sale Published Celebration Screen | ORG | SIMPLE | — | — | — | — | — | — | — | Full-screen moment when organizer publishes a sale — sale name, cover photo, "You're live" + confetti. No schema changes — triggers on `Sale.status → PUBLISHED`. Replaces generic toast. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 79 | Earnings Counter Animation | ORG | SIMPLE | — | — | — | — | — | — | — | Dashboard earnings number rolls up to current value (Revolut-style) on open/refresh. No schema changes — reads existing `Purchase` aggregates. Frontend-only. Pairs with #77 to make dashboard feel alive. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 80 | Purchase Confirmation Redesign | SHO | FREE | — | — | — | — | — | — | — | Redesign shopper success screen after purchase — item photo hero, item title, seller name, pickup details, designed layout. No schema changes: reads `Purchase` + `Item.photoUrls[]`, `Item.title`, `Sale.title`, `Organizer.businessName`. Replaces generic confirmation text. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 81 | Empty State Audit + Copy Pass | BOTH | FREE | — | — | — | — | — | — | — | Inventory all empty states across organizer and shopper flows. Write human-voice copy for each (no dead ends — every empty state gets a CTA and a human sentence). UX/copy-only, no schema or API changes. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |

### Parallel Batch B — New Features + Revenue (Dispatch After Batch A Ships)
_Items within this batch are also parallelizable — different layers, no conflicts._

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 135 | Multi-Platform Social Templates Expansion | ORG | SIMPLE | — | — | — | — | — | — | — | Add TikTok, Pinterest, Nextdoor, Threads to existing social share templates. Platform-native copy + dimensions for each. Low complexity. _(was #122 — renumbered to avoid conflict with Explorer's Guild)_ |
| 136 | QR Code Auto-Embedding in Exports | ORG | SIMPLE | — | ✅ | ✅ | — | — | — | — | Cloudinary overlay: embed FindA.Sale QR code in every watermarked photo export. Organizer toggle to disable per-item. Very low complexity. _(was #123 — renumbered to avoid conflict with Explorer's Guild Phase 2)_ |
| 137 | Nextdoor Standalone Export | ORG | SIMPLE | — | ✅ | ✅ | — | — | — | — | Dedicated one-click Nextdoor card export (distinct from the Neighborhood Post template already in SharePromoteModal). _(was #124)_ |
| 91 | Auto-Markdown (Smart Clearance) | ORG | PRO | — | — | — | — | — | — | — | Auto-discount engine: 50% day 2, 75% day 3, configurable floor. Removes manual repricing. Patrick promoted from deferred. |

### Parallel Batch C — Gamification + Shopper Monetization
_#126 shipped (S269). These can now run in parallel._

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 133 | Hunt Pass Subscription Redesign | SHO | PAID_ADDON | — | — | — | — | — | — | — | Sage/Grandmaster exclusives: 6h Legendary-first access, 1.5x XP multiplier, Loot Legend portfolio, Collector's League leaderboard. **NOT BUILT** — ranks defined in schema but none of the exclusive features are implemented. |
| 124 | Rarity Boost XP Sink | SHO | FREE/PAID_ADDON | — | ✅ | — | — | — | — | — | Frontend UI for POST /api/xp/sink/rarity-boost. Backend endpoint confirmed live. Frontend shows 'Coming Soon' placeholder only — full UI not built. |


### Parallel Batch E — Polish, Social Proof & Engagement (No Blockers)

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 84 | Approach Notes (Arrival Assistant) | SHO | SIMPLE | — | — | — | — | — | — | — | Push notification at 500m with parking/entrance directions. Geolocation-dependent. Needs Architect review (push infra). |
| 85 | Treasure Hunt QR (In-Sale Scavenger Hunt) | SHO | FREE | — | — | — | — | — | — | — | Per-sale QR scavenger hunt. Distinct from daily clue TreasureHunt. Needs Architect review (new schema for in-sale QR codes + badge awards). |

### Legal & Business (Patrick Action Items)

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 82 | Trademark — FindA.Sale | BIZ | LEGAL | — | — | — | — | — | — | 📋 | File USPTO trademark on "FindA.Sale" brand name if not already done. ~$250–400/class + attorney fees (~$1,500–2,500 total). First priority IP action. Attorney required. |
| 83 | Trade Secret Housekeeping | BIZ | LEGAL | — | — | — | — | — | — | 📋 | Document proprietary algorithms (fraud scoring, Near-Miss Nudge logic, City Heat Index formula, Flip Report scoring, AI condition grading prompts) as trade secrets in internal docs. Ensure all contractors/contributors have signed NDAs or are covered by agreements. No filing required — zero cost. |

---

## Platform Safety & Cost Control

### Before Beta (P0) — Parallel Safety Batches

#### Platform Batch P1 — Bidding Integrity

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 93 | Bidder Account Age Gate (7-day) | PLATFORM | ALL | — | ✅ | — | ✅ | — | — | N/A | accountAgeGate.ts confirmed in code. 7-day minimum, ADMIN bypass. Wired to POST /:id/bids. (S280 verified) |
| 94 | Same-IP Bidder Detection | PLATFORM | ALL | ✅ | ✅ | ✅ | ✅ | — | — | N/A | BidIpRecord model + IP tracking in itemController. Admin bid-review page built. (S280 verified) |
| 95 | Bidding Velocity Limits | PLATFORM | ALL | — | ✅ | — | ✅ | — | — | N/A | bidRateLimiter.ts confirmed — 10 bids/60s via Redis, graceful degradation. (S280 verified) |

#### Platform Batch P2 — Buyer Transparency

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 96 | Buyer Premium Disclosure (4-Point Visibility) | PLATFORM | ALL | — | ✅ | ✅ | ✅ | — | — | N/A | Confirmed: stripeController itemized breakdown + CheckoutModal disclosure. (S280 verified) |
| 97 | Post-Purchase Confirmation Email (Premium Breakdown) | PLATFORM | ALL | — | ✅ | — | ✅ | — | — | N/A | Confirmed: breakdownHtml in stripeController with buyer premium, item photo, org name, etc. (S280 verified) |
| 98 | Chargeback Defense Documentation | PLATFORM | ALL | ✅ | ✅ | — | ✅ | — | — | N/A | Confirmed: CheckoutEvidence model in schema + auto-capture in stripeController. (S280 verified) |

#### Platform Batch P3 — Account Controls

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 99 | Export Rate Limiting (1/month) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | CSV/JSON exports limited to 1 per month per account; prevents data harvesting. See anti-abuse-system-design-2026-03-19.md §Vector 1 |
| 100 | First-Month Refund Cap (50%) | PLATFORM | ALL | — | ✅ | — | — | — | — | N/A | Refunds capped at 50% if requested <30 days post-signup. See anti-abuse-system-design-2026-03-19.md §Vector 1 |
| 101 | Email Verification (Unique per Organizer) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Hard gate: no multi-account signup with same email. See anti-abuse-system-design-2026-03-19.md §Vector 4 |
| 102 | Payment Method Deduplication | PLATFORM | ALL | ✅ | ✅ | ✅ | — | — | — | N/A | Links organizer accounts sharing Stripe card/PayPal; suggests merge to Pro tier. See anti-abuse-system-design-2026-03-19.md §Vector 4 |

#### Platform Batch P4 — Cost Control

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 103 | Photo Retention Policy (90-day archive, 1-year delete) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Auto-archive after 90 days, delete after 1 year; reduces Cloudinary costs indefinitely. See total-cost-of-ownership-2026-03-19.md §Section 3 |
| 104 | AI Cost Ceiling + Ollama Fallback | PLATFORM | ALL | — | ✅ | — | — | — | — | N/A | Auto-switch to Ollama if Claude API cost exceeds monthly threshold. See total-cost-of-ownership-2026-03-19.md §Section 5 |
| 105 | Cloudinary Bandwidth Monitoring + Alerts | PLATFORM | ALL | — | ✅ | — | ✅ | — | — | N/A | cloudinaryBandwidthTracker.ts confirmed — tracks daily serves, alerts at 80% of 25GB free tier. (S280 verified) |

### Before Growth (P1) — Parallel Safety Batches

#### Platform Batch P5 — Growth Safety (Fraud Detection & Account Management)

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 106 | Organizer Reputation Scoring System | PLATFORM | ALL | ✅ | ✅ | ✅ | ✅ | — | — | N/A | OrganizerReputation model + computeReputationScore service confirmed in code. Badge endpoint live. (S280 verified) |
| 107 | Chargeback + Collusion Tracking | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Flags pattern of chargebacks + same-IP bidding; suspension after 3+ incidents. See anti-abuse-system-design-2026-03-19.md §Vector 2 |
| 108 | Winning Bid Velocity Check (low vs. value) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Flags auctions with winning bid <10% of estimated value; holds payment 24h for review. See anti-abuse-system-design-2026-03-19.md §Vector 3 |
| 109 | Off-Platform Transaction Detection (Post-Sale Monitoring) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | 30-day pattern detection: low-price sales with no activity flagged. See anti-abuse-system-design-2026-03-19.md §Vector 3 |
| 110 | IP-Based Soft Linking (Multi-Account Detection) | PLATFORM | ALL | ✅ | ✅ | ✅ | — | — | — | N/A | Suggests merge for accounts from same IP with >3 concurrent sales in <7 days. See anti-abuse-system-design-2026-03-19.md §Vector 4 |
| 114 | Bid Cancellation Audit Trail | PLATFORM | ALL | ✅ | ✅ | ✅ | — | — | — | N/A | Tracks bid cancellations; pattern flagged after 5+ cancellations + 3+ chargebacks. See anti-abuse-system-design-2026-03-19.md §Vector 2 |
| 117 | Chargeback Response + Serial Buyer Account Suspension | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Flags buyers at 2+ chargebacks; suspends after 3+ incidents. See anti-abuse-system-design-2026-03-19.md §Vector 6 |

#### Platform Batch P5B — Review Integrity & Spam Prevention

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 115 | Verified Purchase Badge on Reviews | PLATFORM | ALL | ✅ | ✅ | ✅ | — | — | — | N/A | Only non-refunded past purchasers can leave reviews; prevents fake review spam. See anti-abuse-system-design-2026-03-19.md §Novel Vector B |
| 116 | Review Timing Anomaly Detection | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Flags reviews <1 hour post-purchase or from same IP within 24 hours; manual moderation queue. See anti-abuse-system-design-2026-03-19.md §Novel Vector B |

#### Platform Batch P5C — Advanced Fraud Monitoring & Data Governance

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 111 | Bot/Scraper Rate Limiting on CDN | PLATFORM | ALL | — | ✅ | — | — | — | — | N/A | Rate limits image endpoints; prevents bot harvesting via Cloudinary bandwidth spike. See total-cost-of-ownership-2026-03-19.md §Section 4 |
| 112 | Database Record Archival Policy (Soft-Delete) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Quarterly soft-delete of old sales/items; reduces Neon compute bloat. See total-cost-of-ownership-2026-03-19.md §Section 3 |
| 113 | Async AI Tagging Queue (Prevent Rate-Limit Spikes) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Background worker processes tags; prevents Claude API rate limiting during peak uploads. See total-cost-of-ownership-2026-03-19.md §Risk #4 |
| 118 | Photo Compression at Upload (Reduce Storage Bloat) | PLATFORM | ALL | — | ✅ | ✅ | — | — | — | N/A | Auto-compress photos on-device; reject images <100×100px or >50MB. See anti-abuse-system-design-2026-03-19.md §Novel Vector C |
| 119 | Aggregate Chargeback Monitoring (Stripe Health) | PLATFORM | ALL | — | ✅ | — | — | — | — | N/A | Tracks monthly chargeback rate; triggers pre-auth + payment hold if >0.8%, account escalation if >1%. See anti-abuse-system-design-2026-03-19.md §Novel Vector D |
| 120 | Sale Cancellation Audit (Rapid Cancellation Detection) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Flags sales cancelled <2h post-publication with >100 holds; requires organizer explanation. See anti-abuse-system-design-2026-03-19.md §Novel Vector A |
| 121 | Tiered Photo Storage Migration (Cloudinary → B2/Bunny) | PLATFORM | ALL | ✅ | ✅ | — | — | — | — | N/A | Implements 3-tier strategy: Active (0–90d on Cloudinary), Warm (90d–2y on B2 + Bunny CDN), Cold (2y+ metadata-only). Saves ~70% storage cost; enables B2B analytics. See photo-storage-strategy-2026-03-19.md |

---

## Deferred & Long-Term Hold

### Infrastructure & Platform

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Zero-Downtime Migration Framework | INFRA | TEAMS | Blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | INFRA | SIMPLE | Deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes — **trigger effectively met; pre-wire: Vercel preview env + Railway staging slot config can be set up now** |
| Audit Automation Library | INFRA | SIMPLE | Codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch — **trigger effectively met; pre-wire: health-scout baseline JSON and test harness can be scaffolded now** |

### Market Expansion & Positioning

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| #56 Printful Merch Store | BOTH | FREE | No demand signal pre-beta; external API adds complexity. | After beta proves shopper appetite for branded merch |
| #86 Friend Network (social graph) | SHO | FREE | DEFERRED S274 (Patrick+Architect). Social graph infra entangles with notifications, tier logic, and abuse guardrails. Public Shopper Profiles already shipped. | After beta feedback on #87/#88 social features; returns as S2 item |
| Affiliate Program | ORG | TEAMS | Backend 60% built. Referral badges (SIMPLE) + loyalty passport integration worth exploring first. Full payouts deferred. | After referral badges prove demand — **pre-wire: payout calculation engine + referral code table can be added to schema now; activation becomes a config flag** |
| White-label MaaS | ORG | TEAMS | Business decision — beta validation first | After beta data |
| Persistent Inventory (Cross-Sale Item Library) | ORG | PRO | Items that persist across multiple sales — organizer builds a master library, pulls items into each sale, unsold items carry over automatically. Designed for flea market vendors, antique booth operators, and recurring sale organizers. Requires new data model (items not bound to a single sale). `/organizer/inventory` is stubbed as "Coming Soon." | After beta data confirms demand from recurring-sale organizer segment — **pre-wire: add `persistentInventory` boolean + `masterItemLibraryId` FK to Item schema now; activation becomes a filter flag** |
| Consignment Integration | ORG | PRO | Thrift store POS — post-beta complexity | After beta data — **pre-wire: add `consignorId` + `consignmentSplitPct` fields to Item schema now; extends inventory library with zero migration at trigger** |
| QuickBooks Integration | ORG | SIMPLE | CSV export covers 80% of need | When organizers ask — **pre-wire: add QB-compatible column ordering + account codes to existing CSV export; zero-build activation when demand arrives** |
| Multi-metro expansion | ORG | SIMPLE | Beta validation first | After beta data |
| BUSINESS_PLAN.md rewrite | PUB | TEAMS | Reflect national positioning and current fee/feature state | After beta data confirms positioning |

### Hardware & Research

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Video-to-inventory | ORG | TEAMS | Vision models can't reliably segment rooms yet | Late 2026+ |
| AR Furniture Preview | SHO | TEAMS | Hardware not ready | Long-term R&D |

### Brand Spreading & Viral Growth [S2-S3 DEFER]

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Shopper Referral + Affiliate Mechanics | SHO/ORG | FREE | Shoppers earn 5% store credit on referrals; organizers earn 2-3% override. Leaderboard + badges. Needs financial model clarity first. | After pricing + financial model validated |
| Community Challenge / "Hunt Week" Viral Events | SHO | FREE | Weekly themed hunts with prizes, featured placement. Drives virality but needs organizer volume first. | After 50+ concurrent active sales |
| Organizer Brand Kit Expansion | ORG | PRO | Custom fonts, branded email signature, printable business cards, letterhead, social headers, yard sign PDFs with QR codes. | After Brand Kit v1 proves user adoption |
| Organizer Hall of Fame Leaderboard | ORG | SIMPLE | Top organizers by items sold/revenue/ratings. Monthly featured spotlight + badges. Community gamification. | After 100+ organizers + 6 months data |
| Community "Feature Your Sale" Request Form | SHO | FREE | Shoppers nominate sales for featured homepage placement. Moderation queue. Low complexity. | After homepage design stabilizes |
| Print-to-QR Sign Kit | ORG | SIMPLE | Downloadable PDF toolkit: yard signs, directional signs, table tents, hang tags, car magnets with QR codes. | When organizers request print collateral |
| AI Content Generation for Organizers (S3) | ORG | PRO | Claude Haiku auto-writes 10 social post variants per sale. Organizer picks + posts. Defer until templates prove demand. | After Social Templates adoption tracked |
| TikTok / Reels Auto-Generation (S3) | ORG | PRO | 15-second video from photos. Needs video generation, music licensing. Defer until social templates validate demand. | After Social Templates uptake proven |

### Advanced Organizer Features

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Instant Flash Auctions | ORG | PRO | Pre-beta, zero shoppers — no demand signal yet | After beta + 4–6 wks shopper data |
| Live Stream Sale Events | ORG | PRO | Heaviest build (3–4 sprints), requires on-camera organizers | After beta proves organizer appetite |
| Verified Organizer Insurance Badge | ORG | TEAMS | Requires micro-insurance partner — unvalidated market | After beta data + partner conversations |
| Hyper-Local Pop-Up Sale Network | SHO | FREE | Heatmap covers density; marketing layer on top | After Heatmap proves cluster value |

### Gamification Variants (Early Experiments)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| QR/Barcode Item Labels | ORG | SIMPLE | Print scannable labels during intake → POS scan for instant lookup. High potential from retail experience. Pairs with POS v2. | Strong candidate when POS sees real usage |
| Featured Listings (Feature Boost) | ORG | PAID_ADDON | Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. | After 500+ organizer accounts + 10+ active sales |
| Crowd-Sourced Corrections (Community Intel) | SHO | FREE | Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. | After 500+ concurrent shoppers exist |
| Fast Pass for Sales (Priority Entry) | SHO | PAID_ADDON | $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. | After beta proves high-demand sales |
| Sale Grand Finale Events | ORG | PRO | Last 2 hours: live-streamed event, flash auctions, 5x XP. Requires streaming infra. | After Live Stream Sale Events |
| VIP Behind-the-Scenes Tours | ORG | PAID_ADDON | $99–299 video shoot package with creator. Professional content for organizer marketing. | After creator network develops |
| Buddy System (Paired Shopping) | SHO | FREE | Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. | After gamification + social features |

### Creator & Community Economy

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Restoration & Upcycling Marketplace | BOTH | FREE | Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. | After UGC Photo Tags proves community appetite |
| Book Club & Vinyl Community Hubs | SHO | FREE | Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. | After Collector Passport proves specialty-interest demand |

### Long-Term Platform Vision (R&D Phase)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| FindA.Sale Network (Tier 3 Services) | PUB | TEAMS | Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | SHO | PRO | Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. | After ML pipeline + personalization data |
| Estate Planning Toolkit | ORG | TEAMS | Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. | After core organizer features stable — **trigger effectively met; pre-wire: add `executorUserId` + `estateId` to Organizer schema; intake fields cost zero to add now** |
| State of Estate Sales Report | ORG | PAID_ADDON | Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence ($199/yr). | After 6+ months transaction data |

### B2B/B2E/B2C Innovation Streams (Future Revenue Moats)

Deferred until 200+ organizers across 5+ metro areas. Requires aggregated anonymized transaction data (pricing, categories, locations, inventory patterns) to be credible. See `claude_docs/strategy/b2b-b2e-b2c-innovation-broad-2026-03-19.md` (full analysis) and `claude_docs/strategy/b2b-b2e-innovation-2026-03-19.md` (estate-focused opportunities).

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Secondhand Market Intelligence Feed (B2B) | B2B | PAID_ADDON | Aggregated data: category pricing trends, regional inventory velocity, seasonal patterns. Target: antique dealers, resellers, retailers. $99–$499/mo. | After 200+ organizers + 12+ months data |
| Home Contents Valuation API (B2B for Appraisers/Insurers) | B2B | PAID_ADDON | Real-transaction valuation models trained on FindA.Sale data (not appraisal comps). License API to estate appraisers, insurance companies, tax professionals. $499–$999/mo. | After 200+ organizers + 6+ months credible data |
| Antiques Dealer Early Access Platform (B2B) | B2B | PAID_ADDON | Dedicated marketplace + curated feeds for professional dealers. First access to high-value estates. Target: antiquarians, gallery owners, auction houses. Premium subscription or commission on referrals. | After 200+ organizers + professional demand validation |
| Valuation Engine API Licensing (B2B) | B2B | PAID_ADDON | White-label API for eBay, Shopify, and marketplace integrations. Real-time pricing suggestions powered by our dataset. Revenue: API fees + per-query pricing. | After API-First Toolkit ships — Q1 2027+ |
| Flea Market Operator White-Label Platform (B2B) | B2B | TEAMS | White-label FindA.Sale for flea market operators (100+ vendors/weekend). Customizable vendor registration, booth lookup, item aggregation. Revenue: $1K–$5K/month per operator. | After core features stable + multi-organizer workflows proven |
| Municipal Economic Intelligence (B2E) | B2E | PAID_ADDON | Sell anonymized estate sale data to city planners, economic development authorities. Insights: household wealth distribution, downsizing trends, real estate health signals. Target: City Planner Associations. $500–$2K/month. | After 200+ organizers across 10+ cities |
| Moving Company Logistics Integration (B2B) | B2B | PAID_ADDON | White-label partnership + data feed. Help moving companies identify estate liquidation opportunities. Revenue: commission on referrals or subscription access. | After 500+ organizers |
| Nonprofit Fundraising Suite (B2C) | B2C | PAID_ADDON | Turnkey platform for nonprofits to run rummage/silent auctions. FindA.Sale handles fulfillment; nonprofit gets 100% of proceeds. Revenue: 10% of non-profit GMV. | After core nonprofit features prove demand |
| Consignment Shop Operations Suite (B2B) | B2B | TEAMS | Full SaaS for independent consignment shops (inventory, multi-vendor, POS, settlement). FindA.Sale becomes fulfillment + marketing layer. Revenue: $99–$199/month per shop. | After core organizer features stable + consignment demand validated |
| Organizer Certification Program (B2C/B2B) | B2C | PAID_ADDON | Accredited training + badge program for professional estate organizers. Courses: valuation, pricing psychology, buyer psychology, legal compliance. Revenue: $99/course, lifetime access, badge marketplace. | After 1,000+ shoppers + 200+ organizers |
| Shopper Behavior API (B2B) | B2B | PAID_ADDON | Anonymized behavioral data: search patterns, purchase intent, seasonal demand, demographic affinities. License to retailers, category managers, B2C marketplaces. $499–$999/mo. | After 10,000+ shoppers + 12+ months behavioral data |
| Circular Economy Data Feed (B2E) | B2E | PAID_ADDON | ESG/sustainability data: avg item lifecycle cost, resale % by category, waste reduction metrics. Target: ESG consultants, corporate sustainability teams, nonprofits. $199–$499/mo. | After 300+ organizers + data cleanup |
| Liquidation Insurance Product (B2B) | B2B | PAID_ADDON | Partner with specialty insurer: FindA.Sale users insure auction liquidations against underperformance. Revenue: 3–5% commission on policies written. | After 200+ organizers + claims data validated |
| Estate Sale Futures Market (Speculative R&D) | B2B | TEAMS | Speculative — bundle future estate sales; institutional buyers bid on portfolios. High-risk, high-reward. Regulatory review required. Legal TBD. | Long-term R&D — post-2027 |
| Full-Service Liquidation Platform (Speculative R&D) | ORG | TEAMS | Speculative — FindA.Sale hires liquidation coordinators; coordinates end-to-end estate liquidation for high-value estates. Revenue: 12–18% of GMV. Operational complexity TBD. | Long-term R&D — post-2027 |

### Gamification Research (Innovation Round 3)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Mystery Box Drops | SHO | FREE | Pre-beta, zero shoppers. Needs gamification scaffold + shopper base. MI gambling/sweepstakes law review needed. | After badge/XP system + Legal clears compliance |
| Daily Spin Wheel | SHO | FREE | Requires reward infrastructure + shopper base. Board may flag "too gamey" — position as daily check-in reward. | After badge/XP system + 500+ daily shoppers |
| Boost My Listing ($1-$5 microtx) | ORG | PAID_ADDON | Zero value until 50+ active sales + 500+ daily shoppers. FTC paid placement disclosure required. | After 500+ daily shoppers + Legal reviews disclosure |
| Instant Appraisal Token ($0.99) | SHO | PAID_ADDON | Needs sold-item data to be credible. Overlaps with AI Valuations. Requires 1,000+ sold items per category. | After AI Valuations + 6 months transaction data |
| Priority Checkout Pass ($2.99) | SHO | PAID_ADDON | Requires in-person QR validation + POS integration + organizer opt-in. Only viable at high-traffic sales. | After POS v2 sees real usage |
| Scan-to-Know (NFC Item Tags) | BOTH | SIMPLE | NFC tags add $0.05-$0.15/item cost. Start with QR labels first. Evolution of QR/Barcode Labels. | After QR labels prove demand |
| Smart Cart (Running Total) | SHO | SIMPLE | Only works for items with digital prices. Requires organizer adoption of digital pricing + QR/NFC. | After QR Labels + POS established |
| Agentic AI Assistant ("Scout") | SHO | PRO | Requires Wishlist Alerts + Collector Passport + sold-item data. XL complexity. Overlaps with AI Buying Agent Scout. | After Wishlist + Collector Passport + 6 months data — **pre-wire: add `tasteProfile` JSONB field to User schema now; preference data accrues passively from wishlist/save behavior before feature ships** |
| Voice Search + Navigation | SHO | SIMPLE | Web Speech API browser-native. Nice-to-have, not a retention driver. | After core search polished |
| RaaS for Organizers (Resale-as-a-Service) | ORG | TEAMS | Long-term platform vision: full business management suite. Japan/EU circular economy model. | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | PUB | SIMPLE | 42M native Spanish speakers in U.S. i18n framework. Important for national scale, not urgent for GR beta. | Before national expansion — Q1 2027 — **pre-wire: install next-intl now and extract all UI strings to locale files; every future UI addition becomes translation-ready automatically** |
| API-First Organizer Toolkit | ORG | TEAMS | OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier. Enables Zapier. | After core features stabilize — Q4 2026-Q1 2027 — **pre-wire: add `ApiKey` table to schema + auth middleware stub now; no migration needed at launch** |
| Zapier/Make.com Integration Hub | ORG | TEAMS | Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | SHO | FREE | Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+/area). | After Rapidfire + Listing Factory drive quality up |
| Organizer AMAs (Reddit-Style Q&A) | BOTH | FREE | Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness. | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | ORG | PRO | Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations. | Hardcoded Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | ORG | PRO | AI adjusts prices based on real-time demand signals. Extends Auto-Markdown. Requires transaction data. | After 6+ months transaction data |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Rejected by Board

### Innovation Session — Brand Spreading [REJECT]

| Idea | Role | Tier | Reason |
|------|------|------|--------|
| Shopper Instagram Sticker Sharing | SHO | FREE | Instagram API too restrictive. Revisit Q3 if partnership emerges. |
| White-Label Resale Platform (B2B) | ORG | TEAMS | Too early. Revisit after 10+ paying organizers + $5K+ MRR proven. |
| Marketplace Watermark Variants | ORG | SIMPLE | Too micro-tactical. Merge into Nextdoor export template work. |

### Historical Rejections

| Idea | Role | Tier | Reason |
|------|------|------|--------|
| Pokéstop-Style Sale Markers | SHO | FREE | Gamification mismatch — estate sale shoppers skew older, Pokémon framing alienates core demo. |
| Trader Network | BOTH | TEAMS | P2P trading adds liability, moderation, and trust complexity. Not core to organizer value prop. |
| Egg Hatching Mechanic | SHO | FREE | Too game-y for audience. Confusing metaphor for non-gamers. |
| Team Rivalries | SHO | FREE | Competitive team mechanics don't match collaborative sale-shopping culture. |
| Raid-Style Group Events | SHO | FREE | Complex coordination + real-time features for uncertain demand. |
| Professional Certifications | ORG | TEAMS | Requires industry partnerships, legal review, ongoing administration. Low ROI for beta stage. |
| Mood Boards | SHO | FREE | Nice-to-have but no clear retention or revenue driver. |
| AR Item Overlay | SHO | TEAMS | Hardware/browser support still spotty. High build cost for novelty feature. |

---

## Design Decisions (Locked — Session 155)

- **Holds expiry:** 48 hours default, configurable per-sale in organizer settings. Nightly cron cleanup.
- **Health score:** Hybrid gate — block publishing below 40% (no photo or title), nudge 40–70%, free above 70%. Progress bar UX, never punitive.
- **Tag vocabulary:** Curated list of 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
- **Social templates:** Auto-fill v1 with 3 tone options (Casual, Professional, Friendly). Defer WYSIWYG editor to post-beta.
- **Heatmap density:** Radius-based (1–3 mile), pre-computed grid tiles every 6h, 7-day rolling window.
- **Background removal:** On-demand Cloudinary `b_remove` transform only. Primary photo. No batch job.
- **Holds grouping:** By-item in schema, grouped-by-buyer in display. No junction table.
- **Reputation scoring:** Two separate scores — organizer reputation (sale quality, reliability) and shopper reputation (buyer reliability, pickup behavior). Schema must accommodate both; shopper score can be deferred but field must exist from day one. Single-score merge not permitted after schema is locked.
- **Tier lapse state:** Lapsing organizer subscription suspends organizer-only features. Shopper features retained. Full account freeze is not the default behavior. Re-activation on billing resume restores organizer features immediately.
- **Notification defaults:** Both notification channels default to opt-in. Shopper discovery alerts and organizer operational alerts are separate consent items at registration. No "all on" default for either channel.
Roadmap (bottom) — 7 locked UX/product decisions from S155 (holds expiry, health score, tag vocabulary, social templates, heatmap density, background removal, holds grouping)
claude_docs/architecture/ — 13 ADR files covering feature-specific technical specs (#13/#60 Teams Bundle, #17/#19 Bid Bot/Passkey, #30/#46/#69 AI/Offline, #40/#44/#48 Hubs/Trail, #52/#53/#54 Encyclopedia/Aggregator/Appraisal, #65 Tiers, #68 Command Center)
claude_docs/feature-decisions/ — 7 files covering architecture choices (camera workflow, cash fee collection, push coordinator, manager subagent)
decisions-log.md — governance/process decisions (subagent-first gate, file delivery rule, roadmap schema)
FindaSale\claude_docs\feature-notes.md - design decisions based on emotion and animations

---

## Maintenance

This document is the source of truth for product roadmap. Updated at every session wrap when a feature ships, beta status changes, or a deferred item is revisited. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 