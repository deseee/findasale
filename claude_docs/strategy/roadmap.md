# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-19 (v59 — Added 6 Design Polish backlog items #76–#81 from design vision exploration: Skeleton Loaders, Sale Published Celebration, Inspiration Page, Earnings Animation, Purchase Confirmation Redesign, Empty State Audit. All spec'd in `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md`.)

**Status:** Production MVP live at finda.sale. Beta: GO. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.

---

## Product Summary

FindA.Sale is a PWA for sale organizers and shoppers, reducing manual work and improving inventory visibility across the sale lifecycle. 
The platform currently ships **71 features across 4 tiers** (FREE, SIMPLE, PRO, TEAMS) and 
supports organizer-side operations, analytics, marketing, and 
shopper-side discovery, engagement, and gamification. 
Production MVP launched Q1 2026.

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

## Feature Inventory — Shipped

### Organizer — Core Operations [SIMPLE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Create / Edit / Publish / Archive Sales | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Core workflow |
| — | Sale Types (ESTATE/CHARITY/BUSINESS/CORPORATE) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Enum validation + validation matrix |
| 5 | Listing Type Schema Validation | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Backend validation for FIXED/AUCTION/REVERSE_AUCTION/LIVE_DROP/POS |
| — | Sale Map with Geocoding | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/api/geocode` |
| 35 | Entrance Pin / Front Door Locator | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Shopper convenience, parking + entrance detail |
| — | Sale Calendar View | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Organizer + shopper views |
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
| — | Notification Inbox | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | In-app notification center |
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
| — | Stripe Terminal POS (v2) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Multi-item + cash, 10% fee parity |
| — | Payout Transparency / Earnings Dashboard | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Item-level fee breakdown + PDF |
| 11 | Organizer Referral (Fee Bypass) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | referralDiscountExpiry |
| — | Tiers Backend Infrastructure | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | N/A | `/api/tiers` — getMyTier, syncTier |
| 65 | Organizer Mode Tiers (Simple/Pro/Teams) | ORG | PRO | ✅ | ✅ | ✅ | ⚠️ | 📋 | ✅ | 📋 | Full infrastructure: SubscriptionTier enum, tierGate.ts, requireTier, Stripe billing, Progressive Disclosure UI |
| 71 | Organizer Reputation Score | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | 1-5 star public score + reputation.tsx frontend |
| 22 | Low-Bandwidth Mode (PWA) | BOTH | SIMPLE | — | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Network API detection, localStorage, LowBandwidthContext |
| 19 | Passkey / WebAuthn Login | ORG | SIMPLE | ✅ | ✅ | ✅ | 🔧 | 📋 | ⚠️ | 📋 | P0 concurrent challenge race fixed, end-to-end re-QA + merge pending |
| — | A/B Testing Infrastructure | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | N/A | Internal optimization tool |
| — | Invites | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Invite-to-sale / invite-to-platform |
| — | Disputes Management | BOTH | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Trust & safety |

### Organizer — Analytics & Intelligence [PRO]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Seller Performance Dashboard | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Per-sale analytics + insights |
| — | Organizer Insights (Lifetime) | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Cross-sale totals + benchmarking |
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
| 13 | TEAMS Workspace | ORG | TEAMS | ✅ | ✅ | ✅ | ✅ | ✅S194 | ✅ | 📋 | Multi-user workspace, role management |
| 68 | Command Center Dashboard | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Per-sale widget dashboard |

### Organizer — Marketing & Brand Amplification [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 27 | Social Templates (3 tones × 2 platforms) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Instagram/Facebook copy |
| 27 | Cloudinary Watermark on Photo Exports | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Brand protection |
| 27 | CSV/JSON Listing Exports (Listing Factory) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Multi-platform sharing |
| 31 | Brand Kit | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Colors, logo, socials (auto-propagates) |
| 33 | Share Card Factory (OG Tags) | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Branded social previews, dynamic OG images |
| — | Message Templates | ORG | PRO | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Saved organizer reply templates |
| 34 | Hype Meter | ORG | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Real-time social proof |
| 63 | Dark Mode + Accessibility | BOTH | FREE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Tailwind dark variants, WCAG 2.1 AA, high-contrast outdoor mode |
| 67 | Social Proof Notifications | BOTH | SIMPLE | — | ✅ | ✅ | ✅ | 📋 | — | 📋 | Engagement aggregation (favorites, bids, holds) |

### Organizer — Sales Tools & Workflow [SIMPLE/PRO mixed]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 6 | Virtual Queue / Line Management | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Start/call next/join line + SMS; free for all |
| — | Auction Mechanics | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Countdown timer, bid modal, auto-bid, cron closing |
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
| — | Browse Sales (Homepage + Map) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/map`, `/` |
| — | Sale Detail Page | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/sales/[slug]` |
| — | Item Detail Page | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/items/[id]` |
| — | Full-Text Search | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | Advanced filters + location |
| — | Category Browsing | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/categories` index + `/categories/[slug]` |
| — | Tag Browsing | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | 📋 | `/tags/[slug]` ISR pages |
| — | Surprise Me / Serendipity Search | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/surprise-me` random discovery |
| — | Sale Calendar (Upcoming) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/calendar` |
| — | iCal / Calendar Export | SHO | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Download .ics file for sales + items |
| — | QR Code Signs (Yard + Item Labels) | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Printable QR codes linking to sales/items |
| — | QR Scan Analytics | ORG | SIMPLE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Tracking + insights on QR scans |
| — | City Pages | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/cities` + `/city/[slug]` city-level browsing |
| — | Neighborhood Pages | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/neighborhoods/[slug]` local discovery |
| — | Trending Items / Sales | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S194 | — | 📋 | `/trending` page + API |
| — | Activity Feed | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S194 | — | 📋 | `/feed` page + API |
| — | Route Planning (Multi-Sale) | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/routes` OSRM-based |
| — | Price History Tracking | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | `/api/price-history` price trends |
| 49 | City Heat Index | SHO | FREE | ⚠️ | ✅ | ⚠️ | ✅ | ✅S194 | ✅ | 📋 | Weekly "hottest metro" ranking; aggregated sale data |

