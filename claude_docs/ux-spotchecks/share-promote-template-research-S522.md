# Share & Promote — Platform Research + Template Spec
Date: 2026-04-20 | Session: S522
Status: Ready for dev + game design input on XP system

---

## Research Summary: What's Wrong with Current Templates

| Platform | Critical Issue | Impact |
|----------|---------------|--------|
| Facebook | Too many hashtags (7+), weak CTA, no sale link | Low reach, looks spammy |
| Nextdoor | Missing finda.sale link, "familiar faces" ending too vague | Misses conversion |
| Threads | `${sale.title} items` produces broken text ("Downsizing Sale 17 items") | Looks broken |
| Instagram | Shared tab with Facebook — different best practices, needs its own template | Wrong optimization |
| Pinterest | Hashtag-heavy when keywords matter more, first 50 chars wasted | Poor SEO/discovery |
| TikTok | Too many hashtags, caption too long for engagement | 21% lower engagement |
| WhatsApp | Decent but misses link preview opportunity | Underperforms |
| Email | "Hello Friend" opener, generic bullet list | Low open → attend rate |
| Flyer | Solid structure, needs polish | Minor |
| Neighborhood | Uses `**bold**` markdown — renders as literal asterisks on Facebook | Looks broken |

---

## Platform-by-Platform Research + Corrected Templates

All templates use these variables:
- `{title}` = sale.title
- `{city}` = sale.city  
- `{state}` = sale.state
- `{address}` = full address
- `{startDate}` = formatted start (e.g., "Apr 24")
- `{endDate}` = formatted end with year (e.g., "Apr 26, 2026")
- `{fullStartDate}` = "Friday, April 24, 2026"
- `{fullEndDate}` = "Sunday, April 26, 2026"
- `{itemCount}` = number of published items (or "dozens of")
- `{saleUrl}` = full finda.sale URL for this sale
- `{saleType}` = "estate sale" / "yard sale" / etc.
- `{hashtags}` = type-specific hashtag set (see below)

---

### 1. Facebook Groups Post

**Platform research:**
- Optimal length: **40–80 characters** shown before fold; key info in first 150 chars
- Hashtags: **3–5 max** — hashtags don't drive reach on Facebook; avoid looking spammy
- Best posting time: Thursday–Friday before a weekend sale, 1–2 days out
- Groups posts outperform Page posts for local events
- Include the sale link — Facebook generates a link preview that shows the sale photo
- State payment methods if known (cash, cards, etc.)

**Problems with current template:**
- 7 hashtags at the end looks like spam
- No sale link (massive miss — finda.sale preview would show sale photos)
- "Don't miss out! Visit us today." is weak
- Emojis buried in middle of body vs. used sparingly as anchors

**Standard template (free):**
```
{title} — {saleType} in {city}

📅 {startDate}–{endDate}
📍 {address}

{itemCount} items available: furniture, collectibles, household goods, and more. Early arrival recommended — first come, first served.

Browse everything online before you come: {saleUrl}

#{citySlug}sale #{saleTypeSlug} #findasale
```

**Story template (XP unlock / SIMPLE+):**
```
Big sale this weekend in {city} 👋

We're clearing out {itemCount} items from {title} — furniture, vintage finds, collectibles, and everyday household goods you actually need.

📍 {address}
📅 {startDate} – {endDate}

See everything before you go (photos included): {saleUrl}

#{citySlug}sale #findasale
```

**Hype template (XP unlock / PRO+):**
```
🏷️ {title} — starting {startDate}

{itemCount} items. One weekend. {address}, {city}.

Furniture. Antiques. Collectibles. Everything must go — and everything is priced to sell.

Don't wait for Sunday. The good stuff goes fast.

👉 Full item list + photos: {saleUrl}

#{citySlug}yardsale #{saleTypeSlug} #findasale
```

---

### 2. Nextdoor

