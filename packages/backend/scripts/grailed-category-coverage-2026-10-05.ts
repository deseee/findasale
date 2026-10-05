// Coverage report for services/grailedCategoryResolver.ts (S-EXT-GRAILED-CATEGORY-MAP, 2026-10-05).
//
// PURE and READ-ONLY: it reads a JSON export of Items from a file or stdin, runs the resolver on every row
// and prints how many resolved by CURATED_ID / RULE / SCORED and how many came back null, how many rows are
// in the fashion family (the only rows Grailed can take) and how many of those resolved, plus the top
// unresolved fashion-family categories by item count. No database, no network, no writes except the
// optional review file. Titles are never written to the review file (category names and ids only).
//
// The export is a JSON array of { title, description, brand, category, ebayCategoryId, ebayCategoryName }
// (produced by a read-only SELECT against "Item").
//
// Usage (from packages/backend):
//   npx tsx scripts/grailed-category-coverage-2026-10-05.ts path/to/items-export.json
//   npx tsx scripts/grailed-category-coverage-2026-10-05.ts path/to/items-export.json --review=mapping-review.md --top=25
//   cat items-export.json | npx tsx scripts/grailed-category-coverage-2026-10-05.ts
import * as fs from 'fs';
import { explainGrailedCategory, normalizeGrailedText } from '../src/services/grailedCategoryResolver';

interface ExportRow {
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
}

function readInput(file: string | undefined): string {
  if (file) return fs.readFileSync(file, 'utf8');
  return fs.readFileSync(0, 'utf8');
}

function groupKey(r: ExportRow): string {
  const id = r.ebayCategoryId == null || r.ebayCategoryId === '' ? '(no id)' : String(r.ebayCategoryId);
  const name = r.ebayCategoryName || r.category || '(no category)';
  return id + ' | ' + name;
}

// An item is in the fashion family when its eBay category text says clothing, shoes, apparel, jewelry or
// watches, or its title is made of fashion nouns. Everything else is out of scope for Grailed by definition.
const FASHION_CATEGORY = /\b(clothing|apparel|footwear|jewelry and watches|jewelry|watches|handbags|shoes|tracksuits?|t shirts?|jeans|dresses|sneakers|boots|hats|belts|wallets|cufflinks)\b/;
const FASHION_TITLE = /\b(t shirts?|tees?|hoodies?|sweatshirts?|jackets?|jeans|sweaters?|dress(es)?|sneakers?|shoes|boots?|hats?|beanies?|shirts?|pants|shorts|coats?|handbags?|purses?|wallets?|belts?|scarf|scarves|sunglasses|necklaces?|bracelets?|earrings?|tracksuits?|vests?|blazers?|suits?|cufflinks?|watch(es)?)\b/;
function isFashionFamily(r: ExportRow): boolean {
  const cat = normalizeGrailedText((r.ebayCategoryName || '') + ' ' + (r.category || ''));
  if (FASHION_CATEGORY.test(cat)) return true;
  return FASHION_TITLE.test(normalizeGrailedText(r.title));
}

