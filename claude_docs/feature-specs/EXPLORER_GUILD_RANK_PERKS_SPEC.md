# Explorer's Guild — Rank Perks Specification

**Document Owner:** Game Design  
**Status:** Ready for Dev Implementation  
**Last Updated:** 2026-04-13  
**Referenced Locked Decisions:** D-XP-001, D-XP-005, D-HOLD-007, D-HOLD-008, S332, S268

---

## Executive Summary

This spec defines what each Explorer Rank (Initiate → Grandmaster) unlocks for shoppers. All perks are **XP-earned, no additional payment required**. Perks stack cumulatively — a Sage shopper has access to all Initiate, Scout, Ranger, and Sage perks. Grandmaster is the aspirational capstone tier (estimated 1–2% of active base, reset annually on Jan 1).

Perks fall into five categories:
1. **Hold mechanics** (duration, concurrency, grace holds) — already locked in S332
2. **Cosmetics** (badges, profile colors, frames) — XP-priced sinks per D-XP-005
3. **Access & Priority** (early Legendary view, leaderboard visibility, community features)
4. **Friction reduction** (confirm dialogs, search filters, save slots)
5. **Status & recognition** (leaderboard placement, hall of fame, seasonal badges)

---

## Rank Perks Table

| Rank | XP Range | New Unlocks | Visual Signals | Design Rationale |
|------|----------|-------------|-----------------|------------------|
| **Initiate** | 0–499 | • Home feed access<br/>• Save 1 item to Wishlist<br/>• View basic item metadata<br/>• 30 min hold duration<br/>• 1 concurrent hold<br/>• En route grace: 1 hold | Blue rank badge (new)<br/>Initiate icon on profile<br/>Progress bar toward Scout (500 XP) | **Entry tier.** Player can scan items, save discoveries, and place their first holds. No friction. Cosmetics available but not yet earned. Holds are conservative (30 min) to discourage abuse while learning system. |
| **Scout** | 500–1,999 | ⬆️ Everything from Initiate, plus:<br/>• Save up to 3 items (Wishlist)<br/>• Scout Reveal micro-sink (5 XP) unlocks<br/>• Haul Unboxing Animation (2 XP)<br/>• Early access: view sale announcements 1h before organizers<br/>• Bump Post micro-sink (10 XP)<br/>• 45 min hold duration<br/>• 1 concurrent hold (same as Initiate)<br/>• En route grace: 2 holds | Gold rank badge<br/>Scout icon on profile<br/>"Early Scout" label on feed<br/>Announce banner when ranked up | **Active hunter.** Crossed the first milestone (~5–10 hours of engagement). Unlocks micro-transaction sinks (Scout Reveal, Haul Unboxing, Bump) that create frequent micro-decisions. Slight hold upgrade (45 min) signals progression. Early Announce access (1h) gives Scout a small discovery advantage without being game-breaking. |
| **Ranger** | 2,000–4,999 | ⬆️ Everything from Scout, plus:<br/>• Save up to 10 items (Wishlist)<br/>• Early Legendary access: 2h before organizers (Hunt Pass: 6h)<br/>• Save 3 Treasure Trails (up from 1)<br/>• Hunt Pass value engine unlocks ("This Hunt Pass saves you ~$X/month")<br/>• Collector tier badges available<br/>• Reduced friction: skip 1 confirmation dialog per sale (Hold → auto-confirm)<br/>• 60 min hold duration<br/>• 2 concurrent holds<br/>• En route grace: 2 holds | Emerald rank badge<br/>Ranger icon + ribbon on profile<br/>"Legendary Early Access" label on Legendary items<br/>Collector badge showcase on passport | **Power hunter.** Demonstrated pattern of return visits and intentional shopping. Unlocks serious discovery advantage (Legendary 2h early) that directly impacts item-hunting success. Collector tier system becomes visible (e.g., "🔥 Pyrex Specialist"). Friction reduction (1 skip confirmation) rewards experienced players. Multiple Treasure Trail saves enable trip planning. |
| **Sage** | 5,000–11,999 | ⬆️ Everything from Ranger, plus:<br/>• Save up to 15 items (Wishlist)<br/>• Legendary Bundle early access: 4h before organizers (Hunt Pass: 6h)<br/>• Create unlimited Treasure Trails (vs. Ranger 3)<br/>• Leaderboard visibility: see rank/XP of all visible users<br/>• Hunt Pass subscriber exclusive features visible<br/>• Reduced friction: skip 2 confirmation dialogs (Hold + Wishlist shelf)<br/>• Profile customization: unlock 1 custom color for username (1,000 XP sink) OR frame badge (2,500 XP sink)<br/>• Hall of Fame eligibility: if top 100 seasonal, inducted with name on Sage/Grandmaster page<br/>• 75 min hold duration<br/>• 3 concurrent holds<br/>• En route grace: 3 holds | Diamond rank badge<br/>Sage title on profile header<br/>✨ Sage icon on leaderboard<br/>Custom frame/color eligibility badge<br/>Hall of Fame badge (if earned) | **Community pillar.** Reached the trust/engagement floor for community features. Leaderboard now feels consequential (can see peers, not just top 1%). Sage represents 5–15% of active base — rare enough to feel special, common enough to be aspirational. Legendary 4h early access is meaningful (matches non-Hunt-Pass users at parity). Profile customization sinks (1k/2.5k XP) now feel achievable — Sage has earned prestige cosmetics. Hall of Fame creates narrative incentive (your name lives forever). |
| **Grandmaster** | 12,000+ | ⬆️ Everything from Sage, plus:<br/>• Save unlimited items (Wishlist)<br/>• Legendary early access: 6h before organizers (matches Hunt Pass)<br/>• Legendary Bundle access: immediate (no delay)<br/>• Exclusive Grandmaster leaderboard (top 100 seasonal)<br/>• Reduced friction: auto-confirm all holds (no dialog)<br/>• Profile customization: unlock ALL colors (unlimited) + ALL frame badges + profile slot upgrades (250/350/500 XP sinks) at no additional cost<br/>• Permanent Hall of Fame: guaranteed profile feature on `/guild/hall-of-fame`<br/>• Seasonal trophy: Grandmaster seal on profile (resets yearly on Jan 1)<br/>• 90 min hold duration<br/>• 3 concurrent holds (same as Sage)<br/>• En route grace: 3 holds<br/>• Community trust badge: "Trusted Hunter" on all interactions | Platinum rank badge with ⭐<br/>Grandmaster title + seal on profile header<br/>👑 icon on leaderboard<br/>Permanent Hall of Fame badge<br/>Golden glow on avatar | **Hall of fame.** Ultra-rare (1–2% of base, estimated 10–40 users by year-end). Grandmaster is aspirational capstone that takes 3–6 months of consistent weekly engagement to reach. Represents top 0.1% of hunters globally. All customizations unlocked — cosmetic sink pricing (D-XP-005) no longer applies. Legendary 6h parity with Hunt Pass ($4.99/mo) is the symbolic peak. Auto-confirm holds removes last friction (player has earned trust). Permanent Hall of Fame entry (not seasonal) creates lasting recognition. |

