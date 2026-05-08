# Organizer Storefront — Answers + New Briefs
Reply to Claude Design · v0.1 handoff · May 2026

---

## 1. Data shapes — what already exists?

**Organizer profile**
- ✅ Display name — `Organizer.businessName`
- ✅ Logo / mark image — `Organizer.brandLogoUrl` (Cloudinary URL, PRO tier)
- ✅ Cover photo — `Organizer.brandBannerImageUrl` (single URL, PRO tier — no gallery yet)
- ✅ Tagline — `Organizer.tagline`
- ✅ Long description — `Organizer.bio`
- ✅ Year founded — `Organizer.yearFounded`
- ✅ Verified flag — `Organizer.verificationStatus` (NONE / PENDING / VERIFIED / REJECTED)
- 🟡 Service area — `Organizer.serviceAreas` (CSV/JSON freetext — no structured radius/county model yet)
- ❌ Organizer type as first-class field — it's inferred from sale history (`Sale.saleType`: ESTATE / YARD / AUCTION / FLEA_MARKET). One organizer can run multiple types.

**Hours**
- ✅ Regular weekly hours — `OrganizerHours` model (dayOfWeek, openTime, closeTime)
- ❌ Sale-day overrides — not modeled yet (design your HoursV2 override concept and we'll add it)
- ❌ By-appointment flag — not in schema
- ❌ Holiday closures — not in schema
- ❌ Timezone — not stored; assume organizer's address timezone

**Contact**
- ✅ Phone, email (via User), website — all on Organizer
- ✅ Social links — facebook, instagram, etsy, twitterUrl, tiktokUrl, youtubeUrl, pinterestUrl
- 🟡 Address — single `Organizer.address` field; no mailing vs. sale-only split

**Sales**
- ✅ Status — DRAFT / PUBLISHED / ENDED. Note: "upcoming" and "live" are both PUBLISHED (distinguished by `startDate` vs today). Design's UPCOMING/LIVE/PAST pills will need a derived display status.
- ✅ Multi-day — `startDate` / `endDate` exist; no per-day pricing rules yet (50%-off-Sunday is not modeled)
- ✅ Inventory — `Item[]` per sale, full lot catalog for auctions
- ❌ Attendance count — not tracked
- ❌ Featured / pinned flag on sale — not on schema
- ✅ Tags — `Sale.tags` (free-form array, not controlled vocab)

**Reviews**
- ✅ Reviews exist — but they are **per-sale**, not per-organizer. There is no organizer-level review object.
- ❌ Google / Yelp aggregation — not built, not planned for beta
- ❌ Organizer response on reviews — not built
- ❌ Verified-attendee-only gating — not enforced

**Followers / notifications**
- ✅ Follow relationship — `Follow` model + `SmartFollow` model (smart follow triggers alerts for matching items)
- ✅ Email notifications — `notificationPrefs.emailNewSalesFromFollowed` on User
- ✅ Push subscriptions — `PushSubscription` model exists
- ❌ Frequency caps as explicit setting — not modeled
- ❌ Organizer broadcast to followers — not built (great future feature, spec it)

---

## 2. Tier model

**Yes — your Simple / Pro / Teams map to our pricing tiers.** Confirmed pricing (locked S388):
- **Simple** — Free (one-time or casual sellers)
- **Pro** — $29/mo (estate companies, auction houses, retail shops)
- **Teams** — $79/mo (antique malls, flea markets, vendor co-ops)

**Important:** Our current DB uses BRONZE/SILVER/GOLD as activity-based reputation tiers (separate from pricing). Don't use those in the storefront UI — use Simple/Pro/Teams as the identity.

**Teams is not a full product yet.** The floor map, vendor directory, "Become a vendor" pricing block, and sub-vendor accounts are all designed in your mock but don't exist in data. They're the right next thing to build. For v0.2, design the Teams storefront as-if the data exists — we'll build to the design.

Sub-vendors would be first-class Organizer accounts with a parent relationship. That's the right model. Per-vendor sub-pages: yes, in scope for Teams.

---

## 3. Customization surface

Current schema supports:
- ✅ Accent color — `Organizer.brandPrimaryColor` + `brandSecondaryColor`
- ✅ Logo — `Organizer.brandLogoUrl`
- ✅ Banner — `Organizer.brandBannerImageUrl`
- ✅ Custom slug — `Organizer.customStorefrontSlug`
- ✅ Font family — `Organizer.brandFontFamily` (PRO tier)

**Decisions for design:**
- Accent-only theming for Simple, full palette for Pro/Teams — yes, gate by tier
- Layout: fixed templates per tier (not drag-rearrange) for v1
- Custom domain — not planned for beta
- Custom CSS escape hatch — no, too much support cost
- Show/hide module toggles — yes, build this; spec which modules can be hidden per tier
- Per-tier gating: stats strip, team section, FAQ, floor map = Pro/Teams only

---

## 4. Teams / Marketplace specifics

- Floor map — new. No booth/stall data in schema today. Design it; we'll spec the model.
- Vendors — not first-class users today. Design assumes they will be (correct).
- Apply-to-be-a-vendor flow — not built. States to design: APPLIED / APPROVED / LEASING / LAPSED
- Booth pricing — design as organizer-set per booth (fixed or recurring)
- Recurring events (First Saturday Flea) — Sale model supports startDate/endDate; no recurring/template concept beyond SaleTemplate. Design a repeating event pattern and we'll evaluate.
- Per-vendor sub-pages — yes, in scope

---

## 5. Auctions

- ✅ Lot catalog — Item[] per sale, full model with bidding (proxy bids, reverse auctions in beta)
- ✅ Auction type — `Sale.saleType = AUCTION` + `Sale.isAuctionSale`
- ❌ Live vs. timed distinction — not a separate field; infer from `auctionEndTime` on Item
- ❌ Buyer's premium, bid increments — not stored on storefront (in checkout flow only)
- ❌ Past sold prices — not public today; design the toggle, we'll decide visibility policy
- ❌ Consignment intake form — not built; great CTA for auction house storefronts

---

## 6. Retail / Always-Open model

Currently there's no "always open" sale type. Retail organizers (antique shops, salvage yards) run PUBLISHED sales with no defined end date or use `saleType = FLEA_MARKET`. This is a real gap.

**Design decision:** "Always Open" as a first-class `saleType` is the right call. Retail organizers shouldn't see "Active sales (3)" — they should see "Open now" with hours. Design this variant with that framing; we'll add `RETAIL` to the saleType enum.

Special events (pop-ups, tastings) on top of regular hours: same Sale object with an explicit `isSpecialEvent` flag is fine.

---

## 7. Search / Discovery

- Tags — free-form array on Sale today, not controlled vocab. We'll need to rationalize this.
- Search ranking — proximity + recency + review score today; paid featured placement is planned not built.
- Map/explore filters — category, location, date range currently. No planned v1 changes.
- Organizer leaderboard — ✅ exists (Guild ranking system). Surfacing it on the storefront footer is a good idea.

---

## 8. Ownership & Verification

- Claim-this-listing — not built. The Unclaimed Stub variant you designed is exactly right; we need to build the claim flow to match it.
- Verification tiers today — email only (VERIFIED status). Phone + business doc + in-person not built yet.
- What "Verified" means to shoppers: they've confirmed email + business identity. Keep the badge simple — don't over-promise the verification depth.

---

## 9. Notifications & Follows (shopper side)

- Follow today: saves to Follow table, triggers email via `emailNewSalesFromFollowed` pref.
- Push exists (PushSubscription) but is not consistently used for follow-triggered alerts.
- Frequency: per-new-sale today. No digest option yet.
- Organizer broadcast to followers: ❌ not built. Design this as a Pro/Teams feature — "Send update to your X followers." High-value.
- Follower count: private today (not surfaced in UI). Design should surface it to organizers in their dashboard; public display is a product decision.

---

## 10. Mobile / PWA

- Traffic split: predominantly mobile. Design mobile-first — your 390px Pro variant is the right target.
- PWA install rate: low but growing. "Save for sale day" install prompt tied to an upcoming sale is a solid CTA — build it into the storefront side rail.
- Offline: saved sales list (Favorites) is the primary offline need. Map tile caching is low priority.
- iOS push: Safari 16.4+ support is live. Worth designing an explicit "Turn on sale alerts" nudge.

---

## 11. Open UX questions

**Top organizer complaints about current storefront:**
1. No way to show what makes them different (bio/story buried, no stats strip)
2. Can't show that they're "open" between sales (retail/antique shops are stuck looking inactive)
3. New organizers have nothing on their page — no trust signals at all (empty state problem)

**Top shopper complaints:**
1. Hard to tell if an organizer is "active" or abandoned
2. Can't follow an organizer and get reliable alerts
3. Reviews are per-sale, not aggregated — can't trust a new seller with no history

**Sale types not yet designed:**
- Pop-up shops (fits YARD or new type)
- Charity / nonprofit estate sales (fits ESTATE, needs a nonprofit badge)
- Storage-unit auctions (fits AUCTION)
- Moving sales (fits YARD)
- Online-only / shipping sales (needs a flag — no physical address)

**Brand voice:** Warmer / more local. Not formal "professional." The tone is: knowledgeable neighbor, not corporate platform. Short sentences. Friendly authority. See existing copy guidelines — avoid "AI", avoid "estate sale" as the only type.

---

## Tone decision needed from you, Patrick

Design defaulted to **dark**. The light editorial variant looks significantly more trustworthy for first-time shoppers. Recommendation: light as default for the public storefront, dark as user-selectable or organizer-brandable. Confirm so design can lock it.

---

---
---

# NEW BRIEFS — Three additional surfaces to design next

These are separate from the storefront handoff. Higher conversion impact. Send these back to Claude Design as the next three briefs.

---

## Brief A — Homepage Discovery Funnel

**Surface:** `/` — the public homepage / sale discovery feed
**Problem:** Cold shoppers who land without granting location see "No sales yet" and bounce. The featured sales grid is the first (and only) thing they see — no trust signal, no fallback browsing mode.

**Design asks:**
1. Add a **trust metric bar** immediately above the sales grid: "X active sales this month" — pulls from a live count. Single line, muted typography, not a headline.
2. Add a **geo-toggle**: two-state pill — "Near You" (default with location) / "Nationwide" (no location required). When location is denied or unavailable, auto-switch to Nationwide and show a soft nudge: "Showing nationwide · enable location for sales near you."
3. Replace "No sales yet" with a **warm fallback state**: "Browsing nationwide sales while we find ones near you" — with 4–6 nationally-sourced sales cards below it.
4. Consider a **category quick-filter strip** above the grid (Estate · Yard · Auction · Flea Market · All) as a secondary discovery path.

**Outcome:** A cold shopper should be able to browse real sale listings within 3 seconds of landing — without any permission prompts required.

---

## Brief B — Organizer First-48-Hours Onboarding

**Surface:** `/organizer/dashboard` — first view after signup, before first sale is created
**Problem:** New organizers land on a full dashboard with 15+ nav items and no clear starting point. Activation rate for first sale creation is low.

**Design asks:**
1. Temporarily **replace the full dashboard** with a single linear onboarding card for new organizers (zero sales, `onboardingComplete = false`).
2. Card contains exactly: **(a)** one CTA button: "Create Your First Sale," **(b)** three social proof reasons to act (e.g., "Organizers get 3x more views in their first week when they post immediately"), **(c)** a Step indicator: "Step 1 of 5" — psychological commitment device.
3. **After first sale is created**, animate/fade the card out and reveal the standard dashboard.
4. Design empty states for each of the 5 steps (Create Sale → Add Photos → Set Hours → Go Live → Share).
5. The standard dashboard nav should still be accessible via a small "Skip setup" link — don't trap them.

**Outcome:** The organizer's first 48 hours has one job: create a sale. Everything else is noise.

---

## Brief C — Sale Pulse / Discoverability Quick Wins Card

**Surface:** `/organizer/dashboard` — persistent card for all organizers, most prominent for those with active/recent sales
**Problem:** Organizers have no feedback loop on what's driving (or killing) their discoverability. They don't know why some sales get 80 views and others get 8.

**Design asks:**
1. A **"Sale Pulse" card** on the organizer dashboard showing 3–5 plain-language metrics for their most recent or active sale:
   - "Views this week: 8 → Add 3+ photos to reach 24+ avg"
   - "Saves: 0 → Enable a Rare tag to average +5 saves"
   - "Followers: 2 → Share your storefront link to grow your audience"
2. Each metric line has a **one-tap action button** that takes them directly to the thing to fix (photo upload, tag selector, share sheet).
3. One **micro-incentive bar** at the bottom of the card: "Complete 3 quick wins → unlock Featured badge for 1 week." Progress indicator shows 0/3.
4. Card collapses once all quick wins are done; a new set appears when the next sale is created.
5. Mobile-first — this will be the first thing organizers check on their phone after posting a sale.

**Outcome:** Inactive sellers re-engage because they can see exactly what to fix and can fix it in one tap.

---

*End of reply to Claude Design*
