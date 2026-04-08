# ADR: Guild/Crew Creation (Phase 2a Social Retention)

**Session:** S420  
**Author:** Architect  
**Date:** 2026-04-08  
**Status:** Approved for Dev  
**Risk Level:** 🟡 MEDIUM (new schema, XP economy gate, social feature)

---

## Problem Statement

FindA.Sale's XP economy (Phase 2a) creates a reward ceiling for engaged shoppers. Solo players accumulate XP but lack social goals beyond followers. **Crews** introduce a new retention lever: named collector communities with shared leaderboards, pooled group bounties, and activity feeds—encouraging longer sessions and inviting friends.

Crew creation costs 500 XP (permanent sink), positioning crews as achievable but aspirational status symbols.

---

## Solution Summary

Add `Crew` and `CrewMember` models to the schema. Crews are shopper-managed communities with:
- Founder pays 500 XP to create; free to join (new recommendation)
- Max 50 members (prevents P2P market abuse; low operational cost)
- Shared feed (existing haul/activity posts filtered by crew member list)
- Leaderboard (top members by guildXp within crew, monthly reset option TBD)
- Group bounties (existing `MissingListingBounty` optionally tagged with `crewId`)

---

## Schema Changes

### 1. Crew Model
```prisma
model Crew {
  id              String   @id @default(cuid())
  name            String   @unique                    // e.g. "Grand Rapids Mid-Century Hunters"
  slug            String   @unique                    // For URLs: /crews/grand-rapids-mid-century
  description     String?  @db.VarChar(500)          // Optional tagline
  founderUserId   String
  founder         User     @relation("CrewFounder", fields: [founderUserId], references: [id], onDelete: Cascade)
  
  isPublic        Boolean  @default(true)             // Public browse + join; false = invite-only
  memberCount     Int      @default(1)                // Denormalized for fast lookup
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  members         CrewMember[]
  bounties        MissingListingBounty[]
  
  @@index([isPublic])
  @@index([createdAt])
}

model CrewMember {
  id        String   @id @default(cuid())
  crewId    String
  crew      Crew     @relation(fields: [crewId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("CrewMemberships", fields: [userId], references: [id], onDelete: Cascade)
  
  role      String   @default("MEMBER")   // FOUNDER | MODERATOR | MEMBER
  joinedAt  DateTime @default(now())
  
  @@unique([crewId, userId])
  @@index([crewId])
  @@index([userId])
}
```

### 2. User Model Additions
```prisma
// Add to User model:
crews           CrewMember[]  @relation("CrewMemberships")
```

### 3. MissingListingBounty Update
```prisma
// Existing model — add field:
crewId    String?   // Optional: bounds bounty to crew visibility
crew      Crew?     @relation(fields: [crewId], references: [id], onDelete: SetNull)
```

---

## API Contracts

### Create Crew
```
POST /api/crews
Headers: Authorization: Bearer {token}
Body:
  name: string (2–50 chars, unique)
  description?: string (max 500)
  isPublic?: boolean (default true)

Response:
  crewId: string
  name: string
  slug: string
  founderUserId: string
  memberCount: 1
  createdAt: timestamp
  
Post-Request:
  - Deduct 500 XP from user.guildXp
  - Create Crew row
  - Auto-add founder as FOUNDER in CrewMember
  - Log PointsTransaction: type=CREW_CREATION, points=-500
```

### Get Crew Profile
```
GET /api/crews/:crewId
Response:
  id: string
  name: string
  slug: string
  description: string
  founder: { id, name, profileSlug }
  isPublic: boolean
  memberCount: int
  members: [ { id, user: {id, name, profileSlug, guildXp, explorerRank}, role, joinedAt } ]
  createdAt: timestamp
```

### Crew Leaderboard
```
GET /api/crews/:crewId/leaderboard?limit=20
Response:
  members: [
    { rank: 1, user: {id, name, guildXp, explorerRank}, joinedAt }
  ]
```

### Join Crew
```
POST /api/crews/:crewId/join
Headers: Authorization: Bearer {token}

Response: { success: true, crewId, memberCount }

Post-Request:
  - Verify crew.memberCount < 50
  - Add user as MEMBER in CrewMember
  - Increment crew.memberCount
  - Optional: Log PointsTransaction (no cost, but could track for analytics)
```

