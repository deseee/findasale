# @system.finda.sale Bounce Source — Definitive Investigation (S937)

**Question:** A Gmail-rail send delivered to scraped organizers' placeholder address
`scraper+slug@system.finda.sale` (72,060 such User rows). EmailQuotaLog: 06-06=400,
06-07=202, 06-08=200, today(06-09)=0. EmailAutomationLog had ZERO rows in the last 3
days. Which code path produced the ~200/day @system sends?

**Answer (proven below): the post-sale recap path —**
`sendPostSaleRecaps()` in `packages/backend/src/services/postSaleRecapEmailService.ts`,
run by `outwardEmailAutomationsJob` (cron `0 10 * * *`, 10:00 UTC daily). The current
code filters scraped organizers; the 488 stamped rows predate that filter, so this was
the live source on 06-06..06-08. The S937 rail guard now blocks it regardless.

---

## Task A — Definitive source identification

### A.1 The smoking gun (DB evidence)

The post-sale recap service stamps `Sale.recapSentAt` immediately after a successful
send (`postSaleRecapEmailService.ts:217`). That timestamp is a per-send fingerprint.

```sql
SELECT DATE(s."recapSentAt"), COUNT(*)
FROM "Sale" s JOIN "Organizer" o ON s."organizerId"=o.id JOIN "User" u ON o."userId"=u.id
WHERE u.email LIKE '%@system%' AND s."recapSentAt" IS NOT NULL
GROUP BY 1 ORDER BY 1 DESC;
```
Result (run S937 against Railway prod):

| recapSentAt date | @system sales stamped | EmailQuotaLog that day |
|---|---|---|
| 2026-06-08 | **120** | 200 |
| 2026-06-07 | **195** | 202 |
| 2026-06-06 | **173** | 400 |
| **Total** | **488** | — |

- 06-07: 195 recap stamps vs 202 total quota burn → recap = **~97%** of that day's Gmail sends.
- Hour-of-day distribution: **100% at hour 10 UTC** (488/488), min `2026-06-06 10:00:01`,
  max `2026-06-08 10:01:32` — exactly the `0 10 * * *` cron window of
  `outwardEmailAutomationsJob`. No other Gmail-rail job runs at 10:00 UTC to organizers.

```sql
SELECT EXTRACT(HOUR FROM s."recapSentAt") hr, COUNT(*) FROM "Sale" s
JOIN "Organizer" o ON s."organizerId"=o.id JOIN "User" u ON o."userId"=u.id
WHERE u.email LIKE '%@system%' AND s."recapSentAt" IS NOT NULL GROUP BY hr;
-- -> [(10, 488)]
```

Recipient flags confirm these are scraped placeholders:
```sql
SELECT o."isClaimed", o."isUnmanagedListing", COUNT(DISTINCT s.id) FROM "Sale" s
JOIN "Organizer" o ON s."organizerId"=o.id JOIN "User" u ON o."userId"=u.id
WHERE u.email LIKE '%@system%' AND s."recapSentAt" IS NOT NULL GROUP BY 1,2;
-- -> [(False, True, 488)]   isClaimed=false, isUnmanagedListing=true
```

### A.2 Why the current code looks like it can't do this (and why it still did)

Current batch query excludes scraped organizers (`postSaleRecapEmailService.ts:241`):
```ts
organizer: { isClaimed: true, isUnmanagedListing: false }, // exclude scraped organizers
```
But all 488 stamped organizers are `isClaimed=false, isUnmanagedListing=true` — precisely
the set this filter EXCLUDES. Only consistent explanation: the filter was **added after**
these sends (a prior remediation); the 06-06..06-08 batches ran with the older, unfiltered
query. The `recapSentAt` stamps are durable proof the path ran on those scraped orgs.

