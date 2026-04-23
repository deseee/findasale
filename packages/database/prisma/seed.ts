import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Seed configuration — override via environment variables to seed any region
const SEED_CONFIG = {
  city: process.env.SEED_CITY || 'Grand Rapids',
  state: process.env.SEED_STATE || 'MI',
  centerLat: parseFloat(process.env.SEED_CENTER_LAT || '42.96'),
  centerLng: parseFloat(process.env.SEED_CENTER_LNG || '-85.66'),
  zips: (process.env.SEED_ZIPS || '49503,49504,49505,49506,49507,49508,49509,49512,49525,49534').split(','),
};

// ─── Data pools ───────────────────────────────────────────────────────────────

const firstNames = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Karen', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Aaron', 'Bella', 'Chris', 'Diana',
  'Ethan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia', 'Kevin', 'Lisa', 'Marcus', 'Nina',
  'Oscar', 'Patricia', 'Quincy', 'Rebecca', 'Steven', 'Tabitha', 'Ulysses', 'Violet', 'Walter', 'Xena',
  'Yusuf', 'Zara', 'Adrian', 'Amelia', 'Austin', 'Ava', 'Benjamin', 'Bianca', 'Bradley', 'Brooke',
  'Caleb', 'Chloe', 'Daniel', 'Danielle', 'Derek', 'Destiny', 'Drew', 'Evan', 'Eva', 'Felix',
  'Felicity', 'Garrett', 'Gabriella', 'Gregory', 'Giselle', 'Hayden', 'Helena', 'Ivan', 'Jordan', 'Jasmine',
  'Keith', 'Kayla', 'Lance', 'Lena', 'Miles', 'Mia', 'Neil', 'Natalie', 'Owen', 'Penny',
];

const lastNames = [
  'Johnson', 'Smith', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
  'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Rodriguez', 'Lee', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams',
  'Nelson', 'Carter', 'Roberts', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Reeves',
  'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed', 'Bell', 'Gomez',
  'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Barnes',
];

// Organizer data arrays — index-aligned across all four.
// 8 Michigan, 1 N. Indiana, 1 Toledo OH for mild regional color.
const businessNames = [
  "Kelly's Estate Sales",
  'Barn Door Consignment',
  'Up North Flea Market Booth',
  'Martin Family Auctions',
  'Attic Finds Kalamazoo',
  'Cherry Street Antiques',
  'Lansing Estate & Downsizing',
  'Holland Home Clearouts',
  'South Bend Sale Co',
  'Toledo Estate Group',
];

const citiesByOrganizer = [
  'Grand Rapids',
  'Kalamazoo',
  'Holland',
  'Traverse City',
  'Kalamazoo',
  'Ann Arbor',
  'Lansing',
  'Holland',
  'South Bend',
  'Toledo',
];

const statesByOrganizer = [
  'MI', 'MI', 'MI', 'MI', 'MI', 'MI', 'MI', 'MI', 'IN', 'OH',
];

// Per-state zip code pools so IN/OH organizers don't get Michigan zips
const zipsByState: Record<string, string[]> = {
  MI: ['49503', '49504', '49505', '49506', '49007', '49009', '49423', '49424', '48103', '48104', '48906', '48912', '49684', '49686'],
  IN: ['46601', '46614', '46615', '46616', '46619', '46628', '46637'],
  OH: ['43604', '43606', '43607', '43609', '43610', '43612', '43613'],
};

// Sale type per organizer — index-aligned with businessNames
const saleTypesByOrganizer: Array<'ESTATE' | 'YARD' | 'CONSIGNMENT' | 'AUCTION' | 'FLEA_MARKET'> = [
  'ESTATE',       // Kelly's Estate Sales
  'CONSIGNMENT',  // Barn Door Consignment
  'FLEA_MARKET',  // Up North Flea Market Booth
  'AUCTION',      // Martin Family Auctions
  'ESTATE',       // Attic Finds Kalamazoo
  'CONSIGNMENT',  // Cherry Street Antiques
  'ESTATE',       // Lansing Estate & Downsizing
  'ESTATE',       // Holland Home Clearouts
  'ESTATE',       // South Bend Sale Co
  'ESTATE',       // Toledo Estate Group
];

// Realistic sale titles by type
const saleTitlesByType: Record<string, string[]> = {
  ESTATE: [
    'Three-Generation Estate Sale — Furniture, Tools, Jewelry',
    'Complete Home Contents — Downsizing After 40 Years',
    'Estate Liquidation: Quality Furniture and Collectibles',
    'Multi-Room Estate Sale',
    'Estate Sale: Vintage Textiles, Books, Home Furnishings',
  ],
  YARD: [
    'Moving Sale: Tools, Sporting Goods, Kitchen',
    'Garage Clean-Out: Furniture, Electronics, Books',
    'Moving Day Sale — Vintage Finds and Furniture',
  ],
  CONSIGNMENT: [
    'Curated Consignment: Vintage and Antiques',
    'Rotating Consignment — New Inventory This Week',
  ],
  AUCTION: [
    'Regional Estate Auction: Furniture and Jewelry',
    'Fine Art & Antiques Auction',
  ],
  FLEA_MARKET: [
    'Booth Restock — Vintage Tools and Collectibles',
    'Vendor Booth: Mid-Century Modern Finds',
  ],
};

const biosByOrganizer = [
  'Running estate sales around Grand Rapids since 2018. Mostly downsizing clients and full home cleanouts.',
  'Small consignment shop. Rotate inventory weekly. Take most furniture and vintage.',
  'Part-time flea market booth, eight years in. I try to keep the junk out.',
  'Family-run auction house, three generations. We run live and online.',
  'Two-person shop. We do estate sales and occasional auctions. Based in Kalamazoo.',
  'Small antique store on Ann Arbor\'s west side. Mix of mid-century and Victorian.',
  'Estate sales only. I don\'t do consignment, don\'t do appraisals, just sales.',
  'I do probate estates and full home cleanouts. Solo operator, word of mouth.',
  'South Bend and surrounding towns. Estate sales, some downsizing, the occasional moving sale.',
  'Toledo-area estate and auction work. Twenty-plus years. Still figuring out the internet.',
];

