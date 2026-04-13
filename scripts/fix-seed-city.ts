import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Starting seed city fix...\n');

  try {
    // Fix Sale records: update city and state, remove " #N" from titles
    console.log('📍 Fixing Sale records...');
    const salesUpdateResult = await prisma.sale.updateMany({
      where: {
        OR: [
          { city: 'Riverside' },
          { state: 'IL' },
        ],
      },
      data: {
        city: 'Grand Rapids',
        state: 'MI',
      },
    });
    console.log(`✅ Updated ${salesUpdateResult.count} sales with city/state`);

    // Fix sale titles: remove " #N" suffix using raw update with regex
    console.log('🏷️  Removing " #N" suffixes from sale titles...');
    const salesWithSuffixes = await prisma.sale.findMany({
      where: {
        title: {
          contains: ' #',
        },
      },
      select: { id: true, title: true },
    });

    let titleFixCount = 0;
    for (const sale of salesWithSuffixes) {
      const newTitle = sale.title.replace(/\s+#\d+$/, '');
      if (newTitle !== sale.title) {
        await prisma.sale.update({
          where: { id: sale.id },
          data: { title: newTitle },
        });
        titleFixCount++;
      }
    }
    console.log(`✅ Fixed ${titleFixCount} sale titles`);

    // Fix Organizer records: update address to include Grand Rapids, MI
    console.log('🏢 Fixing Organizer addresses...');
    const organizers = await prisma.organizer.findMany({
      select: { id: true, address: true },
    });

    let organizerFixCount = 0;
    for (const org of organizers) {
      // Remove old city/state pattern and replace with Grand Rapids, MI
      const newAddress = org.address
        .replace(/,?\s*Riverside,?\s*IL\s*\d+/, ', Grand Rapids, MI ')
        .replace(/,?\s*Riverside,?\s*IL/, ', Grand Rapids, MI')
        // Clean up any double commas or extra spaces
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .trim();

      if (newAddress !== org.address) {
        await prisma.organizer.update({
          where: { id: org.id },
          data: { address: newAddress },
        });
        organizerFixCount++;
      }
    }
    console.log(`✅ Fixed ${organizerFixCount} organizer addresses`);

    console.log('\n✨ Seed city fix completed successfully!');
    console.log(`\n📋 Summary:`);
    console.log(`  • Sales updated: ${salesUpdateResult.count}`);
    console.log(`  • Sale titles fixed: ${titleFixCount}`);
    console.log(`  • Organizer addresses fixed: ${organizerFixCount}`);
  } catch (error) {
    console.error('❌ Error during seed fix:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
