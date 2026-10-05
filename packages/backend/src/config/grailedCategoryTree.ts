/**
 * grailedCategoryTree.ts -- Grailed's full listing category tree (grailed.com sell form, Menswear and
 * Womenswear departments) as compact data, plus small lookup helpers. Dependency-free on purpose: no
 * imports, no env, no I/O, safe to import from any BACKEND file (never from the frontend or
 * @findasale/shared).
 *
 * SOURCE: the listing page's own embedded data, `initialProps.globalData.get_listing_categories_from_config
 * .categories`, read from an already-loaded page in a normal browser tab on 2026-10-04. Nothing here was
 * fetched from a private API. The saved copy lives at .tmp-scratch/category-trees/grailed-tree-2026-10-04.txt.
 *
 * SHAPE: one line per node, "id|parentId|title", parents before children, an empty parentId = a top-level
 * Category. Grailed's picker has THREE levels: Department (Menswear / Womenswear) -> Category (Tops,
 * Bottoms, ...) -> Sub-category (the leaf). The Department is not a node: it is the prefix of every id
 * ("menswear:tops.polos"), which also keeps ids unique (both departments have Blazers, Boots, Hats ...).
 * Every Sub-category is a leaf; a path is always [Department, Category, Sub-category].
 * TOTALS (asserted by __tests__/grailedCategoryResolver.test.ts): 142 nodes, 14 top-level Categories
 * (6 Menswear, 8 Womenswear), 128 leaves.
 *
 * Titles are NOT unique across departments. Always address a leaf by its id, and by its full path text
 * ("Menswear > Tops > Sweatshirts & Hoodies") when the browser picker must tell two apart.
 * Grailed can change this tree at any time; refresh this file (and re-run the tests) when it does.
 */

export type GrailedDepartment = 'men' | 'women';

export interface GrailedNode {
  id: string;
  /** '' for a top-level Category. */
  parentId: string;
  title: string;
  department: GrailedDepartment;
  /** 1 for a top-level Category, 2 for a Sub-category (the Department is not counted). */
  depth: number;
  childIds: string[];
}

/** Picker label of each department (Grailed's own spelling). */
export const GRAILED_DEPARTMENT_TITLES: Record<GrailedDepartment, string> = {
  men: 'Menswear',
  women: 'Womenswear',
};

