// Coverage report for services/poshmarkCategoryResolver.ts (S-EXT-POSHMARK-CATEGORY-MAP, 2026-10-05).
//
// PURE and READ-ONLY: it reads a JSON export of Items from a file or stdin, runs the resolver on every row
// and prints how many resolved by CURATED_ID / RULE / SCORED and how many came back null, plus the top
// unresolved categories by item count. No database, no network, no writes except the optional review file.
//
// The export is a JSON array of { title, description, brand, category, ebayCategoryId, ebayCategoryName }
// (produced by a read-only SELECT against "Item"; see the session notes). Item text never leaves the console:
// the review file holds category names and ids only.
//
// Usage (from packages/backend):
//   npx tsx scripts/poshmark-category-coverage-2026-10-05.ts path/to/items-export.json
//   npx tsx scripts/poshmark-category-coverage-2026-10-05.ts path/to/items-export.json --review=mapping-review.md --top=25
//   cat items-export.json | npx tsx scripts/poshmark-category-coverage-2026-10-05.ts
import * as fs from 'fs';
import { explainPoshmarkCategory } from '../src/services/poshmarkCategoryResolver';

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

function main(): void {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const reviewArg = args.find((a) => a.startsWith('--review='));
  const topArg = args.find((a) => a.startsWith('--top='));
  const top = topArg ? Number(topArg.slice(6)) || 25 : 25;
  const rows: ExportRow[] = JSON.parse(readInput(file));
  const total = rows.length;

  const bySource: Record<string, number> = { CURATED_ID: 0, RULE: 0, SCORED: 0, NULL: 0 };
  const byDepartment: Record<string, number> = {};
  const nullReasons: Record<string, number> = {};
  const unresolved = new Map<string, { count: number; reason: string; samples: string[] }>();
  const review = new Map<string, { count: number; poshmark: string; source: string; ebay: string }>();

  for (const r of rows) {
    const x = explainPoshmarkCategory({
      ebayCategoryId: r.ebayCategoryId,
      ebayCategoryName: r.ebayCategoryName,
      categoryBreadcrumb: r.category,
      title: r.title,
      description: r.description,
      brand: r.brand,
    });
    const key = groupKey(r);
    if (x.result) {
      bySource[x.result.source] += 1;
      byDepartment[x.result.path[0]] = (byDepartment[x.result.path[0]] || 0) + 1;
      const rk = key + ' => ' + x.result.pathText;
      const prev = review.get(rk);
      if (prev) prev.count += 1;
      else review.set(rk, { count: 1, poshmark: x.result.pathText, source: x.result.source + (x.detail ? ' ' + x.detail : ''), ebay: key });
    } else {
      bySource.NULL += 1;
      const why = x.stage === 'blank' ? 'blank:' + x.detail : x.reason || 'none';
      nullReasons[why.split(':')[0]] = (nullReasons[why.split(':')[0]] || 0) + 1;
      const u = unresolved.get(key) || { count: 0, reason: why, samples: [] };
      u.count += 1;
      if (u.samples.length < 3) u.samples.push(String(r.title || '').slice(0, 70));
      unresolved.set(key, u);
      const rk = key + ' => (blank)';
      const prev = review.get(rk);
      if (prev) prev.count += 1;
      else review.set(rk, { count: 1, poshmark: '(none) ' + why, source: 'NULL', ebay: key });
    }
  }

  const pct = (n: number): string => (total ? ((100 * n) / total).toFixed(1) : '0.0') + '%';
  console.log('Items: ' + total);
  console.log('CURATED_ID: ' + bySource.CURATED_ID + ' (' + pct(bySource.CURATED_ID) + ')');
  console.log('RULE:       ' + bySource.RULE + ' (' + pct(bySource.RULE) + ')');
  console.log('SCORED:     ' + bySource.SCORED + ' (' + pct(bySource.SCORED) + ')');
  console.log('NULL:       ' + bySource.NULL + ' (' + pct(bySource.NULL) + ')');
  console.log('Resolved:   ' + (total - bySource.NULL) + ' (' + pct(total - bySource.NULL) + ')');
  console.log('By department: ' + JSON.stringify(byDepartment));
  console.log('Null reasons: ' + JSON.stringify(nullReasons));
  console.log('\nTop ' + top + ' unresolved categories by item count:');
  const list = Array.from(unresolved.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, top);
  for (const [k, v] of list) console.log(String(v.count).padStart(4) + '  ' + k + '   [' + v.reason + ']   e.g. ' + v.samples.join(' / '));

  if (reviewArg) {
    const out = reviewArg.slice(9);
    const lines: string[] = [];
    lines.push('# Poshmark category mapping review (generated)');
    lines.push('');
    lines.push('Items: ' + total + '. CURATED_ID ' + bySource.CURATED_ID + ', RULE ' + bySource.RULE + ', SCORED ' + bySource.SCORED + ', null ' + bySource.NULL + '.');
    lines.push('');
    lines.push('| Items | eBay category id | eBay category | Poshmark path | Source |');
    lines.push('| ---: | --- | --- | --- | --- |');
    const rev = Array.from(review.values()).sort((a, b) => b.count - a.count || a.ebay.localeCompare(b.ebay));
    for (const v of rev) {
      const parts = v.ebay.split(' | ');
      lines.push('| ' + v.count + ' | ' + parts[0] + ' | ' + parts.slice(1).join(' | ').replace(/\|/g, '/') + ' | ' + v.poshmark.replace(/\|/g, '/') + ' | ' + v.source + ' |');
    }
    fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
    console.log('\nReview table written: ' + out);
  }
}

main();
