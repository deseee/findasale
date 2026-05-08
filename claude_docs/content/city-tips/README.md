# City Tips Content

This directory contains hand-written, location-specific tips for estate sale hunting in major US cities.

## Format

Each file is named `{city-lowercase-hyphens}-{state-abbr-lowercase}.md` and contains Markdown-formatted content.

Example: `grand-rapids-mi.md`, `new-york-ny.md`, `austin-tx.md`

## Structure

Each tip file should include:

1. **H1 Header** — "Estate Hunting in [City], [State]"
2. **Introduction** — 2–3 sentences about the city's estate sale culture
3. **Neighborhood section** — Top neighborhoods for estate sales (if applicable)
4. **Seasonal patterns** — Peak and slow seasons
5. **Insider tips** — Local insights (dealer hotspots, collector interests, etc.)
6. **Closing** — Call-to-action to explore FindA.Sale

## Minimum Length

- **200+ words** for authenticity and SEO
- **Under 600 words** to keep page load fast and engagement high

## Writing Guidelines

- **Use "Auto", "Suggested", or direct data** — never use "AI" in copy (D-006 locked)
- **Use inclusive sale-type language** — "estate sales, yard sales, auctions, flea markets, and more"
- **Be conversational and local** — speak as someone who hunts estate sales in that city
- **Link to data** — reference actual top categories, neighborhoods, and seasonal trends from eBay sold data

## Status: Pending Freelance Writer Assignment

Patrick has queued the top ~20 metros for hand-written content. This directory is a placeholder awaiting assignment to a freelance writer pool.

For the full list of priority cities, see `claude_docs/strategy/s603-final-plan.md` "Content Strategy" section.

## Auto-Generated Fallback

For cities without hand-written tips (the long tail of 2,980+ cities), the frontend uses `packages/frontend/lib/city-tips-generator.ts` to automatically generate contextual tips based on:

- City population
- Top eBay categories in the past 30 days
- Regional seasonal patterns (Northern, Southern, Midwest, Western)

Auto-generated tips are cached and revalidated daily via ISR.

## How Lookup Works

1. Frontend requests city page `/city/[slug]`
2. `getStaticProps` looks for `{slug}.md` in this directory
3. If found: use hand-written tip content
4. If not found: fall back to auto-generated tip from template

No build-time rendering; tips are loaded at page generation time.
