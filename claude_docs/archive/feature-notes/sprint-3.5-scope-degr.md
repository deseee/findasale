# Sprint 3.5 Scope: Code DeGR-ification (Generalize for Multi-Region)

**Status:** Sprint Planning
**Date Created:** 2026-03-07
**Owner:** Patrick (PM) → Dev Agent
**Objective:** Remove all hardcoded Grand Rapids geography and make the app configurable for any city/region.

---

## Executive Summary

FindA.Sale was built specifically for Grand Rapids, MI. This sprint removes **51 hardcoded location references** across **13 files** and establishes infrastructure for configurable multi-city support.

**Summary Stats:**
- **Total Files Affected:** 13
- **Total References:** 51
- **Packages:** Frontend (6), Backend (5), Database (2)
- **Categories:** UI text (20), Seed data (11), Business logic (12), Config/constants (8)

---

## Scope Breakdown by Package

### FRONTEND (6 files, 22 references)

#### 1. `/pages/index.tsx` — Homepage SEO + Schema
- **Line 144:** `"FindA.Sale — Estate Sales in Grand Rapids, MI"` (og:title)
- **Line 145:** `"Browse estate sales and auctions near you. Bid, buy, and discover unique items from local estate sales in Grand Rapids, Michigan."` (og:description)
- **Line 150:** `"FindA.Sale — Estate Sales in Grand Rapids, MI"` (twitter:title)
- **Line 151:** `"Browse estate sales and auctions near you in Grand Rapids, Michigan."` (twitter:description)
- **Line 163:** `"Grand Rapids estate sale marketplace — browse, buy, and sell estate sale items online"` (schema description)
- **Line 166:** `addressLocality: 'Grand Rapids'` (schema address)
- **Line 282:** `"📍 Near Grand Rapids"` (UI text placeholder)
- **Type:** UI text + SEO metadata
- **Fix:** Use env var `NEXT_PUBLIC_CITY`, `NEXT_PUBLIC_STATE` for all og:*, twitter:*, schema fields. For user geolocation fallback text, show location name from API or config.

---

#### 2. `/neighborhoods/index.tsx` — Neighborhood Directory Page
- **Line 3:** Comment: `"Static overview page listing all supported Grand Rapids neighborhoods."`
- **Line 13:** `export const GRAND_RAPIDS_NEIGHBORHOODS: Array<{...}> = [...]` (constant name)
- **Lines 18–31:** 15 neighborhood descriptions (Downtown, Eastown, East Hills, Heritage Hill, Creston, Westside, Midtown, Fulton Heights, Alger Heights, Ada Township, Cascade, Kentwood, Wyoming, Grandville) — each tied to Grand Rapids geography
- **Line 38:** `"Estate Sales by Neighborhood — Grand Rapids, MI | FindA.Sale"` (page title)
- **Line 41:** `"Browse upcoming estate sales by neighborhood in Grand Rapids, Michigan..."` (meta description)
- **Line 55:** `"Grand Rapids, Michigan • Browse sales close to home"` (page subtitle)
- **Type:** Config data (neighborhood list is location-specific)
- **Fix:** Move GRAND_RAPIDS_NEIGHBORHOODS to a database table (Neighborhood model) or API-loaded config. Include neighborhood slug, name, description, bounds (lat/lng), city, state. Load dynamically at page build time.

---

#### 3. `/neighborhoods/[slug].tsx` — Neighborhood Landing Page
- **Line 3:** Comment: `"SEO-optimised page for estate sales in a specific Grand Rapids neighborhood."`
- **Line 13:** `import { GRAND_RAPIDS_NEIGHBORHOODS }` (imported from index)
- **Line 49:** `const pageTitle = \`Estate Sales in ${name}, Grand Rapids MI | FindA.Sale\`` (hardcoded state)
- **Line 50:** `const metaDesc = \`Browse ... in ${name}, Grand Rapids, Michigan...` (hardcoded state in description)
- **Type:** SEO metadata + import
- **Fix:** Accept `city` and `state` as props from getServerSideProps context (derive from neighborhood config). Parameterize title/description templates.

---

