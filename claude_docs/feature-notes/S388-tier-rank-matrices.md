# S388 — Organizer Tier × Feature Matrix & Shopper Rank × Feature Matrix

**Generated from:** codebase inspection + tierLimits.ts + route requireTier gates + TierComparisonTable.tsx + xpService.ts + decisions-log.md
**Date:** 2026-04-03
**Scope:** Actual gating as implemented (not roadmap items)

---

## Deliverable 1: Organizer Feature × Subscription Tier Matrix

| Feature | SIMPLE (Free) | PRO ($29/mo) | TEAMS ($79/mo) | Implementation | Notes |
|---------|---------------|--------------|----------------|---|---|
| **Inventory & Sales** | | | | | |
| Create unlimited sales | ✅ | ✅ | ✅ | All tiers | No limit |
| Items per sale | 200 | 500 | 2,000 | tierLimits.ts | SIMPLE capped at 200, TEAMS at 2,000 |
| Photos per item | 5 | 10 | Unlimited | tierLimits.ts | TEAMS has no limit (Infinity) |
| AI tags per month | 100 | 2,000 | Unlimited | tierLimits.ts | Monthly cap enforced per tier |
| **Team & Access** | | | | | |
| Multi-user workspace | ❌ | ❌ | ✅ | requireTier(TEAMS) | workspace.ts routes |
| Invite team members | ❌ | ❌ | ✅ | requireTier(TEAMS) | workspace.ts routes |
| Role-based permissions | ❌ | ❌ | ✅ | Workspace feature | TEAMS only |
| Shared inventory & sales | ❌ | ❌ | ✅ | Workspace feature | TEAMS only |
| Team activity audit logs | ❌ | ❌ | ✅ | Workspace feature | TEAMS only |
| **Business Tools** | | | | | |
| Brand Kit customization | ❌ | ✅ | ✅ | TierComparisonTable.tsx | Logo, colors, fonts, social links, slug, banner |
| POS integration | ✅ | ✅ | ✅ | All tiers | Basic POS; value tiers gated |
| Hold & Reservations | ✅ | ✅ | ✅ | All tiers | Core feature, no tier gate |
| Email & SMS reminders | ✅ | ✅ | ✅ | All tiers | Core feature |
| Custom storefront slug | ❌ | ✅ | ✅ | TierComparisonTable.tsx | Custom domain slug |
| **Analytics & Insights** | | | | | |
| Basic sales analytics | ✅ | ✅ | ✅ | All tiers | Dashboard overview |
| Advanced analytics & insights | ❌ | ✅ | ✅ | requireTier(PRO) via insights.ts | Detailed metrics |
| Flip Report (post-sale PDF) | ❌ | ✅ | ✅ | requireTier(PRO) via flipReport.ts | Post-sale summary |
| **Operations & Scale** | | | | | |
| Command Center (multi-sale) | ❌ | ✅ | ✅ | requireTier(PRO) via commandCenter.ts | Cross-sale operations hub |
| Batch item operations | ❌ | ✅ | ✅ | tierLimits.ts batchOpsAllowed | Edit/delete items in bulk |
| Photo studio stations | ❌ | ✅ | ✅ | requireTier(PRO) via photoOps.ts | Multi-user photo workflows |
| **Data & Integration** | | | | | |
| Data export (CSV/JSON/Text) | ❌ | ✅ | ✅ | requireTier(PRO) via export.ts | EstatesalesCSV, FacebookJSON, CraigslistText |
| Typology (item classifier) | ❌ | ✅ | ✅ | requireTier(PRO) via typology.ts | AI-powered item type inference |
| Item valuation tools | ❌ | ✅ | ✅ | requireTier(PRO) via valuation.ts | Market value estimation |
| API access & webhooks | ❌ | ❌ | ✅ | requireTier(TEAMS) via webhooks.ts | Full API + webhook events |
| Markdown auto-application | ❌ | ✅ | ✅ | requireTier(PRO) via sales.ts | Feature #91: auto-markdown config |
| Link click stats | ❌ | ✅ | ✅ | requireTier(PRO) via linkClicks.ts | Sale link analytics |
| **Seller Verification** | | | | | |
| Seller verification badge | ❌ | ✅ | ✅ | requireTier(PRO) via verification.ts | Pro/TEAMS only |
| **Social & Viral** | | | | | |
| Social media templates | All tiers | All tiers | All tiers | No tier gate | routes/social.ts, socialPost.ts |
| Social post generator | All tiers | All tiers | All tiers | No tier gate | authenticate only, no requireTier |
| Sale QR code | All tiers | All tiers | All tiers | No tier gate | routes/items.ts, routes/sales.ts |
| **Support** | | | | | |
| Basic support (email) | ✅ | ✅ | ✅ | All tiers | Standard support |
| Priority support (24h) | ❌ | ✅ | ✅ | TierComparisonTable.tsx | Faster response times |
| Dedicated account manager | ❌ | ❌ | ✅ | TierComparisonTable.tsx | TEAMS only |
| White-label customization | ❌ | ❌ | ✅ | TierComparisonTable.tsx | TEAMS only |

