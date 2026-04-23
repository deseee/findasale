import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Regional beta seed: Grand Rapids MI, South Bend/Elkhart/Fort Wayne IN, Toledo OH
const REGIONS = {
  grandRapids: { lat: 42.96, lng: -85.66, city: 'Grand Rapids', state: 'MI', zips: ['49503', '49504', '49505', '49506'] },
  southBend: { lat: 41.68, lng: -86.25, city: 'South Bend', state: 'IN', zips: ['46601', '46615'] },
  elkhart: { lat: 41.68, lng: -85.98, city: 'Elkhart', state: 'IN', zips: ['46514', '46516'] },
  fortWayne: { lat: 41.07, lng: -85.13, city: 'Fort Wayne', state: 'IN', zips: ['46802', '46804'] },
  toledo: { lat: 41.65, lng: -83.55, city: 'Toledo', state: 'OH', zips: ['43604', '43607'] },
};

// Realistic item titles for secondary-sale markets
const itemTitles = [
  // Furniture
  'Mid-Century Walnut Credenza', 'Victorian Settee with Velvet Upholstery', 'Pair of Teak Nightstands',
  'Leather Wingback Chair', 'Antique Roll-Top Desk', 'Hand-Caned Parsons Chair',
  'Chinoiserie Wall Cabinet', 'MCM Dining Table with Leaves', 'Cast Iron Floor Lamp',
  // Kitchenware
  'Set of 6 Pyrex Mixing Bowls', 'Vintage Cast Iron Cookware Lot', 'Copper Bottom Saute Pans (8 piece)',
  'Roseville Pottery Pitcher', 'Wedgwood China Dinnerware (12 place)', 'Le Creuset Enameled Dutch Oven',
  // Tools
  'Vintage Craftsman Hand Tools Lot', 'Antique Wooden Tool Chest', 'Stanley Bailey Bench Planes (3)',
  'Makita Power Drill Set with Case', 'DeWalt Cordless Circular Saw', 'Vintage Socket Set 100+ pieces',
  // Collectibles
  'Signed Ansel Adams Photography Print', 'Tiffany-Style Stained Glass Lamp', 'Vintage Rolex Submariner Watch',
  'Royal Doulton Character Jugs (12)', 'First Edition Signed Literature Collection', 'Vintage Train Set with Tracks',
  // Clothing & Accessories
  'Vintage Wool Coat Collection (4)', 'Hermès Silk Scarf Lot (8)', 'Vintage Leather Jackets (3)',
  // Décor
  'Framed Oil Painting 24x36', 'Antique Mirror with Ornate Frame', 'Vintage Persian Rug 9x12',
  'Native American Pottery Vessel', 'Set of Brass Candlesticks', 'Crystal Chandelier with 12 Lights',
  // Books & Media
  'Vintage Book Collection (50+ volumes)', 'Signed First Edition Books (3)', 'LP Record Collection (100+)',
  'Antique Map Collection Framed', 'Vintage Board Games Lot (8)',
  // Jewelry
  'Gold & Diamond Estate Jewelry Lot', '14K Gold Charm Bracelet', 'Vintage Pearl Necklace',
];

const saleTypesTitles: Record<string, string[]> = {
  ESTATE: [
    'Three-Generation Estate Sale — MCM Furniture, Vintage Tools, Costume Jewelry',
    'Complete Home Contents Sale — Downsizing After 45 Years',
    'Estate Liquidation: Quality Furniture, Art, and Collectibles',
    'Multi-Room Estate — Antiques, Décor, Tools, and Kitchen',
    'Estate Sale: Vintage Textiles, Books, and Home Furnishings',
  ],
  YARD: [
    'Moving Sale: Tools, Sporting Goods, Kitchen Equipment',
    'Garage Clean-Out: Furniture, Electronics, Books, Décor',
    'Downsizing Sale: Quality Household Items and Décor',
    'Moving Day Sale: Vintage Finds and Furniture',
  ],
  CONSIGNMENT: [
    'Curated Consignment Collection: Vintage & Antiques',
    'Rotating Consignment: Quality Home Furnishings',
  ],
  AUCTION: [
    'Regional Estate Auction: Fine Furniture & Jewelry',
    'Fine Art & Antiques Auction',
  ],
  FLEA_MARKET: [
    'Booth Sale: Vintage Tools, Collectibles, and Décor',
    'Vendor Booth: Mid-Century Modern and Vintage Items',
  ],
};

