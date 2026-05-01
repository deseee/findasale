#!/usr/bin/env node
/**
 * Generate index.json for SEO content moat (ADR-075)
 * Run: node generate.js
 */
const fs = require('fs');
const path = require('path');

const CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'San Diego', state: 'CA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'San Jose', state: 'CA' },
  { city: 'Austin', state: 'TX' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Indianapolis', state: 'IN' },
  { city: 'San Francisco', state: 'CA' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Oklahoma City', state: 'OK' },
  { city: 'El Paso', state: 'TX' },
  { city: 'Washington', state: 'DC' },
  { city: 'Boston', state: 'MA' },
  { city: 'Portland', state: 'OR' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Milwaukee', state: 'WI' },
  { city: 'Albuquerque', state: 'NM' },
  { city: 'Tucson', state: 'AZ' },
  { city: 'Fresno', state: 'CA' },
  { city: 'Sacramento', state: 'CA' },
  { city: 'Mesa', state: 'AZ' },
  { city: 'Kansas City', state: 'MO' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Omaha', state: 'NE' },
  { city: 'Colorado Springs', state: 'CO' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Long Beach', state: 'CA' },
  { city: 'Virginia Beach', state: 'VA' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Tampa', state: 'FL' },
  { city: 'New Orleans', state: 'LA' },
  { city: 'Arlington', state: 'TX' },
  { city: 'Wichita', state: 'KS' },
  { city: 'Cleveland', state: 'OH' },
  { city: 'Bakersfield', state: 'CA' },
  { city: 'Aurora', state: 'CO' },
  { city: 'Grand Rapids', state: 'MI' },
];

const SALE_TYPES = ['estate sale', 'yard sale', 'garage sale', 'flea market', 'consignment sale'];

const slug = (text) => text.toLowerCase().replace(/\s+/g, '-');

function generate() {
  const entries = [];

  // Category A: How-to guides (250)
  CITIES.forEach((loc) => {
    SALE_TYPES.forEach((type) => {
      const s = slug(`how-to-run-${type}-in-${loc.city}-${loc.state}`);
      const cap = type.charAt(0).toUpperCase() + type.slice(1);

      entries.push({
        slug: s,
        title: `How to Run a ${cap} in ${loc.city}, ${loc.state}`,
        description: `Complete guide to organizing and running a successful ${type} in ${loc.city}, ${loc.state}. Pricing tips, advertising strategies, and how FindA.Sale can help.`,
        h1: `Running a ${cap} in ${loc.city}, ${loc.state}: Complete Organizer Guide`,
        type: 'how-to',
        saleType: type,
        city: loc.city,
        state: loc.state,
        metro: `${loc.city}, ${loc.state}`,
        content: {
          intro: `Planning a ${type} in ${loc.city}, ${loc.state}? This guide covers everything organizers in the ${loc.city} area need to know to run a successful sale, from planning and pricing to marketing and day-of logistics. Whether you're liquidating an estate, clearing out a home, or launching a flea market, ${loc.city}'s local market has specific buyer preferences and pricing patterns we'll address.`,
          sections: [
            {
              heading: `Planning Your ${loc.city} ${cap}`,
              body: `Start by assessing the scope of items you'll be selling. In ${loc.city}, successful ${type}s typically take 2–6 weeks from planning to completion. Decide whether to DIY, hire a professional company, or partner with an auction house. Set a target date, get your inventory organized, and create a timeline. ${loc.city}'s local market and neighborhood demographics will influence timing and promotion strategy.`
            },
            {
              heading: `Pricing for the ${loc.city} Market`,
              body: `Research comparable items locally and online. ${loc.city}'s market has specific demand patterns for different categories. Price competitively to move inventory quickly while maximizing proceeds. Use online platforms like eBay, Facebook Marketplace, and Craigslist to gauge local pricing. For high-value items, consider a professional appraisal ($150–$500) which often pays for itself on valuable collections.`
            },
            {
              heading: `Advertising Your ${cap} in ${loc.city}`,
              body: `Promotion is critical for drawing buyers. List your event on FindA.Sale, Craigslist, Facebook Marketplace, and local ${loc.city} community boards. Include excellent photos (8–10+), detailed descriptions, clear address and times. Email your network and ask them to share. Create signage for local placement. Most successful ${loc.city} ${type}s get 50–200+ visitors when well-promoted.`
            },
            {
              heading: `Day-of Management and Logistics`,
              body: `Plan to staff your sale with 2–3 people. Arrive early for setup, clear pricing, and organized layout. Accept cash and digital payments (Venmo, Square). Keep items organized by category. Set clear pickup deadlines for unsold inventory. Consider hiring local helpers to manage crowds. The better organized you are, the smoother the day goes and the more revenue you capture.`
            },
            {
              heading: `After the Sale: Cleanup and Next Steps`,
              body: `Plan for unsold items: donate to local charities, post on Facebook Marketplace, or rent a dumpster. Thank those who helped. Reconcile your books and account for taxes if necessary. Most ${loc.city} organizers can complete cleanup within 48 hours, leaving time to process payment and plan future events.`
            }
          ],
          cta: `List your ${type} on FindA.Sale and reach thousands of shoppers in the ${loc.city} area.`
        },
        metaTitle: `How to Run a ${cap} in ${loc.city}, ${loc.state} | FindA.Sale Guide`,
        metaDescription: `Step-by-step guide to organizing a ${type} in ${loc.city}, ${loc.state}. Tips on pricing, advertising, and reaching local shoppers with FindA.Sale.`,
        updatedAt: '2026-05-01'
      });
    });
  });

  // Category B: Pricing guides (250)
  CITIES.forEach((loc) => {
    SALE_TYPES.forEach((type) => {
      const s = slug(`${loc.city}-${loc.state}-${type}-pricing-guide`);
      const cap = type.charAt(0).toUpperCase() + type.slice(1);

      entries.push({
        slug: s,
        title: `${loc.city}, ${loc.state} ${cap} Pricing Guide`,
        description: `What items sell for at ${type}s in ${loc.city}, ${loc.state}. Market data, pricing benchmarks, and tips for organizers.`,
        h1: `${cap} Pricing in ${loc.city}, ${loc.state}: What Actually Sells`,
        type: 'pricing-guide',
        saleType: type,
        city: loc.city,
        state: loc.state,
        metro: `${loc.city}, ${loc.state}`,
        content: {
          intro: `${type}s in ${loc.city}, ${loc.state} follow regional pricing patterns shaped by local demographics and buyer preferences. This guide breaks down what furniture, collectibles, household items, and category-specific goods actually sell for in the ${loc.city} market. Use these benchmarks to price your inventory competitively.`,
          sections: [
            {
              heading: `${loc.city} ${cap} Market Overview`,
              body: `${loc.city}'s ${type} market is driven by local population, income demographics, real estate values, and seasonal demand. Spring and fall typically see stronger traffic. Summer is lighter. Understanding these patterns helps timing your sale for maximum visibility and buyer interest in the ${loc.city} area.`
            },
            {
              heading: `Furniture Pricing in ${loc.city}`,
              body: `Furniture is often the revenue driver at ${type}s. Dining tables: $50–$200. Sofas/sectionals: $100–$400. Bedroom sets: $150–$500. Vintage/antique pieces: $200–$1000+. Condition matters—expect to price worn items 20–40% lower than excellent condition. High-quality brands (Ethan Allen, Baker) attract serious ${loc.city} buyers.`
            },
            {
              heading: `Pricing Household Items and Decor`,
              body: `Decor and household goods move quickly when priced affordably. Wall art: $0.50–$3. Lamps: $2–$10. Vases/collectibles: $0.50–$3. Mirrors: $2–$10. Throws/pillows: $1–$3. Curtains/rods: $3–$10. These category items drive volume sales and help fill out event traffic in ${loc.city} markets.`
            },
            {
              heading: `Electronics and Appliances in ${loc.city}`,
              body: `Working electronics sell well. TVs (recent, working): $50–$200. Laptops: $100–$400. Tablets: $30–$150. Kitchen appliances: $5–$25. Higher-end appliances: $25–$75. Non-working electronics should be disposed of or offered free rather than taking up sale space.`
            },
            {
              heading: `Clothing and Fashion Pricing`,
              body: `Clothing pricing varies by era and brand. Vintage 1950s–80s pieces: $3–$25. Contemporary department store: $1–$5. Designer handbags: $10–$200+. Shoes: $1–$10. Coats: $5–$30. Quality and condition are key—well-presented vintage fashion attracts niche {{city}} buyers willing to pay premium prices.`
            }
          ],
          cta: `List your ${type} on FindA.Sale — free to post, no commission.`
        },
        metaTitle: `${loc.city} ${cap} Pricing Guide 2026 | FindA.Sale`,
        metaDescription: `${cap} pricing benchmarks for ${loc.city}, ${loc.state}. What furniture, collectibles, and household items sell for in the ${loc.city} market.`,
        updatedAt: '2026-05-01'
      });
    });
  });

  return entries;
}

const entries = generate();
const outputPath = path.join(__dirname, 'index.json');
fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));

console.log(`✓ Generated ${entries.length} entries`);
console.log(`✓ Category A (how-to): ${entries.filter(e => e.type === 'how-to').length}`);
console.log(`✓ Category B (pricing): ${entries.filter(e => e.type === 'pricing-guide').length}`);
console.log(`✓ Written to ${outputPath}`);
