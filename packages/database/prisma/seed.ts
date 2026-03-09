import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Seed configuration — allows seeding different regions via environment variables
// Defaults to Grand Rapids, MI for backward compatibility
const SEED_CONFIG = {
  city: process.env.SEED_CITY || 'Grand Rapids',
  state: process.env.SEED_STATE || 'MI',
  stateAbbrev: process.env.SEED_STATE_ABBREV || 'MI',
  centerLat: parseFloat(process.env.SEED_CENTER_LAT || '42.96'),
  centerLng: parseFloat(process.env.SEED_CENTER_LNG || '-85.66'),
  zips: (process.env.SEED_ZIPS || '49503,49504,49505,49506,49507,49508,49509,49512,49525,49534').split(','),
};

// Realistic data arrays
const firstNames = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Karen', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Aaron', 'Bella', 'Chris', 'Diana',
  'Ethan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia', 'Kevin', 'Lisa', 'Marcus', 'Nina',
  'Oscar', 'Patricia', 'Quincy', 'Rebecca', 'Steven', 'Tabitha', 'Ulysses', 'Violet', 'Walter', 'Xena',
  'Yusuf', 'Zara', 'Adrian', 'Amelia', 'Austin', 'Ava', 'Benjamin', 'Bianca', 'Bradley', 'Brooke',
  'Caleb', 'Chloe', 'Daniel', 'Danielle', 'Derek', 'Destiny', 'Drew', 'Destiny', 'Evan', 'Eva',
  'Felix', 'Felicity', 'Garrett', 'Gabriella', 'Gregory', 'Giselle', 'Hayden', 'Helena', 'Ivan', 'Iris',
  'Jordan', 'Jasmine', 'Keith', 'Kayla', 'Lance', 'Lena', 'Miles', 'Mia', 'Neil', 'Natalie',
];

const lastNames = [
  'Johnson', 'Smith', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
  'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Rodriguez', 'Lee', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Allen', 'King', 'Wright', 'Scott', 'Green',
  'Baker', 'Adams', 'Nelson', 'Carter', 'Roberts', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards',
  'Collins', 'Reeves', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed',
  'Bell', 'Gomez', 'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter',
];

const businessNames = [
  'Lakeshore Estate Sales', 'West Michigan Liquidators', 'Grand Rapids Auctions',
  'Heritage Estate Services', 'Lakewood Estate Clearance', 'Priority Estate Sales',
  'Michigan Liquidation Solutions', 'Treasure Find Estate Sales', 'Valley Estate Auctions',
  'Downtown Downsizing', 'Eastside Estate Specialists', 'West side Collectibles',
];

const streetNames = [
  'Wealthy St', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St',
  'Ionia Ave', 'Pearl St', 'Cass Ave', 'Sheldon Ave', 'Jefferson Ave',
  'Leonard St', 'College Ave', 'Lyon St', 'Madison Ave', 'Monroe Ave',
];

const itemTitles = [
  '1940s Mahogany Dresser', 'Singer Sewing Machine', 'Cast Iron Skillet Set',
  'Vintage Record Player', 'Leather Wingback Chair', 'Crystal Vase Collection',
  'Oak Dining Table', 'Antique Pocket Watch', 'Mid-Century Sofa', 'Persian Rug',
  'Vintage Typewriter', 'Brass Floor Lamp', 'Wooden Bookshelf', 'Gilt Mirror',
  'Porcelain Dinnerware Set', 'Leather Briefcase', 'Tiffany Glass Lamp', 'Clock Radio',
  'Decorative Plates', 'Tennis Rackets', 'Vintage Camera', 'Glass Pitcher Set',
  'Copper Cookware', 'Handmade Quilts', 'Wooden Jewelry Box', 'Decorative Plates',
  'Oil Painting', 'Antique Desk', 'Chaise Lounge', 'Bookcase Unit', 'Floor Lamp',
  'Side Table', 'Ottoman', 'Wall Sconce', 'Decorative Mirror', 'Throw Pillows',
  'Area Rug', 'Table Runner', 'Curtains', 'Wall Art', 'Picture Frames',
  'Vase Set', 'Candle Holders', 'Figurines', 'Music Box', 'Jewelry Box',
  'Wooden Trunk', 'Coat Rack', 'Umbrella Stand', 'Plant Stand', 'Console Table',
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

const saleStreets = [
  'Wealthy St', 'Lake Dr', 'Division Ave', 'Cherry St', 'Fulton St',
];

const categories = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing',
];

const conditions = ['mint', 'excellent', 'good', 'fair', 'poor'];