(Git note: `git log -S` timed out in this VM's large-repo checkout. The DB evidence stands
alone — 488 stamps at 10:00 UTC on the recap cron, on organizers the current filter would
exclude, is dispositive. UNKNOWN: exact commit SHA/date the filter landed — needs
`git log -S "isUnmanagedListing: false" -- packages/backend/src/services/postSaleRecapEmailService.ts`
from Patrick's Windows checkout.)

### A.3 Why EmailAutomationLog was empty (corroborating, not contradictory)

Recap is the ONE outward automation that does **not** write `EmailAutomationLog`. Its
idempotency key is `Sale.recapSentAt`. Of the five sub-tasks in `outwardEmailAutomationsJob`:
- `sendPostSaleRecaps` -> stamps `Sale.recapSentAt` (NO EmailAutomationLog) <- **the source**
- `sendOrganizerTestimonialAsks` -> `Sale.testimonialAskSentAt`; filters scraped orgs +
  requires >=1 SOLD item -> 0 @system rows stamped (verified)
- `sendShopperReviewAsks` -> writes EmailAutomationLog; targets shoppers, not @system
- `sendOrganizerWinBacks` -> writes EmailAutomationLog (empty -> ruled out)
- `sendAbandonedSignupNudges` -> writes EmailAutomationLog (empty -> ruled out)

So "EmailAutomationLog empty" actively CORROBORATES recap: it's the only outward path that
sends without touching that log.

### A.4 Call-site table — every Gmail-rail send whose recipient is a DB-derived address

`isHS` = `isHardSuppressed` (domain-block + hard-bounce + complaint). `isS` =
`isSuppressed` (domain-block + bounce + opt-out). Both now include `isEmailDomainBlocked`.
`RAIL` = also caught by the S937 rail guard (`emailService.ts:243`) which runs for ALL sends.

| File:line | Recipient expr | Trigger | Filters scraped/@system? | 06-08 source? |
|---|---|---|---|---|
| **services/postSaleRecapEmailService.ts:212** | `email` <- `sale.organizer.user.email` | cron 10:00 UTC (outwardEmailAutomationsJob) | NOW: batch `isUnmanagedListing:false` + `isS`. THEN: unfiltered | **YES — 488 stamps prove it** |
| services/reviewRequestEmailService.ts:138 | `email` <- `sale.organizer.user.email` | cron 10:00 UTC | batch `isUnmanagedListing:false` + >=1 SOLD + `isS` | No (0 @system stamps) |
| services/reviewRequestEmailService.ts:243 | `email` <- `purchase.user.email` | cron 10:00 UTC | shopper accounts; `isS` | No |
| services/winBackEmailService.ts:182 | `email` <- `organizer.user.email` | cron 10:00 UTC | batch `isClaimed:true`+`isUnmanagedListing:false` + `isS` + log throttle | No (log empty) |
| services/abandonedSignupEmailService.ts:140 | `organizer.user.email` | cron 10:00 UTC | `isS` + EmailAutomationLog | No (log empty) |
| services/onboardingEmailService.ts:77,150,199 | `organizer.email` | **No caller — dead code** | `isS` | No (never invoked) |
| services/saleLiveEmailService.ts:105 | `organizer.email` | **No caller — dead code** | `isHS` | No (never invoked) |
| services/saleAlertEmailService.ts:76,152 | `data.organizerEmail` | event | `isHS` | Not the 10:00 batch |
| services/saleAlertEmailService.ts:118,234 | `data.shopperEmail` | event | `isHS` | shopper |
| services/presaleSneakPeekEmailService.ts:98 | subscriber/RSVP emails | cron | `isS`; @system sneakPeekSentAt=0 | No |
| services/weeklyEmailService.ts:152 | shopper digest | cron Sun 18:00 | `isS` (bulk gate) | shopper |
| services/wishlistMatchEmailService.ts:194 / wishlistAlertService.ts:239 | shopper emails | event/cron | `isS` | shopper |
| services/priceDropService.ts:73 / smartFollowService.ts:122 / followerNotificationService.ts:70 / buyerMatchService.ts:360 | follower/shopper emails | event | `isS` | shopper |
| services/collectorPassportService.ts:289 | shopper email | event | `isS` | shopper |
| services/organizerAnalyticsService.ts:315 | organizer email | cron/digest | `isS` | claimed orgs |
| lib/notificationService.ts:58 | `user.email` | event (createNotification) | explicit `@system` skip (line 50) + `isS` | No |
| jobs/curatorEmailJob.ts:202 | curator emails | cron Mon 08:00 | curated users | No |
| jobs/abandonedCheckoutJob.ts:38 / saleEndingSoonJob.ts:130 / auctionJob.ts:167 / monthlyTrendReportJob.ts:237 | shopper/buyer emails | cron/event | `isS` | shopper |
| controllers/buyingPoolController.ts:210,337 / reservationController.ts:1308 / saleWaitlistController.ts:94 / waitlistController.ts:93 | shopper/waitlist emails | event | mixed | shopper |
| routes/contact.ts:38 | `supportEmail` (support@finda.sale) | contact form | allowlisted | internal |
| routes/contact.ts:60 | submitter `email` (user-entered) | autoreply | `isHS` | user-entered |
| routes/organizers.ts:1976 | `claimantEmail` (user-entered) | claim request | `isS` | user-entered |
| routes/admin.ts:399 | admin-supplied `to` | manual admin test | none (admin-controlled) | internal |
| controllers/adminBroadcastController.ts | admin broadcast list | manual admin | admin-gated | No |
| controllers/couponController.ts | shopper email | event | `isS` | shopper |
| middleware/crawlerAnalytics.ts:55 | internal alert address | middleware | internal | internal |

### A.5 Conclusion

**Source = `sendPostSaleRecaps()` (postSaleRecapEmailService.ts), via
outwardEmailAutomationsJob, 10:00 UTC daily.** Evidence: 488 `Sale.recapSentAt` stamps on
`isClaimed=false / isUnmanagedListing=true` @system organizers, dated 06-06(173) /
06-07(195) / 06-08(120) — matching the EmailQuotaLog burn (06-07's 195 ~ that day's entire
202), 100% at hour 10 UTC = the recap cron. EmailAutomationLog being empty is consistent
because recap is the only outward path that doesn't write that log. Today (06-09)=0 because
the S937 fix + the prior `isUnmanagedListing` batch filter now exclude these.
`OUTREACH_ENABLED='true'` is implied (the job is gated on it and it ran). NOT saleLive
(dead code, no caller).

---

## Task A.6 — OTHER unfiltered paths that are latent landmines

The S937 rail guard now catches @system / finda.sale-zone at ALL of these, so the acute
risk is mitigated. These are hardening items:

1. **`routes/contact.ts:38` — support send has NO controller pre-check.** It sends
   straight to `supportEmail` with no suppression/allowlist guard in the controller; it
   survives only because the rail guard's `SENDABLE_INTERNAL_ALLOWLIST` whitelists
   `SUPPORT_EMAIL`. If `SUPPORT_EMAIL` is ever set to a non-allowlisted value, this send
   silently breaks. The ONE path that depends on the allowlist to FUNCTION, not to block.

2. **Gmail rail-level guard only checks `isEmailDomainBlocked`, not the EmailSuppression
   table.** `emailService.ts:243` filters blocked DOMAINS but does NOT consult per-address
   hard-bounce/complaint suppression. Any future Gmail-rail caller that omits its own
   `isSuppressed`/`isHardSuppressed` guard would send to an individually hard-bounced real
   address. The transactional rail does the full `checkMultiple` at the rail; the Gmail
   rail does not. **Recommend: add `isHardSuppressed`/`checkMultiple` to the Gmail rail
   guard** to match the transactional rail's belt-and-suspenders.

3. **Dead-but-loaded send functions** (`saleLiveEmailService.sendSaleLiveEmail`,
   `onboardingEmailService.sendOnboardingEmail5a/5b/5c`). No caller today, harmless — but
   fully wired to the Gmail rail with `organizer.email` recipients. If a future cron wires
   them up without the scraped-organizer filter, the bug reappears. They DO have `isS`/`isHS`
   guards (now including the domain block), so @system would be caught — flag for awareness.

4. **`organizerAnalyticsService.ts:315`** organizer digest uses `isS` (so @system blocked),
   but verify its batch query excludes `isUnmanagedListing` organizers to avoid iterating
   72k rows of no-op skips (recap bug's milder cousin).

None are sending to @system today (rail guard active). Hardening items, not active incidents.

---

## Task B — Complete legitimate @finda.sale / *.finda.sale recipient set

Tracing every code path whose RECIPIENT (not From, not mailto: link, not User-Agent, not
inbound-only display) resolves to an @finda.sale / *.finda.sale address:

| Code send-target | File:line | Resolves to | Allowed by guard? |
|---|---|---|---|
| Contact-form forward to support inbox | `routes/contact.ts:38` (`to: supportEmail`) | `SUPPORT_EMAIL` ?? `support@finda.sale` | **YES** — allowlist includes `SUPPORT_EMAIL` default |
| Quota / deliverability alerts | emailService sendQuotaAlert, gmailHealthCron, deliverabilityMonitor | `deseee@gmail.com` (external) | N/A (not finda.sale) |
| Admin test send | `routes/admin.ts:399` | admin-supplied `to` | Blocked unless allowlisted — acceptable for a test tool |

**Search performed:** grepped all `to:` recipient expressions across `packages/backend/src`
for literal `finda.sale`, env-derived support/info/admin addresses, and DB-field recipients.
The ONLY code path that intentionally SENDS to an `@finda.sale` address is the contact-form
support forward (`support@finda.sale`). Every other `@finda.sale` / `*.finda.sale` string in
the backend is a **From** address (`SES_FROM_EMAIL`, `RESEND_FROM_EMAIL`,
`hello@send.finda.sale`, `find@outreach.finda.sale`, `notifications@send.finda.sale`), an
unsubscribe/`FRONTEND_URL` link, or a `mailto:` display in HTML — never an SMTP recipient.

### B.1 Allowlist completeness verdict

**`support@finda.sale` (via `SUPPORT_EMAIL`) is sufficient as the only required allowlist
entry.** No other internal address (`info@`, `privacy@`, `legal@`, `admin@`, abuse@,
moderation@) is an actual code SMTP send-target — they appear only as `mailto:` links in
frontend/templates or in legal copy, never passed to `emailService.emails.send` or
`transactionalEmailService.emails.send` as a `to:`. The new finda.sale-zone block will NOT
wrongly break any real internal send.

**Caveat:** the allowlist is correct for TODAY's code but is a single point of fragility.
If anyone later routes a form to `abuse@`/`privacy@finda.sale`, the zone block silently
drops it (`console.warn` only). Mitigations: (a) `SENDABLE_FINDA_SALE_ADDRESSES` env is the
documented escape hatch (already wired, `suppressionService.ts:47`); (b) anyone adding an
internal finda.sale recipient must add it there. UNKNOWN: current prod value of
`SENDABLE_FINDA_SALE_ADDRESSES` — needs Patrick to read the Railway env var to confirm
whether extra internal addresses are already whitelisted. The CODE default (just
`support@finda.sale`) is complete for the current send-target set.