#### 4. `/components/SaleMapInner.tsx` — Map Component
- **Line 79:** `center = [42.9634, -85.6681], // Grand Rapids, MI` (default map center)
- **Type:** Config constant (hardcoded coordinates)
- **Fix:** Use env var `NEXT_PUBLIC_MAP_CENTER_LAT` and `NEXT_PUBLIC_MAP_CENTER_LNG`, default to user location if available. Could also be configurable user setting.

---

#### 5. `/pages/map.tsx` — Sales Map Page
- **Line 169:** `"See all upcoming estate sales on an interactive map. Filter by date and find sales near you in Grand Rapids, MI."` (meta og:description)
- **Line 182:** `{isLoading ? '...' : \`${saleCount} sale${saleCount !== 1 ? 's' : ''} near Grand Rapids, MI\`}` (hardcoded label)
- **Type:** UI text + metadata
- **Fix:** Parameterize city/state name in label. Fetch from API or config.

---

#### 6. `/pages/_document.tsx` — Global Head Tags
- **Line 35:** `content="estate sales, auctions, antiques, thrift, Grand Rapids"` (meta keywords)
- **Type:** Meta keywords
- **Fix:** Use env var or API config endpoint to populate keywords dynamically.

---

#### **Additional Frontend UI References (SEO/Text):**
- `/pages/trending.tsx` Line 51: `"The hottest estate sale items and upcoming sales this week in Grand Rapids."` → **SEO metadata**
- `/pages/terms.tsx` Line 12: `"Terms of Service for FindA.Sale — the estate sale marketplace for Grand Rapids and beyond."` → **Legal/SEO**
- `/pages/plan.tsx` Line 103: `content="Get free guidance from an AI assistant about planning your estate sale in Michigan"` → **Meta description**
- `/pages/plan.tsx` Line 30: `'What are Michigan estate sale laws?'` → **AI Question example**
- `/pages/contact.tsx` Line 35: `"Get in touch with the FindA.Sale support team. We're here to help organizers and shoppers in Grand Rapids, Michigan."` → **SEO metadata**
- `/pages/about.tsx` Line 11: `"FindA.Sale is a digital platform for estate sale organizers and shoppers in Grand Rapids, Michigan."` → **SEO metadata**
- `/pages/leaderboard.tsx` Line 79: `"Top shoppers and organizers in Grand Rapids"` → **Meta description**
- `/pages/leaderboard.tsx` Line 88: `"Celebrating the top shoppers and organizers in Grand Rapids"` → **UI heading**
- `/pages/organizer/email-digest-preview.tsx` Line 53: `'Estate Sale - Downtown Grand Rapids'` → **Preview text (sample data)**
- `/components/Layout.tsx` Line 204: `"Helping you find the best estate sales and auctions in Grand Rapids and beyond."` → **Footer tagline**
- `/pages/organizer/create-sale.tsx` Lines 296–303: Hardcoded neighborhood dropdown options (Downtown, Eastown, East Hills, Heritage Hill, Fulton Heights) → **Select options**

---

### BACKEND (5 files, 16 references)

#### 1. `/services/discoveryService.ts` — Default Geolocation Fallback
- **Line 32:** `const GRAND_RAPIDS_LAT = 42.9619;` (hardcoded constant)
- **Line 33:** `const GRAND_RAPIDS_LNG = -85.6789;` (hardcoded constant)
- **Lines 77–78:** Used as default when no user location provided
- **Type:** Business logic constant
- **Fix:** Move to environment variables or database config:
  - `DEFAULT_SEARCH_LAT` and `DEFAULT_SEARCH_LNG`
  - Or create a `RegionConfig` table with default coordinates per region.
  - Override at request time if user provides location.

---

#### 2. `/routes/feed.ts` — Feed Route Comments & Labels
- **Line 11:** Comment: `"browse/buy history. Supports optional geolocation (?lat=42.96&lng=-85.67)."` (example coordinates)
- **Line 13:** Comment: `"Anonymous users get geo-sorted popular feed (defaults to Grand Rapids)."` 
- **Line 37:** `reason: ... 'Sorted by date and proximity to Grand Rapids'` (response message)
- **Type:** Documentation + response text
- **Fix:** Update comments and response reason string to use dynamic city name from config. Response reason should be: `'Sorted by date and proximity to [CITY]'` where city comes from env/config.

