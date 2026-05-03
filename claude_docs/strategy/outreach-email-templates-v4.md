# Outreach Email Templates — v7 (S630)

**Status:** FINAL — approved for Dev wiring
**Owner:** Patrick
**Sequence:** 4 touches over 21 days
**Sender:** outreach@finda.sale · "The FindA.Sale Team"
**Merge fields available:** [Business Name], [preview link], [video link]
**No first name data** — personalization via business name in subject + body

---

## Touch 1 — Day 0 — All records

> **Subject:** Where do buyers find [Business Name]?
>
> Your sale may be fantastic, but if your buyers don't know when and where to find you, it won't matter.
>
> We understand the challenges you face organizing a sale: short lead time, little visibility and sales discovered only after they ended.
>
> Let us help. We built [Business Name] a free storefront on FindA.Sale — it puts you on the map before shoppers start searching, not after.
>
> Take a look: **[preview link]**
>
> 2-minute walkthrough: **[video link]**
>
> It's free to claim your page. No credit card needed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe link]

---

## Touch 2 — Day 4 — Non-openers of Touch 1 only

> **Subject:** In case it got buried — [Business Name] on FindA.Sale
>
> We sent a note a few days ago about a free storefront for [Business Name] on FindA.Sale. Sending it again in case it got buried.
>
> Take a look: **[preview link]**
>
> 2-minute walkthrough: **[video link]**
>
> Free to claim. No credit card needed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe link]

---

## Touch 3 — Day 9 — Openers of Touch 1 who didn't click

> **Subject:** Be honest — how's the pricing going?
>
> Most organizers price from memory. It works until it doesn't.
>
> Unfamiliar items, everything needs to go by Saturday — guessing on a Hummel figurine or an art nouveau lamp can mean leaving real money on the table.
>
> FindA.Sale includes Smart Pricing — it pulls recent sold comps so you can price with confidence instead of spending 20 minutes on eBay first.
>
> Your [Business Name] storefront is here whenever you're ready: **[preview link]**
>
> Free forever. No credit card needed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe link]

---

## Touch 4 — Day 21 — All non-claimers (break-up)

> **Subject:** Last note
>
> This is the last note we'll send about [Business Name] on FindA.Sale. We won't reach out again.
>
> If you ever want it, it's here whenever you're ready: **[preview link]**
>
> Your first sale is free on the full toolkit. No credit card needed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe link]

---

## Notes for Dev wiring

- Touch 2 fires only to records where Touch 1 `opened = false` at Day 4
- Touch 3 fires only to records where Touch 1 `opened = true AND clicked = false` at Day 9
- Touch 4 fires to all records where `claimed = false` at Day 21
- All four need `[physical address]` and `[unsubscribe link]` populated at send time (CAN-SPAM)
- Video links use source codes: T1 = `?src=outreach-a`, T2 = `?src=outreach-b`, T3 = `?src=outreach-c`, T4 = none (no video in T4)
- EU + QC records excluded at query time via SQL filter (see acquisition strategy §8.3)
- Send window: Tue–Thu 10am–2pm prospect-local time (default Eastern if no address)

## Anti-pattern checklist (verify before send)

- [ ] No "AI" anywhere — Smart Pricing, Auto Tags, not "AI Pricing"
- [ ] No fabricated stats ("thousands of organizers," "saves X hours")
- [ ] No single sale-type framing — body copy is inclusive by default
- [ ] No personal names on sender or sign-off
- [ ] Physical address present
- [ ] Unsubscribe link present and functional
- [ ] Subject lines: no ALL-CAPS, no exclamation marks, no emoji