---

## Rank-Up Moments & Animation Strategy

### Celebratory Arc

When a shopper ranks up, trigger this sequence:

1. **In-app Modal (2–3 seconds)** — Full-screen celebration
   - Animated rank icon + confetti (CSS animation)
   - Title card: "🎉 You're now a **[Rank Name]**!"
   - Headline perk: "New Unlock: [Top 3 perks from new rank]"
   - Two buttons:
     - "See all unlocks" → scrolls to RankBenefitsCard
     - "Keep hunting" → dismisses

2. **Toast Notification (follows modal)** — Stickable summary
   - "**Scout unlocked!** 🐦 Early Announce access, Haul Unboxing, Scout Reveal"
   - Icon + color match rank badge
   - Link to `/shopper/rank-profile` for details

3. **Profile Badge Update** — Visual persistence
   - Avatar now shows rank icon in corner (small badge)
   - Rank title appears on profile header
   - Changes persist until next rank-up (or Jan 1 seasonal reset)

4. **Shareable Moment (optional button)**
   - "Share your rank-up" → pre-filled social post template
   - "Just hit Scout on FindA.Sale! 🐦 #TreasureHunt #ExplorerGuild"
   - Drives organic awareness (feeds D-413: brand spreading ungated)

### Rationale

**Modal + toast combo** prevents celebratory fatigue while ensuring visibility:
- Modal captures attention at the moment of achievement (dopamine peak)
- Toast + persistent badge maintain the win beyond the initial unlock (social proof)
- Shareable moment enables organic word-of-mouth (no friction on sharing)

