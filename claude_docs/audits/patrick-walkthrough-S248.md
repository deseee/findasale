# Patrick Full-Site Walkthrough — S248 + Post-S248 Audit

**Original walkthrough:** Session 248 (2026-03-23) as user11 (shopper) and user3 (organizer/TEAMS)
**Updated through:** Session 265 (2026-03-24) — second walkthrough as user3 added, resolved items marked
**Canonical audit doc.** All findings here; `S248-walkthrough-findings.md` is a summary index.

---

## Resolved Since S248 (do not re-fix)

| ID | What | Session Fixed |
|----|------|---------------|
| H-01 | TreasureHunt modal dismiss button | S258 |
| I-02 | Inspiration 2 footers | S258 |
| C-01 | Contact page copy shortened | S258 |
| C-02 | Contact form sends email | S259 (Patrick confirmed live) |
| FAQ-01 | ▼ unicode rendering on FAQ | S258 (Patrick confirmed) |
| FAQ-02 | → unicode rendering on FAQ links | S258 (Patrick confirmed) |
| CP-rename | Collector Passport → Explorer Passport rebrand | S260/S262 |
| LY-strategy | Gamification spec written and approved | S259/S260 RPG spec |
| PR-02 | Shopper → Organizer conversion flow | S265 (BecomeOrganizerModal) |
| SD-ActivitySummary | ActivitySummary dark mode skeleton | S259 |
| TY-01 | Typology dark mode text (partial) | S258 |

---

## Category Legend

- **BUG** — Broken functionality, fix via findasale-dev
- **DARK** — Dark mode violation (D-002), fix via findasale-dev
- **DATA** — Test data gap, fix via seed script update
- **UX** — Needs UX/design decision before implementation
- **STRATEGY** — Product/business question, needs Patrick + advisory input
- **DUP** — Duplicate/overlapping features, needs consolidation decision
- **COPY** — Text/content update needed

---

## 1. HOMEPAGE

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| H-01 | Treasure hunt modal can't be closed, shows to everyone | BUG | P1 |
| H-02 | "Sales Near You" cards are basic — should cards show more info? | UX | P2 |
| H-03 | Should UX redesign the entire homepage? | STRATEGY | P2 |
| H-04 | Search only finds sale name/about — doesn't search items, organizer names, keywords | BUG/UX | P1 |
| H-05 | No dark/light mode toggle in nav | BUG | P1 |
| H-06 | Organizer-specific pages only accessible from frontpage, not dark mode enabled | DARK | P1 |

## 2. TEST DATA (cross-cutting)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| TD-01 | Most organizers don't have Stripe enabled — can't test sales flow. Only 1-2 should lack it | DATA | P0 |
| TD-02 | Seller accounts need likes, purchases, history, wishlists, faves, trails, loot log pre-populated | DATA | P0 |
| TD-03 | No shoppers have badges on leaderboard | DATA | P1 |
| TD-04 | Gallery/trending photos broken — need real/working image URLs in seed | DATA | P1 |
| TD-05 | No notification data exists | DATA | P2 |
| TD-06 | No data for: command center, bounties, reputation, collector passport, trails, loot log | DATA | P1 |

## 3. MAP

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| M-01 | Map is plain — no animations or interactivity beyond clicking sales | UX | P2 |
| M-02 | Plan Your Route needs default starting point (user location?) and optional ending point (same as start toggle?) | UX | P2 |
| M-03 | Plan Your Route is white in dark mode | DARK | P1 |
| M-04 | Could Plan Your Route include promoted listings/ads (thrift stores, gas stations, restaurants) like Waze? | STRATEGY | P3 |

## 4. INSPIRATION

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| I-01 | Gallery photos broken frequently | DATA | P1 |
| I-02 | Has 2 footers | BUG | P1 |
| I-03 | Can like but can't wishlist from this page | BUG | P2 |

## 5. TRENDING

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| T-01 | Broken thumbnails frequently | DATA | P1 |
| T-02 | Can like but can't wishlist from this page | BUG | P2 |

