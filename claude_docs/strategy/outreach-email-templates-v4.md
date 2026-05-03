# Outreach Email Templates — v8 (S636)

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
> We built [Business Name] a free storefront on FindA.Sale — it puts you on the map before shoppers start searching, not after.
>
> Take a look: **[preview link]**
> 2-minute walkthrough: **[video link]**
>
> It's free to claim your page. No credit card needed.
>
> — The FindA.Sale Team
> [physical address] · [unsubscribe link]

---

## Touch 2 — Day 4 — Non-openers of Touch 1 only

> **Subject:** Most shoppers find a sale after it's over
>
> By the time the Facebook post goes up or the signs hit the corners, the best things are already gone. Most people find out too late.
>
> [Business Name] has a free page on FindA.Sale — it shows up before people start searching, not after the weekend wraps up. Takes about 30 seconds to claim.
>
> Take a look: **[preview link]**
> 2-minute walkthrough: **[video link]**
>
> No credit card needed.
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
> Four notes, no response — we get it. This is the last one.
>
> [Business Name]'s storefront stays live on FindA.Sale. If anything changes and you want to claim it, it's here whenever you're ready: **[preview link]**
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