---

## Perk Retroactivity (Stacking Rule)

**Rule: All perks are retroactively unlocked and cumulative.**

A shopper who reaches Sage (5,000 XP) immediately gains access to:
- All Initiate perks (30 min holds, 1 concurrent, en route grace 1)
- All Scout perks (45 min, early announce, micro-sinks)
- All Ranger perks (60 min, 2 concurrent, Legendary 2h early)
- **Plus** new Sage perks (Legendary 4h, unlimited trails, leaderboard visibility)

**Cosmetic sinks are separate.** Sage can **unlock** the ability to buy a username color (1,000 XP sink), but doesn't automatically get it. They must spend the XP to activate. This preserves agency — players feel like they choose when to "cash in" cosmetics.

**Seasonal cosmetics reset yearly.** Seasonal trophy, seasonal leaderboard badges, and seasonal Hall of Fame induction all reset on Jan 1. Permanent Hall of Fame entry (Grandmaster only) survives resets.

---

## Perks NOT Included (Explicit Rejections)

### 1. **Fee Discounts (Shopping Fee, Platform Fee)**
**Why excluded:** Platform fee (10% organizer) is locked at S268 as non-negotiable. Shopper-side fee discounts would create legal/accounting mess (different fee for same item based on buyer rank). Hunt Pass offers this (1.5x XP, $4.99/mo); rank doesn't.

### 2. **Tier Gating (PRO/TEAMS-only features)**
**Why excluded:** Rank is orthogonal to subscription tier. A Grandmaster on SIMPLE tier and a Grandmaster on PRO tier should have the same rank perks. Tier gates live in `/api/...` middleware, not rank logic.

### 3. **Direct Payout Rewards (XP → Cash, Coupons as cash)**
**Why excluded:** Creates incentive misalignment — players grind rank to cash out, not to engage with the platform. Micro-sinks (Scout Reveal, Bump Post) are valuable because they unlock *discovery*, not cash.

### 4. **Rank-Gated Content Removal (e.g., "Initiate can't view Sages' hauls")**
**Why excluded:** Brand-spreading features must stay ungated (D-413). If Sage haul posts are hidden from Initiates, discovery drops, word-of-mouth dies.

### 5. **Rank-Based Messaging Restrictions (e.g., "DM only if both are Scout+")**
**Why excluded:** Introduces social friction. Guild is meant to encourage community, not gatekeep it.

### 6. **Payment Method Restrictions (e.g., "Grandmaster can pay via crypto")**
**Why excluded:** Payment gating is a PCI/legal/compliance issue, not a game design one. Stays in organizer settings only.

---

## Implementation Notes for Dev

### Schema Changes
- **User.guildXp** — already exists, populated by xpService
- **User.currentRank** — derived from guildXp via `getRankFromXp()` (not stored)
- **User.rankUpHistory** — NEW: array of `{ rank, timestamp, xpAtTime }` for Hall of Fame + seasonal reset tracking
- **UserProfile.customUsernameColor** — already discussed in D-XP-005; tied to cosmetic sink at 1,000 XP
- **UserProfile.customFrameBadge** — already discussed; tied to cosmetic sink at 2,500 XP
- **UserProfile.profileSlotCount** — gated by cosmetic sinks (Bronze 250 XP = +1 slot, Silver 350 = +1, Gold 500 = +1)