## 6. PRICING

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PR-01 | user11 (shopper) shows "Free organizer tier already chosen" — wrong role displayed | BUG | P1 |
| PR-02 | No organizer onboarding flow visible for shopper upgrading to organizer | UX | P2 |
| PR-03 | Support tiers (email, priority email, dedicated account manager, priority phone) — how to automate? Patrick can't handle all this | STRATEGY | P1 |
| PR-04 | "Need unlimited team members?" block needs space after box before mini FAQ | BUG | P2 |
| PR-05 | How to incentivize free-tier users to use POS so platform gets paid for unphoto'd items? | STRATEGY | P1 |
| PR-06 | Should single-sale listing have a nominal à la carte fee? | STRATEGY | P2 |
| PR-07 | Trying to go to organizer/dashboard as shopper = access denied (no friendly redirect) | BUG | P1 |

## 7. ABOUT

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| A-01 | Needs updated to represent what product has become | COPY | P2 |

## 8. LEADERBOARD

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| L-01 | No shoppers have badges | DATA | P1 |
| L-02 | What do users earn by completing sales? What do badges represent? What does climbing ranks get them? Seasonal? Tied to Hunt Pass? | STRATEGY | P0 |
| L-03 | "Gamification exists but no real plan for what we've built besides the mechanics" | STRATEGY | P0 |
| L-04 | Clicking an organizer says "organizer not found" | BUG | P1 |

## 9. CONTACT

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| C-01 | Page text too long — should be "We're here to help! Reach out with any questions or feedback." | COPY | P2 |
| C-02 | Send message button doesn't seem to do anything | BUG | P1 |

## 10. SHOPPER DASHBOARD

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SD-01 | Collection, loyalty etc. buttons should display content within the same page like Overview/Purchases tabs | UX | P2 |
| SD-02 | Overview has white elements in dark mode | DARK | P1 |
| SD-03 | Overview "Sales Near You" loads white then fails | BUG/DARK | P1 |
| SD-04 | Streak and points show nothing | DATA/BUG | P1 |
| SD-05 | Upgrade button links to Hunt Pass checkout but no explanation of why to upgrade | UX | P2 |
| SD-06 | Purchases, watchlist, saved items, points buttons display numbers but don't click anywhere | BUG | P1 |
| SD-07 | "Browse upcoming sales" seems random on dashboard | UX | P2 |
| SD-08 | Pickups — white card in dark mode | DARK | P1 |
| SD-09 | Subscribed tab — no test data, following a seller from frontpage didn't populate it | BUG/DATA | P1 |

## 11. SHOPPER/COLLECTOR-PASSPORT

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| CP-01 | No data — can't test properly | DATA | P1 |
| CP-02 | What are "specialties" and "keywords"? No explanatory text | UX | P2 |
| CP-03 | 2 footers | BUG | P1 |

## 12. SHOPPER/LOYALTY

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| LY-01 | What is loyalty in relation to leaderboard points and Hunt Pass? "Gaming mechanics but no game" | STRATEGY | P0 |
| LY-02 | What are stamps? What are milestones? Same as leaderboard badges? | STRATEGY | P0 |
| LY-03 | When/what benefits, how/why/where? | STRATEGY | P0 |
| LY-04 | 2 footers | BUG | P1 |

## 13. SHOPPER/ALERTS

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AL-01 | Is this the same as wishlist? Should we rename? | DUP | P1 |
| AL-02 | White text on white element in dark mode | DARK | P1 |
| AL-03 | Keywords vs tags — no distinction or explanation | UX | P2 |
| AL-04 | Can't search for matching items from alert card, only edit/delete | UX | P2 |
| AL-05 | 2 footers | BUG | P1 |

## 14. SHOPPER/TRAILS

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| TR-01 | Completely broken — can't create new trail, no data | BUG | P0 |
| TR-02 | 2 footers | BUG | P1 |

## 15. LOOT LOG & RECEIPTS

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| LL-01 | No sales data — can't test | DATA | P1 |

## 16. SHOPPER/FAVORITES

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| F-01 | Overlap with alerts/wishlist — confusing | DUP | P1 |
| F-02 | "My Wishlists" in dropdown goes to page called "Favorites" | BUG | P1 |

