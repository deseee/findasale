-- Phase 20: Shopper messaging — Conversation + Message tables

CREATE TABLE "Conversation" (
    "id"            TEXT NOT NULL,
    "saleId"        TEXT,
    "shopperUserId" TEXT NOT NULL,
    "organizerId"   TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId"       TEXT NOT NULL,
    "body"           TEXT NOT NULL,
    "isRead"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Unique: one conversation thread per shopper + organizer + sale
CREATE UNIQUE INDEX "Conversation_shopperUserId_organizerId_saleId_key"
    ON "Conversation"("shopperUserId", "organizerId", "saleId");

-- Foreign keys
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopperUserId_fkey"
    FOREIGN KEY ("shopperUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;