---

#### 3. `/services/cloudAIService.ts` — AI Prompts (3 references)
- **Line 126:** `text: \`You are an expert estate sale cataloger for a Grand Rapids, Michigan marketplace.\`` (system prompt in image analysis)
- **Line 134:** `Price: Realistic Grand Rapids estate sale price (typically 20–50% of retail).` (prompt instruction)
- **Line 238:** `content: \`You are helping an estate sale organizer in ${city}, Michigan write...` (partial parameterization exists here — good model for others)
- **Line 314:** `content: \`You are an estate sale pricing expert. Based on typical Grand Rapids, Michigan estate sale prices...` (prompt instruction)
- **Type:** AI system prompts
- **Fix:**
  - Line 126: Change to `For a ${city}, ${state} marketplace.` using function parameter `city` and new param `state`.
  - Line 134: Change to `Price: Realistic [CITY], [STATE] estate sale price...` — parameterize or use city from request.
  - Line 314: Same approach — parameterize city/state.
  - Consider storing region-specific pricing guidance in a database table so prompts can reference it.

---

#### 4. `/controllers/plannerController.ts` — Estate Planning Chatbot
- **Line 16:** `const SYSTEM_PROMPT = \`You are an estate sale planning assistant for FindA.Sale, a platform in Grand Rapids, Michigan.\`` (system prompt)
- **Line 19:** `- Michigan estate sale regulations and legal requirements` (state-specific knowledge reference)
- **Type:** AI system prompt
- **Fix:** Accept `city` and `state` from request context (or from user account if organizer). Parameterize system prompt:
  ```
  const SYSTEM_PROMPT = `You are an estate sale planning assistant for FindA.Sale, a platform in ${city}, ${state}.

  You help families, executors, and individuals plan and execute estate sales. You are knowledgeable about:
  - ${state} estate sale regulations and legal requirements
  - Pricing antiques, furniture, and household goods
  ...`
  ```

---

#### 5. `/routes/geocode.ts` — API Example Comment
- **Line 6:** `// GET /api/geocode?address=123+Main+St&city=Grand+Rapids&state=MI&zip=49503` (example)
- **Type:** Documentation comment
- **Fix:** Generic example is fine but could note that zip code is optional/varies by region.

---

#### **Emails & Notifications (2 references):**
- `/services/emailTemplateService.ts` Line 116: `© 2026 FindA.Sale · Grand Rapids, MI<br />` → **Email footer (hardcoded location)**
  - **Fix:** Change to `© 2026 FindA.Sale · [CITY], [STATE]<br />` — fetch from env or database config.

- `/services/wishlistMatchEmailService.ts` Line 137: `saleCity: item.sale.city || 'Grand Rapids',` → **Fallback value**
  - **Fix:** Already has fallback logic; just change default from 'Grand Rapids' to a configurable env var `DEFAULT_CITY` or database lookup.

- `/services/weeklyEmailService.ts` Line 86: `saleCity: sale.city || 'Grand Rapids',` → **Fallback value**
  - **Fix:** Same as above — parameterize.

- `/jobs/curatorEmailJob.ts` Line 92: `Want to see all sales in Grand Rapids?` → **Email CTA text**
  - **Fix:** Parameterize to `Want to see all sales in [CITY]?` where city comes from database or request.

---

### DATABASE (2 files, 11 references)

#### 1. `/prisma/seed.ts` — Seed Data
- **Line 30:** `'Lakeshore Estate Sales', 'West Michigan Liquidators', 'Grand Rapids Auctions',` (business names — GR-specific)
- **Line 32:** `'Michigan Liquidation Solutions', 'Treasure Find Estate Sales', 'Valley Estate Auctions',` (more business names)
- **Line 72:** `const grZips = ['49503', '49504', '49505', '49506', '49507', '49508', '49509', '49512', '49525', '49534'];` (Grand Rapids zip codes)
- **Lines 269:** `address: \`${address}, Grand Rapids, MI ${zip}\`,` (hardcoded city/state in address)
- **Lines 322–345:** Comments and coordinates
  - Line 322: Comment `// Grand Rapids coordinates with variance`
  - Line 323–324: `const baseLat = 42.96; const baseLng = -85.66;` (GR center coords)
  - Line 345: `city: 'Grand Rapids',` (hardcoded city)
