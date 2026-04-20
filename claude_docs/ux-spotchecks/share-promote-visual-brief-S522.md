# Share & Promote — Visual Template Design Brief
Date: 2026-04-20 | Session: S522
For: Claude Design (prototype) → findasale-dev (build)

---

## What We're Building

Shareable image cards — like Canva templates but generated automatically from
sale/item data. An organizer hits "Share" on the promote page, picks a visual
theme, and gets a download-ready image. The image carries the FindA.Sale
watermark, sale info, and item photos. When it gets shared on Instagram,
Facebook, Nextdoor, or TikTok, it looks professional and makes FindA.Sale
look good by association.

Two card families:
1. **Sale Promo Cards** — for organizers promoting an upcoming or live sale
2. **Item Spotlight Cards** — for organizers (and shoppers) featuring a single item

---

## Sizes Needed

| Format | Dimensions | Used for |
|--------|-----------|---------|
| Square | 1080 × 1080px | Instagram feed, Facebook post |
| Landscape | 1200 × 630px | Facebook link preview, OG image |
| Story | 1080 × 1920px | Instagram/Facebook Stories, TikTok |
| Print flyer | 816 × 1056px (letter) | PDF download, physical posting |

---

## FindA.Sale Brand Reference

Primary: **amber-600 = #d97706**
Dark text: **warm-900 = #1c1009**
Light background: **warm-50 = #fdfaf7**
Secondary warm: **warm-400 = #c4a882**
White: #ffffff
Dark mode bg: **gray-900 = #111827**

Logo treatment: "FindA.Sale" wordmark in warm-900 or white depending on bg.
FindA.Sale watermark on item photos: semi-transparent white, bottom-right corner.

---

## Theme 1 — "Classic" (Free for all organizers)

**Vibe:** Clean, professional, trustworthy. Looks like a real estate company's
open house card. Not flashy but totally credible.

**Visual structure — Sale Promo (1080×1080):**
```
┌─────────────────────────────────────┐
│                                     │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← item photos in a 3-photo mosaic
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │    (3 largest item photos, if available)
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │    plain warm-50 bg if no photos
│                                     │
│  ╔═════════════════════════════╗   │
│  ║  ESTATE SALE                ║   │  ← sale type label in amber
│  ║                             ║   │
│  ║  Downtown Downsizing        ║   │  ← sale title, bold, dark
│  ║  Sale 17                    ║   │
│  ║                             ║   │
│  ║  Apr 24 – Apr 26, 2026     ║   │  ← dates
│  ║  123 Main St, Grand Rapids  ║   │  ← address
│  ║                             ║   │
│  ║  43 items available         ║   │  ← item count
│  ╚═════════════════════════════╝   │
│                                     │
│  finda.sale                   [QR] │  ← footer: domain + QR code
└─────────────────────────────────────┘
```

**Colors:**
- White card overlay on photo mosaic (card has slight transparency so photos bleed through edges)
- Amber top rule: 4px amber-600 line above card overlay
- Type: dark warm-900
- Sale type label: amber-600 pill tag
- Footer: warm-400 text on warm-50 bg

**Story format (1080×1920):** Same card, full-bleed photo as background with
dark overlay (50% black), white text on top, FindA.Sale logo top-right.

---

## Theme 2 — "Vintage" (Organizer SIMPLE+ tier)

**Vibe:** Warm, aged, like a found notice on a corkboard. Appeals to estate
sale and antique crowds emotionally. Feels like treasure-hunting, not shopping.