### API Routes (xpController additions)

```
GET /api/user/:id/rank-info
  Returns: { currentRank, guildXp, nextRankXp, perksUnlocked: [], earnHistory: [] }

GET /api/ranks/perks/:rank
  Returns: perks array for specified rank (used in RankBenefitsCard)

GET /api/leaderboard/seasonal
  Returns: top 100 users with rank badges (Sage+ visibility only)

GET /api/guild/hall-of-fame
  Returns: all Grandmasters + top 100 seasonal finalists (across all time, with seasons)
```

### Frontend Components (new + modified)

**New:**
- `RankBadge.tsx` — displays rank icon + color + name
- `RankProgressBar.tsx` — progress toward next rank
- `RankBenefitsCard.tsx` — list of unlocked perks + next rank preview
- `RankUpModal.tsx` — celebration modal on rank-up
- `HallOfFamePage.tsx` — `/guild/hall-of-fame` (Grandmaster + seasonal inductees)
- `SeasonalLeaderboardPage.tsx` — enhanced `/shopper/leaderboard` with rank badges visible

**Modified:**
- `UserNav.tsx` — add RankBadge to top-right (next to avatar)
- `ShopperDashboard.tsx` — add RankProgressBar below existing stats
- `UserProfile.tsx` — show rank title + Hall of Fame badge (if applicable) in header
- `HoldButton.tsx` — duration/concurrency logic tied to `getRankBenefits(rank).holdDuration` + `.maxConcurrentHolds`
- `WishlistPage.tsx` — slot cap based on rank

### Micro-Sink Components (already designed in S268, wire here)

- `ScoutRevealButton.tsx` — 5 XP, reveals one hidden metadata field on item
- `HaulUnboxingAnimationToggle.tsx` — 2 XP, enables animation on item scan
- `BumpPostButton.tsx` — 10 XP, re-surfaces saved item to feed

All three unlock at Scout, always available thereafter.

### Confirmation Dialog Skipping Logic

**Ranger:** Skip 1 per sale
- `HoldButton` on first click → auto-confirm (no "Confirm hold?" dialog)
- Subsequent holds in same sale → normal dialog

**Sage:** Skip 2 per sale
- Same as Ranger, plus `WishlistShelf` "Add to wishlist?" dialog auto-skips once
- Count resets per sale

**Grandmaster:** Auto-confirm all holds
- `HoldButton` never shows confirmation dialog
- Still shows success toast (prevents silent failures)

---

## Retention & Engagement Levers

### Initiate → Scout (0–500 XP, ~5–10 hours)
**Threshold:** Achievable in one weekend of active shopping. Celebrates first visit consistency.

### Scout → Ranger (500–2,000 XP, ~20–40 hours)
**Threshold:** Requires 2–4 weeks of regular weekend visits. Unlock "real" discovery advantage (Legendary 2h early). Retention moment — patterns are forming.

### Ranger → Sage (2,000–5,000 XP, ~50–100 hours)
**Threshold:** 2–3 months of consistent engagement. Leaderboard visibility + cosmetic sinks create social hook. Hall of Fame eligibility announced (even if not achieved this season).

### Sage → Grandmaster (5,000–12,000 XP, ~100–200 hours)
**Threshold:** 3–6 months of weekly engagement. Ultra-aspirational. Only 1–2% reach it. Permanent recognition (Hall of Fame). Matches Hunt Pass subscribers in Legendary early access.

---

## XP Earn Context (Reference — Not Scope of This Spec)

Current locked XP earn rates per S268/S332:
- Item scan: 1 XP
- Sale visit (QR check-in): 5 XP
- Wishlist save: 2 XP
- Hold placed: 3 XP (micro-motivation)
- Haul post published: 10 XP
- Hunt Pass multiplier: 1.5x (applies to all earn)

