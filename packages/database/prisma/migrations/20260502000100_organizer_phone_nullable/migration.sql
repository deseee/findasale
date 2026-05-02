-- AlterTable
ALTER TABLE "Organizer" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN "scrapedEmail" TEXT;
