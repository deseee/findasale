#!/usr/bin/env node
/**
 * fix-seo-batch.js
 *
 * Fixes structural issues in Haiku-generated SEO page batches.
 *
 * Problems it fixes:
 *  1. Two concatenated JSON arrays (Haiku restarted mid-file for batch1)
 *  2. Flat sections[] → nested content: { intro, sections, cta }
 *  3. section.title / section.content → section.heading / section.body
 *  4. Missing description field
 *  5. Strips seoScore and flags (self-scoring was inflated 63-68/70 universally)
 *  6. Sets saleType: "general" (was hardcoded "estate-sale" in batch1 prompt)
 *
 * Usage:
 *   node scripts/fix-seo-batch.js batch1.json batch1-fixed.json
 *   node scripts/fix-seo-batch.js batch2.json batch2-fixed.json
 *
 * After fixing all batches, merge them:
 *   node scripts/fix-seo-batch.js --merge batch1-fixed.json batch2-fixed.json batch3-fixed.json
 *
 * The merge output goes to packages/frontend/data/seo-pages/index.json
 */

const fs = require('fs');
const path = require('path');

// ─── Merge mode ──────────────────────────────────────────────────────────────
if (process.argv[2] === '--merge') {
  const inputFiles = process.argv.slice(3);
  if (inputFiles.length === 0) {
    console.error('Merge mode: provide at least one fixed batch file');
    process.exit(1);
  }
  let merged = [];
  for (const f of inputFiles) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    merged = merged.concat(data);
    console.log(`Added ${data.length} entries from ${f} (total: ${merged.length})`);
  }
  // Deduplicate by slug
  const seen = new Set();
  const deduped = merged.filter(e => {
    if (seen.has(e.slug)) { console.warn(`Duplicate slug removed: ${e.slug}`); return false; }
    seen.add(e.slug);
    return true;
  });
  // Build index.json (array of { slug } for sitemap) separately
  const indexPath = path.join(__dirname, '../packages/frontend/data/seo-pages/index.json');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(deduped, null, 2));
  console.log(`\n✅ Merged ${deduped.length} entries → ${indexPath}`);
  process.exit(0);
}

// ─── Single-file fix mode ─────────────────────────────────────────────────────
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error('Usage: node fix-seo-batch.js <input.json> <output.json>');
  console.error('       node fix-seo-batch.js --merge <fixed1.json> <fixed2.json> ...');
  process.exit(1);
}

let raw = fs.readFileSync(inputFile, 'utf8');

// Strip markdown code fences if present (Haiku sometimes wraps output in ```json ... ```)
raw = raw.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '').trim();

// ─── Parse: handle concatenated arrays (batch1 failure mode) ─────────────────
let allEntries = [];

try {
  allEntries = JSON.parse(raw);
  console.log(`Parsed as single array: ${allEntries.length} entries`);
} catch (e) {
  console.log('Single parse failed — attempting split...');

  // batch1 failure mode: a broken entry has ```json mid-string, then a bare [
  // starts a second JSON array on the very next line. Strategy:
  //   1. Find the ```json corruption point in raw text
  //   2. Find where the broken entry's object started (search back for the slug)
  //   3. Build firstRaw = everything up to that entry (minus trailing comma) + ]
  //   4. Build secondRaw = from the [ that follows the corruption

  // Step 1: find corruption point
  const backtickIdx = raw.indexOf('```json');
  if (backtickIdx === -1) {
    console.error('No corruption marker found. File may be a different format.');
    process.exit(1);
  }

  // Step 2: find the [ that starts the second array after the corruption
  const secondArrayIdx = raw.indexOf('\n[', backtickIdx);
  if (secondArrayIdx === -1) {
    console.error('Could not find second array start after corruption point.');
    process.exit(1);
  }
  const secondRaw = raw.substring(secondArrayIdx + 1); // skip the \n, start at [

  // Step 3: find where the broken entry's object starts by searching backwards
  // from the backtick for \n  { (newline + 2 spaces + brace = top-level entry opener)
  let objStart = backtickIdx;
  while (objStart > 1) {
    if (raw[objStart] === '{' && raw[objStart - 1] === ' ' && raw[objStart - 2] === ' ' &&
        (raw[objStart - 3] === '\n' || raw[objStart - 3] === '\r')) {
      break;
    }
    objStart--;
  }
  console.log(`Found broken entry start at char ${objStart}: ${raw.substring(objStart, objStart + 40).replace(/\n/g, '\\n')}`);
  // Walk backwards further to remove preceding comma + whitespace
  let trimPos = objStart - 1;
  while (trimPos > 0 && /[\s,]/.test(raw[trimPos])) trimPos--;

  const firstRaw = raw.substring(0, trimPos + 1) + '\n]';

  let firstArr = [], secondArr = [];
  try { firstArr = JSON.parse(firstRaw); console.log(`First chunk: ${firstArr.length} entries`); }
  catch (e2) { console.error('First chunk parse failed:', e2.message); process.exit(1); }

  try { secondArr = JSON.parse(secondRaw); console.log(`Second chunk: ${secondArr.length} entries`); }
  catch (e3) { console.error('Second chunk parse failed:', e3.message); process.exit(1); }

  allEntries = [...firstArr, getTiffanyLampEntry(), ...secondArr];
  console.log(`Total after split + Tiffany inject: ${allEntries.length} entries`);
}