### Key Findings — Organizer Tier Matrix

1. **Social/Viral features are ungated:** All three features (social templates, post generator, QR codes) are available to all tiers with `authenticate` only—no `requireTier` gate. This matches Patrick's S388 decision: social features must stay available to all tiers.

2. **SIMPLE cap discrepancy:** TierComparisonTable.tsx shows "100 items per sale" for SIMPLE, but tierLimits.ts defines 200. The frontend claim is outdated; the code enforces 200.

3. **Photos per item:** SIMPLE shows "3" in TierComparisonTable.tsx but tierLimits.ts says 5. Discrepancy: frontend is wrong.

4. **Tier progression:** SIMPLE → PRO is the high-value jump (100+ features gated). PRO → TEAMS is mostly team/API features; single-organizer users see less differentiation.

5. **Multi-user gate is absolute:** Workspace routes explicitly check `requireTier(TEAMS)` — no workarounds. This is the primary TEAMS differentiator.

6. **API access tier:** Webhooks and API keys require TEAMS (`requireTier(TEAMS)`), not PRO. All data export requires PRO.

---

## Deliverable 2: Shopper Feature × Explorer Rank Matrix

| Feature | Initiate (0) | Scout (500) | Ranger (2,000) | Sage (5,000) | Grandmaster (12,000) | Hunt Pass ($4.99/mo) | Implementation | Notes |
|---------|---|---|---|---|---|---|---|---|
| **Core Actions** | | | | | | | | |
| Visit sales (earn XP) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | xpService.ts: VISIT=5 XP | All ranks can visit |
| Favorite items | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | All ranks | Core feature |
| RSVP to sales | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | routes/streaks.ts | All ranks |
| Condition ratings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | All ranks | No rank gate found |
| **Progression & Identity** | | | | | | | | |
| Explorer rank display | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | RankBadge component | All visible |
| Collector Passport | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | CollectorPassport model | Bio, categories, specialties, keywords |
| Achievement badges | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | AchievementBadgesSection | Earn by activities |
| **Treasure Hunt** | | | | | | | | |
| Treasure hunt QR scanning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | xpService: ITEM_SCANNED=25 XP | Daily cap: 100 XP |
| Treasure Hunt finds | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | TreasureHuntFind model | All ranks participate |
| **Auctions** | | | | | | | | |
| Auction bidding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | All ranks | Earn XP on win |
| Auction XP bonus | None | None | None | None | None | +0.5 XP per $100 value, max +5 | xpService.ts | All ranks, value-based |
| **Hold-to-Pay / Checkout** | | | | | | | | |
| Basic holds (payment) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Hold model | No rank gate |
| Hold duration | 30 min | 30 min | 30 min | 30 min | 30 min | 30 min | decisions-log S341 | Rank does NOT affect hold duration post-decision |
| Payment retry window | Match hold | Match hold | Match hold | Match hold | Match hold | Match hold | decisions-log S341 | Invoice expires when hold expires |
| **Hunt Pass Exclusive** | | | | | | | | |
| 2x XP multiplier | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Hunt Pass benefits | All actions earn 2x |
| Early access to flash deals | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | hunt-pass.tsx | First notification of deals |
| Exclusive Hunt Pass badge | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | hunt-pass.tsx | Shopper badge display |
| Loot Legend portfolio | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | decisions-log S268 | Hunt Pass exclusive feature |
| Collector's League leaderboard | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | decisions-log S268 | Hunt Pass exclusive leaderboard |
| **Rank Exclusive Features (Future)** | | | | | | | | |
| Legendary-first access (6h) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ (Hunt Pass only) | decisions-log S268 | Planned: Sage/Grandmaster + Hunt Pass |
| Priority RSVP | ❌ | ❌ | ❌ | 🚧 planned | 🚧 planned | 🚧 planned | No implementation found | Feature #45 intent, not coded |
| Referral bonuses | 🚧 planned | 🚧 planned | 🚧 planned | 🚧 planned | 🚧 planned | 🚧 planned | Referral model exists, XP awards defined but not deployed | REFERRAL_SIGNUP=20 XP, REFERRAL_FIRST_PURCHASE=30 |
| **Customization & Control** | | | | | | | | |
| Notification preferences (email) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | CollectorPassport.notifyEmail | All ranks |
| Notification preferences (push) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | CollectorPassport.notifyPush | All ranks |