### Shopper — Engagement & Community [FREE]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| — | Wishlists | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Full CRUD, distinct from favorites |
| — | Saved Searches with notifyOnNew | SHO | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Auto-notify on new matches |
| — | Shopper ↔ Organizer Messaging | BOTH | FREE | ✅ | ✅ | ✅ | ✅ | 📋 | — | 📋 | Threaded conversations |
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

### Wave 5 — Advanced Intelligence Features [PRO/FREE/PAID_ADDON]

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 46 | Treasure Typology Classifier | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | AI item classification; useTypology.ts, TypologyBadge.tsx |
| 51 | Sale Ripples | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Social proof activity tracking. RippleIndicator auto-records. ripples.tsx analytics. **Neon migration pending.** |
| 52 | Estate Sale Encyclopedia | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Wiki-style knowledge base; EncyclopediaCard.tsx |
| 54 | Crowdsourced Appraisal (Base) | BOTH | FREE | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Request/submit/vote appraisals; AI Sprint 3 deferred |
| 60 | Premium Tier Bundle | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Tier landing page + comparison matrix + upgrade CTA. Sprint 2 frontend complete. |
| 69 | Local-First Offline Mode | BOTH | PRO | — | ✅ | ✅ | ✅ | ✅S202 | ✅ | 📋 | Service worker sync queue; offline catalog |
| 70 | Live Sale Feed | SHO | SIMPLE | ✅ | ✅ | ✅ | 📋 | 📋 | — | 📋 | Real-time sale activity feed |
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

---

## In Progress

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 19 | Passkey / WebAuthn Support | ORG | SIMPLE | ✅ | ✅ | ✅ | 🔧 | 📋 | ⚠️ | 📋 | P0 race condition fixed. End-to-end re-QA + merge pending |
| 51 | Sale Ripples | SHO | FREE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Schema + API + frontend complete. Neon migration applied |
| 54 | Crowdsourced Appraisal AI | BOTH | PAID_ADDON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Sprint 2 frontend built. Sprint 3 (Stripe billing + Claude Haiku vision) deferred |
| 60 | Premium Tier Bundle | ORG | PRO | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | Tier landing page + comparison matrix + upgrade CTA. Sprint 2 complete |

---

## Blocked

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 53 | Cross-Platform Aggregator | ORG | TEAMS | — | — | — | — | — | — | — | Legal review required — ToS risk with EstateSales.NET/Facebook scraping. ADR written |

