# Patrick's Dashboard — S836 Wrap

---

## What Happened This Session (S836)

**#462/#463/#464 UTM attribution ✅ FIXED and VERIFIED after 3 sessions of investigation.**

Root cause: Chrome strips `utm_*` query params in incognito mode at the browser level — before any request is sent to the server. Every server-side fix was attacking the wrong layer.

The real fix: outreach email links now use custom `fsa_*` param names (`fsa_src`, `fsa_med`, `fsa_cmp`, `fsa_cnt`). Chrome doesn't recognize these as tracking params and leaves them alone. UTMCapture maps them back to standard `utm_*` names internally. Verified with console: `sessionStorage.getItem('fsa_utm')` returned `{"utm_source":"outreach","utm_medium":"email","utm_campaign":"touch1","utm_content":"hot"}`.

Also fixed: the Vercel build failure from the S835 push (missing closing bracket in `_app.tsx`).

---

## Current State

**Blocked Queue: 4 items** (below ≥8 QA ceiling — dev sessions available)

| Item | Status |
|------|--------|
| RSVP XP Monthly Cap | Waiting for organic usage (5 RSVPs/month needed) |
| #332 Shopify Cross-Listing | Needs Shopify OAuth test store |
| #293 eBay Post-Sale Panel | Needs completed sale with eBay connection |
| #335 Consignor Payout Email | CODE-ONLY — needs real email address to verify delivery |

---

## Your Actions Required

1. **Push block (S836 docs):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "docs: S836 wrap — #462/#463/#464 ✅ UTM verified, next QA batch queued"
.\push.ps1
```

2. **GBP phone verification:** business.google.com → "Verify now" → phone code (still pending).
3. **#239 legal gate:** Attorney + CPA before live consignor payouts.

---

## Next Session — QA Batch

S804-era UNVERIFIED items are now 32 sessions old (all P0 by age floor). QA session targeting:

- **#166 Invites** — organizer invite flow end-to-end
- **#74 Role-Aware Registration Consent** — consent checkboxes at /register
- **#72 Dual-Role Account Schema** — nav deduplication for organizer+shopper accounts
- **#165 A/B Testing Infrastructure** — variant assignment visible in organizer flow
- **#150 Push Notification Subscriptions** — VAPID prompt + service worker
- **#36 Weekly Treasure Digest** — CODE-ONLY acceptable (cron, can't force timing)
- **#61 Near-Miss Nudges** — API + any UI surface

Chrome agents run SEQUENTIALLY — one feature per dispatch.