### Key Findings — Shopper Rank Matrix

1. **Rank thresholds confirmed:** RANK_THRESHOLDS in xpService.ts match S388 decisions: Initiate 0, Scout 500, Ranger 2,000, Sage 5,000, Grandmaster 12,000.

2. **Hold duration is NOT rank-gated:** The architect's game design document proposed rank-based hold windows (Initiate 2h → Grandmaster 8h), but decisions-log S341 explicitly superseded this. Hold duration is now uniform across ranks (30 min based on code inspection). Rank does not confer checkout advantages.

3. **Hunt Pass is the primary differentiator:** The only shopper feature gated behind a subscription is Hunt Pass ($4.99/mo), which grants 2x XP multiplier + early flash deal access + exclusive leaderboard (Collector's League) + Loot Legend portfolio.

4. **Rank ≠ gameplay advantage (yet):** Rank gates planned features (Legendary-first access, priority RSVP, referral bonuses) but none are live in the current codebase. Rank today is purely cosmetic/progression.

5. **Legendary-first access is Hunt Pass only:** Decision S268 mentions "6h Legendary-first access" but ties it to "Sage/Grandmaster + Hunt Pass"—meaning you need BOTH the rank AND the subscription. Implementation not found in routes, so 🚧 planned.

6. **Referral system exists but not deployed:** ReferralReward model and XP_AWARDS defined (REFERRAL_SIGNUP=20, REFERRAL_FIRST_PURCHASE=30) but no routes wire them up. 🚧 planned feature.

7. **Condition ratings & QR scans are all-ranks:** No rank gates; all shoppers can rate conditions and scan treasure hunt QR codes from day one.

8. **Collector Passport is all-ranks:** Aka "Explorer Passport" in code (routes.ts confusingly names it "collector-passport" but page shows "explorer-passport"). All ranks can build a passport. Passport triggers item matching for notifications.

---

## Reconciliation Notes

### Organizer Tier Issues
- **Frontend/backend mismatch on photo count:** TierComparisonTable.tsx claims SIMPLE=3 photos, but code enforces 5.
- **Frontend/backend mismatch on items count:** TierComparisonTable.tsx claims SIMPLE=100 items, but code enforces 200.
- **Recommendation:** Update TierComparisonTable.tsx lines 30–39 to reflect true limits (200 items SIMPLE, 5 photos SIMPLE).

### Shopper Rank Issues
- **No rank-based hold windows in code:** Architect proposed rank-gated checkouts; S341 decision removed this. Hold duration is uniform.
- **Legendary-first access not wired:** Decision S268 describes it, but no route implements rank-gated deal access.
- **Referral system incomplete:** Schema + XP values exist; no endpoints to trigger them.
- **Priority RSVP incomplete:** No evidence of rank-gated RSVP priority in routes or models.

### Social/Viral (Organizer)
- **Correctly ungated:** SocialPostGenerator, SaleQRCode, social routes confirmed available to all tiers. This aligns with Patrick's S388 mandate.

---

## Matrix Maintenance Rules

Update this file when:
1. New `requireTier()` gates are added to routes (organizer tier matrix)
2. Rank thresholds or XP awards change in xpService.ts (shopper rank matrix)
3. Features are moved between tiers or rank gates are implemented (both)
4. TierComparisonTable.tsx is edited (reconcile organizer matrix)
5. New Hunt Pass exclusives are added (Hunt Pass column)

---

## File Versions Reference

- `packages/backend/src/constants/tierLimits.ts` — line 10–38 (TIER_LIMITS constant)
- `packages/backend/src/middleware/requireTier.ts` — line 21–44 (requireTier middleware)
- `packages/backend/src/services/xpService.ts` — line 11–17, 28–49 (RANK_THRESHOLDS, XP_AWARDS)
- `packages/frontend/components/TierComparisonTable.tsx` — line 15–172 (FEATURES array)
- `claude_docs/decisions-log.md` — S341, S268 (hold windows, gamification systems, Hunt Pass)
