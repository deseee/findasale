# Brand Copy & Tone Audit — 2026-06-23

**Auditor:** Scheduled Task (weekly-brand-drift-detector)  
**Scope:** All customer-facing copy — UI, email, blog, social post templates, challenge descriptions  
**Rules enforced:** D-001 (all sale types), D-006 (no "AI"), no founder voice, brand tone checklist  
**Method:** grep + direct file reads across packages/frontend and packages/backend/src

---

## Summary

| Rule | Violations Found | Status |
|------|-----------------|--------|
| D-001 — All sale types inclusive | **8** | ⚠️ DRIFT |
| D-006 — No "AI" in product copy | **1 confirmed + 1 borderline** | ⚠️ DRIFT |
| No founder voice / "Patrick" | 0 | ✅ Clean |
| Tone (warm, inclusive, jargon-free) | 0 | ✅ Clean |
| Homepage / about / pricing / footer | 0 | ✅ Clean |
| Onboarding / nav / UI feature labels | 0 | ✅ Clean |

---

## D-001 Violations — Sale-Type Exclusivity

Eight instances where copy treats estate sales as the only or default sale type.

### Drift Table

| File | Line | Offending Copy | Rule | Suggested Rewrite |
|------|------|----------------|------|-------------------|
| `packages/backend/src/controllers/notificationController.ts` | 248 | `"Your Weekend Estate Sale Digest"` (email header) | D-001 | `"Your Weekend Sale Digest"` |
| `packages/backend/src/controllers/notificationController.ts` | 253 | `"Here are the estate sales happening this weekend near you. Don't miss out!"` | D-001 | `"Here are the sales happening this weekend near you — estate sales, yard sales, auctions, flea markets, and more. Don't miss out!"` |
| `packages/backend/src/controllers/notificationController.ts` | 355 | `"🏷️ X estate sale(s) this weekend near you"` (email subject line) | D-001 | `"🏷️ X sale(s) near you this weekend"` |
| `packages/backend/src/controllers/socialController.ts` | 62 | `"...at our upcoming estate sale — ${saleDates}..."` (casual tone template) | D-001 | Use `"...at our upcoming sale..."` or pull actual sale type from data |
| `packages/backend/src/controllers/socialController.ts` | 64 | `"...at our upcoming estate sale ${saleDates}..."` (professional tone template) | D-001 | Use `"...at our upcoming sale..."` or pull actual sale type from data |
| `packages/backend/src/services/challengeService.ts` | 64 | `"...hunt for treasures across estate sales."` (Summer challenge description) | D-001 | `"...hunt for treasures across sales near you."` |
| `packages/backend/src/services/challengeService.ts` | 80 | `"...explore the season's best estate sales."` (Fall challenge description) | D-001 | `"...explore the season's best sales."` |
| `packages/backend/src/services/challengeService.ts` | 95 | `"...across your favorite estate sales."` (Holiday challenge description) | D-001 | `"...across your favorite local sales."` |

**Notes:**
- `socialController.ts` generates social post copy that organizers share publicly under their brand. If the organizer is running a garage sale and the template says "estate sale," it's actively wrong. The `saleType` field is available in the calling context — the template should use it.
- `challengeService.ts` descriptions render on the `/challenges` page (confirmed: `challenge.description` is rendered at challenges.tsx:123). These are user-visible.
- The weekly digest email is currently the most visible D-001 violation — it goes to all users and is all-caps "estate sale" in subject, header, and body.

---

## D-006 Violations — "AI" in User-Facing Copy

### Confirmed Violation

| File | Line | Offending Copy | Rule | Suggested Rewrite |
|------|------|----------------|------|-------------------|
| `packages/frontend/data/blog/posts/ai-estate-sale-cataloging-what-actually-matters.ts` | 5 | `title: 'AI Cataloging Is Table Stakes Now. Here\'s What Actually Matters.'` | D-006 | `'Smart Cataloging Is Table Stakes Now. Here's What Actually Matters.'` |

The blog index renders this title publicly. D-006 is absolute: no "AI" in user-facing copy. The post body also uses "AI" 11 times when discussing industry trends and competitors — this is editorial (discussing competitor terminology), which is acceptable context. But the **title** is our own content label, not a quote of competitors.

### Borderline (Judgment Call for Patrick)

`pages/ai-score.tsx` — The GEO tool page uses "AI" throughout to describe what it measures (e.g., "Check how visible any FindA.Sale page is to AI search assistants like ChatGPT, Perplexity, and Google AI"). This is accurate technical description of the tool's subject matter — AI search engines are the entities being measured. Renaming them "Smart assistants" would be confusing and less precise. **Recommendation: treat this as an approved exception.** The nav link already uses compliant language ("Search Visibility"). The page title itself is compliant ("Search Visibility Score").

---

## Compliant Surfaces (Verified Clean)

Evidence of correct implementation found and confirmed:

- **Homepage hero** (`index.tsx:364`): "Browse yard sales, garage sales, estate sales, flea markets, auctions, and more." ✅
- **Pricing page meta** (`pricing.tsx:202`): "Simple, fair pricing for estate sale companies, garage sale hosts, auctioneers, and flea market operators." ✅
- **About page** (`about.tsx:56`): "connecting communities through yard sales, garage sales, estate sales, flea markets…" ✅
- **Footer** (`Layout.tsx:1855`): "yard sales, garage sales, estate sales, flea markets, auctions, and more" ✅
- **Onboarding modal** (`OnboardingModal.tsx:12`): "Discover yard sales, garage sales, estate sales, flea markets, auctions…" ✅
- **Camera PreviewModal AI confidence**: Uses "We identified this as…" / "we think this might be…" / "X% confident" — no "AI" text ✅
- **ItemCard tagging badge**: Renders "Auto" (not "AI") ✅
- **PriceResearchPanel**: Uses "🤖 Smart Estimate" — text is compliant ("Smart"), robot emoji is not the word "AI" ✅
- **AvatarDropdown nav link**: "Search Visibility" (not "AI Score") ✅
- **No founder voice / Patrick** in any user-facing surface ✅
- **Crew page** (`crews/[crewId].tsx:163`): "Organized by {crew.founder.name}" — displays user's actual name, not "founder" brand voice ✅

---

## Prioritized Fix List

### Route to `findasale-dev` (code-embedded strings)

**Priority: HIGH — affects email, social, and gamification copy sent to users**

1. `notificationController.ts` lines 248, 253, 355 — Fix weekly digest email header, body, and subject to use inclusive sale-type language.
2. `socialController.ts` lines 62, 64 — Fix casual and professional social post templates. Pull actual sale type from the `SaleType` enum available in context rather than hardcoding "estate sale." The friendly tone (line 66) already uses the generic "our sale" — use that pattern for all three.
3. `challengeService.ts` lines 64, 80, 95 — Fix seasonal challenge descriptions (3 strings).

### Route to `findasale-marketing` (content/copy decisions)

4. Blog post title `ai-estate-sale-cataloging-what-actually-matters.ts:5` — Rename from "AI Cataloging Is Table Stakes Now…" to drop the word "AI." The body can discuss competitor "AI" features as editorial; the title should comply.

---

## Patrick Dashboard Alert

Appended to `claude_docs/patrick-dashboard.md` below.

