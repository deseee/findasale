# Patrick's Dashboard — S621 WRAP

## Status: 🟢 Claim-This-Listing magic link live | Per-organizer scraper attribution shipped | Google News junk cleaned

**Headline:** S621 shipped the full claim-this-listing flow (#361) with magic link email verification, upgraded the scraper to create per-company organizer pages (not one dump-all organizer), enriched scraped organizers with full Google Places details (phone, address, photo), and deleted all 6000+ Google News junk "sales" from the DB.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1** | Add `GOOGLE_PLACES_API_KEY` Railway env var | ASAP | Railway dashboard → findasale-backend → Variables. Google Maps Platform key with Places API + Places Details enabled. Required for organizer enrichment to populate phone/address/photo on scraped pages. |
| **P2** | Press release — fill `[Last Name]` ×3 + real cell | OVERDUE | `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B. File Mon May 5 9:00 AM EST. |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 8 others |

---

## 📊 What Shipped This Session (S621)

### Claim-This-Listing (#361) — full flow live
- **Modal:** Opens without requiring login. Claimant enters name + email + optional message.
- **Backend:** Generates secure 64-char token, stores on `ClaimRequest`, sends Resend magic link email to `{frontendUrl}/claim/verify/{token}`.
- **Verify page:** `/claim/verify/[token]` — 5 states: loading / success / already-verified / expired (72h) / invalid.
- **Admin endpoints:** `GET /admin/claim-requests`, `POST /admin/claim-requests/:id/approve`, `POST /admin/claim-requests/:id/reject`.
- **Schema:** `ClaimRequest` gained `verificationToken`, `emailVerifiedAt`, `reviewedBy`. `Organizer.phone` is now nullable. `scrapedEmail String?` added.

### Per-organizer scraper attribution
- `getOrCreateScrapedOrganizer()` creates one organizer per company name (using EstateSalesNet's `orgName` field).
- Scraped sales now appear on their own company page, not one dump-all "FindA.Sale Directory" page.
- Email pattern: `scraper+{slug}-{source}@system.finda.sale`.

### Google Places enrichment upgrade
- After finding a Place ID, the enrichment job now calls `place/details` for phone, website, formatted address, and profile photo.
- Requires `GOOGLE_PLACES_KEY` env var in Railway.

### City/state deduplication fix
- `formatLocation()` helper prevents "California, CA" — shows only state code when city field contains a full US state name.

### Google News disabled + DB cleaned
- `NEWSPAPER_FEEDS = []` — Google News deprecated (articles about sales, not sale listings).
- ~6000+ junk `ClassifiedRSS` sales deleted from production DB.

---

## 📦 Push Block — S621 wrap docs only

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "docs: S621 wrap — claim magic link + scraper attribution + Google News cleanup"
.\push.ps1
```

---

## 🔎 Pending Chrome QA (from this + prior sessions)

| Item | What to Test | Status |
|------|-------------|--------|
| **#361 Claim flow** | Login as user12 (shopper, `Seedy2025!`) → Sunrise Consignment storefront → amber banner → modal → submit → "Check Your Email" success | ⏳ Pending |
| **#361 Verify page** | Get token from DB → navigate to `/claim/verify/{token}` → confirm success state | ⏳ Pending |
| **#356 Broadcast card** | Any organizer storefront with a broadcast → "Latest Update" card renders | ⏳ Pending |
| **#363 Buyer's Premium badge** | AUCTION sale on storefront → amber "Buyer's Premium: n%" pill | ⏳ Pending |
| **Tier Lapse plan card** | tier-lapse-test@example.com dashboard → plan card is amber when lapsed | ⏳ Pending |

---

## 🚦 Scraper Status

| Source | Status | Notes |
|--------|--------|-------|
| EstateSalesNet | ✅ Live | 40 US coordinate centers, 00:00 UTC nightly |
| Craigslist | ❌ Suspended | Datacenter IP block — don't trigger |
| Eventbrite | ⏳ Needs key | Add `EVENTBRITE_API_KEY` GitHub Secret |
| Newspaper/Oodle RSS | ✅ Wired | 02:00 UTC (no API key needed) |

**Test accounts:** `Seedy2025!` for all seed users. user1=Alice (TEAMS), user2=Bob (PRO), user11=Sunrise Consignment (unclaimed organizer), user12=primary shopper.