## 17. PROFILE

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PF-01 | Whole page may need redesign | UX | P2 |
| PF-02 | Hunt Pass prominent but what does it mean here? Points shown but what are they good for? | STRATEGY | P1 |
| PF-03 | Bids, referrals — no test data | DATA | P1 |
| PF-04 | Referral points vs other points? Different systems? | DUP/STRATEGY | P1 |
| PF-05 | Sale interests — how differ from wishlist alerts? | DUP | P1 |
| PF-06 | Push notifications toggle — here or settings? | UX | P2 |

## 18. SETTINGS

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| ST-01 | Which notifications actually matter? | UX | P2 |
| ST-02 | Difference between settings and profile — combine or further separate? | UX | P2 |
| ST-03 | 2 footers | BUG | P1 |

## 19. NOTIFICATION BELL

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| N-01 | Can't test — no data in system | DATA | P1 |

## 20. FAQ

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| FAQ-01 | `\u25BC` displaying as text on each question block (unicode not rendered) | BUG | P1 |
| FAQ-02 | `\u2192` displaying as text in CTA links | BUG | P1 |
| FAQ-03 | "Still have questions?" and "Organizer Guide" links — not referenced enough from rest of site | COPY | P2 |

## 21. ORGANIZER (as user3 — TEAMS tier)

### Nav/Menu
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| ON-01 | "Organizer Dashboard" vs shopper "My Dashboard" — ambiguous | UX | P1 |
| ON-02 | "My Profile" appears for both roles — ambiguous | UX | P1 |
| ON-03 | Settings very different from shopper version, much more complete | DUP | P2 |

### Organizer Dashboard
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OD-01 | POS should be more prominent | UX | P2 |

### Print Inventory
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PI-01 | Print button loads forever, tries to print whole page with multiple white pages | BUG | P1 |
| PI-02 | Can't select individual sales to print | BUG | P1 |

### Typology
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| TY-01 | Broken — black text on dark background | BUG/DARK | P1 |

### Command Center
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| CC-01 | No data — can't test | DATA | P1 |
| CC-02 | Fraud signals — no data | DATA | P1 |
| CC-03 | Offline mode — how does it work? For POS and Cards? How are they alerted to sync? | STRATEGY | P2 |

### Appraisals
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AP-01 | Sent appraisal — how do others receive and respond? | UX | P2 |
| AP-02 | What do appraisers get from providing estimates in community feed? | STRATEGY | P2 |

### Item Library
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| IL-01 | Page broken | BUG | P1 |
| IL-02 | How to add items? What distinguishes library items from regular items? | UX | P2 |

### Flip Reports
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| FR-01 | Error: "Unable to load flip report. Please try again." | BUG | P1 |

### Webhooks
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| WH-01 | No guidance on how to test | UX/COPY | P2 |

### Bounties
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| BO-01 | No data | DATA | P1 |

### Reputation
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| RE-01 | Why hidden in community? | UX | P2 |
| RE-02 | No data | DATA | P1 |
| RE-03 | Does it need to tie in with points/tiers? | STRATEGY | P2 |

### Neighborhoods
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| NB-01 | Why is this an organizer feature? Should be for shoppers? | UX | P2 |

### Performance
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PER-01 | Just links to Insights — is it redundant? | DUP | P2 |

### Overview Tab
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OV-01 | Gamified with no direction | STRATEGY | P1 |
| OV-02 | 2 links to reputation score | BUG | P1 |
| OV-03 | Organizer/payouts only accessible from overview tab — should be in nav | UX | P1 |

### Payouts
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PA-01 | Dark text for item name and price on dark background | DARK | P1 |

### Sales Tab
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SA-01 | White cards for live sale status in dark mode | DARK | P1 |

### Organizer Guide
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OG-01 | Needs cleanup and brand/marketing alignment | COPY | P2 |
| OG-02 | Mentions referral program and webhooks — are these ready? | COPY | P2 |
| OG-03 | Not referenced enough from rest of site | COPY | P2 |

### Plan a Sale
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PS-01 | Only displayed to organizers — should be public facing? Start by asking sale type? | UX/STRATEGY | P2 |

### Organizer Profile
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OP-01 | "Start Verification" 404s | BUG | P1 |
| OP-02 | "Your Sales" just links to dashboard — why here? | UX | P2 |
| OP-03 | Quick links and sale interests — what do they do differently than settings equivalents? | DUP | P2 |

