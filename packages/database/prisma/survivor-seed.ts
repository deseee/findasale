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
 * 1. ADMIN_SEED_EMAIL env var — Admin + Organizer (Teams tier)
 * 2. TEST_ORGANIZER_EMAIL env var — Organizer (Teams tier)
 *
 * PASSWORD (default): set via ADMIN_SEED_PASSWORD env var (change immediately after first login)
 *
 * REQUIRED ENV VARS: ADMIN_SEED_EMAIL, TEST_ORGANIZER_EMAIL, ADMIN_SEED_PASSWORD
 * (ADMIN_SEED_NAME optional, defaults to 'Admin')
 */

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function survivorSeed() {
  try {
    console.log('🌱 Seeding production accounts...');

    const adminSeedEmail = process.env.ADMIN_SEED_EMAIL;
    const testOrganizerEmail = process.env.TEST_ORGANIZER_EMAIL;
    const adminSeedName = process.env.ADMIN_SEED_NAME || 'Admin';
    const defaultPassword = process.env.ADMIN_SEED_PASSWORD;
    if (!adminSeedEmail || !testOrganizerEmail || !defaultPassword) {
      console.error(
        '\n❌ REFUSING TO SEED: ADMIN_SEED_EMAIL, TEST_ORGANIZER_EMAIL, and/or ADMIN_SEED_PASSWORD not set.\n' +
        '   Set all three before running this script — see packages/backend/.env.example.\n'
      );
      process.exit(1);
    }
    // Default password for both accounts (change immediately after first login)
    const hashedPassword = await bcryptjs.hash(defaultPassword, 10);

    // Account 1: Admin Account
    const adminUser = await prisma.user.upsert({
      where: { email: adminSeedEmail },
      update: {
        name: adminSeedName,
        password: hashedPassword,
        role: 'ADMIN',
        roles: ['USER', 'ORGANIZER', 'ADMIN'],
      },
      create: {
        email: adminSeedEmail,
        name: adminSeedName,
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

    console.log(`✅ Admin account: ${adminSeedEmail} (TEAMS tier)`);
    console.log(`   User ID: ${adminUser.id}`);
    console.log(`   Organizer ID: ${adminOrganizer.id}`);

    // Account 2: Teams Organizer
    const organizerUser = await prisma.user.upsert({
      where: { email: testOrganizerEmail },
      update: {
        name: 'Artifact MI',
        password: hashedPassword,
        role: 'ORGANIZER',
        roles: ['USER', 'ORGANIZER'],
      },
      create: {
        email: testOrganizerEmail,
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

    console.log(`✅ Organizer account: ${testOrganizerEmail} (TEAMS tier)`);
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
