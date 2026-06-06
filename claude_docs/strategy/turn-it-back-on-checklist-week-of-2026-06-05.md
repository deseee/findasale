# Turn-It-Back-On Checklist — Week of 2026-06-05

Four zero-/low-risk moves that reactivate growth WITHOUT touching the automated email cron. Do these in order; none require re-enabling the pipeline that caused the suspensions.

## 1. Confirm Gmail/Workspace reactivation (blocking gate)
- [ ] Open Google Workspace admin → check status of `outreach@finda.sale`. Confirm the suspension banner is gone.
- [ ] Send one manual test email from the mailbox to yourself. Confirm it delivers.
- [ ] If still flagged: file the reinstatement request and STOP here — do not re-enable anything into a suspended mailbox.
- Owner: Patrick. Risk: none. Unblocks everything downstream.

## 2. Clean the list (do before any cold send is ever re-enabled)
- [ ] Drop/suppress the 480 BOUNCED addresses permanently.
- [ ] Age-out (mark EXPIRED) the 2,206 PENDING that are >30 days stale.
- [ ] Dedupe the queue by normalized email.
- [ ] Stand up a permanent Suppression list (bounce/unsubscribe/complaint) checked on every future send.
- Owner: dispatch to dev (DB + cron logic). Risk: low. This is the safeguard that was missing both times the mailbox got suspended.

## 3. Hand-send the 19 partnership drafts (highest value, near-zero risk)
- [ ] Review the 19 partnership drafts (NESA/NAA/NASMM etc.) for brand voice — sender "The FindA.Sale Team", no founder voice, no "AI".
- [ ] Send ≤5/day, lightly personalized to each org (their members, their sale type), from `outreach.finda.sale`.
- [ ] Track in a simple sheet: org, contact, sent date, opened, replied, outcome. One follow-up at 7 days, then stop.
- Owner: Patrick (or dispatch drafting/personalization). Risk: near-zero (tiny volume, real org contacts). These are finished and have been sitting unsent.

## 4. Confirm the social accounts exist
- [ ] Verify whether FindA.Sale has live, owned LinkedIn Company Page + Instagram business account.
- [ ] If yes: publish 2 of the best already-generated posts this week (manual, brand-voice reviewed).
- [ ] If no: create them (institutional brand accounts, no personal/founder account), claim handles, complete profiles.
- Owner: Patrick. Risk: none. The weekly content pipeline is writing posts that currently go nowhere.

## NOT this week (gated)
- Re-enabling the automated cold-email cron — gated on Gmail reactivation (#1) + list hygiene (#2) + a slow volume ramp starting at 20/day to the 462 warm leads.
- Scaling cold sends past the 462 warm leads — gated on a real lawyer reviewing the scraped-contact consent posture.

See `growth-reactivation-plan-2026-06-05.md` for the full 6-week ramp and the domain-isolation safety check.
