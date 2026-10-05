/**
 * craigslistCategoryTree.ts -- Craigslist's FOR SALE and AUTOS category list (craigslist.org, 3-letter
 * category codes) as compact data, plus small lookup helpers. Dependency-free on purpose: no imports,
 * no env, no I/O, safe to import from any BACKEND file (never from the frontend or @findasale/shared).
 *
 * SOURCE: the category list saved on 2026-10-04 at .tmp-scratch/category-trees/craigslist-tree-2026-10-04.txt
 * (id|parentId|title; 47 lines = 2 parents + 33 for-sale categories + 12 vehicle categories). The ids are
 * Craigslist's own 3-letter category codes (for example sga = sporting goods, ata = antiques).
 * The two parent rows were saved as "for sale (ALL FOR SALE)" and "autos (ALL AUTOS)"; the trailing
 * parenthetical is dropped when parsing so the root titles read "for sale" and "autos".
 *
 * SHAPE: one line per node, "id|parentId|title", parents listed before children, empty parentId = a root.
 * The list is FLAT: every category is a direct child of one of the two roots, so a path is always
 * [root title, category title]. TOTALS (asserted by __tests__/craigslistCategoryResolver.test.ts):
 * 47 nodes, 45 leaves, 2 roots, 33 for-sale leaves, 12 autos leaves.
 *
 * IMPORTANT: these titles are Craigslist's category-list names. The wording of the radio labels on the
 * live posting form (for example "arts+crafts" versus "arts & crafts") is NOT confirmed by this file;
 * the Chrome extension (extension/fas-craigslist.js) therefore carries its own label-candidate table and
 * tolerant matching. Always address a category by its 3-letter id.
 */

export interface CraigslistNode {
  /** Craigslist 3-letter category code. */
  id: string;
  /** Parent code, or '' for a root. */
  parentId: string;
  title: string;
  /** 1 for a root. */
  depth: number;
  childIds: string[];
}

export const CRAIGSLIST_CATALOG_RAW = `
sse||for sale (ALL FOR SALE)
ata|sse|antiques
ppa|sse|appliances
ara|sse|arts+crafts
baa|sse|baby+kids
bar|sse|barter
haa|sse|beauty+hlth
bip|sse|bike parts
bia|sse|bikes
bka|sse|books
bfa|sse|business
ema|sse|cds/dvd/vhs
moa|sse|cell phones
cla|sse|clothes+acc
cba|sse|collectibles
syp|sse|computer parts
sya|sse|computers
ela|sse|electronics
gra|sse|farm+garden
zip|sse|free stuff
fua|sse|furniture
gms|sse|garage sales
foa|sse|general
hsa|sse|household
jwa|sse|jewelry
maa|sse|materials
msa|sse|music instr
pha|sse|photo+video
sga|sse|sporting
tia|sse|tickets
tla|sse|tools
taa|sse|toys+games
vga|sse|video gaming
waa|sse|wanted
aut||autos (ALL AUTOS)
sna|aut|atvs/utvs/snow
pta|aut|auto parts
wta|aut|auto wheels & tires
ava|aut|aviation
bpa|aut|boat parts
boo|aut|boats
cta|aut|cars+trucks
hva|aut|heavy equipment
mpa|aut|motorcycle parts
mca|aut|motorcycles
rva|aut|RVs
tra|aut|trailers
`;

export const CRAIGSLIST_ROOT_IDS = { FOR_SALE: 'sse', AUTOS: 'aut' } as const;

function parseCraigslistTree(raw: string): Map<string, CraigslistNode> {
  const nodes = new Map<string, CraigslistNode>();
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split('|');
    const id = parts[0];
    const parentId = parts[1] || '';
    const title = parts.slice(2).join('|').replace(/\s*\(ALL [A-Z ]+\)\s*$/, '').trim();
    const parent = parentId ? nodes.get(parentId) : undefined;
    nodes.set(id, { id, parentId, title, depth: parent ? parent.depth + 1 : 1, childIds: [] });
    if (parent) parent.childIds.push(id);
  }
  return nodes;
}

export const CRAIGSLIST_NODES: Map<string, CraigslistNode> = parseCraigslistTree(CRAIGSLIST_CATALOG_RAW);

export function getCraigslistNode(id: string | null | undefined): CraigslistNode | undefined {
  return id ? CRAIGSLIST_NODES.get(String(id)) : undefined;
}

/** A leaf is a category an item can actually be posted in (the two roots are not). */
export function isCraigslistLeaf(id: string | null | undefined): boolean {
  const n = getCraigslistNode(id);
  return !!n && n.childIds.length === 0;
}

/** Titles from the root down to the node, e.g. ['for sale', 'sporting']. */
export function craigslistPathTitles(id: string): string[] {
  const out: string[] = [];
  let cur = getCraigslistNode(id);
  while (cur) {
    out.unshift(cur.title);
    cur = cur.parentId ? CRAIGSLIST_NODES.get(cur.parentId) : undefined;
  }
  return out;
}

export function craigslistPathText(id: string): string {
  return craigslistPathTitles(id).join(' > ');
}

export function craigslistRootId(id: string): string {
  let cur = getCraigslistNode(id);
  while (cur && cur.parentId) cur = CRAIGSLIST_NODES.get(cur.parentId);
  return cur ? cur.id : '';
}

export function craigslistAllLeafIds(): string[] {
  const out: string[] = [];
  CRAIGSLIST_NODES.forEach((n) => { if (n.childIds.length === 0) out.push(n.id); });
  return out;
}
