# SEO Content Generation Guide — ADR-075

## Overview
This directory contains SEO content entries for 500 guide pages:
- **Category A (250)**: "How to run a [sale type] in [city, state]"
- **Category B (250)**: "[city, state] [sale type] pricing guide"

## Files
- `index.json` — Complete index of all 500 entries
- `generate.js` — Node.js script to generate `index.json` from city/type combinations
- `[slug].ts` — Future: Individual entry files (optional, for debugging)

## Generation

### Option 1: Generate index.json from script
```bash
cd packages/frontend/data/seo-pages
node generate.js
```

### Option 2: Use within Next.js build
The `pages/guide/[slug].tsx` page reads `index.json` at build time:
```bash
cd packages/frontend
npm run build  # Triggers ISR generation
```

## Structure

### index.json entry format:
```json
{
  "slug": "how-to-run-estate-sale-chicago-il",
  "title": "How to Run a Estate Sale in Chicago, IL",
  "description": "...",
  "h1": "...",
  "type": "how-to" | "pricing-guide",
  "saleType": "estate sale|yard sale|garage sale|flea market|consignment sale",
  "city": "Chicago",
  "state": "IL",
  "metro": "Chicago, IL",
  "content": {
    "intro": "...",
    "sections": [
      { "heading": "...", "body": "..." },
      ...
    ],
    "cta": "..."
  },
  "metaTitle": "...",
  "metaDescription": "...",
  "updatedAt": "2026-05-01"
}
```

## Coverage

**50 Cities (alphabetical order)**:
- New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, Fort Worth, Columbus, Charlotte, Indianapolis, San Francisco, Seattle, Denver, Nashville, Oklahoma City, El Paso, Washington (DC), Boston, Portland, Memphis, Louisville, Baltimore, Milwaukee, Albuquerque, Tucson, Fresno, Sacramento, Mesa, Kansas City, Atlanta, Omaha, Colorado Springs, Raleigh, Long Beach, Virginia Beach, Minneapolis, Tampa, New Orleans, Arlington, Wichita, Cleveland, Bakersfield, Aurora, **Grand Rapids** (included for Michigan coverage)

**5 Sale Types** (per city):
- Estate sale
- Yard sale
- Garage sale
- Flea market
- Consignment sale

**Calculation**: 50 cities × 5 types × 2 content categories (how-to + pricing) = **500 total entries**

## Content Quality Notes

- All intro text is city-specific and mentions market dynamics
- Section headings reference the local city/market
- Body text includes market-specific pricing examples and buyer behavior patterns
- CTA is relevant to the guide type (list a sale vs. browse)
- Schema.org structured data included (HowTo or Article)
- Meta titles and descriptions are unique per entry
- Mobile responsive, dark mode compatible

## Performance Considerations

- **Build time**: All 500 slugs generated at build time via `getStaticPaths`
- **ISR revalidation**: 24 hours (86400 seconds)
- **Fallback**: 'blocking' — new slugs render SSG on first request, then cache
- **Page size**: ~15–20 KB per page (HTML + schema.org JSON-LD)
- **Sitemap**: All 500 URLs included in `server-sitemap.xml.tsx`

## Integration with Sitemap

`server-sitemap.xml.tsx` needs update to include all 500 guide URLs:
```tsx
const guideUrls = indexData.map(entry => ({
  loc: `${baseUrl}/guide/${entry.slug}`,
  lastmod: '2026-05-01',
  changefreq: 'weekly',
  priority: 0.7,
}));
```

## Testing

### Local development:
```bash
cd packages/frontend
npm run dev
# Navigate to http://localhost:3000/guide/how-to-run-estate-sale-chicago-il
```

### Production verification:
- Verify `/guide/[slug]` pages render correctly
- Check schema.org markup in DevTools (Ctrl+Shift+I → Network/Elements)
- Validate sitemap includes all 500 URLs
- Monitor build time for ISR performance

## Future Enhancements

1. Expand to additional cities (100+)
2. Seasonal content variations
3. Multi-language versions
4. Internal linking between related guides
5. User-generated content integration (real pricing from the market)
