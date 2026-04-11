# Patrick's Dashboard — April 11, 2026 (S440)

## S440 Summary

3-round session from Patrick's live site review. Round 1: 7 parallel agents fixed 10 issues. Round 2: nav reorder + holds icon + Inspiration removed. Round 3: leaderboard consolidated, messages dual-role fix, missing Connect links added.

All 3 rounds pushed. Migrations applied. 8 bugs queued for S441.

---

## What S440 Shipped

### Round 1 — 10-Issue Fix Batch (7 parallel agents)
- Nav: grey icons (Command Center, Calendar, Staff), Explorer Passport rename, Hunt Exclusives group, league moved
- Bounties: XP input (50 min), reference URL, expandable cards, BountySubmission model
- Subscription: dark mode fix, upgrade pitches (FREE→PRO/ALC, PRO→TEAMS)
- Achievements: dark mode styling + unlockedAt nullable fix
- Reputation: API path fix (`/users/me/purchases` → `/users/purchases`)
- Dashboard: dates on primary sales cards
- Receipt: review CTA + organizer data in response

### Round 2 — Nav Reorder + Holds Icon
- Nav order: Connect > Hunt Pass > Hunt Exclusives (all 3 locations + avatar)
- Inspiration removed from desktop header
- CartIcon: shopping bag → Clock icon
- Mobile header: holds icon with live badge next to alerts
- Command Center icon grey in mobile

### Round 3 — Leaderboard + Messages + Connect Links
- Leaderboard: `/shopper/leaderboard` → redirect to `/leaderboard`, backend uses `guildXp`
- Messages: dual-role fix — organizer AND shopper conversations with roleContext badges, `/organizer/messages` → redirect to `/messages`
- Connect nav: added Appraisals, Leaderboard, Achievements to both mobile sections

---

## S441 Priority Queue (8 items)

1. **Remove Messages from avatar dropdown** — standalone Messages link still showing in dropdown nav
2. **Bounties: Submit a Match** — button just closes card, needs actual POST to BountySubmission endpoint
3. **Bounties: XP explainer copy** — add text near XP input (minimum, organizer split, non-refundable)
4. **Achievements: stale copy** — references legacy "streak achievements", needs content audit
5. **Reputation: scores all 0** — API path fixed but scoring formula returns 0
6. **Dashboard: live view link** — dates added, need link to public sale view (not just edit)
7. **Receipt: review CTA** — verify renders with test data in Chrome
8. **Bounties: dollars vs XP** — open decision, Stripe/legal research needed

---

## Migrations (S440 — already applied)

3 migrations applied: `add_reference_url_bounty`, `bounty_submissions`, `make_unlockedAt_nullable`

---

## S440 Push Block (all 3 rounds already pushed)

No action needed — all code pushed during session.
