# ADR-052-053-054: Estate Sale Encyclopedia, Cross-Platform Aggregator, Crowdsourced Appraisal API

**Date:** 2026-03-17 (Session 190)
**Status:** Design Complete — Ready for Sprint Planning
**Scope:** 7 sprints total (52: 3, 53: 2 [BLOCKED], 54: 2.5)

---

## Executive Summary

Three major features proposed for Phase 5+:

1. **#52 Estate Sale Encyclopedia [FREE]** — Crowdsourced knowledge base for item identification. Long-tail SEO moat. 3 sprints.
2. **#53 Cross-Platform Aggregator [TEAMS]** — Unified search aggregating EstateSales.NET, Craigslist, Facebook Marketplace listings. **FLAGGED: LEGAL REVIEW REQUIRED before implementation.** 2 sprints (blocked).
3. **#54 Crowdsourced Appraisal API [PAID_ADDON]** — Users submit photos → community + AI estimates item value. Revenue stream. 2.5 sprints.

---

## Feature #52: Estate Sale Encyclopedia

### Business Rationale

- **SEO engine:** Guides like "How to Identify Depression Glass" rank on Google → drive organic discovery
- **Conversion booster:** Encyclopedia links embedded in item detail pages → increased shopper engagement
- **Community moat:** User contributions reduce FindA.Sale's content creation burden
- **Monetization-ready:** Future sponsored entries (premium makers, auction houses) without affecting free tier

### Design

#### Data Models

```prisma
model EncyclopediaEntry {
  id          String @id @default(cuid())
  slug        String @unique // URL-friendly: "depression-glass-101", "art-deco-furniture"
  title       String
  subtitle    String? // "A beginner's guide to..."
  content     String // Markdown format
  category    String // Art Deco, MCM, Americana, Victorian, Tools, Toys, Jewelry, Pottery, Glassware, Textiles, etc.
  tags        String[] @default([]) // Additional searchable tags
  authorId    String
  author      User @relation(fields: [authorId], references: [id])

  status      String @default("DRAFT") // DRAFT | PENDING_REVIEW | PUBLISHED | FLAGGED
  isFeatured  Boolean @default(false) // Homepage rotation

  viewCount   Int @default(0) // Track popularity for ranking
  helpfulCount Int @default(0) // Useful vs. not useful votes

  // Versioning — keep full history of edits
  revisions   EncyclopediaRevision[]

  // Price benchmarks — structured data linked to entries
  benchmarks  PriceBenchmark[]

  // External references — where to learn more
  references  EncyclopediaReference[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category])
  @@index([status])
  @@index([isFeatured])
}

model EncyclopediaRevision {
  id          String @id @default(cuid())
  entryId     String
  entry       EncyclopediaEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)

  // Snapshot of content at time of edit
  title       String
  content     String
  category    String
  tags        String[]

  // Who edited
  authorId    String
  author      User @relation(fields: [authorId], references: [id])

  // Changeset for audit trail
  changeNote  String? // "Fixed typo", "Added price data for 2024"

  createdAt   DateTime @default(now())

  @@index([entryId])
}

model PriceBenchmark {
  id          String @id @default(cuid())
  entryId     String
  entry       EncyclopediaEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)

  condition   String // mint, excellent, good, fair, poor
  region      String // "Northeast", "Midwest", "South", "West", "National"

  priceRangeLow   Int // cents
  priceRangeHigh  Int // cents

  dataSource  String? // "AskPrice", "SOLD listing", "Comps", "Appraiser"
  updatedAt   DateTime @updatedAt

  @@index([entryId])
}

model EncyclopediaReference {
  id          String @id @default(cuid())
  entryId     String
  entry       EncyclopediaEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)

  title       String
  url         String // External link
  source      String? // "Smithsonian", "Museum of Modern Art", "Collector's Weekly", etc.

  createdAt   DateTime @default(now())

  @@index([entryId])
}
```

#### API Contract

