# Brand Voice Audit — 2026-05-07

**Audit Scope:** Full frontend codebase (packages/frontend/) + backend email templates (packages/backend/services/)

**Authority Reference:** `claude_docs/brand/brand-voice-system.md` v2.0

---

## Summary

FindA.Sale's user-facing copy is **strong overall** on brand voice compliance. The codebase successfully avoids "AI" language (uses "Smart," "Auto," "auto-suggested" instead), maintains sale-type inclusivity, and eschews hype language. Three minor violations found and fixed during audit:

1. **Email template tagline:** "Estate Sales, Simplified" (sole sale type) → "Find All The Sales" (inclusive, north star aligned)
2. **Homepage subheader:** "Discover the best items" (vague hype) → "Find upcoming treasures" (specific, action-driven)
3. **Guild Primer copy:** "see the best sales" (vague ranking) → "see new sales" (practical, specific)

All three violations corrected. No remaining critical issues.

---

## Critical Violations (Fixed)

### 1. Email Template Tagline — Sole Sale Type Reference
**File:** `packages/backend/src/services/emailTemplateService.ts` — **Line 81**  
**Violation:** "Estate Sales, Simplified" (D-001 violation: uses single sale type)  
**Violation Type:** Sale-type inclusivity (Pillar 3)  
**Fix Applied:** Changed to "Find All The Sales" (matches north star, inclusive, practical)  
**Status:** ✅ Fixed

### 2. Inspiration Gallery Subheader — Vague Superlative  
**File:** `packages/frontend/pages/inspiration.tsx` — **Line 82**  
**Violation:** "Discover the best items from upcoming sales in your area" ("best" is vague hype)  
**Violation Type:** Practical language (Pillar 4)  
**Fix Applied:** Changed to "Find upcoming treasures from sales happening near you" (specific benefit, action-oriented)  
**Status:** ✅ Fixed

### 3. Guild Primer Presales Copy — Vague Superlative  
**File:** `packages/frontend/pages/shopper/guild-primer.tsx` — **Line 883**  
**Violation:** "Sage shoppers see the best sales 24 hours early" ("best" is vague ranking)  
**Violation Type:** Practical language (Pillar 4)  
**Fix Applied:** Changed to "Sage shoppers see new sales 24 hours early" (specific benefit: early access, no subjective ranking)  
**Status:** ✅ Fixed

---

## Moderate Issues (None Found)

No moderate violations identified. All remaining "AI" language is in comments/internal variable names, not user-facing copy.

---

## Copy Quality Observations

### Areas Passing Brand Voice Check

1. **AI terminology correctly replaced throughout UI:**
   - "Smart Estimate" (line 192, PriceResearchPanel.tsx) ✅
   - "Smart Price Suggestion" (line 105, PriceSuggestion.tsx) ✅
   - "Auto" badge label (line 344, ItemCard.tsx) for auto-suggested tags ✅
   - "auto-suggested" in disclosure text (line 683, items/[id].tsx) ✅
   - "We identified" / "We think this might be" in PreviewModal (lines 235, 249) ✅

2. **Sale-type inclusivity strong across all pages:**
   - Homepage meta: "yard sales, garage sales, estate sales, flea markets, auctions" ✅
   - Category pages: "estate sales, auctions, yard sales, and consignment" ✅
   - City pages: "estate sales, yard sales, auctions, and garage sales" ✅
   - About page lists: "yard sales, garage sales, estate sales, flea markets" ✅

3. **Email content is honest and practical:**
   - Hold alerts: Clear, specific benefit statements ✅
   - Weekly picks: Concrete numbers ("$X to $Y" price ranges), personalized intro ✅
   - No "exclusive," "limited time," or false urgency language ✅

4. **Empty states are helpful, not dismissive:**
   - "All caught up. The organizers you follow haven't published any sales yet." ✅
   - "Try a different keyword, or browse all nearby sales." ✅
   - "Follow your favorite organizers to see their new sales here first." ✅

5. **No founder voice detected:**
   - All emails signed "The FindA.Sale Team" ✅
   - No personal names or "I" statements in user copy ✅

6. **Tone by context correct:**
   - UI microcopy: concise, action-oriented ("Suggest Price," "Use This Price," "Use $XX") ✅
   - Email subject lines: outcome-focused ("Hold confirmed," "Item sold for $XX") ✅
   - Help text: acknowledges problem first, then solution ✅

---

## Clean Areas

- **No jargon:** "leverage," "optimize," "synergy," "cutting-edge," "disruptive" not found in user copy
- **No hype language:** "game-changer," "revolutionary," "industry-leading" not found
- **No false scarcity:** No "exclusive," "unlock," "limited time" in product copy (only in context-appropriate places like gamification)
- **No technical jargon exposed to users:** Error messages are user-friendly ("We identified," "We're not 100% sure")

---

## Files Changed

1. `packages/backend/src/services/emailTemplateService.ts` — 1 line changed
2. `packages/frontend/pages/inspiration.tsx` — 1 line changed
3. `packages/frontend/pages/shopper/guild-primer.tsx` — 1 line changed

**Total violations fixed: 3**  
**Total files modified: 3**

---

## Testing Notes

All changes are copy-only (no logic, no structure). No TypeScript errors introduced.

Recommendation: Merge fixes into main. Ready for pre-launch review.

---

**Audit Completed By:** Marketing Agent (Brand Voice Audit #392)  
**Date:** 2026-05-07  
**Next Review:** Post-launch feedback cycle or when new product features introduce copy
