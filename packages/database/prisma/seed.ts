import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

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

const grZips = ['49503', '49504', '49505', '49506', '49507', '49508', '49509', '49512', '49525', '49534'];

const categories = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing',
];

const conditions = ['mint', 'excellent', 'good', 'fair', 'poor'];

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
        role: 'USER',
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
    const zip = grZips[Math.floor(Math.random() * grZips.length)];
    const hasStripeId = Math.random() > 0.3; // 70% have Stripe ID

    const organizer = await prisma.organizer.create({
      data: {
        userId: users[i].id,
        businessName: `${businessName} ${i + 1}`,
        phone: `616-555-${String(1000 + i).padStart(4, '0')}`,
        address: `${address}, Grand Rapids, MI ${zip}`,
        stripeConnectId: hasStripeId ? `acct_test_${uuidv4().substring(0, 16)}` : null,
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
    const zip = grZips[Math.floor(Math.random() * grZips.length)];

    // Varied dates: 8 upcoming, 8 active, 5 ended, 4 draft
    let startDate, endDate, status;
    if (i < 8) {
      // Upcoming (2-8 weeks out)
      const weeksAhead = Math.floor(Math.random() * 6) + 2;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + weeksAhead * 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'PUBLISHED';
    } else if (i < 16) {
      // Currently active (this week)
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 3));
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 4));
      status = 'PUBLISHED';
    } else if (i < 21) {
      // Ended (3-6 months ago)
      const monthsAgo = Math.floor(Math.random() * 4) + 3;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() - monthsAgo);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 1);
      status = 'ENDED';
    } else {
      // Draft
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30));
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      status = 'DRAFT';
    }

    // Grand Rapids coordinates with variance
    const baseLat = 42.96;
    const baseLng = -85.66;
    const lat = baseLat + (Math.random() - 0.5) * 0.1;
    const lng = baseLng + (Math.random() - 0.5) * 0.1;

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
        city: 'Grand Rapids',
        state: 'MI',
        zip,
        lat,
        lng,
        status,
        photoUrls: [
          `https://res.cloudinary.com/demo/image/upload/v1234567890/estate_sale_${i + 1}_sample1.jpg`,
          `https://res.cloudinary.com/demo/image/upload/v1234567890/estate_sale_${i + 1}_sample2.jpg`,
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
    const itemsPerSale = Math.floor(Math.random() * 5) + 10; // 10-14 items per sale
    for (let j = 0; j < itemsPerSale; j++) {
      const title = itemTitles[Math.floor(Math.random() * itemTitles.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const price = Math.floor(Math.random() * 119800) / 100 + 2; // $2 - $1200
      const hasMultiplePhotos = Math.random() > 0.6; // 40% have multiple photos

      // ~10% SOLD, ~5% RESERVED, rest AVAILABLE
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
                `https://res.cloudinary.com/demo/image/upload/v1234567890/item_${itemCount}_1.jpg`,
                `https://res.cloudinary.com/demo/image/upload/v1234567890/item_${itemCount}_2.jpg`,
              ]
            : [
                `https://res.cloudinary.com/demo/image/upload/v1234567890/item_${itemCount}_1.jpg`,
              ],
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
    const buyerIndex = Math.floor(Math.random() * 90) + 10; // Skip the 10 organizers
    const buyer = users[buyerIndex];
    const status = Math.random() > 0.2 ? 'PAID' : 'PENDING'; // 80% PAID, 20% PENDING

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

  // Create 60 sale subscribers
  console.log('🔔 Creating 60 sale subscribers...');
  const saleSubscribers: any[] = [];
  const usedSubscriptions = new Set<string>();

  for (let i = 0; i < 60; i++) {
    let saleId: string;
    let userId: string;

    // Ensure uniqueness on [userId, saleId]
    let attempts = 0;
    do {
      saleId = sales[Math.floor(Math.random() * sales.length)].id;
      userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers
      attempts++;
    } while (usedSubscriptions.has(`${userId}-${saleId}`) && attempts < 10);

    if (!usedSubscriptions.has(`${userId}-${saleId}`)) {
      const subscriber = await prisma.saleSubscriber.create({
        data: {
          userId,
          saleId,
          phone: Math.random() > 0.5 ? `616-555-${String(5000 + i).padStart(4, '0')}` : null,
          email: Math.random() > 0.3 ? `subscriber${i}@example.com` : null,
        },
      });
      saleSubscribers.push(subscriber);
      usedSubscriptions.add(`${userId}-${saleId}`);
    }
  }
  console.log(`✅ Created ${saleSubscribers.length} sale subscribers`);

  // Create 80 sale favorites
  console.log('❤️  Creating 80 sale favorites...');
  const usedSaleFavs = new Set<string>();

  for (let i = 0; i < 80; i++) {
    let userId: string;
    let saleId: string;

    let attempts = 0;
    do {
      userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers
      saleId = sales[Math.floor(Math.random() * sales.length)].id;
      attempts++;
    } while (usedSaleFavs.has(`${userId}-${saleId}`) && attempts < 10);

    if (!usedSaleFavs.has(`${userId}-${saleId}`)) {
      await prisma.favorite.create({
        data: {
          userId,
          saleId,
        },
      });
      usedSaleFavs.add(`${userId}-${saleId}`);
    }
  }
  console.log(`✅ Created 80 sale favorites`);

  // Create 100 item favorites
  console.log('❤️  Creating 100 item favorites...');
  const usedItemFavs = new Set<string>();

  for (let i = 0; i < 100; i++) {
    let userId: string;
    let itemId: string;

    let attempts = 0;
    do {
      userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers
      itemId = items[Math.floor(Math.random() * items.length)].id;
      attempts++;
    } while (usedItemFavs.has(`${userId}-${itemId}`) && attempts < 10);

    if (!usedItemFavs.has(`${userId}-${itemId}`)) {
      await prisma.favorite.create({
        data: {
          userId,
          itemId,
        },
      });
      usedItemFavs.add(`${userId}-${itemId}`);
    }
  }
  console.log(`✅ Created 100 item favorites`);

  // Create 30 reviews (only on ENDED sales)
  console.log('⭐ Creating 30 reviews...');
  const endedSales = sales.filter((s) => s.status === 'ENDED');
  const usedReviews = new Set<string>();

  for (let i = 0; i < Math.min(30, endedSales.length * 5); i++) {
    const sale = endedSales[Math.floor(Math.random() * endedSales.length)];
    const userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers

    if (!usedReviews.has(`${userId}-${sale.id}`)) {
      const rating = [5, 5, 5, 4, 4, 4, 3, 2, 1][Math.floor(Math.random() * 9)];
      await prisma.review.create({
        data: {
          userId,
          saleId: sale.id,
          rating,
          comment:
            rating >= 3
              ? reviewComments[Math.floor(Math.random() * reviewComments.length)]
              : 'Could be better',
        },
      });
      usedReviews.add(`${userId}-${sale.id}`);
    }
  }
  console.log(`✅ Created 30 reviews`);

  // Create 40 user badges
  console.log('🏆 Creating 40 user badges...');
  const usedBadges = new Set<string>();
  const badgeArray = Array.from(badgeMap.entries());

  for (let i = 0; i < 40; i++) {
    const userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers
    const [badgeName, badgeId] = badgeArray[Math.floor(Math.random() * badgeArray.length)];

    if (!usedBadges.has(`${userId}-${badgeId}`)) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId,
        },
      });
      usedBadges.add(`${userId}-${badgeId}`);
    }
  }
  console.log(`✅ Created 40 user badges`);

  // Create 15 referrals
  console.log('🤝 Creating 15 referrals...');
  const usedReferrals = new Set<string>();

  for (let i = 0; i < 15; i++) {
    const referrerIndex = Math.floor(Math.random() * 80) + 10;
    let referredIndex = Math.floor(Math.random() * 80) + 10;

    // Ensure referred user is different
    while (referredIndex === referrerIndex) {
      referredIndex = Math.floor(Math.random() * 80) + 10;
    }

    const referrerId = users[referrerIndex].id;
    const referredUserId = users[referredIndex].id;

    // Check if already referred
    if (!usedReferrals.has(referredUserId)) {
      await prisma.referral.create({
        data: {
          referrerId,
          referredUserId,
        },
      });
      usedReferrals.add(referredUserId);
    }
  }
  console.log(`✅ Created 15 referrals`);

  // Create 20 line entries across 3-4 sales
  console.log('📋 Creating 20 line entries...');
  const selectedSalesForLines = sales.slice(0, 4);
  const usedLineEntries = new Set<string>();

  for (let i = 0; i < 20; i++) {
    const sale = selectedSalesForLines[Math.floor(Math.random() * selectedSalesForLines.length)];
    const userId = users[Math.floor(Math.random() * 80) + 10].id; // Skip organizers

    if (!usedLineEntries.has(`${sale.id}-${userId}`)) {
      const statuses = ['WAITING', 'NOTIFIED', 'ENTERED', 'CANCELLED'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const position = Math.floor(Math.random() * 50) + 1;

      await prisma.lineEntry.create({
        data: {
          saleId: sale.id,
          userId,
          position,
          status,
          notifiedAt: status !== 'WAITING' ? new Date() : null,
          enteredAt: status === 'ENTERED' ? new Date() : null,
        },
      });
      usedLineEntries.add(`${sale.id}-${userId}`);
    }
  }
  console.log(`✅ Created 20 line entries`);

  // Create 10 affiliate links (one per ~2.5 sales)
  console.log('🔗 Creating 10 affiliate links...');
  for (let i = 0; i < 10; i++) {
    const sale = sales[i * 2]; // Distribute across sales
    if (sale) {
      await prisma.affiliateLink.create({
        data: {
          saleId: sale.id,
          clicks: Math.floor(Math.random() * 100),
        },
      });
    }
  }
  console.log(`✅ Created 10 affiliate links`);

  // Summary
  console.log('\n✨ Seed data created successfully!');
  console.log('\n📊 Data Summary:');
  console.log(`  • Users: 100 (10 organizers, 90 shoppers)`);
  console.log(`  • Organizers: 10`);
  console.log(`  • Sales: 25`);
  console.log(`  • Items: ${items.length}`);
  console.log(`  • Purchases: ${purchases.length}`);
  console.log(`  • Sale Subscribers: ${saleSubscribers.length}`);
  console.log(`  • Sale Favorites: 80`);
  console.log(`  • Item Favorites: 100`);
  console.log(`  • Reviews: 30`);
  console.log(`  • User Badges: 40`);
  console.log(`  • Referrals: 15`);
  console.log(`  • Line Entries: 20`);
  console.log(`  • Affiliate Links: 10`);
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
