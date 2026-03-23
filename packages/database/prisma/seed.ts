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

const businessNames = [
  'Lakeshore Estate Sales',
  'Riverside Liquidators',
  'Local Estate Auctions',
  'Heritage Estate Services',
  'Lakewood Estate Clearance',
  'Priority Estate Sales',
  'Premier Liquidation Solutions',
  'Treasure Find Estate Sales',
  'Valley Estate Auctions',
  'Downtown Downsizing Experts',
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
  'Decorative Plates', 'Vintage Camera', 'Glass Pitcher Set', 'Copper Cookware',
  'Handmade Quilts', 'Wooden Jewelry Box', 'Oil Painting', 'Antique Desk',
  'Chaise Lounge', 'Bookcase Unit', 'Floor Lamp', 'Side Table',
  'Ottoman', 'Wall Sconce', 'Decorative Mirror', 'Area Rug', 'Table Runner',
  'Figurines', 'Music Box', 'Wooden Trunk', 'Coat Rack', 'Console Table',
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
  'https://fastly.picsum.photos/id/465/800/600.jpg?hmac=TpadF5Inc-PTxMXMjB4q5pDPYlahe6CYRDeLbaOjRZk',
  'https://fastly.picsum.photos/id/492/800/600.jpg?hmac=aolz_CKCnAf54UuNY7lvPbI6wMzb2t81dvRkt2WJdJE',
  'https://fastly.picsum.photos/id/726/800/600.jpg?hmac=qFPjkmgGGo3bmW20SoJH_QycsmYAJOsKoElFAEamh7g',
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting database seed...');
  const defaultPassword = await bcrypt.hash('password123', 10);

  // ── Clear all tables via PostgreSQL TRUNCATE CASCADE ─────────────────────
  // CASCADE handles all FK chains automatically — no need to enumerate every table.
  console.log('🗑️  Clearing existing data...');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User", "Badge", "FeeStructure", "Achievement" CASCADE`
  );
  console.log('✅ Cleared existing data');

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
  const pointsOptions = [0, 50, 150, 320, 750, 1200];

  for (let i = 0; i < 100; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName  = lastNames[i % lastNames.length];
    const email     = `user${i + 1}@example.com`;
    const isAdmin   = i === 0;
    const isOrg     = i < 10;
    const isShopper = i >= 10;

    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: `${firstName} ${lastName}`,
        role:  isAdmin ? 'ADMIN' : (isOrg ? 'ORGANIZER' : 'USER'),
        roles: isAdmin ? ['USER', 'ORGANIZER', 'ADMIN'] : (isOrg ? ['USER', 'ORGANIZER'] : ['USER']),
        points: i === 10 ? 340 : pointsOptions[i % pointsOptions.length],
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
  const orgTiers: Record<number, string> = { 0: 'SIMPLE', 1: 'PRO', 2: 'TEAMS' };

  for (let i = 0; i < 10; i++) {
    const street = streetNames[i % streetNames.length];
    const number = 1000 + i * 123;
    const zip    = SEED_CONFIG.zips[i % SEED_CONFIG.zips.length];

    const organizer = await prisma.organizer.create({
      data: {
        userId:          users[i].id,
        businessName:    businessNames[i],
        phone:           `616-555-${String(1000 + i).padStart(4, '0')}`,
        address:         `${number} ${street}, ${SEED_CONFIG.city}, MI ${zip}`,
        bio:             `Professional estate liquidation service with ${5 + i * 2} years of experience in West Michigan.`,
        website:         `https://organizer${i + 1}.example.com`,
        stripeConnectId: i < 8 ? `acct_test_${uuidv4().substring(0, 16)}` : null,
        subscriptionTier: (orgTiers[i] ?? 'SIMPLE') as any,
        stripeCustomerId: `cus_test_${uuidv4().substring(0, 16)}`,
      },
    });
    organizers.push(organizer);
  }
  console.log(`✅ Created ${organizers.length} organizers`);

  // ── Encyclopedia entry ────────────────────────────────────────────────────
  await prisma.encyclopediaEntry.create({
    data: {
      slug:       'depression-glass-101',
      title:      "Depression Glass 101: A Collector's Guide",
      subtitle:   'Identify, value, and collect authentic depression glass',
      content:    `# Depression Glass: Understanding This Affordable Collectible\n\nDepression glass is colorful glassware produced during the Great Depression era (1930-1939). Originally distributed as premiums or sold inexpensively at dime stores, these pieces have become highly collectible today.\n\n## Identifying Depression Glass\n\n- Produced in bright colors: amber, pink, green, blue, and clear\n- Features geometric patterns or floral designs\n- Lighter and slightly thinner than modern glassware\n\n## Common Colors and Rarity\n- **Amber & Clear**: Most common, least valuable\n- **Pink**: Mid-range value, popular with collectors\n- **Blue**: Generally higher value\n\n## Starting Your Collection\nEstate sales are excellent hunting grounds for depression glass at reasonable prices.`,
      category:   'Collectibles',
      tags:       ['glass', 'depression-era', 'collectibles', 'vintage', 'tableware'],
      authorId:   users[0].id,
      status:     'PUBLISHED',
      isFeatured: true,
    },
  });

  // ── Sales (25 total) ──────────────────────────────────────────────────────
  console.log('📅 Creating 25 sales...');
  const sales: any[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const organizer = organizers[i % organizers.length];
    const street    = streetNames[i % streetNames.length];
    const number    = Math.floor(Math.random() * 5000) + 100;
    const zip       = SEED_CONFIG.zips[i % SEED_CONFIG.zips.length];

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

    const lat  = SEED_CONFIG.centerLat + (Math.random() - 0.5) * 0.12;
    const lng  = SEED_CONFIG.centerLng + (Math.random() - 0.5) * 0.12;
    const tags = categories.slice(0, 3).sort(() => Math.random() - 0.5);

    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title:       `${['Downtown Downsizing', "Eastside Collector's", 'Lakefront Estate', 'Family Collection'][i % 4]} Sale ${i + 1}`,
        description: saleDescriptions[i % saleDescriptions.length],
        startDate,
        endDate,
        address:   `${number} ${street}`,
        city:      SEED_CONFIG.city,
        state:     SEED_CONFIG.state,
        zip,
        lat,
        lng,
        status,
        photoUrls: [salePhotoUrls[i % salePhotoUrls.length]],
        tags,
      },
    });
    sales.push(sale);
  }
  console.log(`✅ Created ${sales.length} sales`);

  // ── Items (~12 per sale) ──────────────────────────────────────────────────
  console.log('📦 Creating items...');
  const items: any[] = [];
  let photoIdx = 0;

  for (const sale of sales) {
    const itemsPerSale = Math.floor(Math.random() * 5) + 10;
    for (let j = 0; j < itemsPerSale; j++) {
      const title     = itemTitles[Math.floor(Math.random() * itemTitles.length)];
      const category  = categories[Math.floor(Math.random() * categories.length)];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const price     = Math.round((Math.random() * 495 + 5) * 100) / 100;
      let itemStatus  = 'AVAILABLE';
      if (Math.random() < 0.10) itemStatus = 'SOLD';
      else if (Math.random() < 0.05) itemStatus = 'RESERVED';

      const item = await prisma.item.create({
        data: {
          saleId:      sale.id,
          organizerId: sale.organizerId,
          title:       `${title} #${j + 1}`,
          description: `Beautiful ${category} item in ${condition} condition. Authentic and well-maintained.`,
          price,
          category,
          condition,
          status:      itemStatus,
          photoUrls:   [itemPhotoPool[photoIdx % itemPhotoPool.length]],
          embedding:   [],
          draftStatus: 'PUBLISHED',
        },
      });
      items.push(item);
      photoIdx++;
    }
  }
  console.log(`✅ Created ${items.length} items`);

  // ── Auction items (3 specific items for bidding tests) ────────────────────
  const activeSale = sales.find((s: any) => s.status === 'PUBLISHED') ?? sales[0];
  const auctionItems: any[] = [];

  for (const [k, spec] of [
    { title: 'Signed Ansel Adams Print',   description: 'Authenticated signed lithograph, COA included.',      price: 200,  startPrice: 200,  category: 'art' },
    { title: 'Tiffany Style Stained Glass Lamp', description: 'Dragonfly pattern, 22" shade, excellent condition.', price: 300,  startPrice: 300,  category: 'decor' },
    { title: 'Vintage Rolex Submariner',   description: '1968 ref. 5513 — original bracelet, recently serviced.', price: 2500, startPrice: 2500, category: 'jewelry' },
  ].entries()) {
    const ai = await prisma.item.create({
      data: {
        saleId:           activeSale.id,
        organizerId:      activeSale.organizerId,
        title:            (spec as any).title,
        description:      (spec as any).description,
        price:            (spec as any).price,
        auctionStartPrice:(spec as any).startPrice,
        condition:        'excellent',
        category:         (spec as any).category,
        listingType:      'AUCTION',
        photoUrls:        [`https://fastly.picsum.photos/id/${116 + k}/600/400.jpg?hmac=test${k}`],
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
    const buyerIndex  = Math.floor(Math.random() * 90) + 10;
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

  // 6 specific purchases for user11 (primary shopper)
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
  console.log(`✅ Created ${purchasesCreated.length + 6} purchases`);

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
  console.log('✅ Created bids');

  // ── Favorites ─────────────────────────────────────────────────────────────
  const publishedSales = sales.filter((s: any) => s.status === 'PUBLISHED');
  for (const [idx, sale] of publishedSales.slice(0, 4).entries()) {
    await prisma.favorite.create({ data: { userId: user11.id, saleId: sale.id } });
    if (idx < 2) {
      await prisma.favorite.create({ data: { userId: user12.id, saleId: sale.id } });
    }
  }
  console.log('✅ Created favorites');

  // ── User badges ───────────────────────────────────────────────────────────
  console.log('🏅 Creating user badges...');
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

  // Wishlist alerts (keyword + query JSON per schema)
  await prisma.wishlistAlert.create({
    data: {
      userId:   user11.id,
      name:     'Mid-Century Furniture Under $500',
      query:    { q: 'eames chair mid century', category: 'furniture', minPrice: 0, maxPrice: 500, tags: ['mid-century', 'furniture'], radius: 50, lat: SEED_CONFIG.centerLat, lng: SEED_CONFIG.centerLng },
      isActive: true,
    },
  });
  await prisma.wishlistAlert.create({
    data: {
      userId:   user11.id,
      name:     'Art Deco Jewelry Under $1000',
      query:    { q: 'art deco jewelry diamond', category: 'jewelry', minPrice: 0, maxPrice: 1000, tags: ['art-deco', 'jewelry'], radius: 100, lat: SEED_CONFIG.centerLat, lng: SEED_CONFIG.centerLng },
      isActive: true,
    },
  });
  console.log('✅ Created wishlists and alerts');

  // ── Follows + Smart Follows ───────────────────────────────────────────────
  console.log('🔔 Creating follows...');
  // user11 follows organizers 1, 2, 3
  for (const org of organizers.slice(0, 3)) {
    await prisma.follow.create({
      data: { userId: user11.id, organizerId: org.id },
    });
    await prisma.smartFollow.create({
      data: { userId: user11.id, organizerId: org.id, notifyEmail: true, notifyPush: true },
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

  // ── Treasure Trail ────────────────────────────────────────────────────────
  console.log('🗺️  Creating treasure trail...');
  const trailSales = publishedSales.slice(0, 3);
  if (trailSales.length >= 2) {
    const trail = await prisma.treasureTrail.create({
      data: {
        userId:         user11.id,
        name:           'Grand Rapids Weekend Antique Loop',
        description:    'A curated 3-stop route hitting the best active estate sales in GR this weekend.',
        stops:          trailSales.map((s: any, idx: number) => ({
          saleId:          s.id,
          order:           idx + 1,
          timeEstimateMin: 45 + idx * 15,
          highlightItemIds: [],
        })),
        totalDistanceKm: 18.5,
        totalDurationMin: 165,
        isPublic:        true,
      },
    });

    // TrailHighlight: links trail → item → sale
    const trailItem = items.find((i: any) => i.saleId === trailSales[0].id && i.status === 'AVAILABLE');
    if (trailItem) {
      await prisma.trailHighlight.create({
        data: { trailId: trail.id, itemId: trailItem.id, saleId: trailSales[0].id, note: 'Must-see at this stop — great condition.' },
      });
    }
    console.log('✅ Created treasure trail');
  }

  // ── Shopper Stamps ────────────────────────────────────────────────────────
  // type must be unique per user — using 3 different types for user11
  await prisma.shopperStamp.create({ data: { userId: user11.id, type: 'ATTEND_SALE',   count: 3, awardedAt: oneWeekAgo } });
  await prisma.shopperStamp.create({ data: { userId: user11.id, type: 'MAKE_PURCHASE', count: 6, awardedAt: twoDaysAgo } });
  await prisma.shopperStamp.create({ data: { userId: user12.id, type: 'ATTEND_SALE',   count: 1, awardedAt: oneWeekAgo } });

  // Stamp Milestone (unique per user + milestone number)
  await prisma.stampMilestone.create({ data: { userId: user11.id, milestone: 5, badgeType: 'BRONZE', earnedAt: twoDaysAgo } });
  console.log('✅ Created stamps and milestone');

  // ── Collector Passport ────────────────────────────────────────────────────
  await prisma.collectorPassport.create({
    data: {
      userId:     user11.id,
      bio:        'Mid-century modern enthusiast and vintage jewelry collector based in Grand Rapids.',
      specialties: ['mid-century modern', 'depression glass', 'art deco jewelry'],
      categories: ['Furniture', 'Jewelry', 'Art & Decor'],
      keywords:   ['eames', 'pyrex', 'fiestaware', 'diamond', 'walnut'],
      notifyEmail: true,
      notifyPush:  true,
      totalFinds:  6,
      isPublic:    true,
    },
  });
  console.log('✅ Created collector passport');

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

  // ── User Streaks ──────────────────────────────────────────────────────────
  // unique per [userId, type] — types: 'visit' | 'save' | 'buy'
  await prisma.userStreak.create({ data: { userId: user11.id, type: 'visit', currentStreak: 5,  longestStreak: 5,  lastActivityDate: now } });
  await prisma.userStreak.create({ data: { userId: user11.id, type: 'buy',   currentStreak: 2,  longestStreak: 3,  lastActivityDate: twoDaysAgo } });
  await prisma.userStreak.create({ data: { userId: users[1].id, type: 'visit', currentStreak: 12, longestStreak: 30, lastActivityDate: now } });
  await prisma.userStreak.create({ data: { userId: users[2].id, type: 'visit', currentStreak: 8,  longestStreak: 45, lastActivityDate: now } });
  console.log('✅ Created user streaks');

  // ── Organizer Reputations ─────────────────────────────────────────────────
  console.log('⭐ Creating organizer reputations...');
  // organizerId references User.id (not Organizer.id) per schema
  for (let i = 0; i < organizers.length; i++) {
    await prisma.organizerReputation.create({
      data: {
        organizerId:      users[i].id, // references User.id
        score:            3.5 + i * 0.15 > 5 ? 5.0 : 3.5 + i * 0.15,
        responseTimeAvg:  4.0 - i * 0.3 < 0.5 ? 0.5 : 4.0 - i * 0.3,
        saleCount:        10 + i * 8,
        photoQualityAvg:  0.6 + i * 0.04 > 1 ? 1.0 : 0.6 + i * 0.04,
        disputeRate:      0.05 - i * 0.004 < 0 ? 0.001 : 0.05 - i * 0.004,
        isNew:            i > 7,
      },
    });
  }
  console.log('✅ Created organizer reputations');

  // ── Points Transactions ───────────────────────────────────────────────────
  console.log('💰 Creating points transactions...');
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

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

  // ── Fraud Signals (command center data) ───────────────────────────────────
  console.log('🚨 Creating fraud signals...');
  // FraudSignal requires saleId (non-nullable)
  if (publishedSales[0]) {
    await prisma.fraudSignal.create({
      data: {
        userId:          user15.id,
        saleId:          publishedSales[0].id,
        itemId:          aItem3.id,
        signalType:      'RAPID_BID',
        confidenceScore: 72,
        reviewOutcome:   'PENDING',
        notes:           'Rapid successive bids from new account — bid sniping pattern detected.',
      },
    });
  }
  if (publishedSales[1]) {
    await prisma.fraudSignal.create({
      data: {
        userId:              user13.id,
        saleId:              publishedSales[1].id,
        signalType:          'HIGH_CANCELLATION_RATE',
        confidenceScore:     85,
        reviewedByAdminId:   users[0].id,
        reviewOutcome:       'UNDER_REVIEW',
        notes:               'Item description inconsistent with listing photos. Reported by 2 users.',
      },
    });
  }
  if (publishedSales[2]) {
    await prisma.fraudSignal.create({
      data: {
        userId:          users[4].id,
        saleId:          publishedSales[2].id,
        signalType:      'VELOCITY_SPIKE',
        confidenceScore: 40,
        reviewOutcome:   'DISMISSED',
        notes:           'False positive — organizer had a last-minute schedule change.',
      },
    });
  }
  console.log('✅ Created fraud signals');

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalPurchases = purchasesCreated.length + 6;
  console.log('\n✨ Seed complete!');
  console.log('\n📋 Data Summary:');
  console.log(`  • Users:            100 (user1=ADMIN, user2=PRO organizer, user3=TEAMS organizer, user11=primary shopper)`);
  console.log(`  • Organizers:       10 (tiers: 1×SIMPLE admin, 1×PRO, 1×TEAMS, 7×SIMPLE)`);
  console.log(`  • Sales:            ${sales.length} (8 upcoming, 8 active, 5 ended, 4 draft)`);
  console.log(`  • Items:            ${items.length} + ${auctionItems.length} auction items`);
  console.log(`  • Auction items:    ${auctionItems.length} (Ansel Adams print, Tiffany lamp, Vintage Rolex)`);
  console.log(`  • Purchases:        ${totalPurchases} (6 for user11 specifically)`);
  console.log(`  • Bids:             9 (user11 winning on Adams print, outbid on Tiffany lamp)`);
  console.log(`  • Badges:           ${allBadges.length} types | user11 has 3 badges`);
  console.log(`  • Wishlists:        2 for user11 with items + 2 alerts`);
  console.log(`  • Notifications:    7 (6 for user11, 1 for organizer)`);
  console.log(`  • Follows:          4 follows + 3 smart follows (user11 → orgs 1-3)`);
  console.log(`  • Treasure trail:   1 (user11, 3-stop GR loop)`);
  console.log(`  • Shopper stamps:   3 records | 1 milestone`);
  console.log(`  • Collector passport: 1 (user11)`);
  console.log(`  • Referrals:        2 (user12→user11→user13 chain)`);
  console.log(`  • Bounties:         3 (2 for user11, 1 for user12)`);
  console.log(`  • User streaks:     4 records`);
  console.log(`  • Org reputations:  10`);
  console.log(`  • Points tx:        6`);
  console.log(`  • Conversations:    up to 2 | Messages: up to 5`);
  console.log(`  • Fraud signals:    3 (command center data)`);
  console.log('\n🔑 Test accounts (all passwords: password123):');
  console.log('   user1@example.com  — ADMIN + SIMPLE organizer');
  console.log('   user2@example.com  — PRO organizer (Stripe connected)');
  console.log('   user3@example.com  — TEAMS organizer (Stripe connected)');
  console.log('   user11@example.com — Shopper (purchases, bids, badges, wishlists, trail, passport)');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