**GET /api/encyclopedia/entries** (public, no auth)
```typescript
// Query parameters
{
  page?: number // default 1
  limit?: number // default 20, max 100
  category?: string // optional filter
  search?: string // full-text on title + tags
  sort?: "recent" | "popular" | "trending" // default "recent"
}

// Response
{
  entries: {
    id: string
    slug: string
    title: string
    subtitle?: string
    category: string
    authorName: string // User.name
    status: "PUBLISHED" | "DRAFT" | "PENDING_REVIEW" | "FLAGGED" // DRAFT/PENDING only visible to author+admins
    viewCount: number
    helpfulCount: number
    excerpt: string // First 200 chars of content
    isFeatured: boolean
    createdAt: datetime
    updatedAt: datetime
  }[]
  total: number
  page: number
  hasMore: boolean
}
```

**GET /api/encyclopedia/entries/:slug** (public, no auth)
```typescript
// Response
{
  id: string
  slug: string
  title: string
  subtitle?: string
  content: string // Markdown
  category: string
  tags: string[]

  author: {
    id: string
    name: string
    profilePhoto?: string
  }

  status: "PUBLISHED" | ... // User only sees PUBLISHED; author+admin see draft
  viewCount: number
  helpfulCount: number

  benchmarks: {
    condition: string
    region: string
    priceRangeLow: number
    priceRangeHigh: number
    dataSource?: string
    updatedAt: datetime
  }[]

  references: {
    title: string
    url: string
    source?: string
  }[]

  // Related entries — 3 random from same category
  related: {
    slug: string
    title: string
    viewCount: number
  }[]

  createdAt: datetime
  updatedAt: datetime
}
```

**POST /api/encyclopedia/entries** (auth required: USER or above)
```typescript
{
  title: string // required
  subtitle?: string
  content: string // required, min 500 chars (markdown encouraged)
  category: string // required, enum validation
  tags?: string[] // max 10
  references?: { title: string; url: string; source?: string }[]
}

// Response
{
  id: string
  slug: string // auto-generated from title
  status: "PENDING_REVIEW" // User submissions go to review queue
  createdAt: datetime
  message: "Thank you! Your entry will be reviewed by our team."
}
```

**POST /api/encyclopedia/entries/:slug/vote** (auth required)
```typescript
{
  helpful: boolean // true = helpful, false = not helpful
}

// Response
{
  helpfulCount: number
  userVote: boolean | null // User's current vote (null if no vote)
}
```

**POST /api/encyclopedia/entries/:entryId/revisions** (auth required: owner or admin)
```typescript
{
  title?: string
  content?: string
  category?: string
  tags?: string[]
  changeNote?: string // What changed
}

// Response
{
  revisionId: string
  entryId: string
  changeNote: string
  createdAt: datetime
}
```

#### Frontend Routes & Components

- `/encyclopedia` — List view with search/filter/sort. Infinite scroll or pagination.
- `/encyclopedia/[slug]` — ISR detail page with versioning history sidebar.
- `/encyclopedia/submit` — Submission form (auth-gated). Markdown editor with live preview.
- `/organizer/encyclopedia/moderation` — [PRO/TEAMS tier] Review queue for pending entries. Approve/reject/edit/flag.

#### SEO & Performance

- **ISR:** Entries cached at build time, revalidate every 24h. New entries visible within 24h of approval.
- **Sitemap:** Generate `/encyclopedia/[slug]` URLs in next-sitemap.
- **OG Meta:** Each entry gets `og:title`, `og:description`, `og:image` (category thumbnail).
- **Full-text search:** Use PostgreSQL `to_tsvector(content)` + `websearch_to_tsquery` for rankings.
- **Markdown rendering:** Server-side with `remark` + `rehype` for sanitization + code highlighting.

#### Monetization Path (Future)

- Sponsored entries: "Created by" badge for premium partners (museums, auctioneers).
- Encyclopedia API: Sell access to structured data (benchmarks) to dealers/appraisers.
- Featured category: "Spotlight" entries for seasonal items (holiday collectibles, etc.).

#### Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Low-quality entries tank SEO | High | Mandatory review queue; minimum 500-char requirement; admin editing tools |
| Vandalism / spam | Medium | Soft delete with moderation flag; revision history for rollback |
| Copyright issues (copied text) | High | Terms of Service + plagiarism checker (future) |
| Outdated price data | Low | Source attribution; date stamps on benchmarks; "Last updated" visible |

---

## Feature #53: Cross-Platform Aggregator