function main(): void {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const reviewArg = args.find((a) => a.startsWith('--review='));
  const topArg = args.find((a) => a.startsWith('--top='));
  const top = topArg ? Number(topArg.slice(6)) || 25 : 25;
  const rows: ExportRow[] = JSON.parse(readInput(file));
  const total = rows.length;

  const bySource: Record<string, number> = { CURATED_ID: 0, RULE: 0, SCORED: 0, NULL: 0 };
  const nullReasons: Record<string, number> = {};
  const unresolved = new Map<string, { count: number; reason: string }>();
  const review = new Map<string, { count: number; grailed: string; source: string; ebay: string }>();
  let fashionTotal = 0;
  let fashionResolved = 0;
  let nonFashionResolved = 0;

  for (const r of rows) {
    const x = explainGrailedCategory({
      ebayCategoryId: r.ebayCategoryId,
      ebayCategoryName: r.ebayCategoryName,
      categoryBreadcrumb: r.category,
      title: r.title,
      description: r.description,
      brand: r.brand,
    });
    const fam = isFashionFamily(r);
    if (fam) fashionTotal += 1;
    const key = groupKey(r);
    if (x.result) {
      bySource[x.result.source] += 1;
      if (fam) fashionResolved += 1;
      else nonFashionResolved += 1;
      const rk = key + ' => ' + x.result.pathText;
      const prev = review.get(rk);
      if (prev) prev.count += 1;
      else review.set(rk, { count: 1, grailed: x.result.pathText, source: x.result.source + (x.detail ? ' ' + x.detail : ''), ebay: key });
    } else {
      bySource.NULL += 1;
      const why = x.stage === 'blank' ? 'blank:' + x.detail : x.reason || 'none';
      nullReasons[why.split(':')[0]] = (nullReasons[why.split(':')[0]] || 0) + 1;
      if (fam) {
        const u = unresolved.get(key) || { count: 0, reason: why };
        u.count += 1;
        unresolved.set(key, u);
      }
      const rk = key + ' => (blank)';
      const prev = review.get(rk);
      if (prev) prev.count += 1;
      else review.set(rk, { count: 1, grailed: '(none) ' + why, source: 'NULL', ebay: key });
    }
  }

  const pct = (n: number, d: number): string => (d ? ((100 * n) / d).toFixed(1) : '0.0') + '%';
  console.log('Items: ' + total);
  console.log('CURATED_ID: ' + bySource.CURATED_ID + ' (' + pct(bySource.CURATED_ID, total) + ')');
  console.log('RULE:       ' + bySource.RULE + ' (' + pct(bySource.RULE, total) + ')');
  console.log('SCORED:     ' + bySource.SCORED + ' (' + pct(bySource.SCORED, total) + ')');
  console.log('NULL:       ' + bySource.NULL + ' (' + pct(bySource.NULL, total) + ')');
  console.log('Resolved:   ' + (total - bySource.NULL) + ' (' + pct(total - bySource.NULL, total) + ')');
  console.log('Fashion-family items: ' + fashionTotal + ', resolved: ' + fashionResolved + ' (' + pct(fashionResolved, fashionTotal) + ')');
  console.log('Resolved items OUTSIDE the fashion family (should be 0): ' + nonFashionResolved);
  console.log('Null reasons: ' + JSON.stringify(nullReasons));
  console.log('\nTop ' + top + ' unresolved FASHION-FAMILY categories by item count:');
  const list = Array.from(unresolved.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, top);
  for (const [k, v] of list) console.log(String(v.count).padStart(4) + '  ' + k + '   [' + v.reason + ']');

  if (reviewArg) {
    const out = reviewArg.slice(9);
    const lines: string[] = [];
    lines.push('# Grailed category mapping review (generated)');
    lines.push('');
    lines.push('Items: ' + total + '. CURATED_ID ' + bySource.CURATED_ID + ', RULE ' + bySource.RULE + ', SCORED ' + bySource.SCORED + ', null ' + bySource.NULL + '. Fashion-family items ' + fashionTotal + ', resolved ' + fashionResolved + '.');
    lines.push('');
    lines.push('| Items | eBay category id | eBay category | Grailed path | Source |');
    lines.push('| ---: | --- | --- | --- | --- |');
    const rev = Array.from(review.values()).sort((a, b) => b.count - a.count || a.ebay.localeCompare(b.ebay));
    for (const v of rev) {
      const parts = v.ebay.split(' | ');
      lines.push('| ' + v.count + ' | ' + parts[0] + ' | ' + parts.slice(1).join(' | ').replace(/\|/g, '/') + ' | ' + v.grailed.replace(/\|/g, '/') + ' | ' + v.source + ' |');
    }
    fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
    console.log('\nReview table written: ' + out);
  }
}

main();