const streetNames = [
  'Wealthy St', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St',
  'Ionia Ave', 'Pearl St', 'Cass Ave', 'Sheldon Ave', 'Jefferson Ave',
  'Leonard St', 'College Ave', 'Lyon St', 'Madison Ave', 'Monroe Ave',
];

const itemTitles = [
  // Furniture
  'Mid-Century Walnut Credenza', 'Victorian Settee with Velvet Upholstery',
  'Pair of Teak Nightstands', 'Leather Wingback Chair', 'Antique Roll-Top Desk',
  'Hand-Caned Parsons Chair', 'MCM Dining Table with Two Leaves', 'Oak Farmhouse Table',
  'Cast Iron Floor Lamp', 'Chinoiserie Wall Cabinet', 'Queen Anne Side Table',
  // Kitchenware
  'Set of 6 Pyrex Mixing Bowls', 'Vintage Cast Iron Cookware Lot',
  'Copper Bottom Saute Pans, 8 piece', 'Roseville Pottery Pitcher',
  'Wedgwood China Dinnerware, 12 place setting', 'Le Creuset Enameled Dutch Oven',
  'Hand-Painted Ceramic Serving Bowls',
  // Tools
  'Vintage Craftsman Hand Tools Lot', 'Antique Wooden Tool Chest',
  'Stanley Bailey Bench Planes, set of 3', 'Makita Power Drill Set with Case',
  'DeWalt Cordless Circular Saw', 'Vintage Socket Set, 100+ pieces',
  // Collectibles
  'Signed Ansel Adams Photography Print', 'Tiffany-Style Stained Glass Lamp',
  'Royal Doulton Character Jugs, set of 12', 'First Edition Signed Literature Collection',
  'Vintage Lionel Train Set with Tracks', 'Antique Brass Candlesticks, pair',
  // Clothing & Accessories
  'Vintage Wool Coat Collection, 4 pieces', 'Hermès Silk Scarf Lot, 8 scarves',
  'Vintage Leather Jackets, 3 pieces',
  // Home goods
  'Framed Oil Painting, 24 by 36',
  'Antique Mirror with Ornate Gilt Frame', 'Vintage Persian Rug, 9 by 12',
  'Native American Pottery Vessel', 'Crystal Chandelier with 12 Lights',
  // Books & Media
  'Vintage Book Collection, 50+ volumes', 'Signed First Edition Books, 3 titles',
  'LP Record Collection, 100+ albums', 'Antique Map Collection, framed',
  'Vintage Board Games Lot, 8 titles',
  // Jewelry
  'Gold and Diamond Estate Jewelry Lot', '14K Gold Charm Bracelet',
  'Vintage Pearl Necklace', 'Antique Pocket Watch',
];

const saleDescriptions = [
  'Complete household estate sale including furniture, electronics, and collectibles.',
  'Multi-family estate sale featuring antique furniture, vintage collectibles, and household items.',
  'Large estate with quality furniture, artwork, and home décor.',
  'Collectors estate sale featuring vintage items and antiques.',
  'Downsizing estate sale with quality household furnishings.',
  'Complete home contents sale including all furniture and décor.',
  'Estate liquidation featuring furniture, art, and collectibles.',
  'Multi-room estate sale with furniture and household items.',
];

const categories = [
  'furniture', 'housewares', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing',
];

const conditions = ['mint', 'excellent', 'good', 'fair', 'poor'];

// Curated Unsplash photos (each URL verified HTTP 200). Secondary-sale themed —
// vintage furniture, estate items, antiques, tools, jewelry, books, décor.
const salePhotoUrls = [
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&h=400&fit=crop',
];

