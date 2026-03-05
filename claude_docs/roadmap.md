# ROADMAP – FindA.Sale

**Last Updated:** 2026-03-05 (v9 — Post-launch reorganization. All Five Pillars done. Sprint Track T–X defined.)
**Status:** Production MVP live at finda.sale. 21 phases shipped. Entering post-launch improvement track.

---

## Achievement: Five Pillars Complete ✅

21 phases shipped across 5 pillars (Sprints A–S, 2026-03-04 to 2026-03-05):

1. **Organizer Photo/Video Workflow** — rapid capture, AI tagging, Cloudinary pipeline, multi-photo manager (14, 15, 16)
2. **UI/UX Design Overhaul** — warm design system, bottom tab nav, listing card redesign, onboarding + empty states (24, 25, 26, 27)
3. **Social & Discovery Layer** — follow system, social proof feed, full-text search, weekly curator email (17, 28, 29, 30)
4. **Shopper Engagement Engine** — lightbox, Hunt Pass points, messaging, reservation/hold UI (18, 19, 20, 21)
5. **Creator-Led Growth + Distribution** — creator tier, affiliate/referral, OAuth login, CSV export (22, 23, 31, 32)

Research archives: `claude_docs/research/`

---

## Post-Launch Sprint Track

All items below are buildable by Claude — no external accounts or human decisions required unless noted.

| Sprint | Focus | Status |
|--------|-------|--------|
| **T** | **Production Hardening** | **Next** |
| U | Search & Discovery Upgrade | Queued |
| V | Live Engagement | Queued |
| W | Organizer Workflow | Queued |
| X | Integrations | Queued |

---

## Sprint T — Production Hardening ← Next

**Goal:** Catch regressions early, finish scaffolded features, add quick shopper wins.

### T1 — Stress Test Suite
Automated checks for: schema drift (Prisma model vs migration mismatch), dead routes (registered but no controller export), stale docs (STATE.md references non-existent files), orphaned migrations, console.log stubs in controllers.
- `scripts/health-check.ts` — runs all checks, outputs pass/fail report
- Wires into health-scout skill and pre-deploy checklist

### T2 — Pre-Commit Validation Skill
Extend `.githooks/pre-push` beyond TypeScript check to also run: Prisma schema lint, grep for `console.log` / `TODO` / `alert(` in controllers, check for missing `authenticate` on mutation routes.
- Update `packages/backend/.githooks/pre-push`
- Update findasale-deploy skill checklist to reference it

### T3 — Favorites Categories
Let shoppers filter their saved favorites by category. Builds on existing favorites + search.
- `GET /api/favorites?category=X` — add category filter param
- Update `/favorites` page with category tabs (reuse `/search` category tab pattern)
- Zero schema changes needed

### T4 — Virtual Line SMS E2E
`VirtualLine` model and `lineController` are already scaffolded. Twilio is configured. Complete the flow end-to-end:
- `POST /api/lines/:saleId/join` → SMS confirmation to shopper via Twilio
- `POST /api/lines/:saleId/notify` → organizer broadcasts "now serving #N" via SMS blast
- Simple organizer UI on sale management page (join count + notify button)

---

## Sprint U — Search & Discovery Upgrade

### U1 — Ollama Semantic Search
Replace Prisma `contains` in `/api/search` with Ollama embedding vectors for semantic matching.
- `qwen3-vl:4b` + `nomic-embed-text` model via Ollama `/api/embeddings`
- Store embeddings on `Item` (pgvector or Float[] column + cosine similarity query)
- Graceful fallback to text search if Ollama unavailable
- Migration: `add_item_embedding`

### U2 — Neighborhood Landing Pages
SEO-friendly pages for "Estate Sales in [Grand Rapids Neighborhood]".
- `pages/neighborhoods/[slug].tsx` — upcoming sales filtered by neighborhood/area
- Prisma query by city district or lat/lng bounding box
- Add to sitemap for SEO indexing

---

## Sprint V — Live Engagement

### V1 — Socket.io Live Bidding
Replace 10s auction polling with real-time bid events.
- Add `socket.io` to backend, emit `bid:update` on each `placeBid` call
- Frontend: replace polling `useEffect` in auction item detail with `useSocket` hook
- Graceful fallback to polling if socket drops

### V2 — Instant Payouts
Allow organizers to configure faster Stripe payout schedule.
- `POST /api/organizers/me/payout-schedule` → `{ interval: 'daily' | 'weekly' | 'manual' }`
- Stripe Connect `account.update({ settings: { payouts: { schedule } } })`
- Display current schedule + change option in organizer dashboard

### V3 — UGC Missing-Listing Bounties
Reward shoppers who photograph and submit items the organizer missed.
- `POST /api/items/suggest` — shopper submits photo + title + description
- `/organizer/suggestions` — organizer review queue (approve/reject)
- On approval: 25pt award to submitter, item added to sale

---

## Sprint W — Organizer Workflow

### W1 — Shipping Workflow
For organizers who ship items (antique dealers, online-first sellers).
- `shippingAvailable Boolean @default(false)` + `shippingPrice Decimal?` on `Item`
- Checkout: shopper selects local pickup or shipping
- Flat-rate shipping calculator (organizer sets price per item or per order)

### W2 — Label Printing
PDF-printable item price tags for in-person sales.
- `GET /api/items/:id/label.pdf` — single label: title, price, QR code, sale name
- `GET /api/sales/:id/labels.pdf` — all items in one print-ready PDF
- Builds on existing QR scan infrastructure

---

## Sprint X — Integrations

### X1 — Zapier Webhook System
Let organizers push FindA.Sale events to external tools (CRMs, email lists, inventory systems).
- `Webhook` model: `{ id, organizerId, url, events String[], secret String }`
- Events: `sale.published`, `item.sold`, `reservation.created`, `review.posted`
- `POST /api/organizers/me/webhooks` — register; `DELETE` to remove; `POST .../test` to verify
- Background job fires signed `axios.post(webhook.url, payload)` on each event

---

## Needs Patrick First (Blocked on External Setup)

| Item | What's Needed |
|------|---------------|
| Uptime monitoring | Create free UptimeRobot or StatusGator account → add monitor for `finda.sale` and Railway backend URL → share alert email |
| Sentry error tracking | Create Sentry project → share DSN → Claude wires `@sentry/node` + `@sentry/nextjs` |

---

## Long-Term Hold

| Item | Reason | Revisit |
|------|--------|---------|
| Video-to-inventory | Vision models can't segment rooms reliably yet | Late 2026+ |
| Multi-metro expansion | Business decision — Grand Rapids validation first | After beta data |

---

## Infrastructure (All Done)

Backend on Railway (`backend-production-153c9.up.railway.app`), PostgreSQL on Neon, frontend on Vercel (`finda.sale`). Session safeguards, model routing, scheduled tasks, self-healing skills all active. See `claude_docs/CORE.md` and `claude_docs/self_healing_skills.md`.

---

*v9 updated 2026-03-05. Five Pillars complete. Post-launch Sprint Track T–X defined.*
