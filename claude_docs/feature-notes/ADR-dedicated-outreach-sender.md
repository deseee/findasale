# ADR — Move Cold Outreach Off Workspace Gmail Onto a Dedicated Sending Domain — 2026-06-21

## Recommendation (read first)

Move all cold directory-claim outreach off the Workspace Gmail rail and onto a **dedicated cold-email platform (Instantly- or Smartlead-class)** sending from a **separate purchased outreach domain** (a `.com` variant, NOT `finda.sale` and NOT a subdomain of it). Keep transactional (Resend) and lifecycle/marketing (MailerLite) exactly where they are. The new rail plugs in behind the existing `OUTREACH_ENABLED` kill switch and the existing `EmailSuppression` checks — outreach logic and the recipient-domain block do not change, only the transport underneath `sendOutreachEmails()`.

Three reasons this is the call:
- **The Gmail rail is the bottleneck and the risk.** On 2026-06-21, 136 cold sends failed with "reached a limit for sending mail." Google reputation-throttles `find@outreach.finda.sale` to ~200–300/day (vs. the 2,000 paid ceiling), and the per-account cap is not buyable up.
- **Cold bulk on Workspace endangers the whole `finda.sale` zone.** Spam complaints against cold mail degrade domain reputation that transactional receipts, password resets, payouts, and lifecycle email all depend on. A subdomain does NOT isolate this — see Decision 2.
- **Cold-email platforms are purpose-built for exactly this:** inbox rotation, automatic warmup, per-mailbox volume governors, and bounce/complaint webhooks — the four things Gmail API will never give us for cold sending.

---

## Context

**Current state (code-verified, S937 / S953 maps):**
- Cold outreach sends via **Rail C** — `outreachEmailsCron.ts` → `gmail.users.messages.send` from `OUTREACH_FROM_EMAIL` (`outreach@finda.sale`, rendered `The FindA.Sale Team <…>`). Run-gated by `OUTREACH_ENABLED !== 'true'` (L201), suppression-checked per row via `suppressionService.isSuppressed()` (L479), with tracking pixel + `List-Unsubscribe` header appended.
- The sender mailbox is a Google Workspace account on the `outreach.finda.sale` subdomain (`find@outreach.finda.sale`); its DKIM is at `google._domainkey.outreach`. The root `finda.sale` SPF authorizes Google (`include:_spf.google.com`).
- There is a DB-backed hard cap (`GMAIL_DAILY_HARD_LIMIT`, default 1500) shared across rails, but Google's own reputation throttle bites far earlier (~200–300/day observed).
- Bounces flow back via `bounceSuppressService` (polls the `outreach@` mailbox daily, upserts `EmailSuppression` with `bounceHard:true`), and `suppressionService` reads that back on the next run. The loop is closed.

**The two problems:**
1. **Throughput:** the Workspace account cannot send cold volume. The cap is a reputation throttle, not a billing limit — we cannot buy our way past it.
2. **Reputation contagion:** running cold bulk through a `finda.sale` mailbox puts the root domain's deliverability — which our transactional and lifecycle mail also ride on (SPF `include`, shared root reputation signals) — at the mercy of cold-outreach complaint rates.

---

## Decision 1 — Use a dedicated cold-email platform (Instantly / Smartlead class)

**Approved.** Adopt a purpose-built cold-outreach platform that provides mailbox warmup, multi-inbox rotation, and per-mailbox sending governors out of the box. The platform sends from mailboxes on the new outreach domain (Decision 2).

### Provider options compared

| Option | Fit for cold outreach | Reputation isolation | ToS risk | Verdict |
|---|---|---|---|---|
| **(a) Cold-email platform** (Instantly, Smartlead) | Built for it — warmup, inbox rotation, ramp governors, bounce/complaint webhooks | Strong — uses its own pooled mailboxes on our separate domain | Cold outreach is the *intended* use; allowed | **RECOMMENDED** |
| **(b) Transactional ESP on a separate domain** (Resend/SendGrid/Postmark) | Poor — no warmup, no rotation, built for transactional | Domain isolation OK, but no behavioral isolation | **HIGH — transactional-ESP ToS commonly prohibit cold/unsolicited bulk; account suspension risk** | Rejected |
| **(c) Self-hosted SMTP / Amazon SES on a separate domain** | Workable but we build warmup, rotation, ramp, and suppression plumbing ourselves | Strong if isolated domain + dedicated IP | SES AUP restricts unsolicited bulk; cold campaigns risk SES review/suspension; high ops burden | Rejected for v1 (fallback only) |

**Why (a) over (b):** Resend explicitly positions as transactional. Pushing cold directory-claim mail through Resend (or any transactional ESP) risks account suspension that would also take down our real transactional rail if we ever shared it. The whole point of this ADR is isolation — putting cold mail on the transactional vendor defeats it. Resend stays our transactional rail, untouched.

