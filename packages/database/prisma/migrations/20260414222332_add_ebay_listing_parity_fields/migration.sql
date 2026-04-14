-- AlterTable
ALTER TABLE "Item" ADD COLUMN "packageWeightOz" INTEGER,
ADD COLUMN "packageLengthIn" DECIMAL(6,2),
ADD COLUMN "packageWidthIn" DECIMAL(6,2),
ADD COLUMN "packageHeightIn" DECIMAL(6,2),
ADD COLUMN "packageType" TEXT,
ADD COLUMN "upc" TEXT,
ADD COLUMN "ean" TEXT,
ADD COLUMN "isbn" TEXT,
ADD COLUMN "mpn" TEXT,
ADD COLUMN "brand" TEXT,
ADD COLUMN "ebayEpid" TEXT,
ADD COLUMN "conditionNotes" TEXT,
ADD COLUMN "allowBestOffer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bestOfferAutoAcceptAmt" DECIMAL(10,2),
ADD COLUMN "bestOfferMinimumAmt" DECIMAL(10,2),
ADD COLUMN "ebaySecondaryCategoryId" TEXT,
ADD COLUMN "ebaySubtitle" TEXT;

-- AlterTable
ALTER TABLE "EbayConnection" ADD COLUMN "merchantLocationKey" TEXT,
ADD COLUMN "merchantLocationSource" TEXT;