### Organizer Settings
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OS-01 | Very different from shopper settings — shoppers should have many of these features too | DUP | P2 |
| OS-02 | Workspace doesn't load, links to findasale.com instead of finda.sale | BUG | P1 |
| OS-03 | /workspace/s242-test-workspace 404s | BUG | P1 |

### Premium/Subscription/Upgrade
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SU-01 | Premium page checkmarks not aligned to columns | BUG | P1 |
| SU-02 | /organizer/premium, /organizer/subscription, /organizer/upgrade + /pricing — 4 pages doing basically the same thing, all different | DUP | P0 |

## 22. SALE PAGE (new — post-S248 walkthrough)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SP-01 | Views/shares/saves stats hard to see in dark mode | DARK | P1 |
| SP-02 | "Organized by" section does not link to the organizer's page | BUG | P1 |
| SP-03 | Stray "0" displaying under new organizer badges | BUG | P2 |
| SP-04 | Share button appears in page header AND in lower share block — duplicate | DUP | P2 |
| SP-05 | Organizer info in "Organized by" block AND contact info in lower block — confusing overlap | UX | P2 |
| SP-06 | "Buy Now" → "Complete Purchase — Failed to create payment intent" | BUG | P0 |
| SP-07 | Reviews section is white in dark mode | DARK | P1 |

## 23. ITEM PAGE (new — post-S248 walkthrough)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| IP-01 | Can't add item to cart | BUG | P0 |
| IP-02 | Shopper sees platform fee on a non-auction item | BUG | P1 |
| IP-03 | No "Buy It Now" button | BUG | P1 |

## 24. SHOPPER/WISHLIST (new — post-S248 walkthrough, distinct from Alerts)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| WL-01 | View link 404s | BUG | P1 |
| WL-02 | Manage link broken — redirects to same page | BUG | P1 |
| WL-03 | 2 footers | BUG | P1 |
| WL-04 | Keywords vs tags — no distinction or explanation (same as AL-03) | UX | P2 |
| WL-05 | No user instructions, tooltips explaining items vs collections vs watching | UX | P2 |
| WL-06 | Whole page needs reworking with gaming narrative | UX | P1 |

## 25. SHOPPER/RECEIPTS (new)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| RC-01 | Page is blank | BUG | P1 |

## 26. ORGANIZER/HOLDS (new)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| HO-01 | No data — can't test | DATA | P1 |

## 27. BRAND KIT (new)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| BK-01 | How much of this should be in Settings or Profile vs here? | UX | P2 |
| BK-02 | How much is pro+ only? All of it? | STRATEGY | P2 |

## 28. ADMIN PANEL (new — tested as user1)

### Admin Overview
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AD-01 | 2 footers | BUG | P1 |
| AD-02 | User status in "new signups" + "ended" status in recent sales — too dark for dark mode | DARK | P1 |
| AD-03 | "Back to App" button — probably unnecessary | UX | P3 |
| AD-04 | Could include internal insights or messaging (admin value-add) | UX | P3 |

### admin/users
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AD-05 | Role/status column too dark for dark mode | DARK | P1 |
| AD-06 | Pagination buttons — light text on light background | DARK | P1 |
| AD-07 | No password reset or other admin actions on user | UX | P3 |
| AD-08 | 2 footers | BUG | P1 |

### admin/sales
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AD-09 | "Ended" status too dark for dark mode | DARK | P1 |
| AD-10 | Pagination buttons — light text on light background | DARK | P1 |
| AD-11 | 2 footers | BUG | P1 |

### admin/invites
| # | Finding | Category | Priority |
|---|---------|----------|----------|
| AD-12 | If admin generates an invite code, does it work with OAuth/passkey sign-up, or must they use the code flow? | STRATEGY | P2 |

---

## ADDITIONS TO EXISTING SECTIONS (post-S248 walkthrough)