---

## Backlog — Prioritized

| # | Feature | Role | Tier | DB | API | UI | QA | Chrome | Nav | Human | Notes |
|---|---------|------|------|----|----|----|----|--------|-----|-------|-------|
| 72 | Dual-Role Account Schema | BOTH | SIMPLE | — | — | — | — | — | — | — | `roles[]` array + `subscriptions[]` table. Replaces any single `role` enum. Architect ADR required before dev. Gate for #73, #74, #75. |
| 73 | Two-Channel Notification System | BOTH | SIMPLE | — | — | — | — | — | — | — | OPERATIONAL (organizer) + DISCOVERY (shopper) channels. `notificationChannel` as first-class field on all notification records. Extends existing push/inbox features. Architect ADR required. Depends on #72. |
| 74 | Role-Aware Registration Consent Flow | BOTH | FREE | — | — | — | — | — | — | — | Separate opt-in checkboxes at signup: "sale management alerts" (ORG) + "nearby sale alerts" (SHO). Legal review of consent copy required before dev. Depends on #72. |
| 75 | Tier Lapse State Logic | ORG | PRO | — | — | — | — | — | — | — | When organizer sub lapses: suspend organizer features, retain shopper features. Re-enables on billing resume. Full freeze is not the default. Extends #65. Depends on #72. |
| 56 | Printful Merch Store | BOTH | FREE/PAID_ADDON | — | — | — | — | — | — | — | Drop-shipped branded merch via Printful API. Zero inventory risk. 1 sprint est. |
| 76 | Skeleton Loaders — Item Grids | BOTH | FREE | — | — | — | — | — | — | — | Replace spinners with ghost card layouts across all item/sale grids. No schema changes — reads existing `Item.photoUrls[]`, `Item.title`, `Item.price`. UI-only. Highest perceived-performance ROI. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 77 | Sale Published Celebration Screen | ORG | SIMPLE | — | — | — | — | — | — | — | Full-screen moment when organizer publishes a sale — sale name, cover photo, "You're live" + confetti. No schema changes — triggers on `Sale.status → PUBLISHED`. Replaces generic toast. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 78 | Inspiration Page — Item Gallery | SHO | FREE | — | — | — | — | — | — | — | Browseable masonry grid of best item photos from active/upcoming sales within radius. Shoppable — taps to item detail. No new schema: queries `Item` (photoUrls, aiConfidence, category, status=AVAILABLE, draftStatus=PUBLISHED) + `Sale` (status=PUBLISHED, startDate, endDate) + `Organizer.businessName`. MVP: no filters, 2-col mobile / 3-col desktop, entry from shopper home. V2: category filter, Save to Wishlist inline, organizer attribution. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 79 | Earnings Counter Animation | ORG | SIMPLE | — | — | — | — | — | — | — | Dashboard earnings number rolls up to current value (Revolut-style) on open/refresh. No schema changes — reads existing `Purchase` aggregates. Frontend-only. Pairs with #77 to make dashboard feel alive. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 80 | Purchase Confirmation Redesign | SHO | FREE | — | — | — | — | — | — | — | Redesign shopper success screen after purchase — item photo hero, item title, seller name, pickup details, designed layout. No schema changes: reads `Purchase` + `Item.photoUrls[]`, `Item.title`, `Sale.title`, `Organizer.businessName`. Replaces generic confirmation text. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 81 | Empty State Audit + Copy Pass | BOTH | FREE | — | — | — | — | — | — | — | Inventory all empty states across organizer and shopper flows. Write human-voice copy for each (no dead ends — every empty state gets a CTA and a human sentence). UX/copy-only, no schema or API changes. Spec: `claude_docs/ux-spotchecks/design-polish-vision-2026-03-19.md` |
| 82 | Trademark — FindA.Sale | BIZ | LEGAL | — | — | — | — | — | — | 📋 | File USPTO trademark on "FindA.Sale" brand name if not already done. ~$250–400/class + attorney fees (~$1,500–2,500 total). First priority IP action. Attorney required. |
| 83 | Trade Secret Housekeeping | BIZ | LEGAL | — | — | — | — | — | — | 📋 | Document proprietary algorithms (fraud scoring, Near-Miss Nudge logic, City Heat Index formula, Flip Report scoring, AI condition grading prompts) as trade secrets in internal docs. Ensure all contractors/contributors have signed NDAs or are covered by agreements. No filing required — zero cost. |

