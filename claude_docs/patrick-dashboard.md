# Patrick's Dashboard — S1020 (2026-06-22)

---

## What Happened This Session (S1020 — June 22)

**Outreach email deliverability — root cause found and fixed. The earlier scary "phishing links" alarm was a false alarm.**

- ✅ **Prior P0 was wrong** — the earlier claim that "RAILWAY_BACKEND_URL isn't set → phishing links" was a guess from reading code, not a real problem. The variable has been set for months. Disproven by reading the actual mailbox + database.
- ✅ **Real root cause — it was the BOUNCE RATE, not volume.** Your outreach sender (`outreach@finda.sale`, paid Google Workspace) only sends ~169 emails/day and was fine through June 20. The problem: you were emailing scraped directory addresses, and 15-26% of them bounced over June 18-20 (Google tolerates ~2-5%). A 1-in-5 bounce rate is the classic signature of a bad/purchased list, so on June 21 Google's abuse system **clamped your sending limit** as a penalty — that's why 136 messages bounced "You have reached a limit for sending mail" that day (and the account is still penalized, so even tiny batches fail). The earlier "~200-300/day throttle" explanation was wrong.
- ✅ **The bounces that worried us were mostly junk** — dead mailboxes and placeholder/fake domains from scraped directory data, not a Gmail spam flag. 12 were recoverable (valid mailboxes Google temporarily blocked); those were reset with a 7-day cooldown.
- ✅ **5 fixes shipped + deployed green** — placeholder-email filter, bounce classification (5 new tracking columns), a daily send cap with paced sending and smart back-off, pre-send MX (mail server) validation to skip dead domains, and we built then removed an optional new email rail (kept the existing Gmail send per your call).
- ✅ **Verified live** — outreach cron now logging "12 sent, 0 failed"; backend healthy.
- ✅ **Two scheduled health tasks hardened** — the daily email-health check now watches the real throttle and reads the mailbox directly for limit errors; the bounce sweep now classifies bounces.

---

## The Plan (locked decision)

**No new domain, no SES, no new cost.** The fix has three parts: (1) **clean the list** — skip dead addresses, suppress junk, filter placeholders (all shipped this session) so the bounce rate drops at the source, which is the actual cause; (2) **pause sending** — `OUTREACH_DAILY_CAP` is set to **1** (near-zero) so Google sees sending stop and lifts the penalty over a few days; (3) **resume slowly** on the cleaned list — and ONLY after the daily health check shows zero send-limit failures and a bounce rate under 5%. We are NOT ramping up from 75 (that earlier plan was wrong) — we paused to near-zero to serve the penalty first. The bounce rate, not the volume, is the thing to keep low.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **4 items** — 1 cart, 3 email follow-ups (see below) |
| Outreach email | ⏸️ PAUSED (cap=1) to clear Google's clamp; list now MX-validated + junk-suppressed |
| Email health checks | ✅ Hardened (real throttle + mailbox reads) |
| Vercel / Railway | ✅ Both healthy, deployed green |

---

## Action Required — Patrick

1. **Outreach is PAUSED — leave `OUTREACH_DAILY_CAP=1` in Railway** until the resume condition is met. This near-zero pause lets Google lift the penalty clamp over a few days. Do NOT ramp from 75 — that earlier plan was wrong; the bounce rate (not volume) caused this, so we serve the penalty first.
2. **Resume only when clean:** raise the cap to a small value (low volume, cleaned list) ONLY AFTER the daily email-health check shows zero send-limit failures AND a bounce rate under 5%. Keep the bounce rate under 5% or the clamp comes back.
3. **eBay token** still expired (June 20) — reconnect in organizer settings to restore the live API count (DB fallback is accurate meanwhile).
4. **AlternativeTo** — did you submit after the June 18 prompt?

---

## BQ Items (4)

| Feature | Blocked Until |
|---------|---------------|
| Cart payment-completion (items→SOLD on success) | Real Stripe purchase on prod — Patrick action only |
| bounceSuppressService reads the wrong mailbox | Optional dev fix — point it at the right inbox |
| reclassify-bounces backfill ineffective (~93 bounces) | Depends on the mailbox fix above |
| schema.prisma drift — 5 email columns, no migration file | Optional: generate migration + mark applied |

---

## Push Block

STATE.md + patrick-dashboard.md only (the code was already pushed + deployed green this session). See the push block in chat.

---

## Next Session

**Session type: QA or DEV** — BQ = 4 (no QA gate yet).

- Post-deploy smoke test: confirm outreach cron still clean ("N sent, 0 failed", no limit errors).
- Keep `OUTREACH_DAILY_CAP=1` (paused); only resume per the resume condition above. Watch the bounce rate as the governing metric.
- Email follow-up fixes: bounceSuppressService mailbox (P1) + schema.prisma drift (P1) — both optional.
- #547 eBay Calculated Shipping E2E QA (needs you available).