- **Type:** Seed data (test/dev database initialization)
- **Fix:**
  - Move zip codes to a separate ZIP code config or database table keyed by region.
  - Business names: replace with generic or region-agnostic examples.
  - Hardcoded addresses: use `${address}, ${SEED_CITY}, ${SEED_STATE} ${zip}` from env vars or config object.
  - Coordinates: use `SEED_CITY_LAT` and `SEED_CITY_LNG` from config.
  - Create a seed configuration object:
    ```ts
    const SEED_CONFIG = {
      city: process.env.SEED_CITY || 'Grand Rapids',
      state: process.env.SEED_STATE || 'MI',
      centerLat: parseFloat(process.env.SEED_CENTER_LAT || '42.96'),
      centerLng: parseFloat(process.env.SEED_CENTER_LNG || '-85.66'),
      zips: (process.env.SEED_ZIPS || '49503,49504,49505').split(','),
    };
    ```

---

#### 2. `/prisma/schema.prisma` — Schema Comment
- **Line 131:** `neighborhood  String?    // U2: Grand Rapids neighborhood slug e.g. "eastown"` (comment references GR-specific example)
- **Type:** Documentation comment in schema
- **Fix:** Update to: `neighborhood  String?    // Regional neighborhood slug e.g. "downtown"` — generic example.

---

### TEST FILES (5 files, 10 references)

#### E2E Tests
All test files use hardcoded zip codes (`49503`) and coordinates (`42.9629`) for test user setup. These are non-blocking for feature work but should be updated for consistency.

- `/backend/src/__tests__/weeklyDigest.e2e.ts` Lines 47, 75: `city: 'Grand Rapids'`, `zip: '49503'`, `latitude: 42.9629`
- `/backend/src/__tests__/stripe.e2e.ts` Lines 144–166: `city: 'Grand Rapids'`, `zip: '49503'`, `lat: 42.9629`
- `/backend/src/__tests__/emailReminders.e2e.ts` Lines 24, 54: `city: 'Grand Rapids'`, `zip: '49503'`, `latitude: 42.9629`

**Fix Approach:** Create a TEST_LOCATION constant in each test file or a shared test utilities module:
```ts
const TEST_LOCATION = {
  city: process.env.TEST_CITY || 'Grand Rapids',
  state: process.env.TEST_STATE || 'MI',
  zip: process.env.TEST_ZIP || '49503',
  lat: parseFloat(process.env.TEST_LAT || '42.9629'),
};
```

---

### LEGAL/CONFIG (1 file, 2 references)

#### `/pages/terms.tsx` — Terms of Service
- **Line 21:** `"us," or "our"), a Michigan limited liability company.` (jurisdiction)
- **Line 207:** `"principles. Any dispute shall be resolved in the state or federal courts located in Kent County, Michigan,` (governing law jurisdiction)
- **Type:** Legal/compliance
- **Fix:** This is sensitive — requires legal review. Should be parameterized but NOT exposed via env vars. Instead:
  1. Create a `LEGAL_CONFIG` constant in source code:
     ```ts
     const LEGAL_CONFIG = {
       state: 'Michigan',
       county: 'Kent County',
       entityType: 'limited liability company',
     };
     ```
  2. Update Terms dynamically to reference these values.
  3. When expanding to other states/regions, create separate legal templates or request new Terms approval from legal/compliance.

---

## Implementation Strategy

### Phase 1: Config Infrastructure (1–2 days)
1. Create `/backend/src/config/regionConfig.ts` or env-based region loader
2. Define interface for region configuration:
   ```ts
   interface RegionConfig {
     city: string;
     state: string;
     centerLat: number;
     centerLng: number;
     defaultZips: string[];
     stateAbbrev: string;
     county?: string;
     timeZone?: string; // e.g., 'America/Detroit'
   }
   ```
3. Load from environment variables or database `RegionConfig` table
4. Export as singleton/service for use across codebase