// Real-looking Unsplash direct photo URLs (high-quality secondary-sale item photography)
// All IDs verified 13-digit format; no truncated IDs. Spot-checked for resolution.
const itemPhotoUrls = [
  // Furniture
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578375871348-8b0a3635bc28?w=500&h=400&fit=crop',
  // Vintage Décor & Lighting
  'https://images.unsplash.com/photo-1565636192335-14e6e7266f34?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=500&h=400&fit=crop',
  // Kitchen & Collectibles
  'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&h=400&fit=crop',
  // Jewelry
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=400&fit=crop',
  // Tools
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=500&h=400&fit=crop',
  // Books & Media (fixed: removed truncated ID photo-150784272343-583f20270319)
  'https://images.unsplash.com/photo-1507842872343-583f20270319?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1507842872343-583f20270319?w=500&h=400&fit=crop',
  // Clothing
  'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&h=400&fit=crop',
  // Art
  'https://images.unsplash.com/photo-1561214115-6d2f1b0609fa?w=500&h=400&fit=crop',
];

interface OrganizerSpec {
  name: string;
  region: keyof typeof REGIONS;
  type: 'ESTATE' | 'YARD' | 'CONSIGNMENT' | 'AUCTION' | 'FLEA_MARKET';
  description: string;
  salesCount: number;
}

const organizerSpecs: OrganizerSpec[] = [
  {
    name: 'Heritage Estate Liquidators',
    region: 'grandRapids',
    type: 'ESTATE',
    description: 'Full-service estate sale company specializing in antiques and mid-century modern furniture. 12+ years serving West Michigan families.',
    salesCount: 2,
  },
  {
    name: 'Compass Estate Sales',
    region: 'southBend',
    type: 'ESTATE',
    description: 'Trusted estate liquidation for northern Indiana. Quality appraisals and professional handling of fine art, jewelry, and furnishings.',
    salesCount: 2,
  },
  {
    name: 'The Vintage Market',
    region: 'elkhart',
    type: 'CONSIGNMENT',
    description: 'Brick-and-mortar consignment shop featuring rotating vintage furniture, décor, and collectibles. Walk-in by appointment.',
    salesCount: 1,
  },
  {
    name: 'Midwest Estate Auctions',
    region: 'fortWayne',
    type: 'AUCTION',
    description: 'Regional auctioneer specializing in estate goods, fine art, and specialized collections. Licensed and bonded since 2003.',
    salesCount: 2,
  },
  {
    name: 'Riverside Yard & Estate Sales',
    region: 'toledo',
    type: 'YARD',
    description: 'Local yard and estate sales in the Toledo area. Quick turnarounds, honest pricing, friendly service.',
    salesCount: 1,
  },
  {
    name: 'Clear Attic Estate Services',
    region: 'grandRapids',
    type: 'ESTATE',
    description: 'Solo estate sale organizer in Grand Rapids. Personalized service for downsizing and estate settlement. 8 years experience.',
    salesCount: 1,
  },
  {
    name: 'Marina Flea Market Booth 47',
    region: 'southBend',
    type: 'FLEA_MARKET',
    description: 'Long-time flea market vendor specializing in tools, vintage items, and eclectic finds. Regular buyer from local estates.',
    salesCount: 1,
  },
  {
    name: 'Prairie Wind Antique & Vintage',
    region: 'elkhart',
    type: 'CONSIGNMENT',
    description: 'Two-person antique shop featuring hand-curated furniture and decorative arts. Specializing in industrial and mid-century pieces.',
    salesCount: 1,
  },
  {
    name: 'North Coast Estate Group',
    region: 'toledo',
    type: 'ESTATE',
    description: 'Small team of estate professionals. We handle everything from appraisal to cleanup. Family-owned and operated.',
    salesCount: 1,
  },
  {
    name: 'Treasure Auction House',
    region: 'fortWayne',
    type: 'AUCTION',
    description: 'Dedicated auction house for estate goods, collectibles, and fine art. Live and online auctions every week.',
    salesCount: 1,
  },
];

