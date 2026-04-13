/**
 * Survivor Seed Script — Patrick's Production Accounts
 *
 * PURPOSE:
 * Creates ONLY Patrick's two real accounts in the production database.
 * Runs AFTER the test database is nuked and BEFORE real shoppers onboard.
 *
 * WHEN TO RUN:
 * - After Railway PostgreSQL reset
 * - One-time setup on fresh prod DB
 * - Safe to re-run (uses upsert, idempotent)
 *
 * HOW TO RUN:
 * ```bash
 * cd packages/database
 * $env:DATABASE_URL="postgresql://postgres:[password]@maglev.proxy.rlwy.net:13949/railway"
 * npx ts-node survivor-seed.ts
 * ```
 *
 * ACCOUNTS CREATED:
 * 1. deseee@gmail.com — Admin + Organizer (Teams tier)
 * 2. artifactmi@gmail.com — Organizer (Teams tier)
 *
 * PASSWORD (default): FindASale2026! (Patrick changes after first login)
 */

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function survivorSeed() {
  try {
    console.log('🌱 Seeding Patrick\'s production accounts...');

    // Default password for both accounts (Patrick changes after login)
    const defaultPassword = 'FindASale2026!';
    const hashedPassword = await bcryptjs.hash(defaultPassword, 10);

    // Account 1: Admin Account
    const adminUser = await prisma.user.upsert({
      where: { email: 'deseee@gmail.com' },
      update: {
        name: 'Patrick Desmet',
        password: hashedPassword,
        role: 'ADMIN',
        roles: ['USER', 'ORGANIZER', 'ADMIN'],
      },
      create: {
        email: 'deseee@gmail.com',
        name: 'Patrick Desmet',
        password: hashedPassword,
        role: 'ADMIN',
        roles: ['USER', 'ORGANIZER', 'ADMIN'],
      },
    });

    const adminOrganizer = await prisma.organizer.upsert({
      where: { userId: adminUser.id },
      update: {
        businessName: 'FindA.Sale Admin',
        subscriptionTier: 'TEAMS',
        subscriptionStatus: 'active',
      },
      create: {
        userId: adminUser.id,
        businessName: 'FindA.Sale Admin',
        phone: '616-555-0001',
        address: '123 Main St, Grand Rapids, MI 49503',
        bio: 'Platform administrator and account',
        subscriptionTier: 'TEAMS',
        subscriptionStatus: 'active',
      },
    });

    console.log(`✅ Admin account: deseee@gmail.com (TEAMS tier)`);
    console.log(`   User ID: ${adminUser.id}`);
    console.log(`   Organizer ID: ${adminOrganizer.id}`);

    // Account 2: Teams Organizer
    const organizerUser = await prisma.user.upsert({
      where: { email: 'artifactmi@gmail.com' },
      update: {
        name: 'Artifact MI',
        password: hashedPassword,
        role: 'ORGANIZER',
        roles: ['USER', 'ORGANIZER'],
      },
      create: {
        email: 'artifactmi@gmail.com',
        name: 'Artifact MI',
        password: hashedPassword,
        role: 'ORGANIZER',
        roles: ['USER', 'ORGANIZER'],
      },
    });

    const organizerAccount = await prisma.organizer.upsert({
      where: { userId: organizerUser.id },
      update: {
        businessName: 'Artifact MI',
        subscriptionTier: 'TEAMS',
        subscriptionStatus: 'active',
      },
      create: {
        userId: organizerUser.id,
        businessName: 'Artifact MI',
        phone: '616-555-0002',
        address: '456 Commerce Ave, Grand Rapids, MI 49504',
        bio: 'Estate sales and antique liquidation specialist',
        subscriptionTier: 'TEAMS',
        subscriptionStatus: 'active',
      },
    });

    console.log(`✅ Organizer account: artifactmi@gmail.com (TEAMS tier)`);
    console.log(`   User ID: ${organizerUser.id}`);
    console.log(`   Organizer ID: ${organizerAccount.id}`);

    console.log('\n✅ Survivor seed complete.');
    console.log(`\nDefault password for both accounts: ${defaultPassword}`);
    console.log('⚠️  Patrick should change passwords after first login');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

survivorSeed();