### ⚠️ LEGAL REVIEW REQUIRED — DEFER IMPLEMENTATION

**Status: BLOCKED** — This feature cannot proceed to development until legal review is complete.

### Legal Risk Analysis

#### Scraping Risks (Prohibitive)

**EstateSales.NET:**
- Terms of Service explicitly prohibit automated access, scraping, or copying listings
- Legal precedent: *LinkedIn v. hiQ Labs, Inc.* (9th Cir. 2019) — Companies can enforce ToS against scrapers even for publicly visible data
- **Recommendation:** Approach EstateSales.NET directly for API partnership or affiliate agreement

**Craigslist:**
- ToS explicitly prohibits automated collection without permission
- *craigslist, inc. v. 3taps, Inc.* (N.D. Cal. 2013) — Craigslist successfully blocked scraping, even from RSS feeds
- Craigslist actively pursues legal action against scrapers
- **Recommendation:** Do NOT attempt scraping. Consider affiliate partnership (unlikely to be granted).

**Facebook Marketplace:**
- Meta's ToS prohibits automated data collection, bots, or scraping
- Personal data collection (user names, contacts) violates GDPR/CCPA
- Meta enforces aggressively through legal + technical blocks
- **Recommendation:** Do NOT attempt scraping. Not a partnership candidate.

#### Data Privacy Risks

- Aggregating personal data from Facebook Marketplace raises GDPR/CCPA obligations (user consent, data deletion rights)
- Scraping email addresses or phone numbers = PII exfiltration
- Cross-service linking of user data = new data controller liability

#### Compliance Conclusion

**Do not implement scraping-based aggregation.** The legal risk far outweighs the product benefit.

### Recommended Alternative: Partnership Model

If aggregation is strategically important, pursue these instead:

1. **EstateSales.NET API Partnership**
   - Contact their sales team directly
   - Negotiate terms for read-only feed access
   - Likely requires revenue share or licensing fee
   - Clean, legal, future-proof

2. **RSS Feed Aggregation (if available)**
   - Some estate sale operators publish RSS feeds
   - Consuming RSS ≠ scraping (publisher explicitly publishes)
   - Requires publisher consent but less legally risky

3. **Integration via Embeds**
   - Embed EstateSales.NET iframe on FindA.Sale (affiliate model)
   - No data scraping; user clicks through to their site
   - Revenue share on referrals

### Decision for Patrick

**Recommendation:** Mark #53 as **DEFERRED — Q4 2026** pending business case review. If Patrick wants aggregation badly enough to justify legal risk, we can propose the partnership model above after legal review.

Shelving this feature unblocks 2 sprints for higher-ROI work (encyclopedia, appraisal, fraud detection, etc.).

---

## Feature #54: Crowdsourced Appraisal API

### Business Rationale

- **Revenue stream:** $2–5 per appraisal × 100+ appraisals/day across user base = $200–500/day
- **Shopper engagement:** Curiosity-driven feature — people want to know what their finds are worth
- **Organizer value:** Appraisals surface underpriced items; encourage fee optimization
- **API opportunity:** White-label appraisals to external dealers, auctioneers (future Partnerships team revenue)

### Design

#### Data Models

