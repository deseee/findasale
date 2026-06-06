# FindA.Sale — Knock-On Effects + Out-of-the-Box Growth Levers (2026-06-05)

## Part A — Downstream effects of reactivating the machine

**1. Unfurl fix → share spike → load.** The sale detail page (`pages/sales/[id].tsx`) was server-rendered on every request (SSR), NOT cached. The exact URL that gets shared into Facebook groups / iMessage would hit Railway + Postgres on every human view AND every crawler re-fetch (FB, iMessage, WhatsApp, Slack each fetch OG tags independently). A single viral sale could exhaust the Postgres connection pool → 500s on the pages you just made shareable. **Resolved in the same fix:** the sale page was converted to ISR (getStaticProps + revalidate), which moves the spike onto Vercel's edge cache. The load knock-on and the unfurl bug were the same root cause.

**2. More traffic → conversion leak (THE bottleneck).** On a shared sale page, the prominent "save" action (FavoriteButton) hard-redirects unauthenticated visitors to `/login`. A stranger who arrived from a text gets thrown into a registration wall — textbook bounce. The catch-net already exists (SaleWaitlistButton / WishlistAlertForm capture email only, no login) but is secondary. **Fix: make email-only capture the prominent default on every shared sale page** before warming channels, or you're filling a leaky bucket.

**3. Two-sided flywheel.** More shoppers → more searches/saves → richer demand data → stronger organizer pitch. The surface (DemandSignalsCard: "X searches near you / trending nationally") already exists but only shows AFTER an organizer lists. Surface aggregated demand at acquisition — on the public "list a sale" page and in outreach copy ("127 people searched estate sales in [city] this month").

**4. Email reactivation coupling.** Sending domains are correctly separated (`send.` transactional vs `outreach.`/root cold). Real risk is the bare root domain — keep cold mail off it. Deeper risk is product: outreach → signups → if onboarding doesn't reduce organizer work, you get silent churn → spam complaints → a third suspension. Gate the warm-up ramp on activation quality, not just the calendar.

**Single biggest bottleneck:** the account-required action wall on the sale page with no prominent email-only catch-net. Every channel funnels strangers to that page; the ISR content pages handle volume, but the conversion moment leaks. Cheap to fix, already half-built.

## Part B — Out-of-the-box levers (priority order)

Fast / low-risk (leverage assets already shipped):
1. **Organizer-as-distribution** (S) — one-tap "copy my sale announcement" with the FindA.Sale link baked in; their existing Craigslist/FB/Nextdoor posts become your top-of-funnel.
2. **Demand-signal cold-open** (S) — "Shoppers are already searching here" as the outreach + list-a-sale headline, sourced from data you already compute.
3. **Per-city weekend roundups** (S) — productionize the already-generated content into auto-built "Top sales this weekend in [city]" posts linking to `this-weekend/[city]`.
4. **QR-on-the-sign → live restock alerts** (S) — scanning the yard-sign QR does email-only "alert me when they add items"; the physical sign becomes a subscribe button.
5. **Referral loop at the dopamine peak** (S) — fire the existing shopper/organizer referral loops right after a great find / a sold-out sale, not from a static page.

Medium:
6. **Facebook-group-native share format** (S–M) — big-photo + address + "see all 60 items →" post optimized for local yard-sale groups (the real watering hole).
7. **Print-kit item tags as scannable mini-storefronts** (S–M) — per-item QR opens price/condition/"save the sale" on the phone.
8. **Last-hours urgency syndication** (S–M) — "Final hours, half-price Sunday" alerts to the email-capture base + groups; urgency is native to secondary sales.
9. **Shopper haul sharing** (M) — lean into the existing `/haul` surface; "what I scored for $12" is the most viral-native content in this category.

Bigger bets (highest national ceiling, no paid spend):
10. **"This weekend in [city]" as pitchable local-media asset** (M) — free auto-updating weekend-sales feed/embed for local papers, radio sites, neighborhood blogs → backlinks + referral traffic.
11. **Google event-search + event-aggregator syndication** (M) — sales ARE dated events; claim event-rich-results competitors aren't.
12. **Embeddable "sales near me" widget for adjacent local sites** (M) — realtors, downsizing services, estate attorneys, junk-removal — businesses that touch your audience at the moment of need host your feed.

Brand rules throughout: sender = "The FindA.Sale Team," no founder voice, no "AI" in user-facing copy (use "alerts"/"smart"/"suggested"), national scope by default.
