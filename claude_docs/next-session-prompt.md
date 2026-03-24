# Next Session Prompt — S260

**Date:** 2026-03-23 (S259 complete)
**Status:** Explorer's Guild spec in progress — game design research done, 8 decisions open, board approved Phase 1 with mods. No blockers.

---

## MANDATORY FIRST — Verify Organizer Pages (UNVERIFIED from S259)

User2 login failed during S259 QA. Two pages could not be browser-tested:
- `/organizer/onboarding` — all 5 steps, progress indicator "Step X of 5", localStorage dismiss
- `/organizer/pricing` — all tiers shown, Stripe CTAs, current plan highlighted for PRO

Test as user2@example.com / password123. If login still fails, investigate auth issue first.

---

## S260 PRIORITY 1 — Finish Gamification Spec (RPG Deep Dive + 8 Decisions)

### Patrick's Design Direction (Confirmed S259)

1. **Loot Legend NOT gated** — Every user gets a shareable collection page. Earned/purchased items populate it. High-rank users get special earned items displayed. Make it beautiful and shareable (UGC engine).
2. **Coupons + auction fees** as reward/redemption currency — research how these can integrate into the XP economy (earn coupons via rank? redeem XP for auction fee credits?).
3. **RPG economy research needed** — What can FindA.Sale learn from RPG game economies? Loot tables, XP sinks, item rarity systems, vendor/merchant mechanics, crafting. How do RPGs prevent gold-farming abuse?
4. **Abuse prevention** — Before dev dispatch, design the abuse prevention layer: XP farming guards, referral fraud detection, bid-spamming for XP, fake review rings, account sharing for rank.

### 8 Open Decisions (Confirmed by Patrick or still open)

1. **Grandmaster Hunt Pass** — CONFIRMED UNCAPPED (once you're Grandmaster, Hunt Pass is less the draw anyway)
2. **Seasonal reset** — Soft reset confirmed (annual January). Design: what tier does each rank drop to on reset? (e.g., Grandmaster → Sage floor, Sage → Ranger floor, etc.)
3. **Visit XP** — Game designer question: flat 5 XP/visit capped at 100/month, or something smarter? What would a game designer do?
4. **Sage big payoff** — Presale off table (Patrick doesn't want to force organizers). Loot Legend not gated. What IS the Sage payoff now? Design 2-3 new options.
5. **Hunt Pass ↔ rank** — Confirmed: Hunt Pass gives 2x XP multiplier while active. Scout discount confirmed. Grandmaster free Hunt Pass uncapped confirmed.
6. **Shareable XP sources** — Which actions earn XP AND generate a shareable moment? (photo upload of find, auction win, rank-up announcement, seasonal badge earned)
7. **Auction XP** — Flat per bid OR wins only? Per-bid risks XP farming via bid-spam. Wins only is cleaner.
8. **Social share XP** — Honor system or verified? (Verified requires platform integration; honor system is gameable)

### Research Tasks for Innovation Agent

- **RPG economy deep dive:** Diablo/Path of Exile loot systems, WoW gold economy, RuneScape's Grand Exchange, Pokémon trading. What prevents hyperinflation/deflation? What are XP sinks (things that consume XP/currency to keep economy healthy)?
- **Abuse prevention patterns:** How do MMOs prevent gold farming? How does Duolingo prevent streak manipulation? How does eBay detect feedback manipulation?
- **Coupon/auction fee integration:** Design how coupons and auction fees plug into the XP/reward economy.

### After Research: Final Spec Lock

Once RPG research + 8 decisions resolved, produce FINAL spec and dispatch to findasale-dev for Phase 1 implementation.

---

## S260 PRIORITY 2 — Agent Prompt Bias Fix (Carry-Forward from S259)

**Still not done.** Patrick flagged S258: all agent prompts inject "estate sale" as the only platform use case.

**Action:** Audit and update:
- `/sessions/[session-id]/mnt/.claude/CLAUDE.md` (global)
- `/sessions/[session-id]/mnt/FindaSale/CLAUDE.md` (project)
- Relevant agent SKILL.md files (findasale-dev, findasale-ux, findasale-innovation, findasale-marketing, findasale-qa, findasale-advisory-board)

**Replace throughout:** "estate sale operators" → "secondary sale organizers"
**Ensure:** All agents understand FindA.Sale serves 5 sale types: estate sales, yard sales, auctions, flea markets, consignment.

Dispatch to findasale-records.

---

## S260 PRIORITY 3 — Explorer's Guild Phase 1 Copy Implementation

**Blocker:** Final spec not yet locked (8 decisions open). Do NOT dispatch dev until spec is signed off by Patrick.

**Once approved:**
- Update OnboardingWizard.tsx copy to Explorer's Guild narrative
- Update collector-passport.tsx labels/copy (rank names, expedition language)
- Update Hunt Pass copy ("Explorer's Hunt Pass" or similar?)
- Update leaderboard page copy
- Update badge names to match seasonal expedition themes

Dispatch to findasale-dev with final spec as handoff.

---

## Research Docs Available (claude_docs/research/)

- `gamification-revised-spec-S259.md` — Implementation-ready spec with XP thresholds, archetype paths, seasonal designs
- `gamification-xp-economy-S259.md` — Full XP economy table (25 sources), game design research, viral moments map
- `gamification-board-review-S259.md` — Full board positions, voting, modifications
- `gamification-deep-dive-spec-S259.md` — Original deep dive
- `gamification-executive-summary-S259.md` — Board-friendly summary
- `PATRICK_DECISION_SUMMARY-S259.md` — What's locked vs. open
- `DEV_HANDOFF_CHECKLIST-S259.md` — Dev sprint plan (use after final spec lock)

---

## Context

Commit `efe96ee` deployed: purchases tab clickable + YourWishlists dark mode fix.
Beta week active. Gamification is the strategic focus. No other feature work until spec is locked.

**Platform serves 5 sale types:** estate sales, yard sales, auctions, flea markets, consignment. All features and language must work across all 5. Not just estate sales.

---

## Test Accounts (Live on Neon)

All password: `password123`
- `user1@example.com` — ADMIN + SIMPLE organizer
- `user2@example.com` — PRO organizer (Stripe connected) ⚠️ login failed in S259 — verify first
- `user3@example.com` — TEAMS organizer (Stripe connected)
- `user11@example.com` — Shopper with full activity