```prisma
model AppraisalRequest {
  id          String @id @default(cuid())

  submittedByUserId String
  submittedBy User @relation(fields: [submittedByUserId], references: [id])

  itemTitle       String // required
  itemDescription String? // what the user tells us
  itemCategory    String? // furniture, jewelry, etc. (optional hint)

  photos          AppraisalPhoto[] // 1–5 photos

  // Request metadata
  status          String @default("PENDING") // PENDING | IN_REVIEW | COMPLETED | EXPIRED | DISPUTED

  // Community responses
  communityResponses AppraisalResponse[] @relation("CommunityAppraisals")

  // AI appraisal (optional, paid)
  aiAppraisalRequest AppraisalAIRequest? // one-to-one

  // Final consensus (once community voting or AI response provided)
  consensus       AppraisalConsensus?

  // Dispute tracking
  disputes        AppraisalDispute[]

  expiresAt       DateTime // 30 days from creation
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([submittedByUserId])
  @@index([status])
}

model AppraisalPhoto {
  id          String @id @default(cuid())
  requestId   String
  request     AppraisalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  cloudinaryUrl String
  uploadedAt  DateTime @default(now())

  @@index([requestId])
}

model AppraisalResponse {
  id          String @id @default(cuid())
  requestId   String
  request     AppraisalRequest @relation("CommunityAppraisals", fields: [requestId], references: [id], onDelete: Cascade)

  responderId String
  responder   User @relation(fields: [responderId], references: [id])

  // Estimate
  estimatedLow    Int // cents
  estimatedHigh   Int // cents

  // Confidence signal
  confidence      String @default("COMMUNITY") // COMMUNITY | VERIFIED_EXPERT (future)
  expertise       String? // "MCM Furniture", "Glassware", etc. (user self-assessed)
  reasoning       String // Why they think this price range

  // Vote mechanics (community consensus)
  helpfulVotes    Int @default(0)
  notHelpfulVotes Int @default(0)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([requestId, responderId]) // One response per user per request
  @@index([requestId])
  @@index([responderId])
}

model AppraisalConsensus {
  id          String @id @default(cuid())
  requestId   String @unique
  request     AppraisalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  // Final estimate (median of community, or AI if purchased)
  finalLow    Int // cents
  finalHigh   Int // cents

  // Confidence 0–100 based on (# responses, AI confidence, expert votes)
  confidenceScore Int // 0–100

  // What method was used
  methodology String // "COMMUNITY_CONSENSUS" | "AI_APPRAISAL" | "HYBRID"

  // AI details (if applicable)
  aiModelVersion String? // "claude-haiku-1.0", etc.
  aiConfidence    Float? // 0.0–1.0

  // Data for Insights dashboard
  responseCount   Int @default(0) // How many community responses

  completedAt DateTime @default(now())

  @@index([requestId])
}

model AppraisalAIRequest {
  id          String @id @default(cuid())
  requestId   String @unique
  request     AppraisalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  // Payment tracking
  userId      String
  user        User @relation(fields: [userId], references: [id])

  pricePaidCents Int // $2–5 = 200–500 cents
  paymentStatus  String @default("PENDING") // PENDING | COMPLETED | FAILED | REFUNDED
  stripePaymentIntentId String?

  // When AI response delivered
  completedAt DateTime?
  expiresAt   DateTime // 7 days from creation; request auto-expires if payment not completed

  createdAt   DateTime @default(now())

  @@index([userId])
}

model AppraisalDispute {
  id          String @id @default(cuid())
  requestId   String
  request     AppraisalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  raisedByUserId String
  raisedBy    User @relation(fields: [raisedByUserId], references: [id])

  reason      String // "Estimate too low", "Photos don't match description", "Suspicious expert response"
  notes       String?

  status      String @default("OPEN") // OPEN | INVESTIGATING | RESOLVED | CLOSED
  resolution  String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([requestId])
}
```

#### API Contract

**POST /api/appraisals** (auth required: USER or above)
```typescript
{
  itemTitle: string // required
  itemDescription?: string
  itemCategory?: string
  photos: File[] // 1–5 images, max 10MB each
}

// Response
{
  id: string
  status: "PENDING"
  expiresAt: datetime
  message: "Appraisal request created. Community members can submit estimates."
}
```

**GET /api/appraisals/:requestId** (auth required: requester or admin)
```typescript
// Response
{
  id: string
  itemTitle: string
  itemDescription?: string
  itemCategory?: string

  photos: { cloudinaryUrl: string }[]

  status: "PENDING" | "IN_REVIEW" | "COMPLETED" | "EXPIRED"

  communityResponses: {
    id: string
    responder: {
      id: string
      name: string
    }
    estimatedLow: number // cents
    estimatedHigh: number // cents
    confidence: "COMMUNITY" | "VERIFIED_EXPERT"
    reasoning: string
    helpfulVotes: number
    notHelpfulVotes: number
    createdAt: datetime
  }[]

  consensus?: {
    finalLow: number
    finalHigh: number
    confidenceScore: number (0–100)
    methodology: string
    responseCount: number
    completedAt: datetime
  }

  aiAppraisalStatus?: "NOT_PURCHASED" | "PENDING" | "COMPLETED"
  aiAppraisalResult?: {
    estimatedLow: number
    estimatedHigh: number
    aiConfidence: number (0.0–1.0)
    reasoning: string
  }

  createdAt: datetime
  expiresAt: datetime
}
```