const salePhotoUrls = [
  'https://fastly.picsum.photos/id/637/800/600.jpg?hmac=kncdkpbYYQHSXAC06PzTzVvGtm1ebZ_Qe72HkxhRvDk',
  'https://fastly.picsum.photos/id/613/800/600.jpg?hmac=-0i5Kl_9JQpW3utGuxVgA3zksoEPIAfrI2XjM1kKv2Y',
  'https://fastly.picsum.photos/id/515/800/600.jpg?hmac=u7HfJd5Ryyt_u5PUGvY_c3P4UdkjRZV0XhyZuL2Ny78',
  'https://fastly.picsum.photos/id/249/800/600.jpg?hmac=-KQaSdrUVO8GfiMHph5eE-Nwl_DUaXuvZ8O7m0WRhas',
  'https://fastly.picsum.photos/id/698/800/600.jpg?hmac=IxKdF5SjJdQg56BS_Ejc5JzVLDEe28o6cBbj6jA05Ec',
  'https://fastly.picsum.photos/id/925/800/600.jpg?hmac=C2FP6ms8hbBOX58pQCijWEP02dyO6wdn8GQ0Vb2vdQ4',
  'https://fastly.picsum.photos/id/779/800/600.jpg?hmac=AqQVSvC4EDrWxi8BnTBaxQ12KUncMaGmXsLuoFYZeT0',
  'https://fastly.picsum.photos/id/698/800/600.jpg?hmac=IxKdF5SjJdQg56BS_Ejc5JzVLDEe28o6cBbj6jA05Ec',
  'https://fastly.picsum.photos/id/465/800/600.jpg?hmac=TpadF5Inc-PTxMXMjB4q5pDPYlahe6CYRDeLbaOjRZk',
  'https://fastly.picsum.photos/id/492/800/600.jpg?hmac=aolz_CKCnAf54UuNY7lvPbI6wMzb2t81dvRkt2WJdJE',
  'https://fastly.picsum.photos/id/726/800/600.jpg?hmac=qFPjkmgGGo3bmW20SoJH_QycsmYAJOsKoElFAEamh7g',
  'https://fastly.picsum.photos/id/719/800/600.jpg?hmac=lxszKi_UN449cJaeWVhr81sYLeXlA9V5ZDLElVdnLY4',
  'https://fastly.picsum.photos/id/314/800/600.jpg?hmac=OjmCu3etW85aNJD0JaXWdV4XtFax1pY7mNMJbXxYFWY',
  'https://fastly.picsum.photos/id/663/800/600.jpg?hmac=6KwrDDW7MZ2vTZ-L_3z6b2x_4p_adCqeFB6cIMlYyhc',
  'https://fastly.picsum.photos/id/788/800/600.jpg?hmac=tgypEsAsBdraA8ehcLjJ88OAYUZHEFrfkPMokkETd0M',
  'https://fastly.picsum.photos/id/383/800/600.jpg?hmac=nC5kYs09icYCDzp6GiMOTczS-now4ZKQ6tiiCBmcIzo',
  'https://fastly.picsum.photos/id/272/800/600.jpg?hmac=Si-HAYLaQ3WaGRUeA3_AGOt2Wco07TDtbbLH97g7lZ4',
  'https://fastly.picsum.photos/id/769/800/600.jpg?hmac=WKPwJzilN_3XU-sLienIORtJxdLRvtRIMhApT28bt8E',
  'https://fastly.picsum.photos/id/497/800/600.jpg?hmac=MCuRVBkGn7uxJBlW04P9NPb-uEUUkUdaDMk9XXYRQsc',
  'https://fastly.picsum.photos/id/1011/800/600.jpg?hmac=IdMb_PQfwnMjO6rbG9t4_Y3Mi_9dFpclHfNz4TmXU_0',
];

const itemPhotoPool = [
  'https://fastly.picsum.photos/id/1037/600/400.jpg?hmac=E7oV9MlYzBUFFygTj04kbdysY_Yu8n2jqR9o-hXekyU',
  'https://fastly.picsum.photos/id/841/600/400.jpg?hmac=iAmjBV3nnPkSjUIMk9sjc2vH4Cm9HNe-BeQ0fu78NcY',
  'https://fastly.picsum.photos/id/820/600/400.jpg?hmac=FKqdyLSrMLcr2y-nT5m6eVtPj_qC6dcbSn49numf-6s',
  'https://fastly.picsum.photos/id/949/600/400.jpg?hmac=8R-1KEvShmnk-yZ7_Sv9o3R47y8r_GAyCqYMJi8shzU',
  'https://fastly.picsum.photos/id/180/600/400.jpg?hmac=GWOD1KQ7oaGkR7Zpj4QJDXLC2XkaKZjoKZ3i824mdUE',
  'https://fastly.picsum.photos/id/164/600/400.jpg?hmac=AeaV1BoMa0SBprKJm71cmlXO7mUuDsQU5t-n-xUZlus',
  'https://fastly.picsum.photos/id/568/600/400.jpg?hmac=AC6_PWP-eHtGmBwHnwlj8RTFzHuCK3EWYYFcVAuSxwk',
  'https://fastly.picsum.photos/id/132/600/400.jpg?hmac=gJk_qWSbbgRfkHDwuIj28xSW_dVYSSzzSWL89GbOHRI',
  'https://fastly.picsum.photos/id/563/600/400.jpg?hmac=-_o6NDMsUHWq07Ml1TszDSpxv22vrBh8fvcxakx4Pkc',
  'https://fastly.picsum.photos/id/128/600/400.jpg?hmac=8llVvQyDbjLA-0Fltxos8HsMmiynleSoS_LveaHajmY',
];