**Platform research:**
- **No hashtags** — Nextdoor does not use hashtag discovery; they read as spam
- Neighbor-to-neighbor tone is correct and effective
- Short and specific: exact address, exact dates
- Photos matter — Nextdoor shows a single image with the post
- Personal sign-off builds trust
- Include the link — Nextdoor generates a preview

**Problems with current template:**
- No finda.sale link (biggest miss)
- "Hope to see some familiar faces!" is warm but adds no info
- Generic item types — "furniture, household goods, collectibles" (fine but can be better)

**Standard template (free):**
```
Neighbors — {title} is happening {startDate}–{endDate} at {address}, {city}.

{saleType.cap} open to the public. {itemCount} items available.

Browse everything ahead of time at: {saleUrl}

Early arrival recommended — items go fast!
```

**Story template (XP unlock / SIMPLE+):**
```
Hi neighbors!

We're holding a {saleType} at {address} from {startDate} through {endDate}.

There are {itemCount} items listed with photos — furniture, collectibles, household goods, and plenty of surprises. Everything is priced to sell.

You can browse before you come: {saleUrl}

Hope to see some of you there!
```

**Hype template (XP unlock / PRO+):**
```
Sale alert for {city} neighbors 📣

{title} — {startDate} through {endDate}
{address}

{itemCount} items are listed online with photos right now. Prices are real and things are moving.

Take a look before Saturday: {saleUrl}

See you there!
```

---

### 3. Instagram