### Additional Shopper Dashboard findings (add to §10)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SD-10 | HuntPass CTA has nothing to click or close | BUG | P1 |
| SD-11 | HuntPass crown in streak bar — what does it do? No tooltip | UX | P2 |
| SD-12 | Favorites tab shows watchlist items, not saved items — intended? | BUG | P1 |
| SD-13 | Subscribed tab doesn't link through to organizer pages | BUG | P1 |
| SD-14 | Purchase button cards don't show enough data; clicking through shows items as still "Add to Cart" (not marked sold) | BUG | P1 |

### Additional Explorer Passport findings (add to §11)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| CP-04 | Page title/SEO name still needs update after Explorer rebrand | UX | P2 |
| CP-05 | "No matches yet" in My Matches with no explanation of what matches are | UX | P2 |

### Additional Loyalty findings (add to §12)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| LY-05 | Why "passports"? Confusing terminology given Explorer rebrand | UX | P2 |
| LY-06 | What are guild XP, stamps, milestones, and badges — are they the same as leaderboard badges? | UX | P1 |
| LY-07 | When/what/how/why benefits land, and where they appear — needs full user-facing explanation | UX | P1 |
| LY-08 | Whole page needs reworking with the gaming narrative | UX | P1 |

### Additional Trails findings (add to §14)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| TR-03 | Button uses same map graphic as Explorer — confusing | UX | P2 |
| TR-04 | Light text on mint textbox — readability issue | DARK | P1 |

### Additional Loot Log findings (add to §15)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| LL-02 | Page renders blank | BUG | P1 |

### Additional Profile findings (add to §17)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PF-07 | Badges not visible in dashboard — where are they? | BUG | P2 |
| PF-08 | My Bids not surfaced in dashboard | BUG | P2 |
| PF-09 | Referral points — different system from guild XP, leaderboard points? | DUP | P1 |
| PF-10 | Push notification toggle showing on Profile — should only be in Settings | DUP | P2 |

### Additional Settings findings (add to §18)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| ST-04 | My Profile vs Explorer Passport — need to be combined or further distinguished | UX | P2 |
| ST-05 | "Followed organizers categories" in Settings vs "item categories" in Explorer Passport — what's the difference? | UX | P2 |
| ST-06 | Were we going to let users change email address on Settings? Or another page? | UX | P2 |

### Additional Notification Bell findings (add to §19)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| N-02 | Bell doesn't show unread count until clicked | BUG | P1 |

### Additional Organizer Dropdown findings (add to §21 Nav/Menu)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| ON-04 | Verification is light on context; whole workflow (our side + theirs) needs fleshing out | UX | P2 |
| ON-05 | Push notifications appears in dropdown settings — another location conflict | DUP | P1 |
| ON-06 | AI Assistance has no toggle or checkbox | BUG | P2 |
| ON-07 | Organizer profile super basic — only business name; can we auto-fill from licensed business data? | UX | P2 |

### Additional Organizer Dashboard findings (add to §21 Organizer Dashboard)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OD-02 | Was the dashboard supposed to be reorganized? Some things moved to shopper? | STRATEGY | P2 |
| OD-03 | Pro Features section shows nothing when expanded — should show greyed-out upgrade buttons | BUG | P1 |
| OD-04 | Performance button visible in Community but throws error for non-pro users | BUG | P1 |
| OD-05 | Neighborhoods visible to free/basic org tier — should it be gated? | BUG | P2 |
| OD-06 | Upgrade CTA can't be closed during a session | BUG | P2 |

### Additional Print Inventory findings (add to §21 Print Inventory)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PI-03 | Column headers (Title / Category / Condition / Price / Status) invisible in dark mode | DARK | P1 |

### Additional Organizer Profile findings (add to §21 Organizer Profile)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| OP-04 | "Start Verification" link has no space before it | BUG | P2 |
| OP-05 | "Start Verification" does not link straight to the verification tab | BUG | P2 |
| OP-06 | Push notifications toggle appearing on Organizer Profile page | DUP | P2 |
| OP-07 | "Your Sales" just links to dashboard — why is it on the profile? | UX | P2 |

### Additional Organizer Command Center (add to §21 Command Center)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| CC-04 | White elements in dark mode | DARK | P1 |

### Additional Organizer Sales Tab (add to §21 Sales Tab)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| SA-02 | Sales tab seems to work better as a command center than the actual Command Center | UX | P2 |

