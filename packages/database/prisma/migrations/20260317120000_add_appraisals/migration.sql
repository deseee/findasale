-- S191: Crowdsourced Appraisal API — Feature #54 Sprint 1
-- Models: AppraisalRequest, AppraisalPhoto, AppraisalResponse, AppraisalConsensus, AppraisalAIRequest, AppraisalDispute

CREATE TABLE "AppraisalRequest" (
  id TEXT PRIMARY KEY,
  "submittedByUserId" TEXT NOT NULL,
  "itemTitle" TEXT NOT NULL,
  "itemDescription" TEXT,
  "itemCategory" TEXT,
  status TEXT DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalPhoto" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "cloudinaryUrl" TEXT NOT NULL,
  "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalResponse" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "responderId" TEXT NOT NULL,
  "estimatedLow" INT NOT NULL,
  "estimatedHigh" INT NOT NULL,
  confidence TEXT DEFAULT 'COMMUNITY',
  expertise TEXT,
  reasoning TEXT NOT NULL,
  "helpfulVotes" INT DEFAULT 0,
  "notHelpfulVotes" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  UNIQUE("requestId", "responderId"),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("responderId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalConsensus" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT UNIQUE NOT NULL,
  "finalLow" INT NOT NULL,
  "finalHigh" INT NOT NULL,
  "confidenceScore" INT NOT NULL,
  methodology TEXT NOT NULL,
  "aiModelVersion" TEXT,
  "aiConfidence" FLOAT,
  "responseCount" INT DEFAULT 0,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalAIRequest" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT UNIQUE NOT NULL,
  "userId" TEXT NOT NULL,
  "pricePaidCents" INT NOT NULL,
  "paymentStatus" TEXT DEFAULT 'PENDING',
  "stripePaymentIntentId" TEXT,
  "completedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalDispute" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "raisedByUserId" TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'OPEN',
  resolution TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("raisedByUserId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appraisal_user ON "AppraisalRequest"("submittedByUserId");
CREATE INDEX IF NOT EXISTS idx_appraisal_status ON "AppraisalRequest"(status);
CREATE INDEX IF NOT EXISTS idx_photo_request ON "AppraisalPhoto"("requestId");
CREATE INDEX IF NOT EXISTS idx_response_request ON "AppraisalResponse"("requestId");
CREATE INDEX IF NOT EXISTS idx_response_responder ON "AppraisalResponse"("responderId");
CREATE INDEX IF NOT EXISTS idx_consensus_request ON "AppraisalConsensus"("requestId");
CREATE INDEX IF NOT EXISTS idx_ai_request_user ON "AppraisalAIRequest"("userId");
CREATE INDEX IF NOT EXISTS idx_dispute_request ON "AppraisalDispute"("requestId");