**Seasonal reset:** Jan 1, guildXp persists (rank persists) but leaderboard rank resets.

---

## Cosmetic Sink Pricing (Reminder — D-XP-005 Locked)

| Cosmetic | XP Cost | Rank Unlock | Duration |
|----------|---------|-------------|----------|
| Username Color | 1,000 XP | Ranger+ | Permanent until re-purchase |
| Frame Badge | 2,500 XP | Sage+ | Permanent (cosmetic badges do not expire) |
| Profile Slot Bronze (+1) | 250 XP | Sage+ | Permanent |
| Profile Slot Silver (+1) | 350 XP | Sage+ | Permanent |
| Profile Slot Gold (+1) | 500 XP | Grandmaster | Permanent |
| Haul Post Feature (7d) | 100 XP | Scout+ | 7 days |
| Treasure Trail Sponsor (7d) | 100 XP | Ranger+ | 7 days (14d for Hunt Pass) |

Grandmaster unlocks all cosmetics at no additional cost (cosmetic sink pricing no longer applies once Grandmaster).

---

## Testing Checklist (for QA)

### Rank Progression
- [ ] User at 499 XP earns 1 XP → rank-up modal triggers, avatar updates, toast shows
- [ ] User at 1,999 XP → Scout rank-up works (all perks stack)
- [ ] User at 5,000 XP → Sage rank-up works (leaderboard visibility + Hall of Fame eligibility)
- [ ] User at 12,000+ XP → Grandmaster rank-up works (permanent Hall of Fame badge added)

### Perk Stacking
- [ ] Ranger user can save 10 items (not 3), place 2 concurrent holds, view Legendary 2h early
- [ ] Sage user has all Ranger perks + can skip 2 confirmation dialogs + see leaderboard ranks
- [ ] Grandmaster user has all Sage perks + auto-confirm holds + unlimited cosmetic access

### Cosmetics
- [ ] Ranger can see "Unlock username color (1,000 XP)" button in profile settings
- [ ] Sage can see AND click to unlock colors/frames
- [ ] Grandmaster can unlock all cosmetics without XP cost

### Hall of Fame
- [ ] Top 100 Sage/Grandmaster users appear on `/guild/hall-of-fame` during season
- [ ] Grandmaster gets permanent Hall of Fame badge (survives seasonal reset)
- [ ] Jan 1 seasonal reset clears old leaderboard, maintains Grandmaster permanent entry

### Mobile & Dark Mode
- [ ] RankBadge renders correctly in avatar corner on mobile
- [ ] RankProgressBar doesn't overflow on small screens
- [ ] All rank colors (blue, gold, emerald, diamond, platinum) pass WCAG contrast in light + dark

---

## Success Metrics (Post-Deploy)

- **Conversion to Scout:** % of Initiates who hit 500 XP within 30 days (target: 40%+)
- **Conversion to Ranger:** % of Scouts who hit 2,000 XP within 60 days (target: 25%+)
- **Seasonal Grandmaster:** Count of Grandmaster rank-ups (target: 10–40 by year-end, ~1–2% of active)
- **Cosmetic Sink Adoption:** % of Sage+ who unlock at least 1 cosmetic (target: 30%+)
- **Hall of Fame Engagement:** Monthly unique visitors to `/guild/hall-of-fame` (target: 5–10% of active)

---

## Handoff Notes

1. **Locked dependencies:** Hold duration/concurrency (S332), cosmetic sinks (D-XP-005), rank structure (S268)
2. **Design continuity:** Brand voice is aspirational + inclusive (elite without gatekeeping)
3. **Accessibility:** RankBadge colors must pass WCAG AA on both light + dark backgrounds
4. **Mobile-first:** All rank UI must be testable on iPhone SE (375px width)
5. **No PII in Hall of Fame:** Profile slug + username only (no email, phone, payment info)