### Phase 2: Database Changes (2–3 days)
1. Create `Neighborhood` model in Prisma schema (if not exists):
   ```prisma
   model Neighborhood {
     id        String   @id @default(cuid())
     slug      String   @unique
     name      String
     description String
     city      String
     state     String
     centerLat Float
     centerLng Float
     bounds    Json?  // {minLat, maxLat, minLng, maxLng}
     createdAt DateTime @default(now())
   }
   ```
2. Seed neighborhoods table with GR data (15 neighborhoods)
3. Update `Sale.neighborhood` foreign key reference (if needed for data integrity)

### Phase 3: Frontend Updates (3–4 days)
1. Update `/neighborhoods/index.tsx` to fetch from API instead of hardcoded export
2. Update `/neighborhoods/[slug].tsx` getServerSideProps to accept city/state
3. Update SEO metadata in all pages to use env var `NEXT_PUBLIC_CITY` and `NEXT_PUBLIC_STATE`
4. Update map defaults to use `NEXT_PUBLIC_MAP_CENTER_LAT/LNG`
5. Remove hardcoded neighborhood dropdown in organizer form; load dynamically from API

### Phase 4: Backend Updates (2–3 days)
1. Update discovery service to use `RegionConfig` instead of constants
2. Parameterize AI prompts in `cloudAIService.ts` and `plannerController.ts`
3. Update feed route response reason message
4. Update email templates to use dynamic city/state (fetch from database or pass in context)
5. Update seed script to accept `SEED_CITY`, `SEED_STATE`, `SEED_ZIPS` env vars

### Phase 5: Tests & Documentation (1–2 days)
1. Update E2E test setup to use `TEST_LOCATION` config
2. Add comments clarifying hardcoded vs. configurable values
3. Document environment variables for new deployment

---

## Environment Variables Required

```bash
# Frontend (.env.local or .env.production)
NEXT_PUBLIC_CITY=Grand Rapids
NEXT_PUBLIC_STATE=MI
NEXT_PUBLIC_MAP_CENTER_LAT=42.9634
NEXT_PUBLIC_MAP_CENTER_LNG=-85.6681

# Backend (.env)
DEFAULT_SEARCH_LAT=42.9619
DEFAULT_SEARCH_LNG=-85.6789
DEFAULT_CITY=Grand Rapids
DEFAULT_STATE=MI

# Seed/Testing
SEED_CITY=Grand Rapids
SEED_STATE=MI
SEED_CENTER_LAT=42.96
SEED_CENTER_LNG=-85.66
SEED_ZIPS=49503,49504,49505,49506,49507,49508,49509,49512,49525,49534

TEST_CITY=Grand Rapids
TEST_STATE=MI
TEST_ZIP=49503
TEST_LAT=42.9629
```

---

## Rollout Plan

1. **Minimum Viable Generalization (MVP):**
   - Env vars for city/state
   - Dynamic neighborhoods from API
   - Parameterized AI prompts
   - **Result:** App works for any city, pre-configured at deployment time

2. **Multi-Region Runtime (Future):**
   - User/organizer selects region at signup
   - App defaults to user's region city/neighborhoods
   - Admin panel to manage regions
   - **Result:** Single deployment serves multiple regions without redeploy

---

## Success Criteria

- [ ] All hardcoded "Grand Rapids" and "Michigan" references moved to config
- [ ] Neighborhoods loaded dynamically from API/database
- [ ] Seed script accepts region parameters and generates correct zip codes
- [ ] AI prompts include city/state dynamically
- [ ] All SEO metadata pages parameterized
- [ ] E2E tests use configurable location
- [ ] Documentation updated with env vars and deployment instructions
- [ ] Legal review on Terms updates (jurisdiction clauses)

---

## Notes for Dev Agent

- **Priority:** Neighborhoods → API/database first (blocks frontend work)
- **Attention:** AI prompts need to maintain quality after parameterization; review Claude prompt templates carefully
- **Testing:** Use a non-GR city (e.g., Ann Arbor, Detroit) in one E2E run to verify generalization works
- **Legal:** Flag Terms/jurisdiction changes for Patrick to review with legal before deployment

---

**Next: Hand off to dev agent with this scope for implementation.**