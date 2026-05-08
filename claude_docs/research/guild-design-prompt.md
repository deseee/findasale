# Guild Design Prompt
*Use this prompt to generate a novel visual/UX design concept for the Explorer's Guild XP system.*

---

## HOW TO USE

Paste everything below the divider line into a fresh Claude conversation. Claude will produce a self-contained interactive HTML prototype you can open in a browser. No setup required.

---

## PROMPT START ↓

You are a world-class game designer and UI artist. Your job is to redesign the Explorer's Guild XP experience for FindA.Sale — a secondhand-sale discovery platform (estate sales, garage sales, auctions, flea markets). The current design is plain: card grids and data tables. You are going to replace that with something immersive, atmospheric, and visually stunning that makes shoppers feel like they're embarking on a real treasure-hunting journey.

---

## WHAT THE SYSTEM IS

**Explorer's Guild** is FindA.Sale's loyalty and progression system for shoppers. The metaphor is adventure + treasure hunting. Users earn XP by doing things they already love — attending sales, buying items, writing reviews, posting hauls, completing treasure trails at events, referring friends.

### Ranks (lowest → highest)
| Rank | Emoji | XP Required | Vibe |
|------|-------|-------------|------|
| Initiate | 🧭 | 0 | Just starting their journey |
| Scout | 🔍 | 500 | First milestones, first unlocks |
| Ranger | 🎯 | 2,000 | Serious hunter, real perks begin |
| Sage | ✨ | 5,000 | Expert collector, respected in the community |
| Grandmaster | 👑 | 12,000 | Mastery achieved — gets Hunt Pass free for life |

### Key features
- **Hunt Pass** ($4.99/mo): Premium multiplier pass. Gives 1.5x XP on everything, early access to rare items, golden avatar frame, leaderboard badge. Think Battle Pass meets hunter's license.
- **Treasure Trails**: Organizer-created multi-stop local adventures combining sales with neighborhood discovery (QR scans, geolocation check-ins, completion bonuses)
- **Seasonal Adventures**: Quarterly themes (Spring Awakening, Summer Exploration, Fall Collection, Winter Treasures) with leaderboards that reset every 3 months while ranks persist
- **XP Sinks**: XP is spendable currency — cosmetics, boosts, crew creation, coupon slots, organizer tools

### Sample XP values
- Sale visit: 5 XP (7 with Hunt Pass)
- Purchase: 10 XP (15 with Hunt Pass)
- Auction win: 20 XP (30 with Hunt Pass)
- Treasure Trail completion: 40–80 XP depending on stops
- 7-day streak: 100 XP (150 with Hunt Pass)
- Referral (friend buys): 500 XP (750 with Hunt Pass)
- Grandmaster reward: Free Hunt Pass for life

### Shopper archetypes
- **Bargain Hunter** 🔍 — visits + purchases
- **Quality Collector** 🎁 — high-value finds + haul posts
- **Social Connector** 🤝 — referrals + shares

---

## BRAND GUIDELINES (honor these, then go wild within them)

**Personality:** Warm, curious, adventurous, community-first. Not corporate, not cold. The vibe is a trusted local treasure-hunting partner.

**Color palette (canonical):**
- Primary action / XP / premium: **Purple** (`#7c3aed` / Tailwind `purple-600`)
- Brand warmth: **Warm tones** — cream, amber, deep brown (`warm-50` through `warm-900`)
- Growth / positive / CTA: **Sage green** (`sage-600` = approximately `#4d7c5f`)
- Hunt Pass accent: **Amber / gold** (conveys premium, trophy-like status)
- Dark mode: Full support. Background `gray-900`, surface `gray-800`

**Typography feel:** Clear, friendly, high readability. Adventure and warmth over corporate clean.

**Copy voice:** Enthusiastic without being forced. Celebrate the hunt. Reward the journey. "Treasure takes many forms." Do not use the word "AI." Use "Auto" or "Smart" instead.

---

## WHAT TO DESIGN

Build a **single self-contained interactive HTML file** that reimagines the Explorer's Guild as a truly immersive experience. You have full creative control over visual language, metaphors, layout, and interaction patterns — the only constraints are the brand colors above and the real system data provided.

### Design must include all of the following:

**1. The Rank Journey** — Make the five ranks feel like a real adventure path, not a table. Think:
- A visual map or trail showing the journey from Initiate to Grandmaster
- Each rank has its own distinct visual identity, color temperature, and atmosphere
- Animated or interactive rank "cards" that expand to show perks
- A glowing progress indicator for the user's current position

**2. XP Earn Menu** — Replace tables with something that feels alive:
- Group earn actions by archetype (Bargain Hunter, Quality Collector, Social Connector) not just category
- Each action should feel like a "quest" or "loot opportunity"
- Hunt Pass bonus should visually transform the XP — the 1.5x multiplier should feel like a power-up, not a footnote

**3. Hunt Pass Showcase** — Treat it like a premium artifact or hunter's license:
- Not a pricing card — more like a physical object (a scroll, a badge, a magic compass, a laminated pass)
- Show what it feels like to be a Hunt Pass holder vs. not
- Gold / amber aesthetic that feels earned and exclusive without being gatekeeping

**4. Seasonal Adventures** — The four seasons should feel immersive:
- Each season gets its own atmosphere (Spring = fresh discovery, Summer = exploration, Fall = curating, Winter = reflection + hauls)
- Show a current season "active adventure" state and how it resets without erasing rank

**5. XP Sinks (Spend Your XP)** — Frame spending XP as looting or crafting, not shopping:
- Cosmetics as collectibles
- Boosts as consumables
- Crew/Guild creation as a founding moment

**6. One "wow" interactive moment** — Choose something that would delight a first-time visitor. Ideas (pick one or invent something better):
- A live XP counter that animates as the user imagines doing actions
- A "path calculator" that shows how many sales you'd need to attend to reach the next rank
- A parallax rank map that shifts as you scroll
- A rank reveal animation when you click a rank card

### Stylistic direction (pick ONE of these or blend them — your call):
- **Option A: Dark Adventure** — Deep backgrounds, glowing rank badges, particle effects for XP gain, a feeling of campfire-and-map-table planning your next hunt
- **Option B: Warm Parchment** — Vintage treasure-map aesthetic, hand-drawn-feel borders, compass rose motifs, worn leather textures in CSS — but still modern and clean underneath
- **Option C: Modern RPG** — Clean dark UI with neon XP highlights, rank badges that feel like achievement medallions, progress bars that feel like health bars, a leaderboard that feels like a competitive scoreboard
- **Option D: Your Own Direction** — If you see a direction that's more evocative than these, take it. Justify in a comment at the top.

---

## OUTPUT REQUIREMENTS

- Single `.html` file, fully self-contained (no external dependencies except optionally a CDN font or icon set)
- Works in modern Chrome/Safari/Firefox
- Responsive — looks good on both desktop and mobile
- Dark mode by default (toggleable if you like)
- All real data from this prompt — no placeholder copy
- Smooth animations and transitions (CSS or vanilla JS, no React required)
- A comment at the top explaining your design direction and key creative decisions

Do NOT build a plain informational page. This is a marketing and engagement artifact. It should make someone want to start earning XP immediately.

---

## PROMPT END ↑