**POST /api/appraisals/:requestId/responses** (auth required: USER)
```typescript
{
  estimatedLow: number // cents
  estimatedHigh: number // cents
  expertise?: string // "MCM Furniture", "Glassware"
  reasoning: string // required, min 50 chars
}

// Response
{
  id: string
  status: "POSTED"
  helpfulVotes: 0
  notHelpfulVotes: 0
}
```

**POST /api/appraisals/:requestId/ai-appraisal** (auth required: USER, PAID)
```typescript
// Step 1: Initiate payment
{
  // Request
}

// Response
{
  paymentIntentId: string
  checkoutUrl: string // Redirect to Stripe checkout
  expiresAt: datetime // 7 days
}

// Step 2: After payment completes (webhook)
// Trigger async Claude Haiku vision analysis:
// - Analyze photos
// - Cross-reference embeddings against EncyclopediaEntry benchmarks
// - Return consensus: { finalLow, finalHigh, reasoning, aiConfidence }
// - Save to AppraisalConsensus with methodology="AI_APPRAISAL"
```

**POST /api/appraisals/:requestId/responses/:responseId/vote** (auth required: USER)
```typescript
{
  helpful: boolean
}

// Response
{
  helpfulVotes: number
  notHelpfulVotes: number
}
```

#### Workflow Flow

**Shopper Initiates Appraisal:**
1. Snap 1–5 photos of item
2. Fill title + optional description + category hint
3. Submit → status PENDING
4. Community appraisers see request in `/appraisals/queue` feed
5. 5+ appraisers respond with estimates + reasoning

**Consensus Logic (After 5+ Responses):**
1. Calculate median estimate: `(low + high) / 2`
2. Confidence score: `(responseCount - 5) * 5` capped at 100
   - 5 responses = 0%, 20+ responses = 75–100%
3. Rank responses by helpfulness votes
4. Feature top 3 responses, hide low-quality ones
5. Update status to COMPLETED

**AI Appraisal (Paid, $2–5):**
1. User clicks "Get AI Appraisal" (after seeing community estimates)
2. Redirect to Stripe checkout (pricing: $2, $3, $5 tier options)
3. On webhook confirmation:
   - Call Claude Haiku Vision with photos
   - Cross-reference EncyclopediaEntry benchmarks for category
   - Generate estimate + confidence
   - Save to AppraisalConsensus with methodology="AI_APPRAISAL"
4. Display both community + AI estimates side-by-side
5. AI estimate replaces community consensus if higher confidence

#### Payment Integration

- Stripe: $2–5 per appraisal (org takes 100%, FindA.Sale takes commission via platform fee)
- Payment required BEFORE AI analysis starts
- Webhook validates payment, triggers async Claude Haiku job
- Failed/disputed appraisals → refund (manual process, PRO organizers can initiate)

#### Monetization

| Scenario | FindA.Sale Revenue |
|----------|-------------------|
| 100 community appraisals/day @ 0% conversion | $0 |
| 100 community appraisals/day, 10% convert to AI ($3 avg) | $30/day = $10.9k/year |
| 200 community appraisals/day, 15% convert | $90/day = $32.8k/year |
| API licensing (bulk appraisals for external dealers) | 10–20% of API fees |

Conservative estimate: **$10–30k/year** from appraisal fees at scale.

#### Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Bad AI estimates damage credibility | High | Always show confidence score; encourage community votes first; disclaimer on paid appraisals |
| Spam responses (junk estimates) | Medium | Require minimum expertise self-assessment; flag low-confidence responses |
| Payment refund storms (disputes) | Medium | Clear pricing, disclaimer; manual review for refunds; require dispute reason |
| Low community participation | Medium | Gamify (points for helpful responses); show contributor stats |

---

## Implementation Roadmap

### Feature #52: Encyclopedia (3 Sprints)

**Sprint 1 (1.5 weeks):**
- Schema: EncyclopediaEntry, Revision, PriceBenchmark, Reference models
- Neon migration + prisma generate
- Backend service + controller + routes (GET entries, GET by slug, POST new, POST vote)
- Middleware: entry visibility (draft only for author/admin)