**Platform research:**
- Caption truncates at **~125 characters** before "more" — hook must be in first line
- Optimal caption: **150–300 characters total** for most posts; carousels can go longer
- Hashtags: **3–5 niche-specific** at end (or first comment) — algorithm now prioritizes keyword-rich captions over hashtags
- No clickable links in captions — direct to "link in bio" (organizer's profile)
- Emojis used as visual line breaks
- First line is the hook — question, bold statement, or number

**Problems with current template:**
- Shared with Facebook — Instagram needs a different first line (hook-first)
- Too many hashtags (7+)
- Doesn't acknowledge the bio link limitation

**Standard template (free):**
```
{itemCount} items. One sale. This weekend only.

{title} — {saleType} in {city}
📅 {startDate}–{endDate} | 📍 {address}

Link to browse everything in bio 👆

#{citySlug}sale #{saleTypeSlug} #thrifting #findasale
```

**Story template (XP unlock / SIMPLE+):**
```
Something for everyone at {title} this weekend ✨

{itemCount} items — furniture, vintage, collectibles, and more. All listed with photos at finda.sale.

📍 {address}, {city}
📅 {startDate}–{endDate}

Link in bio to browse before you go.

#{saleTypeSlug} #{citySlug}thrift #secondhand #findasale
```

**Hype template (XP unlock / PRO+):**
```
The good stuff always goes first. 🏷️

{title} in {city} — {itemCount} items dropping {startDate}.

We're talking real furniture, real vintage, real prices.

📍 {address} | 📅 {startDate}–{endDate}
Browse it all in bio before you go.

#{citySlug}sale #estatesalefinds #thriftedtreasures #findasale
```

---

### 4. WhatsApp

**Platform research:**
- **Ultra-short** is best — WhatsApp messages are read like texts
- Lead with the link — WhatsApp generates a rich link preview with the sale's cover photo
- The preview does most of the work; the text just needs to set context
- 2–3 sentences max; anything longer gets skipped
- No hashtags (WhatsApp doesn't use them)
- On mobile: `wa.me/?text=` opens WhatsApp directly

**Problems with current template:**
- Decent length but front-loads the name/dates rather than the link
- Moving the link first would trigger a richer preview

**Standard template (free):**
```
{saleUrl}

{title} — {saleType} in {city}, {startDate}–{endDate}. {itemCount} items with photos. Come take a look!
```

**Story template (XP unlock / SIMPLE+):**
```
{saleUrl}

Hey! I'm running a {saleType} in {city} this weekend — {startDate} through {endDate} at {address}. {itemCount} items listed with photos, all priced to go. Would love to see you there!
```

**Hype template (XP unlock / PRO+):**
```
{saleUrl}

{title} — {city}, {startDate}–{endDate}. {itemCount} items, real prices, everything goes. Photos online now. Pass it on! 🏷️
```

---

### 5. Threads

**Platform research:**
- **500 character limit** per post
- **1–2 hashtags only** — Threads is conversation-first, not hashtag-driven
- Conversational, natural tone performs much better than promotional
- Front-load the most interesting thing about the sale (not the name)
- Links work but no rich preview like Facebook
- Authenticity > polish on Threads

**Problems with current template:**
- `"Lots of ${sale.title} items"` → produces broken text like "Lots of Downtown Downsizing Sale 17 items" — **critical bug**
- Ends without a link
- Too promotional-sounding for Threads

**Standard template (free):**
```
Running a {saleType} this weekend in {city} — {title}

{itemCount} items: furniture, vintage pieces, collectibles, and more. Everything must go, everything is priced to sell.

📍 {address} · {startDate}–{endDate}
Browse the full list: {saleUrl}

#{saleTypeSlug} #findasale
```

**Story template (XP unlock / SIMPLE+):**
```
Holding a {saleType} in {city} this {startDate} and wanted to post it here before the weekend

{itemCount} items, all listed with photos. Furniture, collectibles, some vintage pieces — real stuff, not junk. Prices are actually reasonable.

{saleUrl} if you want to look before you show up.

#{citySlug}sale
```

**Hype template (XP unlock / PRO+):**
```
{city} people — {saleType} this weekend that's actually worth going to

{title} · {address}
{startDate}–{endDate} · {itemCount} items listed

The good pieces will be gone by 9am Saturday. Just saying.

{saleUrl}
```

---

### 6. Email Invite

**Platform research:**
- Subject line is everything — personalized subjects increase open rates by 26%
- Urgency + specificity in subject: include dates, avoid "Big Sale!"
- Body: **plain text performs comparably to HTML** for personal-feeling emails
- Include a prominent link (not buried at bottom)
- Personal sign-off builds credibility
- Bullet lists work well for email — scannable

**Problems with current template:**
- Subject: "You're invited to {title} — Limited time sale!" — "Limited time" is spam-triggering language
- "Hello Friend" — too generic, impersonal
- "Why shop with us?" section sounds like a chain store ad, not a person
- No finda.sale link prominently placed

**Standard template (free):**
```
SUBJECT: {title} — {startDate}–{endDate} in {city}

---

Hi there,

I'm holding a {saleType} and wanted to make sure you heard about it:

{title}
📅 {fullStartDate} through {fullEndDate}
📍 {address}, {city}, {state}
🕐 [Your Hours]

{itemCount} items are listed online with photos right now:
{saleUrl}

Highlights include furniture, collectibles, household goods, and more. First-come, first-served on the best pieces.

Hope to see you there!

[Your Name]
```

**Story template (XP unlock / SIMPLE+):**
```
SUBJECT: We're having a {saleType} — {startDate}–{endDate}, {city}

---

Hi [Name],

I'm excited to share that {title} is happening this {startDate} through {endDate}.

When: {fullStartDate} – {fullEndDate} · [Your Hours]
Where: {address}, {city}, {state}

We've got {itemCount} items listed with photos at the link below — browse before you come so you know what to look for:
👉 {saleUrl}

Whether you're hunting for furniture, vintage finds, or just a good deal, there's something here for you.

First come, first served — early arrival is always worth it.

See you there!
[Your Name]
```

**Hype template (XP unlock / PRO+):**
```
SUBJECT: Don't miss {title} — {startDate}–{endDate}

---

Hi [Name],

Quick heads up: {title} starts {startDate} and {itemCount} items are already listed online.

📍 {address}, {city} · {fullStartDate}–{fullEndDate} · [Your Hours]

Take a look before the weekend: {saleUrl}

You'll find furniture, collectibles, vintage pieces, and household goods — all priced to move. The best items go early, so plan accordingly.

Hope to see you!
[Your Name]
```

---

### 7. Flyer Copy

**Platform research:**
- Print flyers: large headline, minimal body text, phone number/address prominent
- Digital flyers (shared as image): same rules, but can include QR code
- Key info must be legible at a glance: WHO, WHAT, WHEN, WHERE
- Price expectations set traffic ("All items $1–$50" brings different crowd than "High-end antiques")
- "Everything Must Go" consistently outperforms generic headlines for estate/yard sales

**Problems with current template:**
- `${sale.description.substring(0, 60)}...` — truncated descriptions look unprofessional
- Brackets like `[Your Phone]` are fine (placeholder), but layout could be better
- "DON'T MISS THIS OPPORTUNITY!" is dated copywriting

**Standard template (free):**
```
{title.upper}

{saleType.upper} OPEN TO THE PUBLIC

📅 {fullStartDate}
   through {fullEndDate}

📍 {address}
   {city}, {state} {zip}

🕐 Hours: [Your Hours]

WHAT'S AVAILABLE:
• {itemCount}+ items
• Furniture & home goods
• Collectibles & antiques
• Tools, decor, and more

Browse all items with photos:
finda.sale (search {city})

Cash & cards accepted · All sales final
Questions: [Phone] · [Email]
```

**Story template (XP unlock / SIMPLE+):**
```
EVERYTHING MUST GO

{title}
{saleType} · {city}, {state}

📅 {startDate}–{endDate}
📍 {address}
🕐 [Your Hours]

{itemCount}+ items listed with photos online
Browse ahead: {saleUrl}

—— HIGHLIGHTS ——
Furniture · Collectibles · Vintage
Household Goods · [Add your specialties]

All items priced to sell. First come, first served.
[Phone] | [Email]
```

**Hype template (XP unlock / PRO+):**
```
ONE SALE. ONE WEEKEND. EVERYTHING GOES.

{title}
{city}, {state}

{startDate.upper} – {endDate.upper}
{address}
[Your Hours]

Browse {itemCount}+ items before you arrive:
{saleUrl}

FURNITURE · ANTIQUES · COLLECTIBLES
VINTAGE · HOUSEHOLD · AND MORE

Cash & cards accepted
Early arrivals get first pick
[Phone] | [Email]
```

---

### 8. Pinterest

**Platform research:**
- **Pin title:** 100 chars max; shown in feed — must be keyword-rich
- **Pin description:** 500 chars max; first **50–60 characters** shown before fold — front-load keywords
- Optimal description length: **220–250 characters** (not the full 500)
- **Keywords > hashtags** for Pinterest SEO — algorithm prioritizes descriptive text
- Limit hashtags to **2–5**
- Write like a helpful blog summary, not a social post
- Pinterest skews toward search/discovery, not social sharing — think "how would someone search for this?"

**Problems with current template:**
- Starts with sale name not keywords — first 50 chars are wasted on the title
- Hashtag-heavy when keywords in body matter more
- Description is longer than the 220-250 optimal range

**Standard template (free):**
```
TITLE: {saleType.cap} in {city}, {state} — {title}

DESCRIPTION:
{city} {saleType} with {itemCount} items — furniture, vintage collectibles, antiques, and household goods. Browse the full inventory with photos online at FindA.Sale before you visit.

📅 {startDate}–{endDate} · 📍 {address}, {city}, {state}

{saleUrl}

#{saleTypeSlug} #findasale
```

**Story template (XP unlock / SIMPLE+):**
```
TITLE: {title} — {saleType.cap} in {city} | {startDate}–{endDate}

DESCRIPTION:
Discover unique furniture, antiques, collectibles, and vintage finds at this {city} {saleType}. {itemCount} items available with photos — browse online before visiting. Curated pieces from {startDate} through {endDate}.

📍 {address}, {city} · {saleUrl}

#{citySlug}sale #{saleTypeSlug} #vintagefinds #findasale
```

**Hype template (XP unlock / PRO+):**
```
TITLE: Don't Miss This {city} {saleType.cap} — {itemCount} Items, {startDate}

DESCRIPTION:
One-of-a-kind {saleType} in {city} featuring {itemCount} items: vintage furniture, antiques, collectibles, and more. Every piece is photographed and listed online. Shop in person or browse first at FindA.Sale.

{startDate}–{endDate} · {address}, {city}, {state} · {saleUrl}

#{saleTypeSlug} #estatesalefinds #antiquehunting #findasale
```

---

### 9. TikTok

**Platform research:**
- Caption limit: **4,000 chars** but only **55–70 chars** shown before "See more"
- Videos with captions under **150 chars** generate 21% higher engagement
- Hashtags: **3–5 max** for optimal reach — mix 1 broad + 2 niche
- First line is the hook — must create curiosity or urgency
- Tone: informal, first-person, like a friend texting
- "haul" language is authentically TikTok and still performs well for resale/thrift content
- Include location-specific hashtag (e.g., #grandrapidsthrift)

**Problems with current template:**
- 6+ hashtags — research says 3–5 max
- Caption is 220+ chars — well above the 150-char engagement sweet spot
- Location hashtag is `#${sale.city.toLowerCase().replace(/\s/g, '')}thrift` — correct approach

**Standard template (free):**
```
{saleType} alert in {city} — {title} 🏷️

📍 {address}
📅 {startDate}–{endDate}
🔗 Link in bio → finda.sale

#{saleTypeSlug} #{citySlug}thrift #findasale
```

**Story template (XP unlock / SIMPLE+):**
```
If you're into {saleType}s, this is your weekend

{title} in {city} — {itemCount} items, all listed with photos
📍 {address} · {startDate}–{endDate}
Browse it before you go → link in bio

#{saleTypeSlug} #thrifthaul #{citySlug}thrift
```

**Hype template (XP unlock / PRO+):**
```
POV: you show up early to {title} and it's exactly as good as the listing said 🏷️

{city} · {startDate}–{endDate} · {itemCount} items
Full list with photos → link in bio (finda.sale)

#thriftfinds #{saleTypeSlug} #{citySlug}thrift
```

---

### 10. Neighborhood Post (Facebook Groups — "Community" style)

**Platform research:**
- Local buy/sell/trade groups and neighborhood groups are the #1 driver of foot traffic for yard/estate sales
- Format: conversational, not promotional — "I'm holding" not "We invite you to"
- List specific items (3–5 callouts) to trigger specific buyers
- **Remove `**bold**` markdown** — renders as literal asterisks on Facebook; use ALL CAPS or dashes instead
- Payment method callout drives click → attend conversions
- Post Thursday–Friday for a weekend sale, 1–2 days out

**Problems with current template:**
- `**bold**` markdown renders as literal asterisks on Facebook — critical bug
- "Hey neighbors! 👋" opener is fine but slightly generic
- Missing the finda.sale link (consistent miss across templates)

**Standard template (free):**
```
Hey neighbors! 👋

Heads up about a {saleType} happening in our area:

{title}

Running {fullStartDate} through {fullEndDate}.

📍 Location: {address}, {city}

{itemCount} items available with photos — furniture, household goods, collectibles, and more.

See everything at: {saleUrl}

Cash and cards accepted. Let me know if you have questions!
```

**Story template (XP unlock / SIMPLE+):**
```
Hi everyone!

Wanted to let you know about {title} — a {saleType} happening this {startDate}–{endDate} right here in {city}.

📍 {address}
📅 {fullStartDate} – {fullEndDate}

There are {itemCount} items listed with photos online, so you can browse before you come:
{saleUrl}

Highlights: furniture, vintage pieces, collectibles, and household goods. {sale.tags ? `They specialize in ${sale.tags.join(', ')}.` : ''}

Early arrival is always worth it — the best stuff goes fast. Let me know if you plan to stop by! 🛍️
```

---

## Hashtag Sets by Sale Type

Current `getHashtagsForSaleType()` function — CORRECTED. Max 3 hashtags per set.

```
ESTATE:       #estatesale #antiquehunting #findasale
YARD:         #yardsale #thrifting #findasale
AUCTION:      #auction #antiquehunting #findasale
FLEA_MARKET:  #fleamarket #thriftfinds #findasale
CONSIGNMENT:  #consignment #thrifting #findasale
CHARITY:      #charitysale #thrifting #findasale
CORPORATE:    #businesssale #officefurniture #findasale
default:      #garagesale #thrifting #findasale
```

**Removed:** #Bargains, #ShoppingLocal, #LocalSales — too generic, not searchable
**Added:** City-slug hashtags generated per template from `sale.city`

---

## XP Template Unlock System

### Concept

Organizers earn XP through sale activity. They spend XP to unlock premium template variants that produce better-performing posts — and since these posts carry FindA.Sale watermarks and links, better posts = more brand exposure.

### Tier Structure

One XP pool — organizers and shoppers share `guildXp` on the User model.
Organizers are the primary template spenders. XP values are proposals for
findasale-gamedesign to tune.

| Tier | XP Cost | Notes |
|------|---------|-------|
| Standard | 0 (free) | All users |
| Story | 500 XP | Permanent unlock per user |
| Hype | 1,500 XP | Permanent unlock per user |

### UI Treatment

Each platform tile shows 3 template variant buttons:
```
[Standard]  [Story 🔒 500 XP]  [Hype 🔒 1,500 XP]
```

Locked variants show a preview of the first line (creates desire).
When unlocked, the variant becomes the tile's default with a subtle badge.

XP balance shown in the page hero: "You have 820 XP available"

Tier-based organizers (SIMPLE/PRO/TEAMS) see variants unlocked automatically
with a "Included in your plan" badge instead of XP cost.

### What Needs Game Design Input
- Exact XP values for organizer actions (above are proposals)
- Whether XP unlocks are permanent or per-sale
- Whether TEAMS can share unlocked templates across workspace members
- Whether unlocked variants appear on future sales automatically

---

## Critical Bugs to Fix (in current templates)

1. **Threads "sale.title items" bug** — `Lots of ${sale.title} items` produces nonsense
2. **Neighborhood Post `**bold**`** — renders as literal asterisks on Facebook
3. **No finda.sale link** in Nextdoor, Neighborhood Post, Instagram, and Threads templates
4. **Hashtag overload** — Facebook (7+), TikTok (6+) — all need reduction

---

## Dev Implementation Notes

Template tiers are stored as a constant object per platform:
```ts
type TemplateTier = 'standard' | 'story' | 'hype';

const TEMPLATE_XP_COST: Record<TemplateTier, number> = {
  standard: 0,
  story: 500,
  hype: 1500,
};
```

Tier availability check:
```ts
function canUseTemplate(tier: TemplateTier, organizerXP: number, planTier: string): boolean {
  if (tier === 'standard') return true;
  if (tier === 'story') return organizerXP >= 500 || ['SIMPLE','PRO','TEAMS'].includes(planTier);
  if (tier === 'hype') return organizerXP >= 1500 || ['PRO','TEAMS'].includes(planTier);
  return false;
}
```

XP balance source: `user.guildXp` — same field used for shopper XP. No schema change needed.
XP spend mechanic (deducting on unlock) needs a backend route — flag for Architect.

Template variant selection state: `useState<TemplateTier>('standard')` per platform.
Selected tier persists in localStorage so organizers don't re-select every visit.