**Why (a) over (c):** SES/self-hosted gives us domain isolation but forces us to build warmup scheduling, inbox rotation, and ramp logic ourselves — months of plumbing the platforms ship on day one. Keep (c) as a documented fallback only if platform cost becomes prohibitive at scale.

---

## Decision 2 — Buy a separate outreach sending domain (not finda.sale, not a subdomain)

**Approved.** Purchase a distinct domain for cold outreach (e.g. `getfindasale.com`, `findasale-team.com`, or similar — final pick is Patrick's, must be brand-coherent and clearly ours). Stand up its own SPF, DKIM, and DMARC. The platform creates several mailboxes on it (e.g. `team@`, `claims@`, `hello@`) for inbox rotation. Configure a `List-Unsubscribe` and reply-to that routes back to a monitored inbox (ImprovMX alias → Gmail, same pattern as the existing zone).

### Why a subdomain is NOT enough
Reputation isolation at the level mailbox providers actually score on is **organizational-domain (root) level**, not hostname level. `outreach.finda.sale` shares the registrable root `finda.sale`; Gmail/Outlook reputation models, DMARC alignment, and blocklist entries operate substantially on that root. A spam-complaint spike against cold mail from any `*.finda.sale` mailbox can bleed into how `noreply@finda.sale` (receipts, resets) and `support@finda.sale` (lifecycle) are scored. A **separate registrable domain** is the only clean firewall: if the outreach domain gets torched, transactional/lifecycle on `finda.sale` is untouched, and we can rotate to a fresh outreach domain without affecting the product.

### Constraint
The new domain must NEVER be added to the `finda.sale` SPF `include` chain, and `finda.sale` must never be added to the outreach domain's. Keep the two zones' auth records fully independent.

---

## Decision 3 — Warmup and volume ramp tied to OUTREACH_DAILY_CAP

**Approved.** New mailboxes start cold. Enable the platform's automated warmup (2–4 weeks) before any production cold send from a given mailbox. Production cold volume then ramps:

| Phase | Per-mailbox/day | OUTREACH_DAILY_CAP (total) | Notes |
|---|---|---|---|
| Warmup | platform-managed | 0 production | No real outreach during warmup |
| Week 1 ramp | ~20–30 | set cap to mailbox-count × per-mailbox | Watch bounce/complaint rate |
| Week 2–3 | ~40–50 | raise cap stepwise | Hold if complaint rate climbs |
| Steady | ~50/mailbox | scale by adding mailboxes, not by raising per-mailbox | Add domains/mailboxes for more volume |

`OUTREACH_DAILY_CAP` (tactical env cap on the cold rail) is the single throttle knob; raise it only as warmup and clean metrics permit. Scale by adding warmed mailboxes/domains, never by pushing a single mailbox hot.

---

## Decision 4 — Reuse all existing suppression and compliance machinery

**Approved.** The compliance surface does not move with the transport. The new rail MUST honor everything the current rail does:
- **`EmailSuppression` checks** — call `suppressionService.isSuppressed()` / `checkMultiple()` before every cold send, exactly as `outreachEmailsCron.ts` does today. No address gets a cold mail if it's hard-bounced, opted-out, or complained.
- **Recipient-domain block** — `suppressionService.isEmailDomainBlocked()` (blocks `finda.sale`/`*.finda.sale` zone + competitor domains `estatesales.net`/`.org`) still runs. Cold mail must never hit our own zone or competitors.
- **`List-Unsubscribe` header** + a working one-click opt-out, same as today.
- **CAN-SPAM physical address** — every cold message carries `OUTREACH_PHYSICAL_ADDRESS` (219 E Michigan Ave, Suite F, Paw Paw, MI 49079) and institutional sender voice ("The FindA.Sale Team" — no founder voice, no "AI" language).
- **Bounce/complaint feedback into `EmailSuppression`** — replace the Gmail-mailbox-polling `bounceSuppressService` with the platform's bounce/complaint **webhook** (mirrors the existing Resend-webhook → `addSuppression` pattern in `routes/outreach.ts`). Every bounce and spam-complaint the platform reports gets written to `EmailSuppression` so the suppression loop stays closed on the new rail too.

---

## Decision 5 — Minimal code surface; everything else stays

**Approved.** High-level rail change only (no code in this ADR):
- Outreach send calls move from the Gmail path in `outreachEmailsCron.ts` to the new platform's send API (or SMTP), placed **behind the existing `OUTREACH_ENABLED` gate and the existing suppression checks** — those guards do not change.
- Add a platform bounce/complaint **webhook endpoint** that calls the existing `addSuppression` path (same shape as the Resend webhook).
- `lib/emailService.ts` (Gmail rail) remains for the lifecycle/bulk Rail-A services that still legitimately use it; only the **cold-outreach** path leaves it.
- **Transactional (Resend) and lifecycle (MailerLite) are untouched.** This change is scoped to cold directory-claim outreach only.
- Pre-existing P1 gaps from the S937 map (G1 Resend `send.finda.sale` DKIM alignment, G3 missing suppression on 8 bulk lifecycle services) are **separate work** — not blocked by and not part of this migration.

---

## Migration Sequence

1. **Buy domain** + point its DNS at the platform; set SPF/DKIM/DMARC for the new domain (platform provides the records). Set up reply/bounce inbox forwarding.
2. **Create mailboxes** on the new domain in the platform; **start warmup** (2–4 weeks). No production cold sends yet.
3. **Build the rail behind the kill switch** — wire `sendOutreachEmails()` to the platform API behind `OUTREACH_ENABLED` + existing suppression; add the bounce/complaint webhook → `EmailSuppression`. Ship with `OUTREACH_ENABLED=false` so nothing fires.
4. **Canary** — after warmup, flip `OUTREACH_ENABLED=true` with `OUTREACH_DAILY_CAP` at the Week-1 ramp value. Send to a small clean batch; confirm tracking, opt-out, and bounce→suppression all flow.
5. **Ramp** per Decision 3, watching bounce/complaint rate at each step.
6. **Decommission Gmail cold path** — once the platform rail is steady, retire the Gmail cold-send code path (keep the Workspace mailbox for inbound/notices). Lifecycle Rail-A services stay on Gmail.

### Rollback
Set `OUTREACH_ENABLED=false` (instant kill — no deploy). If the platform itself is the problem, revert the `sendOutreachEmails()` transport to the Gmail path (kept until step 6 completes) and re-enable. Because suppression and gating live above the transport, rollback touches only the transport line.

---

## Cost Estimate (rough, monthly)

| Item | Est. cost |
|---|---|
| Outreach domain registration | ~$10–15 / yr |
| Cold-email platform (Instantly/Smartlead class) | ~$30–100 / mo (tier by mailbox count / send volume) |
| Additional sending mailboxes (Google/Microsoft, if platform doesn't pool) | ~$1–6 / mailbox / mo |
| **Total v1 (small mailbox count)** | **~$40–120 / mo** |

Scales with mailbox count, not per-send. Far cheaper than the reputation cost of torching `finda.sale`.

---

## Risks

- **New-domain cold start:** a fresh domain has zero reputation; skipping warmup gets it blocklisted fast. Mitigated by mandatory warmup (Decision 3) and conservative ramp.
- **Platform lock-in:** outreach logic stays ours (suppression, gating, content); only transport is the platform, so swapping platforms is bounded. Keep SES/self-host (option c) documented as the escape hatch.
- **Webhook gap:** if the bounce/complaint webhook isn't wired before going live, suppression silently stops closing the loop on the new rail. Step 3 must ship the webhook with the rail, verified in the canary (step 4).
- **Brand confusion:** a non-`finda.sale` outreach domain can look like spoofing to recipients. Mitigate with a clearly-ours domain, institutional sender name, real reply-to, and consistent footer/branding.
- **Two zones drift:** someone adds the outreach domain to `finda.sale` SPF (or vice-versa), re-coupling reputation. Mitigated by the Decision-2 constraint and a DNS note.

---

## Consequences

- Cold outreach throughput is no longer capped by Google Workspace reputation throttling; it scales by adding warmed mailboxes/domains.
- `finda.sale` root reputation (transactional + lifecycle) is firewalled from cold-outreach complaint risk.
- One new external vendor + one new domain to maintain; one new webhook to keep healthy.
- `OUTREACH_ENABLED` remains the master kill switch; `OUTREACH_DAILY_CAP` becomes the volume governor on the new rail.
- The Workspace `outreach@`/`find@outreach.finda.sale` mailbox is retained for inbound and Google notices but is no longer the cold-send path.

## Constraints Added

1. The dedicated outreach domain MUST be a separate registrable domain — never `finda.sale` or any `*.finda.sale` subdomain — with its own independent SPF/DKIM/DMARC.
2. The two zones' email-auth records MUST stay independent: never cross-`include` SPF, never share DKIM/DMARC scope.
3. New outreach mailboxes MUST complete platform warmup before any production cold send.
4. The cold rail MUST run behind `OUTREACH_ENABLED` and MUST call `suppressionService` (suppression + recipient-domain block) before every send — identical to the current rail.
5. Bounces and complaints from the new platform MUST feed `EmailSuppression` via webhook before the rail goes live (no closed loop = no go-live).
6. Cold outreach must NOT be sent through the transactional ESP (Resend) or any transactional-ESP account — ToS prohibition + reputation isolation.
7. Transactional (Resend) and lifecycle (MailerLite) rails are out of scope for this migration and MUST NOT be altered by it.
