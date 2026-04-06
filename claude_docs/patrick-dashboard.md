# Patrick's Dashboard — April 6, 2026

---

## What Happened This Session (S403)

Full gamification strategy session. No code. All design.

Ran a 5-agent pass: Innovation research → Devils Advocate + Steelman (parallel) → full Advisory Board → Game Designer (XP economy) → Architect (Treasure Trails feasibility). Every design decision from the Explorer's Guild system is now locked and documented.

**Big calls made this session:**
- Treasure Trails redefined — not a sale route, a curated local experience (cafés, antique shops, photo spots + the sale)
- Dual XP eliminated — one currency for everyone
- Seasonal Battle Pass killed as a separate product — folds into Hunt Pass
- Organizer signup XP cap removed
- Hunt Pass stays $4.99/mo (math validated)
- Google Places API approved at $200/mo hard cap
- Trail creation: open to all (no paywall), editorial review 1–2 days
- Organizer earns +15 XP per unique shopper trail completion
- Trail XP scales by length: 3-stop=+40 XP up to 7-stop=+80 XP bonus

**Three new spec files created:**
- `claude_docs/research/s403-gamification-research.md` — full research memo
- `claude_docs/feature-notes/gamedesign-decisions-2026-04-06.md` — complete XP economy (Rev 2), all decisions locked
- `claude_docs/feature-notes/treasure-trails-architect-adr.md` — schema plan, API contracts, feasibility verdict (GO)

---

## Push Block (S403 — run now)

No code changes this session. Documentation files only.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add "claude_docs/feature-notes/gamedesign-decisions-2026-04-06.md"
git add "claude_docs/feature-notes/treasure-trails-architect-adr.md"
git add "claude_docs/research/s403-gamification-research.md"
git commit -m "S403: Explorer's Guild full design — XP economy, Treasure Trails, architect ADR"
.\push.ps1
```

---

## Action Items for Patrick

- [ ] **Run push block above**
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Enable Places API → Create key → Set $200/mo billing cap → Add to Railway env as `GOOGLE_PLACES_API_KEY`
- [ ] **Run S399 migration** if not already done — FeedbackSuppression table (see STATE.md S399)
- [ ] **Encyclopedia rename decision** — "Resale Encyclopedia," "Secondhand Encyclopedia," or keep "Estate Sale Encyclopedia" for SEO? Dev blocked until decided.
- [ ] **Trademark call** — File for FindA.Sale? ~$250–$400 per class.
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created
- [ ] **eBay production credentials** — When ready for real eBay data, get production creds from developer.ebay.com and swap Railway env vars + two API URLs back to `api.ebay.com`

---

## Next Session (S404) — Explorer's Guild Build + QA

**What S404 does:** One-shot build of the full Explorer's Guild + Treasure Trails system. All design is locked. Dev dispatches in parallel with documentation.

**Session opens with:**
1. `findasale-records` creates master spec doc from the 3 design files
2. `findasale-dev` dispatched in parallel to implement (schema → XP service → Trail backend → Trail frontend → trail builder in organizer flow)
3. After dev returns: math verification, schema check, API contract check

**Before S404 starts you need:**
- Google Places API key in Railway (see action item above)
- Push block from this session run

**After S404 ships:**
- Treasure Trails will be live in the organizer sale creation flow
- XP economy will be wired across the platform
- Explorer's Guild ranks will be functional

*Updated S403 — 2026-04-06*
