/**
 * outreachFilter.ts
 *
 * Business-name filter for the DirectoryClaimEmail outreach queue.
 * Runs before any organizer is inserted so off-topic businesses never
 * receive a claim email.
 *
 * Logic: allowlist-first, blocklist-second, default PASS.
 * When in doubt, let it through — false negatives (missed blocklist hits)
 * are much less damaging than false positives (blocking legitimate leads).
 */

/**
 * Two-layer outreach filter.
 * Layer 1 (allowlist): anything secondhand-adjacent passes immediately.
 * Layer 2 (blocklist): pure service businesses with no goods inventory.
 * Default: PASS — when in doubt, let it through.
 */
export function isValidOutreachTarget(businessName: string): boolean {
  if (!businessName) return true;
  const name = businessName.toLowerCase();

  // ── LAYER 1 — allowlist (pass immediately, no further checks) ──────────────
  const allowlist = [
    // Estate & liquidation
    'estate sale', 'estate sales', 'estate liquidat', 'estate clear', 'estate clean',
    'estate service', 'estate specialist', 'estate professional', 'estate auction',
    'estate transition', 'estate management', 'estate tag', 'tag sale',
    // Auction
    'auction', 'auctioneer', 'auction house', 'auction co', 'live auction',
    'online auction', 'absolute auction', 'benefit auction', 'charity auction',
    'storage auction', 'farm auction', 'industrial auction', 'government surplus',
    'police auction', 'seized property', 'unclaimed freight',
    // Pawn & buying
    'pawn', 'pawnbroker', 'buy sell trade', 'cash for gold', 'cash 4 gold',
    'we buy gold', 'gold buyer', 'coin dealer', 'coin shop', 'jewelry buyer',
    'we buy jewelry', 'numismatic', 'philatelic',
    // Antique & vintage
    'antique', 'antiquities', 'vintage', 'retro', 'mid-century', 'mid century',
    'collectible', 'collectibles', 'memorabilia', 'nostalgia', 'curio',
    'curiosities', 'ephemera', 'picker', 'treasure hunter',
    // Consignment & resale
    'consignment', 'consign', 'resale', 're-sale', 'resell',
    'secondhand', 'second hand', 'pre-owned', 'preowned', 'gently used',
    'nearly new', 'like new', 'used goods', 'used furniture', 'used clothing',
    'used books', 'rare book', 'used records', 'vinyl record',
    'used instruments', 'used electronics',
    // Thrift & surplus
    'thrift', 'charity shop', 'surplus', 'overstock', 'closeout', 'clearance',
    'habitat restore',
    // Liquidation
    'liquidation', 'liquidator', 'close-out', 'bankruptcy sale',
    'bankruptcy liquidation',
    // Flea & yard
    'flea market', 'swap meet', 'yard sale', 'garage sale', 'rummage sale',
    'moving sale', 'attic sale', 'basement sale', 'barn sale',
    // Salvage & repurposing
    'salvage', 'reclaimed', 'reclamation', 'architectural salvage',
    'repurposed', 'upcycle', 'junk shop', 'junker', 'junking', 'flipper',
    // Downsizing / transition
    'downsizing', 'downsize', 'senior move', 'senior transition',
    'relocation sale', 'declutter',
    // Specialty resale categories
    'sports card', 'trading card', 'baseball card', 'record shop',
    'vintage jewelry', 'estate jewelry', 'bridal consignment',
    'baby consignment', "children's resale", 'used tools',
    'sporting goods resale',
  ];
  if (allowlist.some(kw => name.includes(kw))) return true;

  // ── LAYER 2 — blocklist (only fires if Layer 1 didn't match) ──────────────
  // Only businesses whose ENTIRE model is service/experience delivery with
  // no physical goods inventory. When in doubt, do NOT add to this list.
  //
  // Note: many entries have leading/trailing spaces (e.g. ' hotel ', ' diner ')
  // for whole-word matching so "motel" doesn't block "motel antiques" and
  // "hotel" doesn't block "hotel furniture liquidation". Keep the spaces.
  const blocklist = [
    // Food service
    'restaurant', ' diner', ' deli ', 'delicatessen', ' cafe ', ' cafeteria',
    'coffee shop', ' bakery', ' bistro', 'fast food', 'catering company',
    'food truck', 'steakhouse', 'pizzeria', 'sushi bar',
    // Hospitality
    ' hotel ', ' motel ', ' resort ', ' inn ', 'bed and breakfast', ' b&b ',
    // Financial services (not pawn — already in allowlist)
    ' bank ', 'credit union', 'mortgage lender', 'financial advisor',
    'wealth management', 'investment advisor',
    // Healthcare
    'hospital', 'medical center', 'dental office', 'dental clinic',
    ' pharmacy', 'urgent care', 'health clinic', 'veterinary clinic',
    // Personal care (pure service)
    'hair salon', 'nail salon', 'nail spa', 'beauty salon', ' barbershop',
    'day spa', 'massage therapy', ' yoga studio', 'fitness studio',
    'crossfit', 'pilates studio',
    // Pure professional services
    'marketing agency', 'digital agency', 'pr firm', 'web design',
    'software company', 'app developer', 'saas', 'tech startup',
    'accounting firm', 'tax preparer', 'bookkeeping service',
    // New construction (not renovation/salvage)
    'home builder', 'general contractor', 'new construction',
    'custom home builder',
    // Grocery / supermarket
    'grocery store', 'supermarket', 'food market',
    // Pet services (not resale)
    'pet grooming', 'dog grooming', 'dog trainer',
  ];

  // Pad name with spaces for whole-word matching on short terms
  const padded = ` ${name} `;
  if (blocklist.some(kw => padded.includes(kw))) return false;

  // ── DEFAULT: pass ──────────────────────────────────────────────────────────
  return true;
}
