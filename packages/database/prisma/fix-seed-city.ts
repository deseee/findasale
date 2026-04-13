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

    // Fix sale titles: remove " #N" suffix
    console.log('🏷️  Removing " #N" suffixes from sale titles...');
    const salesWithSuffixes = await prisma.sale.findMany({
      where: { title: { contains: ' #' } },
      select: { id: true, title: true },
    });

    let titleFixCount = 0;
    for (const sale of salesWithSuffixes) {
      const newTitle = sale.title.replace(/\s+#\d+$/, '');
      if (newTitle !== sale.title) {
        await prisma.sale.update({ where: { id: sale.id }, data: { title: newTitle } });
        titleFixCount++;
      }
    }
    console.log(`✅ Fixed ${titleFixCount} sale titles`);

    // Fix Organizer addresses
    console.log('🏢 Fixing Organizer addresses...');
    const organizers = await prisma.organizer.findMany({ select: { id: true, address: true } });

    let organizerFixCount = 0;
    for (const org of organizers) {
      const newAddress = org.address
        .replace(/,?\s*Riverside,?\s*IL\s*\d+/, ', Grand Rapids, MI ')
        .replace(/,?\s*Riverside,?\s*IL/, ', Grand Rapids, MI')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
      if (newAddress !== org.address) {
        await prisma.organizer.update({ where: { id: org.id }, data: { address: newAddress } });
        organizerFixCount++;
      }
    }
    console.log(`✅ Fixed ${organizerFixCount} organizer addresses`);

    console.log('\n✨ Done!');
    console.log(`  • Sales city/state: ${salesUpdateResult.count}`);
    console.log(`  • Sale titles: ${titleFixCount}`);
    console.log(`  • Organizer addresses: ${organizerFixCount}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