**Sprint 2 (1 week):**
- Frontend: `/encyclopedia` list view with search/filter/sort
- Frontend: `/encyclopedia/[slug]` detail page with ISR
- Markdown rendering (remark + rehype)
- OG meta generation

**Sprint 3 (0.5 weeks):**
- Submit flow + moderation queue (`/organizer/encyclopedia/moderation`)
- Revision history sidebar
- Full-text search optimization
- Sitemap integration

---

### Feature #53: Cross-Platform Aggregator (BLOCKED)

**Status:** DEFER until legal review complete. Recommend marking as Q4 2026.

**If partnership model approved (future):**
- 2 sprints for EstateSales.NET API integration
- Data normalization layer
- Unified search display with source attribution

---

### Feature #54: Crowdsourced Appraisal (2.5 Sprints)

**Sprint 1 (1.5 weeks):**
- Schema: AppraisalRequest, Response, Consensus, AIRequest, Dispute models
- Neon migration + prisma generate
- Backend service: submission, community responses, consensus calculation
- Backend controller + routes (POST, GET, vote)
- Middleware: auth gating, payment validation

**Sprint 2 (1 week):**
- Frontend: `/appraisals/submit` form + photo upload (Cloudinary)
- Frontend: `/appraisals/:id` detail view with community + AI tab
- Community response component + voting UI
- Stripe checkout integration

**Sprint 3 (0.5 weeks [async]):**
- Webhook: payment confirmation → async Claude Haiku job
- Vision analysis + benchmark cross-reference
- Discord/email notifications to community members on new requests (engagement hook)

---

## Schema Migration Plan

### Feature #52 Migrations

**File:** `20260317001300_add_encyclopedia`
```sql
CREATE TABLE "EncyclopediaEntry" (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'DRAFT',
  isFeatured BOOLEAN DEFAULT false,
  viewCount INT DEFAULT 0,
  helpfulCount INT DEFAULT 0,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("authorId") REFERENCES "User"(id)
);

CREATE TABLE "EncyclopediaRevision" (
  id TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  "authorId" TEXT NOT NULL,
  "changeNote" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"(id) ON DELETE CASCADE,
  FOREIGN KEY ("authorId") REFERENCES "User"(id)
);

CREATE TABLE "PriceBenchmark" (
  id TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  condition TEXT NOT NULL,
  region TEXT NOT NULL,
  "priceRangeLow" INT NOT NULL,
  "priceRangeHigh" INT NOT NULL,
  "dataSource" TEXT,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"(id) ON DELETE CASCADE
);

CREATE TABLE "EncyclopediaReference" (
  id TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"(id) ON DELETE CASCADE
);

CREATE INDEX idx_encyclopedia_category ON "EncyclopediaEntry"(category);
CREATE INDEX idx_encyclopedia_status ON "EncyclopediaEntry"(status);
CREATE INDEX idx_encyclopedia_featured ON "EncyclopediaEntry"("isFeatured");
CREATE INDEX idx_encyclopedia_author ON "EncyclopediaEntry"("authorId");
CREATE INDEX idx_revision_entry ON "EncyclopediaRevision"("entryId");
CREATE INDEX idx_benchmark_entry ON "PriceBenchmark"("entryId");
CREATE INDEX idx_reference_entry ON "EncyclopediaReference"("entryId");
```

### Feature #54 Migrations