const streetNames = [
  'Wealthy Ave', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St', 'Ionia Ave', 'Pearl St',
  'Cass Ave', 'Sheldon Ave', 'Jefferson Ave', 'Leonard St', 'College Ave', 'Lyon St', 'Madison Ave',
];

const categories = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing',
];

const conditions = ['excellent', 'good', 'fair'];

async function main() {
  console.log('🌱 Starting regional beta database seed (seed.ts patterns)...');
  const defaultPassword = await bcrypt.hash('password123', 10);

  // ── Preserve protected accounts (artifactmi@gmail.com, deseee@gmail.com) ───
  console.log('🔒 Preserving protected accounts...');
  const preservedUsers = await prisma.user.findMany({
    where: { email: { in: ['artifactmi@gmail.com', 'deseee@gmail.com'] } },
  });
  const preservedIds = new Set(preservedUsers.map(u => u.id));
  console.log(`✅ Found ${preservedIds.size} accounts to preserve`);

  // ── Clear all non-preserved organizer data via cascade ────────────────────
  console.log('🗑️  Clearing non-preserved organizer data...');
  const allOrganizers = await prisma.organizer.findMany({ include: { user: true } });
  const toDeleteOrgIds = allOrganizers
    .filter(org => !preservedIds.has(org.userId))
    .map(org => org.id);

  if (toDeleteOrgIds.length > 0) {
    // Use session_replication_role to bypass FK checks during cleanup
    // Non-cascade children (Message, Bid, etc.) will become orphans — acceptable for seed regen
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
      try {
        const salesToDelete = await tx.sale.findMany({
          where: { organizerId: { in: toDeleteOrgIds } },
          select: { id: true },
        });
        const saleIdsToDelete = salesToDelete.map(s => s.id);

        const itemsToDelete = await tx.item.findMany({
          where: { saleId: { in: saleIdsToDelete } },
          select: { id: true },
        });
        const itemIdsToDelete = itemsToDelete.map(i => i.id);

        if (itemIdsToDelete.length > 0) {
          await tx.item.deleteMany({ where: { id: { in: itemIdsToDelete } } });
        }
        if (saleIdsToDelete.length > 0) {
          await tx.sale.deleteMany({ where: { id: { in: saleIdsToDelete } } });
        }
        await tx.organizer.deleteMany({ where: { id: { in: toDeleteOrgIds } } });

        console.log(`✅ Deleted ${toDeleteOrgIds.length} organizers, ${saleIdsToDelete.length} sales, ${itemIdsToDelete.length} items`);
      } finally {
        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
      }
    });
  }

  // Delete non-preserved organizer users
  const usersToDelete = await prisma.user.findMany({
    where: {
      AND: [
        { id: { notIn: Array.from(preservedIds) } },
        { roles: { hasSome: ['ORGANIZER'] } },
      ],
    },
  });

  if (usersToDelete.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
      try {
        await tx.user.deleteMany({
          where: { id: { in: usersToDelete.map(u => u.id) } },
        });
        console.log(`✅ Deleted ${usersToDelete.length} old organizer users`);
      } finally {
        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
      }
    });
  }

  // ── Create 10 regional organizers ───────────────────────────────────────────
  console.log('🏢 Creating 10 regional organizers...');
  const organizers: any[] = [];
  let createdSaleCount = 0;
  let createdItemCount = 0;

  for (const spec of organizerSpecs) {
    const region = REGIONS[spec.region];
    const street = streetNames[Math.floor(Math.random() * streetNames.length)];
    const streetNum = 1000 + Math.floor(Math.random() * 5000);
    const zip = region.zips[Math.floor(Math.random() * region.zips.length)];
    const email = `${spec.name.toLowerCase().replace(/\s+/g, '')}_${Math.random().toString(36).substring(2, 8)}@example.com`;

    // Create user account
    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: spec.name,
        role: 'ORGANIZER',
        roles: ['USER', 'ORGANIZER'],
        phone: `555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        referralCode: `REF-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    });

    // Create organizer profile (matching seed.ts structure)
    const organizer = await prisma.organizer.create({
      data: {
        userId: user.id,
        businessName: spec.name,
        phone: `555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        address: `${streetNum} ${street}, ${region.city}, ${region.state} ${zip}`,
        bio: spec.description,
        website: `https://www.${spec.name.toLowerCase().replace(/\s+/g, '-')}.local`,
        subscriptionTier: 'SIMPLE',
      },
    });
    organizers.push(organizer);
  }
  console.log(`✅ Created ${organizers.length} organizers`);

  // ── Create sales per organizer (seed.ts pattern) ────────────────────────────
  console.log('📅 Creating regional sales...');
  const now = new Date();
  let photoIdx = 0;

  for (let orgIdx = 0; orgIdx < organizers.length; orgIdx++) {
    const spec = organizerSpecs[orgIdx];
    const region = REGIONS[spec.region];
    const organizer = organizers[orgIdx];
    const street = streetNames[orgIdx % streetNames.length];

    for (let s = 0; s < spec.salesCount; s++) {
      let startDate: Date, endDate: Date, status: string, lifecycleStage: string, purchaseModel: string;

      if (s === 0) {
        // First sale is active (running now)
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 2);
        status = 'PUBLISHED';
        lifecycleStage = 'LIVE';
      } else {
        // Subsequent sales are upcoming
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 10 + s * 7);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        status = 'PUBLISHED';
        lifecycleStage = 'PREP';
      }

      const titlePool = saleTypesTitles[spec.type];
      const saleTitle = titlePool[Math.floor(Math.random() * titlePool.length)];
      const lat = region.lat + (Math.random() - 0.5) * 0.08;
      const lng = region.lng + (Math.random() - 0.5) * 0.08;

      const sale = await prisma.sale.create({
        data: {
          organizerId: organizer.id,
          title: saleTitle,
          description: `Professional ${spec.type.toLowerCase()} sale. Quality items, fair pricing.`,
          startDate,
          endDate,
          address: `${1000 + s * 100} ${street}`,
          city: region.city,
          state: region.state,
          zip: region.zips[s % region.zips.length],
          lat,
          lng,
          status,
          publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago for visibility
          photoUrls: [itemPhotoUrls[Math.floor(Math.random() * itemPhotoUrls.length)]],
          tags: ['vintage', 'collectibles', 'antiques'],
          saleType: spec.type,
          lifecycleStage,
          purchaseModel: 'SUBSCRIPTION',
        },
      });
      createdSaleCount++;

      // ── Create 25-40 items per sale ────────────────────────────────────────
      const itemsPerSale = 25 + Math.floor(Math.random() * 16);
      for (let i = 0; i < itemsPerSale; i++) {
        const title = itemTitles[Math.floor(Math.random() * itemTitles.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];

        let price: number;
        const rand = Math.random();
        if (rand < 0.65) {
          price = 5 + Math.random() * 70;
        } else if (rand < 0.90) {
          price = 100 + Math.random() * 400;
        } else {
          price = 500 + Math.random() * 1500;
        }
        price = Math.round(price * 100) / 100;

        await prisma.item.create({
          data: {
            saleId: sale.id,
            title: `${title}`,
            description: `${title} in ${condition} condition.`,
            price,
            category,
            condition,
            status: Math.random() < 0.1 ? 'SOLD' : 'AVAILABLE',
            photoUrls: [itemPhotoUrls[photoIdx % itemPhotoUrls.length]],
            embedding: [],
            draftStatus: 'PUBLISHED',
            listingType: 'FIXED',
          },
        });
        createdItemCount++;
        photoIdx++;
      }
    }
  }
  console.log(`✅ Created ${createdSaleCount} sales, ${createdItemCount} items`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           REGIONAL BETA SEED COMPLETE (seed.ts v2)           ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║ Preserved Accounts: ${preservedIds.size}                                      ║`);
  console.log(`║ Created Organizers: ${organizers.length}                                      ║`);
  console.log(`║ Created Sales: ${createdSaleCount}                                         ║`);
  console.log(`║ Created Items: ${createdItemCount}                                       ║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ Regions: Grand Rapids MI, South Bend/Elkhart/Fort Wayne IN,  ║');
  console.log('║ Toledo OH                                                    ║');
  console.log('║ Sale Types: Estate, Yard, Consignment, Auction, Flea Market  ║');
  console.log('║ Key Fields Set: publishedAt, lifecycleStage, purchaseModel   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('💥 Seed failed:', e);
    process.exit(1);
  });