### Additional Plan a Sale findings (add to §21 Plan a Sale)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| PS-02 | Only accessible from dropdown — not in organizer dashboard | UX | P2 |
| PS-03 | Should it be public-facing, starting by asking type of sale? | STRATEGY | P2 |

### Map — additional finding (add to §3)

| # | Finding | Category | Priority |
|---|---------|----------|----------|
| M-05 | "Plan Your Route" — should it start expanded instead of collapsed? Should it be above the map? | UX | P2 |

---

## CROSS-CUTTING STRATEGIC QUESTIONS (need dedicated session)

These are product-level questions that keep surfacing across multiple pages:

1. **Gamification has no game plan (L-02, L-03, LY-01, LY-02, LY-03, OV-01):**
   Points, badges, stamps, milestones, leaderboard, loyalty, Hunt Pass, referral points — what do they all mean? What's the reward loop? Is it seasonal? Tied to Hunt Pass? What do users actually get? This needs a unified gamification strategy before more code is written.

2. **Feature overlap / naming confusion (AL-01, F-01, PF-04, PF-05, DUP items):**
   Alerts vs wishlists vs favorites vs saved items vs watchlist vs sale interests — how many of these are the same thing? Need a naming consolidation decision.

3. **Support tier reality check (PR-03):**
   Email support, priority email, dedicated account manager, priority phone — Patrick is one person. What can be automated? What's the actual support plan?

4. **Subscription page sprawl (SU-02):**
   4 different pages doing the same thing differently. Need to consolidate to 1.

5. **Organizer vs shopper settings parity (OS-01, ST-02):**
   Shopper settings are bare bones compared to organizer. What should shoppers also have?

6. **POS incentivization (PR-05):**
   How to get free-tier users to use POS so platform earns on un-photographed items?

7. **Test data overhaul (TD-01 through TD-06):**
   The seed script needs a major rewrite to create realistic, varied data across all features so we stop burning tokens fixing empty states on the fly.

8. **Payment flow broken end-to-end (SP-06, IP-01, IP-03):**
   "Buy Now" fails with payment intent error. Can't add item to cart. No "Buy It Now" button on item page. The full purchase flow is non-functional — this is a P0 blocker for any monetization testing.

9. **Organizer dashboard reorganization (OD-02):**
   Was this supposed to be overhauled with some tabs moved to the shopper side? Needs clarification before more organizer dashboard work.

10. **Settings/profile/notifications sprawl:**
    Push notifications appear in at least 3 locations (shopper profile, organizer profile, dropdown settings). Profile vs Settings distinction is unclear for both roles. Need a single, consistent information architecture decision before fixing individual pages.

11. **Admin invite code + OAuth compatibility (AD-12):**
    If someone is invited via code but uses Google/Facebook/passkey OAuth, does the invite code flow work? Needs a product decision before beta invites go out.

12. **Verification workflow (ON-04):**
    The organizer verification flow is underspecified on both sides. What does Patrick see? What does the organizer see? What triggers approval? Needs a full spec before fleshing out the UI.

---

## SUMMARY COUNTS (updated through S265)

| Category | Count | Resolved |
|----------|-------|---------|
| BUG | ~55 | ~10 |
| DARK | ~20 | ~2 |
| DATA | ~15 | 0 |
| UX | ~35 | 0 |
| STRATEGY | ~18 | ~3 (gamification spec) |
| DUP | ~12 | 0 |
| COPY | ~5 | ~2 |
| **Total open** | **~135** | **~17 resolved** |

## RECOMMENDED TRIAGE ORDER

1. **Test data overhaul** (TD-*) — unblocks testing of 30+ items downstream. One seed rewrite prevents dozens of "no data can't test" findings.
2. **P0 strategy session** — gamification plan, feature naming consolidation, subscription page consolidation. Without decisions here, fixing individual pages is wasteful.
3. **Dark mode pass** (DARK items) — mechanical, can be batched in one dev dispatch
4. **Double footer bug** — appears on 8+ pages, likely one Layout.tsx fix
5. **Broken pages** (TR-01, IL-01, FR-01, TY-01, OP-01, OS-02) — individual dev fixes
6. **Everything else** — prioritized within each session
