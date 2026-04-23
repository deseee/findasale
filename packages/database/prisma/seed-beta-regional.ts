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
const itemPhotoUrls = [
  // Furniture
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578375871348-8b0a3635bc28?w=500&h=400&fit=crop',
  // Vintage Décor & Lighting
  'https://images.unsplash.com/photo-1565636192335-14e6e7266f34?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1565636192335-14e6e7266f34?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=500&h=400&fit=crop',
  // Kitchen & Collectibles
  'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&h=400&fit=crop',
  // Jewelry
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=400&fit=crop',
  // Tools
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=500&h=400&fit=crop',
  // Books & Media
  'https://images.unsplash.com/photo-150784272343-583f20270319?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1507842872343-583f20270319?w=500&h=400&fit=crop',
  // Clothing
  'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&h=400&fit=crop',
  'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&h=400&fit=crop',
  // Art
  'https://images.unsplash.com/photo-1561214115-6d2f1b0609fa?w=500&h=400&fit=crop',
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
  console.log('🌱 Starting regional beta database seed...');
  const defaultPassword = await bcrypt.hash('password123', 10);

  // ── Preserve existing accounts ─────────────────────────────────────────────
  console.log('🔒 Preserving protected accounts (artifactmi@gmail.com, deseee@gmail.com)...');
  const preservedUsers = await prisma.user.findMany({
    where: { email: { in: ['artifactmi@gmail.com', 'deseee@gmail.com'] } },
  });
  const preservedIds = new Set(preservedUsers.map(u => u.id));
  console.log(`✅ Found ${preservedIds.size} accounts to preserve`);

  // ── Delete all organizers EXCEPT preserved ones ────────────────────────────
  console.log('🗑️  Clearing non-preserved seed data...');
  const allOrganizers = await prisma.organizer.findMany({ include: { user: true } });
  const toDeleteOrgIds = allOrganizers
    .filter(org => !preservedIds.has(org.userId))
    .map(org => org.id);

  if (toDeleteOrgIds.length > 0) {
    // Find sales belonging to organizers we're removing
    const salesToDelete = await prisma.sale.findMany({
      where: { organizerId: { in: toDeleteOrgIds } },
      select: { id: true },
    });
    const saleIdsToDelete = salesToDelete.map(s => s.id);

    // Items → Sales → Organizers (order matters because Item.sale is not onDelete: Cascade)
    if (saleIdsToDelete.length > 0) {
      await prisma.item.deleteMany({
        where: { saleId: { in: saleIdsToDelete } },
      });
      await prisma.sale.deleteMany({
        where: { id: { in: saleIdsToDelete } },
      });
    }
    await prisma.organizer.deleteMany({
      where: { id: { in: toDeleteOrgIds } },
    });
    console.log(`✅ Deleted ${toDeleteOrgIds.length} old organizer accounts, ${saleIdsToDelete.length} sales, and their items`);
  }

  // Delete non-preserved users (except admins and organizers we're keeping)
  const usersToDelete = await prisma.user.findMany({
    where: {
      AND: [
        { id: { notIn: Array.from(preservedIds) } },
        { roles: { hasSome: ['ORGANIZER'] } }, // Only delete organizer-type users
      ],
    },
  });

  if (usersToDelete.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: usersToDelete.map(u => u.id) } },
    });
    console.log(`✅ Deleted ${usersToDelete.length} old user accounts`);
  }

  // ── Create new regional organizer accounts ──────────────────────────────────
  console.log('🏢 Creating 10 regional organizer accounts...');
  let createdOrganizerCount = 0;
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
        phone: `${region.lat.toFixed(0).substring(0, 3)}-555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        referralCode: `REF-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    });

    // Create organizer profile
    const organizer = await prisma.organizer.create({
      data: {
        userId: user.id,
        businessName: spec.name,
        phone: `${region.lat.toFixed(0).substring(0, 3)}-555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        address: `${streetNum} ${street}, ${region.city}, ${region.state} ${zip}`,
        bio: spec.description,
        website: `https://www.${spec.name.toLowerCase().replace(/\s+/g, '-')}.local`,
        instagram: `@${spec.name.toLowerCase().replace(/\s+/g, '')}`,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        onboardingComplete: true,
      },
    });

    createdOrganizerCount++;

    // ── Create 1-2 sales per organizer ──────────────────────────────────────
    const now = new Date();
    const salesForThisOrg = spec.salesCount;
    let isFirstSale = true;

    for (let s = 0; s < salesForThisOrg; s++) {
      let startDate: Date, endDate: Date, status: string;

      if (isFirstSale) {
        // First sale is current/active
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 2);
        status = 'PUBLISHED';
        isFirstSale = false;
      } else {
        // Subsequent sale is upcoming
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 10 + s * 7);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        status = 'PUBLISHED';
      }

      const titlePool = saleTypesTitles[spec.type];
      const saleTitle = titlePool[Math.floor(Math.random() * titlePool.length)];

      const lat = region.lat + (Math.random() - 0.5) * 0.08;
      const lng = region.lng + (Math.random() - 0.5) * 0.08;

      const sale = await prisma.sale.create({
        data: {
          organizerId: organizer.id,
          title: saleTitle,
          description: `Professional ${spec.type.toLowerCase()} sale. Quality items, fair pricing. View details and preview items below.`,
          startDate,
          endDate,
          address: `${streetNum + s * 100} ${street}`,
          city: region.city,
          state: region.state,
          zip,
          lat,
          lng,
          status,
          photoUrls: [itemPhotoUrls[Math.floor(Math.random() * itemPhotoUrls.length)]],
          tags: categories.slice(0, 3),
          saleType: spec.type,
        },
      });

      createdSaleCount++;

      // ── Create 25-40 items per sale ────────────────────────────────────────
      const itemsPerSale = 25 + Math.floor(Math.random() * 16);
      let photoIdx = 0;

      for (let i = 0; i < itemsPerSale; i++) {
        const title = itemTitles[Math.floor(Math.random() * itemTitles.length)];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];

        // Realistic pricing: most $5-$75, some $100-$500, 2-3 per sale $500+
        let price: number;
        const rand = Math.random();
        if (rand < 0.65) {
          price = 5 + Math.random() * 70; // Most items $5-$75
        } else if (rand < 0.90) {
          price = 100 + Math.random() * 400; // Some $100-$500
        } else {
          price = 500 + Math.random() * 1500; // Few $500+
        }
        price = Math.round(price * 100) / 100;

        const description = `${title} in ${condition} condition. Professional appraisal completed.`;

        await prisma.item.create({
          data: {
            saleId: sale.id,
            title: `${title}`,
            description,
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

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                   BETA SEED COMPLETE                          ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║ Preserved Accounts: ${preservedIds.size}                                      ║`);
  console.log(`║ Created Organizers: ${createdOrganizerCount}                                      ║`);
  console.log(`║ Created Sales: ${createdSaleCount}                                         ║`);
  console.log(`║ Created Items: ${createdItemCount}                                       ║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ Regional Coverage: Grand Rapids MI, South Bend/Elkhart/       ║');
  console.log('║ Fort Wayne IN, Toledo OH                                     ║');
  console.log('║ Sale Types: Estate, Yard, Consignment, Auction, Flea Market  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('💥 Seed failed:', e);
    process.exit(1);
  });
