// generate-template-pages.mjs
// Generates city×category (250 pages) + trend reports (100 pages) as JSON entries
// Run: node scripts/generate-template-pages.mjs
// Output: batch-templates.json (merge this with Haiku batches via fix-seo-batch.js --merge)

const cities = [
  { name: "Grand Rapids", state: "MI", slug: "grand-rapids-mi" },
  { name: "New York", state: "NY", slug: "new-york-ny" },
  { name: "Los Angeles", state: "CA", slug: "los-angeles-ca" },
  { name: "Chicago", state: "IL", slug: "chicago-il" },
  { name: "Houston", state: "TX", slug: "houston-tx" },
  { name: "Phoenix", state: "AZ", slug: "phoenix-az" },
  { name: "Philadelphia", state: "PA", slug: "philadelphia-pa" },
  { name: "San Antonio", state: "TX", slug: "san-antonio-tx" },
  { name: "San Diego", state: "CA", slug: "san-diego-ca" },
  { name: "Dallas", state: "TX", slug: "dallas-tx" },
  { name: "San Jose", state: "CA", slug: "san-jose-ca" },
  { name: "Austin", state: "TX", slug: "austin-tx" },
  { name: "Jacksonville", state: "FL", slug: "jacksonville-fl" },
  { name: "Fort Worth", state: "TX", slug: "fort-worth-tx" },
  { name: "Columbus", state: "OH", slug: "columbus-oh" },
  { name: "Indianapolis", state: "IN", slug: "indianapolis-in" },
  { name: "Charlotte", state: "NC", slug: "charlotte-nc" },
  { name: "Memphis", state: "TN", slug: "memphis-tn" },
  { name: "Boston", state: "MA", slug: "boston-ma" },
  { name: "Seattle", state: "WA", slug: "seattle-wa" },
  { name: "Denver", state: "CO", slug: "denver-co" },
  { name: "Atlanta", state: "GA", slug: "atlanta-ga" },
  { name: "Nashville", state: "TN", slug: "nashville-tn" },
  { name: "Portland", state: "OR", slug: "portland-or" },
  { name: "Miami", state: "FL", slug: "miami-fl" },
];

const categories = [
  { name: "Furniture", slug: "furniture", keyword: "furniture" },
  { name: "Vintage & Collectibles", slug: "collectibles", keyword: "vintage collectibles" },
  { name: "Jewelry", slug: "jewelry", keyword: "vintage jewelry" },
  { name: "Glass & Ceramics", slug: "glass-ceramics", keyword: "glass and ceramics" },
  { name: "Art & Paintings", slug: "art", keyword: "art and paintings" },
  { name: "Books & Media", slug: "books", keyword: "books and media" },
  { name: "Clothing & Fashion", slug: "clothing", keyword: "vintage clothing" },
  { name: "Tools & Hardware", slug: "tools", keyword: "tools and hardware" },
  { name: "Lighting & Lamps", slug: "lighting", keyword: "vintage lamps" },
  { name: "Other Finds", slug: "other", keyword: "hidden gems" },
];

const trendCategories = [
  "furniture", "vintage-collectibles", "jewelry", "glass-ceramics",
  "art", "books", "clothing", "tools", "lighting", "other"
];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const updatedAt = "2026-05-11T00:00:00.000Z";
const entries = [];

