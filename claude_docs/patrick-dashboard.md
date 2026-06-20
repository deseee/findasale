# Patrick's Dashboard — Week of June 19, 2026 (Updated S1013)

---

## What Happened This Session (S1013 — June 19)

**Audit session — you asked me to check past sessions for anything left undone:**

- ✅ **Fixed the recurring "Failed to load users" 500 on /admin/users** — root cause found: the admin user list (and the sales list) were pulling every purchase/sale ID just to count them, overflowing the database server's small shared-memory and throwing a disk-full error. Switched to proper count queries. **One thing left for you:** the Railway database node itself is memory-tight — bumping its size (or shared-memory) is the durable fix; my code change reduces the pressure.
- ✅ **Found another, bigger version of the same slow-query bug** — the admin *Organizer Performance* report (`/admin/reports/organizers`) was loading every one of your 80k+ organizer records (with all their sales and items) just to show one page. Rewrote it to do the math in the database. Same root cause, no Railway change needed.
- ✅ **Closed the 4 stuck eBay items (open since S998)** — Loy Norrix Choirs + Kirkland Pepper are now linked to their eBay offers. The other two (Whip-It Butane, Contigo Travel Mug) no longer exist in the database, so their eBay offers are just orphaned — nothing to link.
- ✅ **Caught a documentation gap** — the admin DM + ala-carte feature you shipped today (commit 4374e40a) is now on the roadmap (#554). Note: it's live but hasn't had a real click-through QA yet — sending a real message to confirm the email actually delivers is the open item.
- ℹ️ **The "fee rate 8% vs 10%" question isn't a bug** — the code tiers it on purpose (10% SIMPLE, 8% PRO/TEAMS). Just needs a one-line doc fix so it stops coming back.
- ⚠️ **Heads-up:** a second Cowork window (S1012) was editing the project notes at the same time as this audit. No harm done, but running two windows at once is exactly what causes the notes to drift.

---

## What Happened This Session (S1012 — June 19)

**Bug/Data session — ala-carte revenue + admin DM:**

- ✅ **Ala-carte $9.99 now shows in Today's Revenue** — backfilled the existing ala-carte payment directly to the DB, then fixed the code so all future ala-carte payments auto-track. Admin dashboard "Today's Revenue" card now reflects the correct amount.
- ✅ **Stripewebhook creates Purchase records** — `checkout.session.completed` for ALA_CARTE now writes a `Purchase` row (source=ALA_CARTE) so revenue is properly tracked going forward. Idempotency guard in the PI handler prevents double-counting.
- ✅ **Admin DM feature** — "Send Message" button now appears on every user's admin detail page (`/admin/users/[userId]`). Click it, fill in Subject + Message, hit Send → email goes out via the transactional rail. Useful for welcome messages, account questions, etc.
- ✅ **No schema migration needed** — ala-carte revenue uses the existing `Purchase.source` field ('ALA_CARTE'). No DB changes required.

---

## REQUIRED ACTION (S1013 — push the 500 fix + wrap docs)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/adminController.ts
git add packages/backend/src/controllers/adminReportsController.ts
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S1013: admin getUsers/getSales _count fix (53100) + roadmap #554 + wrap docs"
.\push.ps1
```

*(If the other window already pushed the docs, run `git fetch && git pull` first, then push.)*

**Then (your call, not code):** raise the Railway database instance/shared-memory to fully stop the /admin/users 500s.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **2 items** — cart payment-completion (Stripe LIVE keys); admin DM #554 (needs QA) |
| Ala-carte revenue tracking | ✅ Fixed + deployed |
| Admin DM (email to user) | ✅ Deployed — "Send Message" on /admin/users/[id] |
| Admin MRR calculation | ✅ Fixed + deployed (S1011) |
| RETAIL sale dashboard dates | ✅ Fixed + deployed (S1011) |
| Blog (/blog + /blog/[slug]) | ✅ Chrome-verified S1008 |
| Label composer | ✅ Chrome-verified S1008 |
| Buy Now graceful error | ✅ Chrome-verified S1008 |
| Cart multi-item checkout | ⚠️ UNVERIFIED — Stripe LIVE keys; real purchase needed |
| Vercel / Railway | ✅ Both healthy |
| SEO Pages | ✅ estate-sales / yard-sales / auctions / flea-markets verified |
| eBay Queue Mode | ✅ Confirmed firing */30 |

---

## BQ Items (1)

| Feature | Blocked Until |
|---------|---------------|
| Cart payment-completion (items marked SOLD on success) | Real purchase with live Stripe — test cards rejected on prod |

---

## Next Session (S1013)

1. **Push wrap docs** (block above).
2. **Verify admin DM** — go to `/admin/users/[your-user-id]`, click "Send Message", send a test welcome message to yourself.
3. **Verify ala-carte revenue** — check `/admin` dashboard, "Today's Revenue" should show $9.99.
4. **BQ item** — cart payment-completion still needs a real purchase to verify.
