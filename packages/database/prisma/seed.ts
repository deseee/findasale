import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Hash password function
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('password123', saltRounds);

  // Clear existing data in the correct order to avoid foreign key constraints
  await prisma.$transaction([
    prisma.bid.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.review.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.item.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.organizer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.badge.deleteMany(),
  ]);

  // Create badges
  const badges = await prisma.badge.createMany({
    data: [
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
    ],
  });

  console.log(`Created ${badges.count} badges`);

  // Create users without referral codes initially
  const user1 = await prisma.user.create({
    data: {
      email: 'user1@example.com',
      password: defaultPassword,
      name: 'Alice Johnson',
      role: 'USER',
      points: 150,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'user2@example.com',
      password: defaultPassword,
      name: 'Bob Smith',
      role: 'USER',
      points: 320,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'user3@example.com',
      password: defaultPassword,
      name: 'Carol Davis',
      role: 'USER',
      points: 75,
    },
  });

  // Now update users with referral codes if the field exists
  try {
    await prisma.user.update({
      where: { id: user1.id },
      data: { referralCode: `REF-${uuidv4().substring(0, 8)}` }
    });

    await prisma.user.update({
      where: { id: user2.id },
      data: { referralCode: `REF-${uuidv4().substring(0, 8)}` }
    });

    await prisma.user.update({
      where: { id: user3.id },
      data: { referralCode: `REF-${uuidv4().substring(0, 8)}` }
    });
  } catch (error) {
    console.log('referralCode field not available in database, skipping...');
  }

  // Create organizers
  const organizer1 = await prisma.organizer.create({
    data: {
      userId: user1.id,
      businessName: 'Johnson Family Estate Sales',
      phone: '555-0101',
      address: '123 Main St',
    },
  });

  // Create sales
  const sale1 = await prisma.sale.create({
    data: {
      organizerId: organizer1.id,
      title: 'Spring Cleaning Estate Sale',
      description: 'Complete household estate sale including furniture, electronics, and collectibles',
      startDate: new Date('2023-04-15T09:00:00Z'),
      endDate: new Date('2023-04-16T17:00:00Z'),
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      lat: 30.2672,
      lng: -97.7431,
      status: 'PUBLISHED',
      photoUrls: ['https://example.com/sale1.jpg'],
      tags: ['furniture', 'electronics', 'collectibles'],
    },
  });

  // Create items
  const item1 = await prisma.item.create({
    data: {
      saleId: sale1.id,
      title: 'Vintage Leather Sofa',
      description: 'Beautiful 1970s leather sofa in excellent condition',
      price: 299.99,
      status: 'AVAILABLE',
      photoUrls: ['https://example.com/sofa1.jpg'],
    },
  });

  const item2 = await prisma.item.create({
    data: {
      saleId: sale1.id,
      title: 'Antique Wooden Desk',
      description: 'Handcrafted oak desk from the 1800s',
      price: 189.99,
      status: 'AVAILABLE',
      photoUrls: ['https://example.com/desk1.jpg'],
    },
  });

  // Create favorites
  await prisma.favorite.create({
    data: {
      userId: user2.id,
      saleId: sale1.id,
    },
  });

  // Create purchases
  await prisma.purchase.create({
    data: {
      userId: user2.id,
      itemId: item1.id,
      saleId: sale1.id,
      amount: 299.99,
      status: 'PAID',
    },
  });

  await prisma.purchase.create({
    data: {
      userId: user3.id,
      itemId: item2.id,
      saleId: sale1.id,
      amount: 189.99,
      status: 'PAID',
    },
  });

  // Create referrals
  await prisma.referral.create({
    data: {
      referrerId: user1.id,
      referredUserId: user2.id,
    },
  });

  // Create user badges
  const firstPurchaseBadge = await prisma.badge.findFirst({
    where: { name: 'First Purchase' },
  });

  if (firstPurchaseBadge) {
    await prisma.userBadge.create({
      data: {
        userId: user2.id,
        badgeId: firstPurchaseBadge.id,
      },
    });

    await prisma.userBadge.create({
      data: {
        userId: user3.id,
        badgeId: firstPurchaseBadge.id,
      },
    });
  }

  console.log('Seed data created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