export const GRAILED_CATALOG_RAW = `
menswear:tops||Tops
menswear:tops.long_sleeve_shirts|menswear:tops|Long Sleeve T-Shirts
menswear:tops.polos|menswear:tops|Polos
menswear:tops.button_ups|menswear:tops|Shirts (Button Ups)
menswear:tops.short_sleeve_shirts|menswear:tops|Short Sleeve T-Shirts
menswear:tops.sweaters_knitwear|menswear:tops|Sweaters & Knitwear
menswear:tops.sweatshirts_hoodies|menswear:tops|Sweatshirts & Hoodies
menswear:tops.sleeveless|menswear:tops|Tank Tops & Sleeveless
menswear:tops.jerseys|menswear:tops|Jerseys
menswear:bottoms||Bottoms
menswear:bottoms.casual_pants|menswear:bottoms|Casual Pants
menswear:bottoms.cropped_pants|menswear:bottoms|Cropped Pants
menswear:bottoms.denim|menswear:bottoms|Denim
menswear:bottoms.leggings|menswear:bottoms|Leggings
menswear:bottoms.jumpsuits|menswear:bottoms|Overalls & Jumpsuits
menswear:bottoms.shorts|menswear:bottoms|Shorts
menswear:bottoms.sweatpants_joggers|menswear:bottoms|Sweatpants & Joggers
menswear:bottoms.swimwear|menswear:bottoms|Swimwear
menswear:outerwear||Outerwear
menswear:outerwear.bombers|menswear:outerwear|Bombers
menswear:outerwear.cloaks_capes|menswear:outerwear|Cloaks & Capes
menswear:outerwear.denim_jackets|menswear:outerwear|Denim Jackets
menswear:outerwear.heavy_coats|menswear:outerwear|Heavy Coats
menswear:outerwear.leather_jackets|menswear:outerwear|Leather Jackets
menswear:outerwear.light_jackets|menswear:outerwear|Light Jackets
menswear:outerwear.parkas|menswear:outerwear|Parkas
menswear:outerwear.raincoats|menswear:outerwear|Raincoats
menswear:outerwear.vests|menswear:outerwear|Vests
menswear:footwear||Footwear
menswear:footwear.boots|menswear:footwear|Boots
menswear:footwear.leather|menswear:footwear|Casual Leather Shoes
menswear:footwear.formal_shoes|menswear:footwear|Formal Shoes
menswear:footwear.hitop_sneakers|menswear:footwear|Hi-Top Sneakers
menswear:footwear.lowtop_sneakers|menswear:footwear|Low-Top Sneakers
menswear:footwear.sandals|menswear:footwear|Sandals
menswear:footwear.slip_ons|menswear:footwear|Slip Ons
menswear:tailoring||Tailoring
menswear:tailoring.blazers|menswear:tailoring|Blazers
menswear:tailoring.formal_shirting|menswear:tailoring|Formal Shirting
menswear:tailoring.formal_trousers|menswear:tailoring|Formal Trousers
menswear:tailoring.suits|menswear:tailoring|Suits
menswear:tailoring.tuxedos|menswear:tailoring|Tuxedos
menswear:tailoring.vests|menswear:tailoring|Vests
menswear:accessories||Accessories
menswear:accessories.bags_luggage|menswear:accessories|Bags & Luggage
menswear:accessories.belts|menswear:accessories|Belts
menswear:accessories.glasses|menswear:accessories|Glasses
menswear:accessories.gloves_scarves|menswear:accessories|Gloves & Scarves
menswear:accessories.hats|menswear:accessories|Hats
menswear:accessories.jewelry_watches|menswear:accessories|Jewelry & Watches
menswear:accessories.wallets|menswear:accessories|Wallets
menswear:accessories.misc|menswear:accessories|Miscellaneous
menswear:accessories.periodicals|menswear:accessories|Periodicals
menswear:accessories.socks_underwear|menswear:accessories|Socks & Underwear
menswear:accessories.sunglasses|menswear:accessories|Sunglasses
menswear:accessories.supreme|menswear:accessories|Supreme
menswear:accessories.ties_pocketsquares|menswear:accessories|Ties & Pocketsquares
womenswear:womens_tops||Tops
womenswear:womens_tops.blouses|womenswear:womens_tops|Blouses
womenswear:womens_tops.bodysuits|womenswear:womens_tops|Bodysuits
womenswear:womens_tops.button_ups|womenswear:womens_tops|Button Ups
womenswear:womens_tops.crop_tops|womenswear:womens_tops|Crop Tops
womenswear:womens_tops.hoodies|womenswear:womens_tops|Hoodies
womenswear:womens_tops.long_sleeve_shirts|womenswear:womens_tops|Long Sleeve T-Shirts
womenswear:womens_tops.polos|womenswear:womens_tops|Polos
womenswear:womens_tops.short_sleeve_shirts|womenswear:womens_tops|Short Sleeve T-Shirts
womenswear:womens_tops.sweaters|womenswear:womens_tops|Sweaters
womenswear:womens_tops.sweatshirts|womenswear:womens_tops|Sweatshirts
womenswear:womens_tops.tank_tops|womenswear:womens_tops|Tank Tops
womenswear:womens_bottoms||Bottoms
womenswear:womens_bottoms.jeans|womenswear:womens_bottoms|Jeans
womenswear:womens_bottoms.joggers|womenswear:womens_bottoms|Joggers
womenswear:womens_bottoms.jumpsuits|womenswear:womens_bottoms|Jumpsuits
womenswear:womens_bottoms.leggings|womenswear:womens_bottoms|Leggings
womenswear:womens_bottoms.maxi_skirts|womenswear:womens_bottoms|Maxi Skirts
womenswear:womens_bottoms.midi_skirts|womenswear:womens_bottoms|Midi Skirts
womenswear:womens_bottoms.mini_skirts|womenswear:womens_bottoms|Mini Skirts
womenswear:womens_bottoms.pants|womenswear:womens_bottoms|Pants
womenswear:womens_bottoms.shorts|womenswear:womens_bottoms|Shorts
womenswear:womens_bottoms.sweatpants|womenswear:womens_bottoms|Sweatpants
womenswear:womens_outerwear||Outerwear
womenswear:womens_outerwear.blazers|womenswear:womens_outerwear|Blazers
womenswear:womens_outerwear.bombers|womenswear:womens_outerwear|Bombers
womenswear:womens_outerwear.coats|womenswear:womens_outerwear|Coats
womenswear:womens_outerwear.denim_jackets|womenswear:womens_outerwear|Denim Jackets
womenswear:womens_outerwear.down_jackets|womenswear:womens_outerwear|Down Jackets
womenswear:womens_outerwear.fur_faux_fur|womenswear:womens_outerwear|Fur & Faux Fur
womenswear:womens_outerwear.jackets|womenswear:womens_outerwear|Jackets
womenswear:womens_outerwear.leather_jackets|womenswear:womens_outerwear|Leather Jackets
womenswear:womens_outerwear.rain_jackets|womenswear:womens_outerwear|Rain Jackets
womenswear:womens_outerwear.vests|womenswear:womens_outerwear|Vests
womenswear:womens_dresses||Dresses
womenswear:womens_dresses.mini|womenswear:womens_dresses|Mini Dresses
womenswear:womens_dresses.midi|womenswear:womens_dresses|Midi Dresses
womenswear:womens_dresses.maxi|womenswear:womens_dresses|Maxi Dresses
womenswear:womens_dresses.gowns|womenswear:womens_dresses|Gowns
womenswear:womens_footwear||Footwear
womenswear:womens_footwear.boots|womenswear:womens_footwear|Boots
womenswear:womens_footwear.heels|womenswear:womens_footwear|Heels
womenswear:womens_footwear.platforms|womenswear:womens_footwear|Platforms
womenswear:womens_footwear.mules|womenswear:womens_footwear|Mules
womenswear:womens_footwear.flats|womenswear:womens_footwear|Flats
womenswear:womens_footwear.hitop_sneakers|womenswear:womens_footwear|Hi-Top Sneakers
womenswear:womens_footwear.lowtop_sneakers|womenswear:womens_footwear|Low-Top Sneakers
womenswear:womens_footwear.sandals|womenswear:womens_footwear|Sandals
womenswear:womens_footwear.slip_ons|womenswear:womens_footwear|Slip Ons
womenswear:womens_accessories||Accessories
womenswear:womens_accessories.belts|womenswear:womens_accessories|Belts
womenswear:womens_accessories.glasses|womenswear:womens_accessories|Glasses
womenswear:womens_accessories.gloves|womenswear:womens_accessories|Gloves
womenswear:womens_accessories.hair_accessories|womenswear:womens_accessories|Hair Accessories
womenswear:womens_accessories.hats|womenswear:womens_accessories|Hats
womenswear:womens_accessories.miscellaneous|womenswear:womens_accessories|Miscellaneous
womenswear:womens_accessories.scarves|womenswear:womens_accessories|Scarves
womenswear:womens_accessories.socks_intimates|womenswear:womens_accessories|Socks & Intimates
womenswear:womens_accessories.sunglasses|womenswear:womens_accessories|Sunglasses
womenswear:womens_accessories.wallets|womenswear:womens_accessories|Wallets
womenswear:womens_accessories.watches|womenswear:womens_accessories|Watches
womenswear:womens_bags_luggage||Bags & Luggage
womenswear:womens_bags_luggage.backpacks|womenswear:womens_bags_luggage|Backpacks
womenswear:womens_bags_luggage.belt_bags|womenswear:womens_bags_luggage|Belt Bags
womenswear:womens_bags_luggage.bucket_bags|womenswear:womens_bags_luggage|Bucket Bags
womenswear:womens_bags_luggage.clutches|womenswear:womens_bags_luggage|Clutches
womenswear:womens_bags_luggage.crossbody_bags|womenswear:womens_bags_luggage|Crossbody Bags
womenswear:womens_bags_luggage.handle_bags|womenswear:womens_bags_luggage|Handle Bags
womenswear:womens_bags_luggage.hobo_bags|womenswear:womens_bags_luggage|Hobo Bags
womenswear:womens_bags_luggage.luggage_travel|womenswear:womens_bags_luggage|Luggage & Travel
womenswear:womens_bags_luggage.messengers_satchels|womenswear:womens_bags_luggage|Messengers & Satchels
womenswear:womens_bags_luggage.mini_bags|womenswear:womens_bags_luggage|Mini Bags
womenswear:womens_bags_luggage.shoulder_bags|womenswear:womens_bags_luggage|Shoulder Bags
womenswear:womens_bags_luggage.toiletry_pouches|womenswear:womens_bags_luggage|Toiletry Pouches
womenswear:womens_bags_luggage.tote_bags|womenswear:womens_bags_luggage|Tote Bags
womenswear:womens_bags_luggage.other|womenswear:womens_bags_luggage|Other
womenswear:womens_jewelry||Jewelry
womenswear:womens_jewelry.body_jewelry|womenswear:womens_jewelry|Body Jewelry
womenswear:womens_jewelry.bracelets|womenswear:womens_jewelry|Bracelets
womenswear:womens_jewelry.brooches|womenswear:womens_jewelry|Brooches
womenswear:womens_jewelry.charms|womenswear:womens_jewelry|Charms
womenswear:womens_jewelry.cufflinks|womenswear:womens_jewelry|Cufflinks
womenswear:womens_jewelry.earrings|womenswear:womens_jewelry|Earrings
womenswear:womens_jewelry.necklaces|womenswear:womens_jewelry|Necklaces
womenswear:womens_jewelry.rings|womenswear:womens_jewelry|Rings
`;