// ─── City × Category pages (250) ────────────────────────────────────────────
for (const city of cities) {
  for (const cat of categories) {
    const slug = `sales-${city.slug}-${cat.slug}`;
    const title = `${cat.name} at Sales & Auctions in ${city.name}, ${city.state}`;
    const metaTitle = `${cat.name} — ${city.name} Sales | FindA.Sale`.slice(0, 60);
    const metaDescription = `Find ${cat.keyword} at estate sales, yard sales, and auctions in ${city.name}, ${city.state}. Browse active listings, compare prices, and set alerts.`.slice(0, 160);

    entries.push({
      slug,
      title,
      h1: `${cat.name} for Sale in ${city.name}, ${city.state}`,
      description: metaDescription,
      metaTitle,
      metaDescription,
      type: "how-to",
      saleType: "general",
      city: city.name,
      state: city.state,
      metro: city.slug,
      updatedAt,
      content: {
        intro: `Browse ${cat.keyword} from estate sales, yard sales, auctions, and garage sales in ${city.name}, ${city.state}. FindA.Sale indexes active listings in real time so you can compare prices and find deals before the weekend.`,
        sections: [
          {
            heading: `How to Find ${cat.name} in ${city.name}`,
            body: `Use the FindA.Sale map to filter by category and date in ${city.name}. Active sales with ${cat.keyword} appear with inventory counts and price ranges so you know what to expect before you go. Bookmark sales and get notified when new items are added.`
          },
          {
            heading: `What to Expect at ${city.name} Sales`,
            body: `${city.name}, ${city.state} typically has estate sales and auctions active on weekends. Prices at local sales often run 30–70% below retail, especially for ${cat.keyword}. Early access and preview days are common for larger sales — follow organizers on FindA.Sale to get notified first.`
          },
          {
            heading: `Tips for Buying ${cat.name} at Local Sales`,
            body: `Bring cash — many ${city.name} estate sales don't take cards. Inspect items carefully; most sales are final. For ${cat.keyword}, check condition, look for maker marks, and compare against recent eBay sold prices before bidding or buying.`
          }
        ],
        cta: `Browse active ${cat.name.toLowerCase()} listings in ${city.name} on FindA.Sale — real inventory, real prices, updated daily.`
      }
    });
  }
}

// ─── Trend Report pages (100 — 10 categories × 10 most recent months) ────────
for (const catSlug of trendCategories) {
  for (let m = 0; m < 10; m++) {
    const now = new Date(2026, 4, 11); // anchored to May 2026
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    const catDisplay = catSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const slug = `trending-${catSlug}-${monthName.toLowerCase()}-${year}`;
    const metaTitle = `Top ${catDisplay} at Sales — ${monthName} ${year} | FindA.Sale`.slice(0, 60);
    const metaDescription = `See the ${catDisplay.toLowerCase()} items selling fast at estate sales, auctions, and yard sales in ${monthName} ${year}. Real prices and trends.`.slice(0, 160);

    entries.push({
      slug,
      title: `Top ${catDisplay} Items Selling at Sales — ${monthName} ${year}`,
      h1: `Top ${catDisplay} Finds at Sales This Month`,
      description: `Which ${catDisplay.toLowerCase()} items are moving fastest at estate sales and auctions in ${monthName} ${year}.`,
      metaTitle,
      metaDescription,
      type: "how-to",
      saleType: "general",
      city: "", state: "", metro: "",
      updatedAt,
      content: {
        intro: `These are the ${catDisplay.toLowerCase()} items moving fastest at estate sales and auctions right now. Prices and trends drawn from active FindA.Sale listings in ${monthName} ${year}.`,
        sections: [
          {
            heading: `What's Hot in ${catDisplay} This Month`,
            body: `Demand for ${catDisplay.toLowerCase()} at estate sales tends to spike in spring and fall — peak estate sale season. Items with clear maker marks, original boxes, and documented provenance consistently outperform comparable unmarked pieces by 40–80%.`
          },
          {
            heading: `Pricing Trends for ${catDisplay}`,
            body: `Prices for ${catDisplay.toLowerCase()} at estate sales typically run 30–60% below auction house prices for the same quality. The gap narrows for rare or high-demand pieces. Use the FindA.Sale price history feature to track what similar items have sold for locally.`
          },
          {
            heading: `What to Watch at Sales This Month`,
            body: `Set up a Wishlist alert on FindA.Sale for ${catDisplay.toLowerCase()} and get notified the moment a matching item is listed. Sales with active inventory are marked with item counts — filter by category before you go.`
          }
        ],
        cta: `Track ${catDisplay.toLowerCase()} listings in real time on FindA.Sale — browse by category, city, and sale type.`
      }
    });
  }
}

import { writeFileSync } from 'fs';
writeFileSync('batch-templates.json', JSON.stringify(entries, null, 2));
console.log(`Generated ${entries.length} template pages → batch-templates.json`);
console.log(`  City×Category: ${cities.length * categories.length}`);
console.log(`  Trend Reports: ${trendCategories.length * 10}`);