const itemPhotoPool = [
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=600&h=400&fit=crop',
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting database seed...');
  const defaultPassword = await bcrypt.hash('password123', 10);

  // ── Clear data, preserving artifactmi@gmail.com and deseee@gmail.com ───────
  console.log('🗑️  Clearing existing data (preserving protected accounts)...');

  const preservedEmails = ['artifactmi@gmail.com', 'deseee@gmail.com'];
  const preserved = await prisma.user.findMany({
    where: { email: { in: preservedEmails } },
    select: { id: true },
  });
  const preservedIds = preserved.map(u => u.id);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      // Delete all non-preserved organizers and their sales/items
      const nonPreservedOrgs = await tx.organizer.findMany({
        where: { userId: { notIn: preservedIds } },
        select: { id: true },
      });
      const orgIdsToDelete = nonPreservedOrgs.map(o => o.id);

      if (orgIdsToDelete.length > 0) {
        const salesToDelete = await tx.sale.findMany({
          where: { organizerId: { in: orgIdsToDelete } },
          select: { id: true },
        });
        const saleIdsToDelete = salesToDelete.map(s => s.id);

        if (saleIdsToDelete.length > 0) {
          await tx.item.deleteMany({ where: { saleId: { in: saleIdsToDelete } } });
          await tx.sale.deleteMany({ where: { id: { in: saleIdsToDelete } } });
        }

        await tx.organizer.deleteMany({ where: { id: { in: orgIdsToDelete } } });
      }

      // Delete non-preserved users (except protected accounts)
      await tx.user.deleteMany({ where: { id: { notIn: preservedIds } } });

      // Delete OrganizerWorkspace rows — Artifact/deseee are SIMPLE tier, not TEAMS,
      // so they have no workspaces. Wipe all to avoid slug unique-constraint collision.
      await (tx as any).organizerWorkspace.deleteMany({});

      // Delete badges and achievements (safe — not tied to preserved accounts)
      await tx.badge.deleteMany({});
      await tx.achievement.deleteMany({});

      console.log(`✅ Cleared data (preserved ${preservedIds.length} accounts)`);
    } finally {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
  });

  // ── Badges ────────────────────────────────────────────────────────────────
  console.log('⭐ Creating badges...');
  await prisma.badge.createMany({
    data: [
      { name: 'First Purchase',      description: 'Made your first purchase',    iconUrl: null, criteria: { type: 'purchases_made', count: 1 } },
      { name: 'Regular Shopper',     description: 'Made 5 purchases',            iconUrl: null, criteria: { type: 'purchases_made', count: 5 } },
      { name: 'Dedicated Collector', description: 'Made 20 purchases',           iconUrl: null, criteria: { type: 'purchases_made', count: 20 } },
      { name: 'Social Butterfly',    description: 'Referred 3 friends',          iconUrl: null, criteria: { type: 'referrals_made', count: 3 } },
      { name: 'Community Champion',  description: 'Earned 1000 points',          iconUrl: null, criteria: { type: 'points_earned', count: 1000 } },
      { name: 'Sale Scout',          description: 'Attended 5 different sales',  iconUrl: null, criteria: { type: 'sales_attended', count: 5 } },
      { name: 'Trail Blazer',        description: 'Completed a treasure trail',  iconUrl: null, criteria: { type: 'trails_completed', count: 1 } },
      { name: 'Auction Winner',      description: 'Won an auction item',         iconUrl: null, criteria: { type: 'auctions_won', count: 1 } },
    ],
  });
  const allBadges = await prisma.badge.findMany();
  const badgeMap = new Map(allBadges.map((b: any) => [b.name, b.id]));
  console.log(`✅ Created ${allBadges.length} badges`);

  // ── FeeStructure ──────────────────────────────────────────────────────────
  await prisma.feeStructure.upsert({
    where: { id: 1 },
    update: {},
    create: { listingType: '*', feeRate: 0.10 },
  });

  // ── Users (100 total) ─────────────────────────────────────────────────────
  console.log('👥 Creating 100 users...');
  const users: any[] = [];


  // 22 users: 1 admin (user1) + 9 organizers (user2-10) + 12 shoppers (user11-22).
  // The 12 shoppers cover hardcoded references user11-15 (bids, Hunt Pass) and
  // users[20]/users[21] (completed-sale purchases). Down from the original 100.
  for (let i = 0; i < 22; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName  = lastNames[i % lastNames.length];
    const email     = `user${i + 1}@example.com`;
    const isAdmin   = i === 0;
    const isOrg     = i < 10;
    const isShopper = i >= 10;

    // Compute roles array based on user type
    let rolesArray: string[];
    if (isAdmin) {
      rolesArray = ['USER', 'ORGANIZER', 'ADMIN'];
    } else if (isOrg) {
      rolesArray = ['USER', 'ORGANIZER'];
    } else {
      rolesArray = ['USER'];
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: `${firstName} ${lastName}`,
        role:  isAdmin ? 'ADMIN' : (isOrg ? 'ORGANIZER' : 'USER'),
        roles: rolesArray,

        phone: `616-555-${String(i).padStart(4, '0')}`,
        referralCode: `REF-${uuidv4().substring(0, 8).toUpperCase()}`,
        huntPassActive: i === 10, // user11 has Hunt Pass
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} users`);

  // ── Organizers (10 total, from users 1–10) ────────────────────────────────
  console.log('🏢 Creating 10 organizers...');
  const organizers: any[] = [];
  // Subscription tiers by organizer index (0-based): 0=SIMPLE, 1=PRO, 2=TEAMS, rest=SIMPLE
  // user1 = TEAMS + ADMIN (founder-level), user2 = PRO, user3 = SIMPLE
  const orgTiers: Record<number, string> = { 0: 'TEAMS', 1: 'PRO', 2: 'SIMPLE' };

  for (let i = 0; i < 10; i++) {
    const street = streetNames[i % streetNames.length];
    const number = 1000 + i * 123;
    const city = citiesByOrganizer[i];
    const state = statesByOrganizer[i];
    const stateZips = zipsByState[state];
    const zip = stateZips[i % stateZips.length];

    // TD-01: user1 (i=0) and user2 (i=1) get real Stripe test account IDs
    let stripeConnectId: string | null = null;
    if (i === 0) stripeConnectId = 'acct_1T6f2DLlmra0eowv';
    else if (i === 1) stripeConnectId = 'acct_1TF0UsLTUdLTeyio';
    else if (i === 2) stripeConnectId = 'acct_test_user3';
    else if (i < 8) stripeConnectId = `acct_test_${uuidv4().substring(0, 16)}`;

    const organizer = await prisma.organizer.create({
      data: {
        userId:          users[i].id,
        businessName:    businessNames[i],
        phone:           `616-555-${String(1000 + i).padStart(4, '0')}`,
        address:         `${number} ${street}, ${city}, ${statesByOrganizer[i]} ${zip}`,
        bio:             biosByOrganizer[i],
        website:         `https://organizer${i + 1}.example.com`,
        stripeConnectId: stripeConnectId,
        subscriptionTier: (orgTiers[i] || 'SIMPLE') as any,
      },
    });
    organizers.push(organizer);
  }
  console.log(`✅ Created ${organizers.length} organizers`);


  // ── Sales (25 total) ──────────────────────────────────────────────────────
  console.log('📅 Creating 25 sales...');
  const sales: any[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const orgIdx    = i % organizers.length;
    const organizer = organizers[orgIdx];
    const street    = streetNames[i % streetNames.length];
    const number    = Math.floor(Math.random() * 5000) + 100;
    const saleState = statesByOrganizer[orgIdx];
    const saleCity  = citiesByOrganizer[orgIdx];
    const stateZipList = zipsByState[saleState];
    const zip       = stateZipList[i % stateZipList.length];
    const saleType  = saleTypesByOrganizer[orgIdx];
    const titlePool = saleTitlesByType[saleType];
    const saleTitle = titlePool[i % titlePool.length];

    let startDate: Date, endDate: Date, status: string;
    if (i < 8) {
      // Future upcoming
      startDate = new Date(now); startDate.setDate(startDate.getDate() + (i + 2) * 7);
      endDate   = new Date(startDate); endDate.setDate(endDate.getDate() + 1);
      status    = 'PUBLISHED';
    } else if (i < 16) {
      // Active now
      startDate = new Date(now); startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 2));
      endDate   = new Date(now); endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 3) + 1);
      status    = 'PUBLISHED';
    } else if (i < 21) {
      // Ended
      endDate   = new Date(now); endDate.setMonth(endDate.getMonth() - (i - 15));
      startDate = new Date(endDate); startDate.setDate(startDate.getDate() - 1);
      status    = 'ENDED';
    } else {
      // Draft
      startDate = new Date(now); startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) + 1);
      endDate   = new Date(startDate); endDate.setDate(endDate.getDate() + 1);
      status    = 'DRAFT';
    }

    // Per-org geographic jitter so sales land near their organizer's city
    const cityLat = (zipsByState[saleState] && saleState === 'MI') ? 42.96 :
                    saleState === 'IN' ? 41.68 : 41.65;
    const cityLng = saleState === 'MI' ? -85.66 :
                    saleState === 'IN' ? -86.25 : -83.55;
    const lat  = cityLat + (Math.random() - 0.5) * 0.08;
    const lng  = cityLng + (Math.random() - 0.5) * 0.08;
    const tags = categories.slice(0, 3).sort(() => Math.random() - 0.5);

    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title:       saleTitle,
        description: saleDescriptions[i % saleDescriptions.length],
        startDate,
        endDate,
        address:   `${number} ${street}`,
        city:      saleCity,
        state:     saleState,
        zip,
        lat,
        lng,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) : null,
        photoUrls: [salePhotoUrls[i % salePhotoUrls.length]],
        tags,
        saleType,
      },
    });
    sales.push(sale);
  }
  console.log(`✅ Created ${sales.length} sales`);

  // ── Items (~12 per sale) ──────────────────────────────────────────────────
  console.log('📦 Creating items...');
  const items: any[] = [];
  let photoIdx = 0;
  let globalItemIndex = 0;

  for (const sale of sales) {
    const itemsPerSale = Math.floor(Math.random() * 5) + 10;
    for (let j = 0; j < itemsPerSale; j++) {
      const title     = itemTitles[Math.floor(Math.random() * itemTitles.length)];
      const category  = categories[Math.floor(Math.random() * categories.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      // Tiered price distribution: 65% $5-$75, 25% $100-$500, 10% $500-$2000
      const priceRand = Math.random();
      let price: number;
      if (priceRand < 0.65)      price = 5 + Math.random() * 70;
      else if (priceRand < 0.90) price = 100 + Math.random() * 400;
      else                       price = 500 + Math.random() * 1500;
      price = Math.round(price * 100) / 100;
      let itemStatus  = 'AVAILABLE';
      if (Math.random() < 0.10) itemStatus = 'SOLD';
      else if (Math.random() < 0.05) itemStatus = 'RESERVED';

      // Assign rarity to specific items for visual verification
      let rarity = null;
      if (globalItemIndex === 2) rarity = 'COMMON';
      else if (globalItemIndex === 7) rarity = 'UNCOMMON';
      else if (globalItemIndex === 15) rarity = 'RARE';
      else if (globalItemIndex === 25) rarity = 'ULTRA_RARE';
      else if (globalItemIndex === 35) rarity = 'LEGENDARY';

      const item = await prisma.item.create({
        data: {
          saleId:      sale.id,
          title:       `${title} #${j + 1}`,
          description: `Beautiful ${category} item in ${condition} condition. Authentic and well-maintained.`,
          price,
          category,
          condition,
          status:      itemStatus,
          photoUrls:   [itemPhotoPool[photoIdx % itemPhotoPool.length]],
          embedding:   [],
          draftStatus: 'PUBLISHED',
          ...(rarity && { rarity }),
        },
      });
      items.push(item);
      photoIdx++;
      globalItemIndex++;
    }
  }
  console.log(`✅ Created ${items.length} items`);

  // ── Auction items (3 specific items for bidding tests) ────────────────────
  const activeSale = sales.find((s: any) => s.status === 'PUBLISHED') ?? sales[0];
  const auctionItems: any[] = [];

  for (const [k, spec] of [
    { title: 'Signed Ansel Adams Print',   description: 'Authenticated signed lithograph, COA included.',      price: 200,  startPrice: 200,  category: 'art' },
    { title: 'Tiffany Style Stained Glass Lamp', description: 'Dragonfly pattern, 22" shade, excellent condition.', price: 300,  startPrice: 300,  category: 'housewares' },
    { title: 'Vintage Rolex Submariner',   description: '1968 ref. 5513 — original bracelet, recently serviced.', price: 2500, startPrice: 2500, category: 'jewelry' },
  ].entries()) {
    const photoSeeds = ['ansel-adams-print', 'tiffany-lamp', 'rolex-watch'];
    const ai = await prisma.item.create({
      data: {
        saleId:           activeSale.id,
        title:            (spec as any).title,
        description:      (spec as any).description,
        price:            (spec as any).price,
        auctionStartPrice:(spec as any).startPrice,
        condition:        'excellent',
        category:         (spec as any).category,
        listingType:      'AUCTION',
        photoUrls:        [`https://picsum.photos/seed/${photoSeeds[k]}/600/400`],
        status:           'AVAILABLE',
        draftStatus:      'PUBLISHED',
        embedding:        [],
      },
    });
    auctionItems.push(ai);
  }
  console.log(`✅ Created ${auctionItems.length} auction items`);

  // ── Purchases (base: ~50 random + 6 for user11) ───────────────────────────
  console.log('💳 Creating purchases...');
  const soldItems = items.filter((i: any) => i.status === 'SOLD' || i.status === 'RESERVED');
  const purchasesCreated: any[] = [];

  for (let i = 0; i < Math.min(50, soldItems.length); i++) {
    const item        = soldItems[i];
    const buyerIndex  = Math.floor(Math.random() * 12) + 10; // shoppers are users[10..21]
    const buyer       = users[buyerIndex];
    const pStatus     = Math.random() > 0.2 ? 'PAID' : 'PENDING';

    const p = await prisma.purchase.create({
      data: {
        userId:               buyer.id,
        itemId:               item.id,
        saleId:               item.saleId,
        amount:               item.price ?? 25,
        platformFeeAmount:    (item.price ?? 25) * 0.05,
        status:               pStatus,
        stripePaymentIntentId: pStatus === 'PAID' ? `pi_test_${uuidv4().substring(0, 20)}` : null,
      },
    });
    purchasesCreated.push(p);
  }

  // TD-02: 6+ specific purchases for user11 (primary shopper) — meets 5+ requirement
  const user11       = users[10]; // user11@example.com
  const availItems   = items.filter((i: any) => i.status === 'AVAILABLE').slice(0, 6);
  for (const item of availItems) {
    await prisma.purchase.create({
      data: {
        userId:               user11.id,
        itemId:               item.id,
        saleId:               item.saleId,
        amount:               item.price ?? 25,
        platformFeeAmount:    (item.price ?? 25) * 0.05,
        status:               'PAID',
        stripePaymentIntentId: `pi_test_u11_${uuidv4().substring(0, 16)}`,
      },
    });
  }
  console.log(`✅ Created ${purchasesCreated.length + 6} purchases (user11 has 6+)`);

  // ── Bids on auction items ─────────────────────────────────────────────────
  console.log('🔨 Creating bids...');
  const [aItem1, aItem2, aItem3] = auctionItems;
  const user12 = users[11];
  const user13 = users[12];
  const user14 = users[13];
  const user15 = users[14];

  // Adams print: user14 → user15 outbid → user11 winning
  await prisma.bid.create({ data: { userId: user14.id, itemId: aItem1.id, amount: 210, status: 'ACTIVE' } });
  await prisma.bid.create({ data: { userId: user15.id, itemId: aItem1.id, amount: 245, status: 'ACTIVE' } });
  await prisma.bid.create({ data: { userId: user11.id, itemId: aItem1.id, amount: 280, status: 'WINNING' } });

  // Tiffany lamp: user11 outbid by user12
  await prisma.bid.create({ data: { userId: user11.id, itemId: aItem2.id, amount: 320, status: 'ACTIVE' } });
  await prisma.bid.create({ data: { userId: user12.id, itemId: aItem2.id, amount: 375, status: 'WINNING' } });

  // Rolex: competitive
  await prisma.bid.create({ data: { userId: user12.id, itemId: aItem3.id, amount: 2600, status: 'ACTIVE' } });
  await prisma.bid.create({ data: { userId: user13.id, itemId: aItem3.id, amount: 2850, status: 'ACTIVE' } });
  await prisma.bid.create({ data: { userId: user14.id, itemId: aItem3.id, amount: 3100, status: 'WINNING' } });

  // Sync currentBid on auction items to reflect highest bid
  await prisma.item.update({ where: { id: aItem1.id }, data: { currentBid: 280 } });
  await prisma.item.update({ where: { id: aItem2.id }, data: { currentBid: 375 } });
  await prisma.item.update({ where: { id: aItem3.id }, data: { currentBid: 3100 } });
  console.log('✅ Created bids');

  // ── Favorites / Likes (TD-02: at least 10 likes for user11) ─────────────────
  const publishedSales = sales.filter((s: any) => s.status === 'PUBLISHED');

  // Sale favorites (4)
  for (const [idx, sale] of publishedSales.slice(0, 4).entries()) {
    await prisma.favorite.create({ data: { userId: user11.id, saleId: sale.id } });
    if (idx < 2) {
      await prisma.favorite.create({ data: { userId: user12.id, saleId: sale.id } });
    }
  }

  // TD-02: Item favorites — user11 likes items from followed organizers to reach 10+ likes total
  const itemsForLikes = items
    .filter((i: any) => i.status === 'AVAILABLE' &&
            (i.organizerId === organizers[0].id ||
             i.organizerId === organizers[1].id ||
             i.organizerId === organizers[2].id))
    .slice(0, 8);

  for (const item of itemsForLikes) {
    await prisma.favorite.create({ data: { userId: user11.id, itemId: item.id } });
  }

  console.log(`✅ Created ${4 + itemsForLikes.length} favorites (sales + items)`);

  // ── User badges ───────────────────────────────────────────────────────────
  console.log('🏅 Creating user badges...');
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);

  if (badgeMap.get('First Purchase')) {
    await prisma.userBadge.create({ data: { userId: user11.id, badgeId: badgeMap.get('First Purchase')!, awardedAt: oneWeekAgo } });
  }
  if (badgeMap.get('Sale Scout')) {
    await prisma.userBadge.create({ data: { userId: user11.id, badgeId: badgeMap.get('Sale Scout')!, awardedAt: twoDaysAgo } });
  }
  if (badgeMap.get('Trail Blazer')) {
    await prisma.userBadge.create({ data: { userId: user11.id, badgeId: badgeMap.get('Trail Blazer')!, awardedAt: new Date() } });
  }
  if (badgeMap.get('Social Butterfly')) {
    await prisma.userBadge.create({ data: { userId: user12.id, badgeId: badgeMap.get('Social Butterfly')!, awardedAt: oneWeekAgo } });
  }
  console.log('✅ Created user badges');

  // ── Wishlists + items ─────────────────────────────────────────────────────
  console.log('💝 Creating wishlists...');
  const wishlist1 = await prisma.wishlist.create({
    data: { userId: user11.id, name: 'Mid-Century Modern Hunt', occasion: 'decorating', isPublic: true },
  });
  const wishlist2 = await prisma.wishlist.create({
    data: { userId: user11.id, name: 'Vintage Jewelry', occasion: 'gifting', isPublic: false },
  });

  // WishlistItems must link to existing Item records
  const wishlistItemTargets = availItems.slice(0, 2);
  for (const target of wishlistItemTargets) {
    await prisma.wishlistItem.create({
      data: { wishlistId: wishlist1.id, itemId: target.id, note: 'Hoping to find this at the next sale!' },
    });
  }
  if (availItems[2]) {
    await prisma.wishlistItem.create({
      data: { wishlistId: wishlist2.id, itemId: availItems[2].id, note: 'Perfect for a gift.' },
    });
  }

  console.log('✅ Created wishlists');

  // ── Follows ───────────────────────────────────────────────────────────────
  console.log('🔔 Creating follows...');
  // user11 follows organizers 1, 2, 3
  for (const org of organizers.slice(0, 3)) {
    await prisma.follow.create({
      data: { userId: user11.id, organizerId: org.id },
    });
  }
  // user12 follows organizer 1
  await prisma.follow.create({ data: { userId: user12.id, organizerId: organizers[0].id } });
  console.log('✅ Created follows');

  // ── Sale RSVPs ────────────────────────────────────────────────────────────
  for (const sale of publishedSales.slice(0, 3)) {
    await prisma.saleRSVP.create({ data: { userId: user11.id, saleId: sale.id } });
  }
  if (publishedSales[0]) {
    await prisma.saleRSVP.create({ data: { userId: user12.id, saleId: publishedSales[0].id } });
  }
  console.log('✅ Created RSVPs');

  // ── Notifications ─────────────────────────────────────────────────────────
  console.log('🔔 Creating notifications...');
  const notifSale = publishedSales[0];
  if (notifSale) {
    await prisma.notification.create({
      data: { userId: user11.id, type: 'sale_alert', title: 'Sale starting soon!', body: `${notifSale.title} starts tomorrow. Don't miss it.`, link: `/sales/${notifSale.id}`, read: false },
    });
  }
  await prisma.notification.create({
    data: { userId: user11.id, type: 'badge', title: 'Badge earned: Trail Blazer! 🗺️', body: 'You completed your first treasure trail. +150 points added.', link: '/profile', read: true, createdAt: twoDaysAgo },
  });
  await prisma.notification.create({
    data: { userId: user11.id, type: 'purchase', title: 'Purchase confirmed', body: 'Your purchase has been confirmed. Arrange pickup with the organizer.', link: '/purchases', read: true, createdAt: oneWeekAgo },
  });
  await prisma.notification.create({
    data: { userId: user11.id, type: 'message', title: 'New message from organizer', body: 'The organizer replied to your question about the Eames chair.', link: '/messages', read: false, createdAt: new Date(now.getTime() - 3600000) },
  });
  await prisma.notification.create({
    data: { userId: user11.id, type: 'sale_alert', title: 'Wishlist match found!', body: 'An Eames chair was just listed near you — matches your wishlist.', link: '/wishlist', read: false, createdAt: new Date(now.getTime() - 86400000) },
  });
  await prisma.notification.create({
    data: { userId: user11.id, type: 'flash_deal', title: 'Flash deal ending soon', body: '30% off the Persian Rug — sale ends in 2 hours.', link: notifSale ? `/sales/${notifSale.id}` : '/sales', read: false, createdAt: new Date(now.getTime() - 7200000) },
  });
  // Organizer notifications
  await prisma.notification.create({
    data: { userId: users[1].id, type: 'system', title: 'New follower', body: 'A shopper started following your store.', link: '/organizer/dashboard', read: false },
  });
  console.log('✅ Created notifications');




  // ── Referrals ─────────────────────────────────────────────────────────────
  // user12 → referred user11; user11 → referred user13
  await prisma.referral.create({ data: { referrerId: user12.id, referredUserId: user11.id } });
  await prisma.referral.create({ data: { referrerId: user11.id, referredUserId: user13.id } });
  console.log('✅ Created referrals');

  // ── Missing Listing Bounties ──────────────────────────────────────────────
  // MissingListingBounty requires saleId — attach to active published sales
  if (publishedSales[0]) {
    await prisma.missingListingBounty.create({
      data: { saleId: publishedSales[0].id, userId: user11.id, description: 'Looking for an original Eames fiberglass shell chair, any color, any condition.', offerPrice: 300, status: 'OPEN' },
    });
  }
  if (publishedSales[1]) {
    await prisma.missingListingBounty.create({
      data: { saleId: publishedSales[1].id, userId: user11.id, description: 'Seeking a vintage Leica M3 camera in working condition with original case.', offerPrice: 400, status: 'OPEN' },
    });
  }
  if (publishedSales[2]) {
    await prisma.missingListingBounty.create({
      data: { saleId: publishedSales[2].id, userId: user12.id, description: 'Old Craftsman 10" table saw, any year pre-1985.', offerPrice: 150, status: 'OPEN' },
    });
  }
  console.log('✅ Created bounties');

  // ── Item Reservations / Holds (TD-02 additional: 2-3 holds for user3/organizer) ──────
  console.log('📌 Creating item reservations...');
  const holdItems = items
    .filter((i: any) => organizers[2] && i.organizerId === organizers[2].id && i.status === 'AVAILABLE')
    .slice(0, 3);

  const tomorrowPlus3Days = new Date(now);
  tomorrowPlus3Days.setDate(tomorrowPlus3Days.getDate() + 3);

  for (const [idx, item] of holdItems.entries()) {
    await prisma.itemReservation.create({
      data: {
        itemId:    item.id,
        userId:    [user11.id, user12.id, user14.id][idx],
        status:    idx === 0 ? 'CONFIRMED' : 'PENDING',
        expiresAt: tomorrowPlus3Days,
        note:      ['Held for Saturday pickup', 'Customer will confirm by Friday', 'On hold pending payment'][idx],
      },
    });
  }
  console.log(`✅ Created ${holdItems.length} item reservations`);

  // ── Reviews / Reputation Records (TD-02 additional: 2-3 reputation entries) ──────────
  console.log('⭐ Creating item reviews...');
  const soldItemsForReviews = items
    .filter((i: any) => i.status === 'SOLD' || i.status === 'RESERVED')
    .slice(0, 3);

  for (const [idx, item] of soldItemsForReviews.entries()) {
    await prisma.review.create({
      data: {
        saleId:      item.saleId,
        userId:      [user11.id, user12.id, user14.id][idx],
        rating:      [5, 4, 5][idx],
        comment:     ['Arrived in perfect condition. The organizer was very helpful with questions.', 'Item matched the photos well. Fair price for the quality.', 'Exactly what I was looking for. Will shop here again!'][idx],
        createdAt:   [twoWeeksAgo, oneWeekAgo, twoDaysAgo][idx],
      },
    });
  }
  console.log(`✅ Created ${soldItemsForReviews.length} reviews`);

  // ── User Streaks ──────────────────────────────────────────────────────────
  // unique per [userId, type] — types: 'visit' | 'save' | 'buy'
  await prisma.userStreak.create({ data: { userId: user11.id, type: 'visit', currentStreak: 5,  longestStreak: 5,  lastActivityDate: now } });
  await prisma.userStreak.create({ data: { userId: user11.id, type: 'buy',   currentStreak: 2,  longestStreak: 3,  lastActivityDate: twoDaysAgo } });
  await prisma.userStreak.create({ data: { userId: users[1].id, type: 'visit', currentStreak: 12, longestStreak: 30, lastActivityDate: now } });
  await prisma.userStreak.create({ data: { userId: users[2].id, type: 'visit', currentStreak: 8,  longestStreak: 45, lastActivityDate: now } });
  console.log('✅ Created user streaks');


  // ── Points Transactions ───────────────────────────────────────────────────
  console.log('💰 Creating points transactions...');
  await prisma.pointsTransaction.create({ data: { userId: user11.id, type: 'PURCHASE', points: 50,  description: 'First Purchase badge awarded',  createdAt: oneWeekAgo } });
  await prisma.pointsTransaction.create({ data: { userId: user11.id, type: 'REVIEW',   points: 100, description: 'Referral bonus — referred user13', createdAt: twoDaysAgo } });
  await prisma.pointsTransaction.create({ data: { userId: user11.id, type: 'VISIT',    points: 150, description: 'Trail Blazer badge awarded',       createdAt: new Date() } });
  await prisma.pointsTransaction.create({ data: { userId: users[1].id, type: 'PURCHASE', points: 500, description: 'Monthly PRO organizer bonus',    createdAt: oneWeekAgo } });
  await prisma.pointsTransaction.create({ data: { userId: users[2].id, type: 'PURCHASE', points: 1000, description: 'Monthly TEAMS organizer bonus', createdAt: oneWeekAgo } });
  await prisma.pointsTransaction.create({ data: { userId: user12.id, type: 'PURCHASE', points: 50, description: 'First Purchase badge awarded',      createdAt: twoWeeksAgo } });
  console.log('✅ Created points transactions');

  // ── Conversations + Messages ──────────────────────────────────────────────
  console.log('💬 Creating conversations and messages...');
  const org1 = organizers[0]; // organizer for users[0]
  const org2 = organizers[1]; // organizer for users[1]

  if (publishedSales.find((s: any) => s.organizerId === org1.id)) {
    const saleForConvo1 = publishedSales.find((s: any) => s.organizerId === org1.id)!;
    const convo1 = await prisma.conversation.create({
      data: { shopperUserId: user11.id, organizerId: org1.id, saleId: saleForConvo1.id },
    });
    await prisma.message.create({
      data: { conversationId: convo1.id, senderId: user11.id, body: 'Hi! Is the mid-century dresser still available?', createdAt: new Date(now.getTime() - 86400000 * 2) },
    });
    await prisma.message.create({
      data: { conversationId: convo1.id, senderId: users[0].id, body: "Yes, it's available! Comes with original hardware. Great condition.", createdAt: new Date(now.getTime() - 86400000 * 2 + 3600000) },
    });
    await prisma.message.create({
      data: { conversationId: convo1.id, senderId: user11.id, body: 'Wonderful! Will you hold it if I come Saturday morning?', createdAt: new Date(now.getTime() - 86400000) },
    });
  }

  // Find a sale belonging to org2 for second conversation
  const saleForConvo2 = publishedSales.find((s: any) => s.organizerId === org2.id);
  if (saleForConvo2 && saleForConvo2.id !== (publishedSales.find((s: any) => s.organizerId === org1.id) ?? {}).id) {
    const convo2 = await prisma.conversation.create({
      data: { shopperUserId: user11.id, organizerId: org2.id, saleId: saleForConvo2.id },
    });
    await prisma.message.create({
      data: { conversationId: convo2.id, senderId: user11.id, body: 'Is there flexibility on the Persian rug pricing?', createdAt: new Date(now.getTime() - 86400000 * 3) },
    });
    await prisma.message.create({
      data: { conversationId: convo2.id, senderId: users[1].id, body: 'Best I can do is $700 cash — it is priced below market for a genuine Tabriz.', createdAt: new Date(now.getTime() - 86400000 * 3 + 7200000) },
    });
  }
  console.log('✅ Created conversations and messages');

  // ── OS-03: Workspace record for user2 (PRO organizer) ─────────────────────
  console.log('🏢 Creating workspace for user2...');
  const user2 = users[1]; // user2@example.com — PRO organizer
  const workspace = await (prisma as any).organizerWorkspace.create({
    data: {
      name: 'FindA.Sale Premium Workspace',
      slug: 'pro-workspace-user2',
      ownerId: org2.id,
    },
  });
  console.log('✅ Created workspace');

  // ── FR-01: Completed PRO-tier sale with purchase transactions ──────────────
  console.log('💳 Creating completed sale with purchases for user2...');
  const completedSaleStartDate = new Date(now);
  completedSaleStartDate.setMonth(completedSaleStartDate.getMonth() - 2);
  const completedSaleEndDate = new Date(completedSaleStartDate);
  completedSaleEndDate.setDate(completedSaleEndDate.getDate() + 1);

  const completedSale = await prisma.sale.create({
    data: {
      organizerId: org2.id,
      title: 'Premium Estate Clearance - Completed Sale',
      description: 'High-value estate sale featuring curated antiques and collectibles. All items sold.',
      startDate: completedSaleStartDate,
      endDate: completedSaleEndDate,
      address: '2847 Wealthy St',
      city: SEED_CONFIG.city,
      state: SEED_CONFIG.state,
      zip: SEED_CONFIG.zips[1],
      lat: SEED_CONFIG.centerLat + 0.02,
      lng: SEED_CONFIG.centerLng - 0.02,
      status: 'ENDED',
      photoUrls: [salePhotoUrls[0]],
      tags: ['antiques', 'collectibles', 'vintage'],
    },
  });

  // Create items for the completed sale
  const completedSaleItems = [];
  const completedItemSpecs = [
    { title: 'Victorian Mahogany Secretary Desk', price: 450.00, category: 'furniture', condition: 'excellent' },
    { title: 'Signed Oil Painting - Landscape', price: 800.00, category: 'art', condition: 'excellent' },
  ];

  for (const spec of completedItemSpecs) {
    const item = await prisma.item.create({
      data: {
        saleId: completedSale.id,
        title: spec.title,
        description: `Premium ${spec.category} item in ${spec.condition} condition. Authenticated and appraised.`,
        price: spec.price,
        status: 'SOLD',
        category: spec.category,
        condition: spec.condition,
        photoUrls: [itemPhotoPool[completedSaleItems.length]],
        embedding: [],
      },
    });
    completedSaleItems.push(item);
  }

  // Create completed purchases with PAID status
  for (let i = 0; i < completedSaleItems.length; i++) {
    const item = completedSaleItems[i];
    const buyerIndex = 20 + i; // Different shoppers
    const buyer = users[buyerIndex];

    await prisma.purchase.create({
      data: {
        userId: buyer.id,
        itemId: item.id,
        saleId: completedSale.id,
        amount: item.price ?? 100.00,
        platformFeeAmount: (item.price ?? 100.00) * 0.10,
        status: 'PAID',
        source: 'ONLINE',
        stripePaymentIntentId: `pi_test_completed_${uuidv4().substring(0, 16)}`,
      },
    });
  }

  console.log('✅ Created completed sale with 2 items and 2 PAID purchases');

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalPurchases = purchasesCreated.length + 6;
  const totalFavorites = 4 + itemsForLikes.length;
  const totalHolds = holdItems.length;
  const totalReviews = soldItemsForReviews.length;

  // ─── REAL ACCOUNTS (survive database nuke) ───────────────────────────────
  // These are Patrick's production accounts. Always seeded so local dev
  // matches the real account structure. Passwords: password123 (local only).

  const patrickAdmin = await prisma.user.upsert({
    where: { email: 'deseee@gmail.com' },
    update: { name: 'Patrick Desmet', role: 'ADMIN', roles: ['USER', 'ORGANIZER', 'ADMIN'] },
    create: {
      email: 'deseee@gmail.com',
      name: 'Patrick Desmet',
      password: defaultPassword,
      role: 'ADMIN',
      roles: ['USER', 'ORGANIZER', 'ADMIN'],
    },
  });
  await prisma.organizer.upsert({
    where: { userId: patrickAdmin.id },
    update: { subscriptionTier: 'TEAMS', subscriptionStatus: 'active' },
    create: {
      userId: patrickAdmin.id,
      businessName: 'FindA.Sale Admin',
      phone: '616-555-0001',
      address: '123 Main St, Grand Rapids, MI 49503',
      bio: 'Platform administrator',
      subscriptionTier: 'TEAMS',
      subscriptionStatus: 'active',
    },
  });

  const artifactUser = await prisma.user.upsert({
    where: { email: 'artifactmi@gmail.com' },
    update: { name: 'Artifact MI', role: 'ORGANIZER', roles: ['USER', 'ORGANIZER'] },
    create: {
      email: 'artifactmi@gmail.com',
      name: 'Artifact MI',
      password: defaultPassword,
      role: 'ORGANIZER',
      roles: ['USER', 'ORGANIZER'],
    },
  });
  await prisma.organizer.upsert({
    where: { userId: artifactUser.id },
    update: { subscriptionTier: 'TEAMS', subscriptionStatus: 'active' },
    create: {
      userId: artifactUser.id,
      businessName: 'Artifact MI',
      phone: '616-555-0002',
      address: '456 Commerce Ave, Grand Rapids, MI 49504',
      bio: 'Estate sales and antique liquidation specialist',
      subscriptionTier: 'TEAMS',
      subscriptionStatus: 'active',
    },
  });
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n✨ Seed complete!');
  console.log('\n📋 Data Summary:');
  console.log(`  • Users:            100 (user1=ADMIN, user2=PRO organizer, user3=TEAMS organizer, user11=primary shopper)`);
  console.log(`  • Organizers:       10 (tiers: 1×SIMPLE admin, 1×PRO, 1×TEAMS, 7×SIMPLE) [TD-01: user2+user3 Stripe connected]`);
  console.log(`  • Sales:            ${sales.length} (8 upcoming, 8 active, 5 ended, 4 draft)`);
  console.log(`  • Items:            ${items.length} + ${auctionItems.length} auction items [TD-04: stable picsum.photos URLs]`);
  console.log(`  • Auction items:    ${auctionItems.length} (Ansel Adams print, Tiffany lamp, Vintage Rolex)`);
  console.log(`  • Purchases:        ${totalPurchases} [TD-02: 6 for user11 — exceeds 5+ requirement]`);
  console.log(`  • Bids:             9 (user11 winning on Adams print, outbid on Tiffany lamp)`);
  console.log(`  • Favorites/Likes:  ${totalFavorites} (4 sales + ${itemsForLikes.length} items) [TD-02: ${totalFavorites}+ for user11]`);
  console.log(`  • Badges:           ${allBadges.length} types | user11 has 3 badges [TD-03: ✓ complete]`);
  console.log(`  • Wishlists:        2 for user11 with items`);
  console.log(`  • Notifications:    7 (6 for user11, 1 for organizer)`);
  console.log(`  • Follows:          4 follows (user11 → orgs 1-3)`);
  console.log(`  • Referrals:        2 (user12→user11→user13 chain)`);
  console.log(`  • Bounties:         3 (2 for user11, 1 for user12)`);
  console.log(`  • Item Holds:       ${totalHolds} (user3 organizer) [NEW: TD-02 additional data]`);
  console.log(`  • Reviews:          ${totalReviews} (with ratings 4-5) [NEW: TD-02 additional data]`);
  console.log(`  • User streaks:     4 records`);
  console.log(`  • Points tx:        6`);
  console.log(`  • Conversations:    up to 2 | Messages: up to 5`);
  console.log('\n🔑 Test accounts (all passwords: password123):');
  console.log('   user1@example.com     — ADMIN + SIMPLE organizer');
  console.log('   user2@example.com     — PRO organizer [TD-01: Stripe acct_test_user2]');
  console.log('   user3@example.com     — TEAMS organizer [TD-01: Stripe acct_test_user3]');
  console.log('   user11@example.com    — Shopper [TD-02: 6+ purchases, 10+ likes, badges, trail, reviews, holds]');
  console.log('\n🔑 Real accounts (password: password123 locally):');
  console.log('   deseee@gmail.com      — ADMIN + TEAMS organizer (Patrick)');
  console.log('   artifactmi@gmail.com  — TEAMS organizer (Artifact MI)');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