**Visual structure — Sale Promo (1080×1080):**
```
┌─────────────────────────────────────┐
│  ┌───────────────────────────────┐  │
│  │  ·  ·  ·  ESTATE SALE  ·  ·  │  │  ← dotted decorative rule, sepia
│  │                               │  │
│  │  ╭─────────────────────╮     │  │
│  │  │  [item photo 1]     │     │  │  ← single large item photo, slight
│  │  │  polaroid style     │     │  │    sepia tint + 2px white border
│  │  │  shadow underneath  │     │  │    like a polaroid print
│  │  ╰─────────────────────╯     │  │
│  │                               │  │
│  │  Downtown Downsizing Sale 17  │  │  ← serif font (Georgia or similar)
│  │  ────────────────────────     │  │
│  │  Apr 24–26 · Grand Rapids     │  │
│  │  123 Main St                  │  │
│  │                               │  │
│  │  43 pieces available          │  │
│  │                               │  │
│  │  Browse at finda.sale   [QR]  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Colors:**
- Background: warm cream #f5ede0 (aged paper)
- Outer border: rough/textured amber frame effect
- Text: sepia warm-900 #2d1a0e
- Accent rules: amber-600 thin lines
- Item photo: slight sepia overlay (CSS filter: sepia(20%) warm(10%))
- Font: serif (Georgia, or loaded web font like Playfair Display)

**Story format:** full-bleed cream bg, single tall item photo at top half,
info text below. Feels like an old newspaper announcement.

---

## Theme 3 — "Bold" (Organizer PRO+ tier)

**Vibe:** High-contrast, editorial, modern. Feels like a design studio made it.
Confident and premium. Appeals to higher-end estate sales and curated vintage.

**Visual structure — Sale Promo (1080×1080):**
```
┌─────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← deep charcoal background #1a1a2e
│▓                                   ▓│
│▓  ┌─────────────────────────────┐  ▓│
│▓  │░░░░ item photo mosaic ░░░░░│  ▓│  ← 2-photo split or single full bleed
│▓  │░░░░ high contrast tones ░░░│  ▓│    with vibrance boost
│▓  └─────────────────────────────┘  ▓│
│▓                                   ▓│
│▓  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ▓│  ← thick amber-600 rule
│▓                                   ▓│
│▓  DOWNTOWN DOWNSIZING SALE 17   ▓│  ← all-caps, white, bold sans
│▓                                   ▓│
│▓  APR 24 – 26, 2026              ▓│  ← spaced caps, amber-400
│▓  123 MAIN ST · GRAND RAPIDS     ▓│
│▓                                   ▓│
│▓  43 ITEMS · ESTATE SALE         ▓│  ← amber-600 dots as separators
│▓                                   ▓│
│▓  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ▓│
│▓                                   ▓│
│▓  FINDA.SALE               [QR]  ▓│  ← white wordmark, amber QR border
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────┘
```

**Colors:**
- Background: deep charcoal #1a1a2e or warm-900 #1c1009
- Primary text: pure white
- Accent: amber-600 #d97706
- Photo treatment: slight contrast/saturation boost, not filtered
- Dividers: amber-600 horizontal rules, 2px
- Font: heavy sans-serif (Inter Black, or loaded font like Space Grotesk Bold)

---

## Theme 4 — "Branded" (Organizer PRO tier — uses Brand Kit)

**Vibe:** Their brand, their colors. Looks like their business made it.

Same layout as "Bold" but replaces:
- charcoal bg → `organizer.brandPrimaryColor`
- amber accents → `organizer.brandSecondaryColor` (or amber if not set)
- organizer logo appears top-left (from `brandLogoUrl`)
- font → `brandFontFamily` if set
- FindA.Sale watermark stays (small, bottom-right) — this is non-negotiable

---

## Theme 5 — "Photo Full-Bleed" (Shopper XP unlock — 500 XP)

**Vibe:** The item photo IS the card. Stunning for high-quality finds.
Most shareable format for Instagram and TikTok.

**Visual structure:**
```
┌─────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░ item photo fills entire card ░░░│  ← full bleed, no crop
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│                                     │
│████████████████████████████████████│  ← gradient overlay bottom 40%
│                                     │    (black transparent → black 80%)
│  VICTORIAN WRITING DESK            │  ← item name, white, large bold
│  $285 · Grand Rapids Estate Sale   │  ← price + sale name, white smaller
│                                     │
│  📍 Apr 24–26  finda.sale    [QR] │  ← footer row
└─────────────────────────────────────┘
```

**For sale promo variant:** 3-photo mosaic fills the card instead of single item.

---

## Item Spotlight Cards (Both organizer + shopper)

Same themes as above, but for a single item. The card shows:
- Item photo (primary)
- Item title
- Price
- Sale name + dates (smaller)
- FindA.Sale watermark bottom-right
- "Available at finda.sale" CTA

**Haul post variant (XP unlock — 500 XP):**
Shows 4–6 items in a grid (items from a sale), with a "Finds from {sale name}"
header. Collage-style, like an Instagram grid post. Any user can generate this —
organizers use it to showcase their best inventory, buyers use it after a haul.

---

## QR Code Treatment

Every card includes a QR code that goes to the sale URL (`finda.sale/sales/{id}`).
QR code is small (80–100px), bottom-right, white on transparent rounded square bg.
Not intrusive but scannable.

---

## Watermark Rules

FindA.Sale watermark on item photos within cards:
- Semi-transparent white, 30% opacity
- Bottom-right of each item photo
- "FindA.Sale" in the standard wordmark font
- Never covering the main subject of the photo (auto-positioned to avoid center mass)
- Cannot be removed or hidden — applies to all themes including branded

---

## How Cards are Generated (Technical)

Recommended approach: **Next.js `/api/og` route using Satori**
- Satori converts JSX → SVG → PNG server-side (no browser needed)
- Works as an API endpoint: `GET /api/share-card?saleId=xxx&theme=bold&format=square`
- Returns PNG download
- Can generate all 4 sizes from one template definition
- No new npm packages needed — `@vercel/og` (already available in Next.js) wraps Satori

Fallback: Client-side `html2canvas` — heavier, but works without server changes.

**Architect decision needed:** Satori (server route) vs html2canvas (client-side).
Satori produces better quality and is more reliable on mobile.
html2canvas requires no backend changes.

---

## Unlock Gates

One XP pool. Organizers and shoppers are the same users — `guildXp` on the User
model. Organizers are the primary spenders here since they're doing the sharing.
XP values below are proposals for findasale-gamedesign to tune.

| Theme | XP Cost | Notes |
|-------|---------|-------|
| Classic | 0 XP (free) | Available to all users |
| Vintage | 500 XP | Permanent unlock — applies to all future sales |
| Bold | 1,500 XP | Permanent unlock |
| Branded | 2,500 XP | Also requires Brand Kit colors/logo to be set up |
| Photo Full-Bleed | 1,000 XP | Sale promo + item cards |
| Haul post collage | 500 XP | Multi-item grid card |

Unlocks are **permanent per user** — spend once, use forever on any sale.
Locked themes show a dimmed live preview with XP cost badge to create desire.

---

## For Claude Design

Prompt to use:
"Design shareable social media card templates for FindA.Sale, a platform for
estate sales and yard sales. I need 3 visual theme variants for a 1080×1080
square card:

1. CLASSIC — clean white card with 3-item photo mosaic at top, amber-600
   (#d97706) accent lines, sale title + dates + address + item count, QR code
   bottom-right, 'finda.sale' wordmark in footer. Feels like a professional
   open house notice.

2. VINTAGE — warm cream (#f5ede0) background, single item photo in a polaroid
   style (white border, slight sepia tint), serif font (Playfair Display or
   Georgia), thin amber decorative rules, aged-paper aesthetic. Feels like
   an antique store announcement.

3. BOLD — deep charcoal (#1a1a2e) background, high-contrast item photos,
   thick amber-600 horizontal rules, all-caps white title text, heavy sans
   font (Space Grotesk Bold). Feels editorial and modern.

All three include: sale title, date range, address, item count, 'finda.sale'
wordmark, small QR code. The watermark 'FindA.Sale' appears subtly on each
item photo.

Show all three side-by-side at 1080×1080. Also show the BOLD theme in
1080×1920 story format."

---

## Screens Needed on the Share & Promote Page

The redesigned promote page (from the S522 brief) gets a "Download Card" section:

```
┌─────────────────────────────────────────────────┐
│  Share Card                                     │
│  Download a ready-to-post image for social      │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │          │  │          │  │   🔒     │     │
│  │ CLASSIC  │  │ VINTAGE  │  │  BOLD    │     │
│  │ preview  │  │ preview  │  │  PRO+    │     │
│  │          │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                  │
│  Format: [Square] [Story] [Landscape] [Flyer]   │
│                                                  │
│  [⬇ Download Image]  [Copy Link Instead]        │
└─────────────────────────────────────────────────┘
```

Theme cards are small live previews (populated with real sale data).
Locked themes show a dimmed preview with tier badge.
Format selector switches aspect ratio.
Download generates the PNG via the API route.