---

## Deferred & Long-Term Hold

### Infrastructure & Platform

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Zero-Downtime Migration Framework | INFRA | TEAMS | Blue-green migrations for large tables (items, purchases). Critical as data grows past 10k rows. Architect designs; Dev builds helpers. | When table sizes warrant it |
| Canary Deploy + Auto-Rollback | INFRA | SIMPLE | Deploy to Vercel preview + Railway staging first; auto-rollback if smoke tests fail. Enables daily deploys without risk. | After beta stabilizes |
| Audit Automation Library | INFRA | SIMPLE | Codify 8 pre-beta audit paths as reusable tests; run on every deploy. health-scout creates `audit_baseline.json`. | After beta launch |

### Market Expansion & Positioning

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Affiliate Program | ORG | TEAMS | Backend 60% built. Referral badges (SIMPLE) + loyalty passport integration worth exploring first. Full payouts deferred. | After referral badges prove demand |
| White-label MaaS | ORG | TEAMS | Business decision — beta validation first | After beta data |
| Consignment Integration | ORG | PRO | Thrift store POS — post-beta complexity | After beta data |
| QuickBooks Integration | ORG | SIMPLE | CSV export covers 80% of need | When organizers ask |
| Multi-metro expansion | ORG | SIMPLE | Beta validation first | After beta data |
| BUSINESS_PLAN.md rewrite | PUB | TEAMS | Reflect national positioning and current fee/feature state | After beta data confirms positioning |

### Hardware & Research

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Video-to-inventory | ORG | TEAMS | Vision models can't reliably segment rooms yet | Late 2026+ |
| AR Furniture Preview | SHO | TEAMS | Hardware not ready | Long-term R&D |

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
| City Weekend Landing Pages (Metro Explorer) | SHO | FREE | SEO-indexed per-metro pages. ISR + Schema.org markup. High SEO ROI but slow payoff (6–12 wk indexing). | After 10+ active sales in GR |
| Featured Listings (Feature Boost) | ORG | PAID_ADDON | Paid homepage placement ($50–100/sale). Zero value pre-scale — needs 500+ daily shoppers. | After 500+ organizer accounts + 10+ active sales |
| Auto-Markdown (Smart Clearance) | ORG | PRO | Auto-discount engine: 50% day 2, 75% day 3. Removes manual repricing. | Week 3–4 of beta once organizers run 1–2 sales |
| Approach Notes (Arrival Assistant) | SHO | SIMPLE | Push notification at 500m: "Parking around back, enter via side gate." Geolocation-dependent. | After Front Door Locator + Entrance Pin ship |
| Crowd-Sourced Corrections (Community Intel) | SHO | FREE | Shoppers report "still available?" status + correct entrance locations. Vote-based ranking. | After 500+ concurrent shoppers exist |
| Treasure Hunt QR (In-Sale Scavenger Hunt) | SHO | FREE | Organizer prints QR stickers for unique items → shoppers collect badges. Dwell time + impulse purchase driver. | After gamification scaffold ships |
| Shopper Profile + Friend Network | SHO | FREE | Public mini-card showing badges, finds, friend activity. Social proof layer. | After gamification + UGC features |
| Unified Print Kit | ORG | SIMPLE | Combined PDF: yard sign QR + item barcode stickers. Attribution loop. | After QR/Barcode Labels promoted |
| Fast Pass for Sales (Priority Entry) | SHO | PAID_ADDON | $5–15 per pass, 30-min early access, capped at 20–50 passes. Revenue stream for organizers. | After beta proves high-demand sales |
| Sale Grand Finale Events | ORG | PRO | Last 2 hours: live-streamed event, flash auctions, 5x XP. Requires streaming infra. | After Live Stream Sale Events |
| VIP Behind-the-Scenes Tours | ORG | PAID_ADDON | $99–299 video shoot package with creator. Professional content for organizer marketing. | After creator network develops |
| Buddy System (Paired Shopping) | SHO | FREE | Pair with friend for sale visits. Shared cart, bonus XP, co-collector profile. | After gamification + social features |