// ─── Transform each entry ─────────────────────────────────────────────────────
function transformEntry(entry) {
  // Already has correct nested content structure — just fix section field names
  if (entry.content && Array.isArray(entry.content.sections)) {
    const fixedSections = entry.content.sections.map(s => ({
      heading: s.heading || s.title || '',
      body: s.body || s.content || ''
    }));
    const { seoScore, flags, ...rest } = entry;
    return {
      ...rest,
      description: entry.description || buildDescription(entry),
      saleType: entry.saleType || 'general',
      content: { ...entry.content, sections: fixedSections }
    };
  }

  // Flat structure: sections[] at top level (batch1 output format)
  if (!Array.isArray(entry.sections) || entry.sections.length < 2) {
    console.warn(`⚠️  ${entry.slug}: fewer than 2 sections — skipping transform, check manually`);
    return entry;
  }

  const rawSections = entry.sections;

  // First section body → intro paragraph
  const intro = rawSections[0].content || rawSections[0].body || '';

  // Last section body → cta
  const lastSection = rawSections[rawSections.length - 1];
  const cta = lastSection.content || lastSection.body || '';

  // Middle sections → sections array with correct field names
  const sections = rawSections.slice(1, -1).map(s => ({
    heading: s.heading || s.title || '',
    body: s.body || s.content || ''
  }));

  // Strip seoScore and flags — inflated and not useful
  const { seoScore, flags, sections: _, ...rest } = entry;

  return {
    ...rest,
    description: entry.description || buildDescription(entry),
    saleType: 'general', // Was hardcoded estate-sale in batch1 prompt — normalize
    content: { intro, sections, cta }
  };
}

function buildDescription(entry) {
  return `${entry.title} — what to pay, what to avoid, and how to find pieces at estate sales, auctions, yard sales, and flea markets.`;
}

const transformed = allEntries.map(transformEntry);

// ─── Validation ───────────────────────────────────────────────────────────────
let issueCount = 0;
transformed.forEach(entry => {
  if (!entry.content) { console.warn(`⚠️  ${entry.slug}: no content object`); issueCount++; return; }
  if (!entry.content.intro) { console.warn(`⚠️  ${entry.slug}: empty intro`); issueCount++; }
  if (!Array.isArray(entry.content.sections) || entry.content.sections.length === 0) {
    console.warn(`⚠️  ${entry.slug}: no sections`); issueCount++;
  } else {
    entry.content.sections.forEach((s, i) => {
      if (!s.heading) { console.warn(`⚠️  ${entry.slug}: section[${i}] missing heading`); issueCount++; }
      if (!s.body) { console.warn(`⚠️  ${entry.slug}: section[${i}] missing body`); issueCount++; }
    });
  }
  if (!entry.content.cta) { console.warn(`⚠️  ${entry.slug}: empty cta`); issueCount++; }
});

// ─── Write output ─────────────────────────────────────────────────────────────
fs.writeFileSync(outputFile, JSON.stringify(transformed, null, 2));
console.log(`\n✅ Written ${transformed.length} entries → ${outputFile}`);
if (issueCount === 0) console.log('✅ Validation: clean');
else console.log(`⚠️  Validation: ${issueCount} issue(s) — review warnings above`);