const reviewComments = [
  'Great selection of mid-century pieces!',
  'Prices were fair and reasonable.',
  'Excellent condition on most items.',
  'Well organized and easy to navigate.',
  'Found some amazing vintage treasures!',
  'Professional and friendly staff.',
  'Would come again!',
  'Great variety of items.',
  'Highly recommend this estate sale.',
  'Very satisfied with my purchases.',
  'Nice quality items at good prices.',
  'Friendly and helpful organizers.',
  'Well priced antiques and collectibles.',
  'Great finds!',
  'Neat items and fair pricing.',
];

async function main() {
  console.log('🌱 Starting database seed...');
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('password123', saltRounds);

  // Clear existing data in correct dependency order
  console.log('🗑️  Clearing existing data...');
  await prisma.$transaction([
    prisma.bid.deleteMany(),
    prisma.lineEntry.deleteMany(),
    prisma.affiliateLink.deleteMany(),
    prisma.review.deleteMany(),
    prisma.saleSubscriber.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.item.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.organizer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.feeStructure.deleteMany(),
  ]);

  // Create badges (5 total)
  console.log('⭐ Creating badges...');
  const badgesData = [
    {
      name: 'First Purchase',
      description: 'Made your first purchase',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 1 }),
    },
    {
      name: 'Regular Shopper',
      description: 'Made 5 purchases',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 5 }),
    },
    {
      name: 'Dedicated Collector',
      description: 'Made 20 purchases',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'purchases_made', count: 20 }),
    },
    {
      name: 'Social Butterfly',
      description: 'Referred 3 friends',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'referrals_made', count: 3 }),
    },
    {
      name: 'Community Champion',
      description: 'Earned 1000 points',
      iconUrl: null,
      criteria: JSON.stringify({ type: 'points_earned', count: 1000 }),
    },
  ];

  const badges = await prisma.badge.createMany({ data: badgesData });
  console.log(`✅ Created ${badges.count} badges`);

  // B1: Seed FeeStructure with default 10% global rate
  console.log('💰 Seeding FeeStructure...');
  await prisma.feeStructure.upsert({
    where: { id: 1 },
    update: {},
    create: { listingType: '*', feeRate: 0.10 }
  });
  console.log('✅ FeeStructure seeded (10% global rate)');

  // Get badge IDs for later use
  const allBadges = await prisma.badge.findMany();
  const badgeMap = new Map(allBadges.map((b: any) => [b.name, b.id]));

  // Create 100 users (90 shoppers, 10 organizers)
  console.log('👥 Creating 100 users...');
  const users: any[] = [];
  const pointsOptions = [0, 50, 150, 320, 750, 1200];

  for (let i = 0; i < 100; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const email = `user${i + 1}@example.com`;
    const points = pointsOptions[Math.floor(Math.random() * pointsOptions.length)];
    const hasPhone = Math.random() > 0.4; // 60% have phone numbers

    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: `${firstName} ${lastName}`,
        role: i < 10 ? 'ORGANIZER' : 'USER',
        points,
        phone: hasPhone ? `616-555-${String(i).padStart(4, '0')}` : null,
        referralCode: `REF-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} users`);

  // Create 10 organizers (from first 10 users)
  console.log('🏢 Creating 10 organizers...');
  const organizers: any[] = [];
  for (let i = 0; i < 10; i++) {
    const businessName = businessNames[i % businessNames.length];
    const street = saleStreets[Math.floor(Math.random() * saleStreets.length)];
    const number = Math.floor(Math.random() * 5000) + 100;
    const address = `${number} ${street}`;
    const zip = SEED_CONFIG.zips[Math.floor(Math.random() * SEED_CONFIG.zips.length)];
    const organizer = await prisma.organizer.create({
      data: {
        userId: users[i].id,
        businessName: `${businessName} ${i + 1}`,
        phone: `616-555-${String(1000 + i).padStart(4, '0')}`,
        address: `${address}, ${SEED_CONFIG.city}, ${SEED_CONFIG.state} ${zip}`,
        stripeConnectId: null,
      },
    });
    organizers.push(organizer);
  }
  console.log(`✅ Created ${organizers.length} organizers`);

  // Create 25 sales
  console.log('📅 Creating 25 sales...');
  const sales: any[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const organizer = organizers[i % organizers.length];
    const street = saleStreets[Math.floor(Math.random() * saleStreets.length)];
    const number = Math.floor(Math.random() * 5000) + 100;
    const zip = SEED_CONFIG.zips[Math.floor(Math.random() * SEED_CONFIG.zips.length)];

    let startDate, endDate, status;
    if (i < 8) {
      const weeksAhead = Math.floor(Math.random() * 6) + 2;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + weeksAhead * 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'PUBLISHED';
    } else if (i < 16) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 3));
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 4));
      status = 'PUBLISHED';
    } else if (i < 21) {
      const monthsAgo = Math.floor(Math.random() * 4) + 3;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() - monthsAgo);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 1);
      status = 'ENDED';
    } else {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30));
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'DRAFT';
    }

    const lat = SEED_CONFIG.centerLat + (Math.random() - 0.5) * 0.1;
    const lng = SEED_CONFIG.centerLng + (Math.random() - 0.5) * 0.1;

    const tags = [
      [categories[Math.floor(Math.random() * categories.length)]],
      categories.slice(0, 3).sort(() => Math.random() - 0.5),
    ][Math.floor(Math.random() * 2)];

    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `${
          ['Downtown Downsizing', 'Eastside Collector\'s', 'Lakefront Estate', 'Family Collection'][
            Math.floor(Math.random() * 4)
          ]
        } Estate Sale ${i + 1}`,
        description: saleDescriptions[Math.floor(Math.random() * saleDescriptions.length)],
        startDate,
        endDate,
        address: `${number} ${street}`,
        city: SEED_CONFIG.city,
        state: SEED_CONFIG.state,
        zip,
        lat,
        lng,
        status,
        photoUrls: [
          salePhotoUrls[i],
        ],
        tags,
      },
    });
    sales.push(sale);
  }
  console.log(`✅ Created ${sales.length} sales`);

  // Create 300 items (~12 per sale)
  console.log('📦 Creating 300 items...');
  const items: any[] = [];
  let itemCount = 0;

  for (const sale of sales) {
    const itemsPerSale = Math.floor(Math.random() * 5) + 10;
    for (let j = 0; j < itemsPerSale; j++) {
      const title = itemTitles[Math.floor(Math.random() * itemTitles.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const price = Math.floor(Math.random() * 119800) / 100 + 2;
      const hasMultiplePhotos = Math.random() > 0.6;

      let status = 'AVAILABLE';
      if (Math.random() < 0.1) status = 'SOLD';
      else if (Math.random() < 0.05) status = 'RESERVED';

      const item = await prisma.item.create({
        data: {
          saleId: sale.id,
          title: `${title} #${j + 1}`,
          description: `Beautiful ${category} item in ${condition} condition. Authentic and well-maintained.`,
          price,
          category,
          condition,
          status,
          photoUrls: hasMultiplePhotos
            ? [
                itemPhotoPool[itemCount % itemPhotoPool.length],
                itemPhotoPool[(itemCount + 1) % itemPhotoPool.length],
              ]
            : [
                itemPhotoPool[itemCount % itemPhotoPool.length],
              ],
          embedding: [],
        },
      });
      items.push(item);
      itemCount++;
    }
  }
  console.log(`✅ Created ${items.length} items`);

  // Create 50 purchases (only on SOLD or RESERVED items)
  console.log('💳 Creating 50 purchases...');
  const soldAndReservedItems = items.filter((i) => i.status === 'SOLD' || i.status === 'RESERVED');
  const purchases: any[] = [];

  for (let i = 0; i < Math.min(50, soldAndReservedItems.length); i++) {
    const item = soldAndReservedItems[i];
    const buyerIndex = Math.floor(Math.random() * 90) + 10;
    const buyer = users[buyerIndex];
    const status = Math.random() > 0.2 ? 'PAID' : 'PENDING';

    const purchase = await prisma.purchase.create({
      data: {
        userId: buyer.id,
        itemId: item.id,
        saleId: item.saleId,
        amount: item.price!,
        platformFeeAmount: item.price! * 0.05,
        status,
        stripePaymentIntentId: status === 'PAID' ? `pi_test_${uuidv4().substring(0, 20)}` : null,
      },
    });
    purchases.push(purchase);
  }
  console.log(`✅ Created ${purchases.length} purchases`);

  // Summary
  console.log('\n✨ Seed data created successfully!');
  console.log('\n📋 Data Summary:');
  console.log(`  • Users: 100 (10 organizers, 90 shoppers)`);
  console.log(`  • Organizers: 10`);
  console.log(`  • Sales: 25`);
  console.log(`  • Items: ${items.length}`);
  console.log(`  • Purchases: ${purchases.length}`);
  console.log(`  • Badges: 5`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
