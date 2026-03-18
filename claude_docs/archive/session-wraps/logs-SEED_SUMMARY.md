# Database Seed Summary

## ✅ Seed Script Complete

The new high-volume seed script has been successfully created and tested. It populates the FindA.Sale database with realistic test data for local development, QA, and stakeholder demos.

### Location
- **File**: `packages/database/prisma/seed.ts`
- **Run Command** (inside Docker): `docker exec findasale-backend-1 sh -c "cd /app && npx tsx packages/database/prisma/seed.ts"`

### Data Generated

| Entity | Count | Details |
|--------|-------|---------|
| **Users** | 100 | 90 shoppers + 10 organizers; diverse names; mixed points/phone |
| **Organizers** | 10 | Grand Rapids business names; realistic addresses; 70% have Stripe ID |
| **Sales** | 25 | 8 upcoming, 8 active, 5 ended, 4 draft; all in Grand Rapids area |
| **Items** | 300 | ~12 per sale; all 12 categories; 5 conditions; 10% sold, 5% reserved |
| **Purchases** | 50 | 80% paid, 20% pending; includes platform fees & Stripe IDs |
| **SaleSubscribers** | 60 | Email/phone reminders; unique per sale |
| **Sale Favorites** | 80 | Users favoriting sales |
| **Item Favorites** | 100 | Users favoriting items |
| **Reviews** | 30 | Only on ended sales; ratings 1-5 with realistic comments |
| **UserBadges** | 40 | Users awarded badges (First Purchase, Regular Shopper, etc) |
| **Referrals** | 15 | User referral chains |
| **LineEntries** | 20 | Virtual queues across 3-4 sales |
| **AffiliateLinks** | 10 | One per ~2.5 sales |
| **Badges** | 5 | System badges (kept from original seed) |

### Key Features

✅ **Realistic Data**
- Diverse first/last names (100 options each)
- Grand Rapids street names & ZIP codes
- Proper geocoordinates (lat ~42.96, lng ~-85.66)
- Authentic business names (Lakeshore Estate Sales, etc)
- Category & condition enums match schema

✅ **Idempotent**
- Clears all tables before reseeding
- Uses no hardcoded IDs
- Builds relationships from returned objects
- Can run multiple times safely

✅ **High Volume**
- 300+ items for meaningful search/filtering tests
- 100 users for badge/referral logic testing
- 25 sales with varied statuses for UI testing
- Realistic item pricing ($2–$1200)

✅ **Comprehensive Coverage**
- All 12 item categories represented
- All 5 condition states present
- Mixed purchase statuses (PAID, PENDING)
- Reviews only on ended sales
- Line entries on active sales
- Affiliate links distributed across sales

### Performance

Script runs in ~30–45 seconds on typical connection.

### Dependencies Added

```json
"dependencies": {
  "bcryptjs": "^2.4.3",
  "uuid": "^9.0.0"
}
```

### Testing Checklist

- [x] Script compiles without TypeScript errors
- [x] Database schema synced (via `prisma db push`)
- [x] Seed clears & repopulates cleanly
- [x] All 300 items created with correct categories/conditions
- [x] All 50 purchases linked to sold/reserved items
- [x] Foreign key constraints satisfied
- [x] Summary logs confirm counts match requirements

### Next Steps

1. **Verify in Prisma Studio**: `npm run db:studio` — browse tables, confirm data quality
2. **Test in UI**: Start app, confirm homepage shows 10+ sales, map shows pins, categories filter properly
3. **Check org dashboard**: Should show real sales, revenue analytics, subscriber counts
4. **Verify email reminders**: Should have 60+ subscribers to notify

### Notes

- Passwords hashed with bcrypt; default is `password123` for all users
- Referral codes assigned to all 100 users
- Stripe test IDs use `pi_test_` format for purchases
- Cloudinary placeholder URLs for all photos
- Min/max constraints (prices, points, dates) validated per requirements