function buildGrailedNodes(): Map<string, GrailedNode> {
  const nodes = new Map<string, GrailedNode>();
  const lines = GRAILED_CATALOG_RAW.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const first = line.indexOf('|');
    const second = line.indexOf('|', first + 1);
    const id = line.slice(0, first);
    const parentId = line.slice(first + 1, second);
    const title = line.slice(second + 1);
    const department: GrailedDepartment = id.indexOf('womenswear:') === 0 ? 'women' : 'men';
    const parent = parentId === '' ? undefined : nodes.get(parentId);
    nodes.set(id, { id, parentId, title, department, depth: parent ? parent.depth + 1 : 1, childIds: [] });
    if (parent) parent.childIds.push(id);
  }
  return nodes;
}

export const GRAILED_NODES: ReadonlyMap<string, GrailedNode> = buildGrailedNodes();

export function getGrailedNode(id: string): GrailedNode | undefined {
  return GRAILED_NODES.get(id);
}

export function isGrailedLeaf(id: string): boolean {
  const n = GRAILED_NODES.get(id);
  return !!n && n.childIds.length === 0;
}

/** The department a node lives under (null for an unknown id). */
export function grailedDepartmentOf(id: string): GrailedDepartment | null {
  const n = GRAILED_NODES.get(id);
  return n ? n.department : null;
}