**File:** `20260317001400_add_appraisals`
```sql
CREATE TABLE "AppraisalRequest" (
  id TEXT PRIMARY KEY,
  "submittedByUserId" TEXT NOT NULL,
  "itemTitle" TEXT NOT NULL,
  "itemDescription" TEXT,
  "itemCategory" TEXT,
  status TEXT DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"(id)
);

CREATE TABLE "AppraisalPhoto" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "cloudinaryUrl" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
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
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  UNIQUE("requestId", "responderId"),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("responderId") REFERENCES "User"(id)
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
  "completedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE
);

CREATE TABLE "AppraisalAIRequest" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT UNIQUE NOT NULL,
  "userId" TEXT NOT NULL,
  "pricePaidCents" INT NOT NULL,
  "paymentStatus" TEXT DEFAULT 'PENDING',
  "stripePaymentIntentId" TEXT,
  "completedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"(id)
);

CREATE TABLE "AppraisalDispute" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "raisedByUserId" TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'OPEN',
  resolution TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("requestId") REFERENCES "AppraisalRequest"(id) ON DELETE CASCADE,
  FOREIGN KEY ("raisedByUserId") REFERENCES "User"(id)
);

CREATE INDEX idx_appraisal_user ON "AppraisalRequest"("submittedByUserId");
CREATE INDEX idx_appraisal_status ON "AppraisalRequest"(status);
CREATE INDEX idx_response_request ON "AppraisalResponse"("requestId");
CREATE INDEX idx_response_responder ON "AppraisalResponse"("responderId");
CREATE INDEX idx_ai_request_user ON "AppraisalAIRequest"("userId");
CREATE INDEX idx_dispute_request ON "AppraisalDispute"("requestId");
```

## Rollback Plans

### Feature #52 Rollback

Down migrations (in reverse order):
```sql
DROP TABLE IF EXISTS "EncyclopediaReference";
DROP TABLE IF EXISTS "PriceBenchmark";
DROP TABLE IF EXISTS "EncyclopediaRevision";
DROP TABLE IF EXISTS "EncyclopediaEntry";
```

Playbook: If encyclopedia entries cause Neon OOM (large text fields), drop tables and redeploy without encyclopedia logic.

### Feature #54 Rollback

Down migrations (in reverse order):
```sql
DROP TABLE IF EXISTS "AppraisalDispute";
DROP TABLE IF EXISTS "AppraisalAIRequest";
DROP TABLE IF EXISTS "AppraisalConsensus";
DROP TABLE IF EXISTS "AppraisalResponse";
DROP TABLE IF EXISTS "AppraisalPhoto";
DROP TABLE IF EXISTS "AppraisalRequest";
```

Playbook: If appraisal payment webhook fails, disable payment flow (keep community appraisals) and debug webhook logic offline.

---

## Cross-Layer Contracts

### Database → Backend

- **Encyclopedia:** EntryID + slug uniqueness guaranteed; full-text indexes on content
- **Appraisal:** RequestID + photo count validated; consensus calculated server-side

### Backend → Frontend

- **Encyclopedia:**
  - GET /api/encyclopedia/entries: Returns paginated list + total count
  - GET /api/encyclopedia/entries/:slug: Returns hydrated entry + related entries
  - Detail page receives fully rendered Markdown (server-side conversion)

- **Appraisal:**
  - GET /api/appraisals/:id: Returns request + all community responses + consensus
  - Payment flow: Frontend calls Stripe → webhook triggers backend job → frontend polls for status

### Frontend Responsibility

- Encyclopedia: Render Markdown (using react-markdown), handle no-JS fallback
- Appraisal: Photo upload via Cloudinary, Stripe checkout handling, real-time response polling

---

## Constraints & Locked Decisions

1. **No external scraping** (#53) — Legal constraint prevents implementation
2. **Encyclopedia categories enum** — Locked to 15 categories (expandable in future sprints)
3. **Appraisal pricing** — $2–5 tier range (not higher; keeps volume high)
4. **No manual expert vetting** (#54 Phase 1) — Community consensus only; expert badge system deferred to Phase 2

---

## Success Metrics

### #52 Encyclopedia
- Target: 100+ entries within 6 months
- SEO: 500+ organic visits/month from Google by month 6
- Engagement: 30% of item viewers click encyclopedia link

### #54 Appraisal
- Target: 1,000+ appraisal requests/month by month 3
- Monetization: 10% conversion to AI appraisals = $100/month revenue by month 3
- Community participation: 100+ active appraisers contributing

---

## Next Steps (For Patrick)

1. **#52 & #54:** APPROVED for Sprint Planning. Assign to findasale-dev once roadmap prioritized.
2. **#53:** SCHEDULE legal review before any implementation work. Recommend deferring to Q4 2026.
3. **Migrations:** Once sprints assigned, run Neon migrations per CLAUDE.md §6 (with explicit $env:DATABASE_URL override).

---

**Design Complete. Ready for development dispatch.**