// ─── Hand-written Tiffany lamp entry (replaces corrupted batch1 entry) ────────
function getTiffanyLampEntry() {
  return {
    slug: "tiffany-lamp-pricing-guide-2026",
    title: "Tiffany Lamp Prices: Studio vs. Reproduction",
    h1: "Tiffany Lamp Prices: Authentic Studio vs. Reproduction",
    description: "Price guide for authentic Tiffany Studios lamps vs. reproductions — how to identify genuine leaded glass pieces and what they sell for at estate sales.",
    metaTitle: "Tiffany Lamp Price Guide 2026 | FindA.Sale",
    metaDescription: "Authentic Tiffany Studios lamps range $2,000–$100,000+. Learn to spot reproductions and what genuine leaded glass lamps sell for at estate sales.",
    type: "pricing-guide",
    saleType: "general",
    city: "", state: "", metro: "",
    updatedAt: "2026-05-11T00:00:00.000Z",
    content: {
      intro: "Authentic Tiffany Studios lamps (1893–1933) command $2,000–$100,000+ at estate sales and auctions, while even quality reproductions top out around $2,000. The gap comes down to three things: hand-rolled opalescent glass, hand-soldered lead came, and a marked bronze base — all checkable at the sale.",
      sections: [
        {
          heading: "Tiffany Studio Lamp Prices by Shade Design",
          body: "Geometric shades (1800–1900 series): $2,000–$8,000. Floral shades (Peony, Tulip, Daffodil): $5,000–$25,000. Dragonfly shade: $12,000–$60,000. Wisteria (most sought-after): $15,000–$100,000+. Pond Lily multi-socket: $10,000–$45,000. Base style affects value 15–40% — tree-trunk bronze bases command premiums over plain column bases. Matching original base-to-shade pairings add another 20–30%."
        },
        {
          heading: "Tiffany Studios Marks: What to Look For",
          body: "Authentic bases are cast or stamped 'TIFFANY STUDIOS NEW YORK' with a model number (e.g. '533'). Shades often carry a paper tag or impressed mark on the inside rim. Early pieces (pre-1902) may read 'Tiffany Glass and Decorating Co.' instead. Absence of a mark doesn't confirm reproduction — marks wear off — but a proper mark strongly supports authenticity and adds 25–50% vs. unmarked studio pieces."
        },
        {
          heading: "Authentic Contemporaries Worth Knowing: Duffner, Handel, Bradley",
          body: "Not every leaded glass lamp is either Tiffany or fake. Studio contemporaries Duffner & Kimberly ($1,200–$8,000), Handel ($800–$5,000), and Miller lamps ($400–$2,000) were quality producers under their own marks. Bradley & Hubbard is frequently mistaken for Tiffany. These are legitimate collectibles — not reproductions — and are often underpriced because buyers only recognize the Tiffany name."
        },
        {
          heading: "Red Flags That Confirm a Reproduction",
          body: "Glass too uniform: every pane of identical color and thickness — authentic Tiffany glass is hand-rolled, showing natural variation in color and density under light. Lead came appears bright silver instead of dark, aged gray. Base feels lightweight with casting seams and sharp edges. Stamp reads 'Tiffany-style' rather than 'Tiffany Studios.' Shade wobbles or shows non-period hardware. Any plastic, resin, or acrylic panels confirm modern reproduction regardless of claimed origin."
        },
        {
          heading: "Quick Authentication Checks at the Sale",
          body: "Hold the shade up to a light source: authentic opalescent glass shifts color and shows slight variation across each pane. Flip the base: look for 'TIFFANY STUDIOS NEW YORK' and a model number. Check the lead came with a fingernail — it should feel slightly soft, not rigid like zinc. Weigh it mentally: genuine Tiffany shades are heavy for their size due to dense glass. A UV flashlight sometimes reveals authentic glass fluorescence that reproductions lack."
        }
      ],
      cta: "Tiffany and leaded glass lamps appear most often in high-estate liquidations and dedicated antique auctions. Set an alert on FindA.Sale for 'Tiffany lamp' or 'leaded glass lamp' to be notified across estate sales, auctions, and consignment sales in your area — and always request base-mark and glass-detail photos before bidding online."
    }
  };
}