### Leave/Kick from Crew
```
POST /api/crews/:crewId/members/:userId/remove
Headers: Authorization: Bearer {token}

Rules:
  - Founder can kick any member
  - Moderators can kick regular members
  - User can always leave own crew
  - If founder leaves, promote oldest moderator or oldest member to founder
  
Response: { success: true, memberCount }
```

### Crew Activity Feed
```
GET /api/crews/:crewId/feed?limit=20
Response:
  activities: [
    { type: "haul_post", user: {...}, item: {...}, createdAt }
    { type: "member_joined", user: {...}, joinedAt }
    { type: "bounty_completed", user: {...}, bountyId, createdAt }
  ]
  
Implementation:
  - Query UGCPhoto (haul posts) where userId IN (crew.members.userId) order by createdAt DESC
  - May include PointsTransaction for bounty completions within crew
```

---

## XP Economy Integration

### Cost
- **Crew creation:** 500 XP (permanent sink, one-time)
- **Joining crew:** Free (retention play—no friction)
- **Crew bonus XP:** None at creation (potential future tier benefit: PRO crews gain +10% member XP)

### Naming
- Feature name: **Explorer's Guild — Crew Creation**
- XP sink name: `CREW_CREATION`
- Bounties filter: crews are NOT separate bounty silos; bounties can be tagged but remain cross-visible

---

## Group Bounties Strategy

**Recommendation:** Extend existing `MissingListingBounty` with optional `crewId` FK instead of creating a new model.

- When `crewId` is set, bounty is visible to crew members + creator's followers (social proof)
- When `crewId` is null, bounty is visible to sale-wide audience (current behavior)
- No separate leaderboard; crew member completions appear in crew feed

---

## Implementation Sequence

1. **Add schema** (1 file: schema.prisma)
2. **Write migration** (SQL: CREATE TABLE crew, crew_member; ALTER TABLE missing_listing_bounty)
3. **Backend routes** (5 endpoints: create, get profile, leaderboard, join, remove)
4. **XP ledger** (deduct cost in create endpoint; validate user has ≥500 XP before accepting)
5. **Frontend pages** (crew discovery page, crew profile page, create modal)
6. **Activity feed** (query UGCPhoto + PointsTransaction filtered by crew members)
7. **Toast + copy** (confirm crew created; invite link in crew profile)

---

## Rollback Plan

**If crew feature launched but needs rollback:**
1. Set `Crew.isActive = false` (soft-delete)
2. Revert crew creation endpoint to 401
3. Refund 500 XP to all crew founders (batch script via backend)
4. Crew members retain visibility of past crew (historical record) but can't rejoin

**Data cleanup:** Crews and memberships remain in DB for historical audit; new crew creation is disabled.

---

## Decisions for Patrick

1. **Member limit:** 50 per crew (prevents P2P market abuse; adjust if testing shows different needs)
2. **Free to join?** YES — encourage growth; founder pays cost, members get free entry
3. **Invite-only default?** NO — public crews by default (easier discovery); founders can toggle isPublic
4. **Founder succession:** If founder leaves, auto-promote oldest moderator or member (prevents orphaned crews)
5. **Crew XP bonus:** Deferred — PRO tier could add +10% member XP in future; for now, no bonus

**Pre-flight check:** Confirm 500 XP threshold aligns with current rank distribution (how many shoppers have 500+ XP today?). If <10%, raise threshold to 250 XP.

---

## Flagged Risks

- **Crew abandonment:** If founder never returns, crew is frozen. Mitigate: auto-promote on founder inactivity (30 days) — TBD in Phase 2b
- **Crew spam:** Low risk if 500 XP cost holds. Monitor creation rate week 1
- **Member churn:** Crews without moderator activity may bleed members. Mitigate: in-app prompt "invite friends to your crew"

---

## Success Metrics

- Crews created (W1, W2, W4)
- Avg crew size (target: 3–5 members)
- Repeat visits by crew members (goal: +15% session length vs non-crew)
- Crew creation rate as % of users with 500+ XP

---

**Dev dispatch gate:** After Patrick approves decisions, Architect clears findasale-dev to implement with schema-first approach: read schema.prisma, write migration SQL, implement backend controllers before frontend.