/** Id of the top-level Category an id lives under ('' for an unknown id). */
export function grailedRootId(id: string): string {
  let cur = GRAILED_NODES.get(id);
  while (cur && cur.parentId !== '') cur = GRAILED_NODES.get(cur.parentId);
  return cur ? cur.id : '';
}

/** [Department, Category, Sub-category] titles for a node ([] for an unknown id), e.g. ["Menswear", "Tops", "Polos"]. */
export function grailedPathTitles(id: string): string[] {
  const n = GRAILED_NODES.get(id);
  if (!n) return [];
  const chain: string[] = [];
  let cur: GrailedNode | undefined = n;
  while (cur) {
    chain.unshift(cur.title);
    cur = cur.parentId === '' ? undefined : GRAILED_NODES.get(cur.parentId);
  }
  chain.unshift(GRAILED_DEPARTMENT_TITLES[n.department]);
  return chain;
}

/** "Menswear > Tops > Sweatshirts & Hoodies" ('' for an unknown id). */
export function grailedPathText(id: string): string {
  return grailedPathTitles(id).join(' > ');
}

/** Every leaf id, in tree order. */
export function grailedAllLeafIds(): string[] {
  const out: string[] = [];
  GRAILED_NODES.forEach((n) => { if (n.childIds.length === 0) out.push(n.id); });
  return out;
}