### Creator & Community Economy

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| Restoration & Upcycling Marketplace | BOTH | FREE | Before/after project gallery. "Studio Pro" tier for restorers. Creator economy play. | After UGC Photo Tags proves community appetite |
| Book Club & Vinyl Community Hubs | SHO | FREE | Moderated collector hubs with feeds, swaps, events, challenges. Niche community retention. | After Collector Passport proves specialty-interest demand |
| Brand & Designer Tracking | SHO | FREE | Follow specific brands/designers (Eames, Hermès). Alerts when matching items post. | After tag system + Wishlist Alerts ship |

### Long-Term Platform Vision (R&D Phase)

| Feature | Role | Tier | Reason | Revisit Trigger |
|---------|------|------|--------|-----------------|
| FindA.Sale Network (Tier 3 Services) | PUB | TEAMS | Multi-sided ecosystem: organizers + buyers + restorers + appraisers + shippers + designers. Platform as infrastructure OS. | Transformative — after platform proves all 3 tiers viable |
| AI Buying Agent Scout | SHO | PRO | Personal AI shopping agent. Learns taste, proactively watches sales, auto-notifies. Premium $9.99/mo. | After ML pipeline + personalization data |
| Estate Planning Toolkit | ORG | TEAMS | Heir/executor liquidation assistant: inventory builder, appraisal integration, tax reporting. Upstream demand creation. | After core organizer features stable |
| State of Estate Sales Report | ORG | PAID_ADDON | Monthly anonymized data report: pricing trends, category velocity, regional hotspots. B2B intelligence ($199/yr). | After 6+ months transaction data |

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
| Agentic AI Assistant ("Scout") | SHO | PRO | Requires Wishlist Alerts + Collector Passport + sold-item data. XL complexity. Overlaps with AI Buying Agent Scout. | After Wishlist + Collector Passport + 6 months data |
| Voice Search + Navigation | SHO | SIMPLE | Web Speech API browser-native. Nice-to-have, not a retention driver. | After core search polished |
| RaaS for Organizers (Resale-as-a-Service) | ORG | TEAMS | Long-term platform vision: full business management suite. Japan/EU circular economy model. | After individual features prove themselves — 2027+ |
| Multi-Language Support (Spanish First) | PUB | SIMPLE | 42M native Spanish speakers in U.S. i18n framework. Important for national scale, not urgent for GR beta. | Before national expansion — Q1 2027 |
| API-First Organizer Toolkit | ORG | TEAMS | OAuth2 auth, docs, rate limiting, versioning for public API. Behind Premium Tier. Enables Zapier. | After core features stabilize — Q4 2026-Q1 2027 |
| Zapier/Make.com Integration Hub | ORG | TEAMS | Requires API-First Toolkit first. Official Zapier app with triggers + actions. 2.2M businesses use Zapier. | After API-First ships — Q1-Q2 2027 |
| TikTok-Style Item Reveal Feed | SHO | FREE | Vertical swipe feed of item reveals. Only works with high photo quality + item volume (100+/area). | After Rapidfire + Listing Factory drive quality up |
| Haul Post Gallery (UGC Social Proof) | SHO | FREE | Post-purchase "show off your finds" with item linking. Builds on UGC Photo Tags. | After UGC Photo Tags ships |
| Organizer AMAs (Reddit-Style Q&A) | BOTH | FREE | Scheduled pre-sale preview + Q&A sessions. Requires chat infrastructure + organizer willingness. | After 10+ active organizers |
| Workflow Automations (Built-in IFTTT) | ORG | PRO | Rule builder: Trigger → Condition → Action. Start with 5-10 hardcoded automations. | Hardcoded Q3 2026; custom rules 2027 |
| Auto-Reprice (Market-Responsive Pricing) | ORG | PRO | AI adjusts prices based on real-time demand signals. Extends Auto-Markdown. Requires transaction data. | After 6+ months transaction data |
| Sale Soundtrack (Ambient Vibes) | SHO | FREE | AI-suggested Spotify/Apple Music playlists matched to sale type. Stick to external playlist links. | Anytime — low priority but fun marketing splash |

*Deprecated (won't build): Co-Branded Yard Signs, Multi-Format Marketing Kit.*

---

## Rejected by Board

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
---

## Maintenance

This document is the source of truth for product roadmap. Updated at every session wrap when a feature ships, beta status changes, or a deferred item is revisited. Full build history: `claude_docs/strategy/COMPLETED_PHASES.md`.
