# ADR-068 Quick Reference — Command Center Dashboard

**Status:** Architecture Design Complete ✅
**Verdict:** GO FOR SPRINT 1 IMPLEMENTATION
**Tier:** PRO ($29/mo users only)
**Effort:** 2 sprints (backend first, then UI)

---

## What Is It?

Multi-sale overview dashboard for organizers managing 5+ active sales simultaneously. Single screen shows:
- All active sales + upcoming + recent
- Key metrics per sale (items listed/sold, revenue, conversion rate)
- Pending actions (items needing photos, pending holds, unpaid purchases)
- Quick links to edit each sale

---

## Architecture Decisions

### Schema: ✅ Ready (No Changes Needed)
- All required fields exist: Sale, Item, Purchase, ItemReservation, Favorite
- No migrations required
- Can build immediately

### API Design: ✅ Finalized
- **Endpoint:** `GET /api/organizer/command-center`
- **Tier:** PRO (checked via `requireTier('PRO')` middleware)
- **Response:** Aggregate summary + array of sale metrics
- **Query Params:** Optional status filter, date range

### Performance: ✅ Optimized
- Naive approach: 5N queries (bad for 50 sales = 250 queries)
- Optimized approach: 2–3 queries using Prisma groupBy (good)
- Caching: Redis with 5-minute TTL
- **Expected:** <500ms cached, <1.5s on cold start with 50 active sales

### Tier Gating: ✅ Wired
- SIMPLE tier users: 403 Forbidden
- PRO/TEAMS tier users: Full access
- Middleware: `requireTier('PRO')` on route

---

## Sprint 1 Breakdown (Backend)

**Duration:** 4–5 days

### New Files (5)
1. `commandCenterService.ts` — Fetch, aggregate, cache metrics
2. `commandCenterController.ts` — HTTP handler
3. `routes/commandCenter.ts` — Route registration
4. `shared/src/types/commandCenter.ts` — TypeScript interfaces
5. Cache invalidation hooks in item/purchase/sale controllers

### Modified Files (1)
- `index.ts` — Register command center route

### Testing
- Unit: Metrics aggregation (5 test cases)
- Integration: API endpoint (3+ test organizers, 10–50 sales each)
- Performance: Verify <1s response time with Redis

---

## Sprint 2 Breakdown (Frontend UI)

**Duration:** 4–5 days (after Sprint 1 complete)

### New Files (3)
1. `pages/organizer/command-center.tsx` — Main page
2. `components/CommandCenterCard.tsx` — Sale card UI
3. `hooks/useCommandCenter.ts` — React Query hook

### Modified Files (1)
- `Layout.tsx` or navigation — Add "Command Center" link

### Testing
- Manual: Navigate page, verify cards render, test filters
- Tier gating: Confirm SIMPLE users see upgrade CTA

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Schema changes blocking | 🟢 LOW | No changes needed; all fields exist |
| Query performance | 🟢 LOW | Optimized to 2–3 queries; Redis cache |
| Tier gating bypass | 🟢 LOW | Tested in S178 billing feature; reuse same pattern |
| Cache consistency | 🟡 MEDIUM | Invalidate on mutations (handled in code) |
| Redis downtime | 🟡 MEDIUM | Graceful fallback to DB (optional caching) |

**Overall:** LOW RISK — read-only feature, no data loss vectors, proven tier middleware

---

## Files to Review

1. **Full Architecture:** `claude_docs/architecture/ADR-068-COMMAND-CENTER-DASHBOARD.md`
2. **Sprint 1 Spec:** `claude_docs/architecture/ADR-068-SPRINT1-IMPLEMENTATION-SPEC.md`
3. **This Summary:** `claude_docs/architecture/ADR-068-QUICK-REFERENCE.md`

---

## Next Steps

### For Patrick
- [ ] Review architecture docs above
- [ ] Verify Redis connection on Railway
- [ ] Approve Sprint 1 start

### For findasale-dev (Sprint 1)
- [ ] Implement 5 new files per spec
- [ ] Apply cache invalidation to 3 existing controllers
- [ ] Run tests from checklist
- [ ] Deploy to staging and smoke test

### For findasale-dev (Sprint 2, after S1 complete)
- [ ] Implement page + components per spec
- [ ] Wire React Query hook
- [ ] Add nav link
- [ ] QA tier gating (SIMPLE → upgrade CTA)

---

## Go/No-Go Criteria

**Go if:**
- ✅ API endpoint returns 200 (PRO tier) and 403 (SIMPLE tier)
- ✅ Response metrics within ±1% of manual spot check
- ✅ Performance <1.5s cold start, <500ms cached
- ✅ Tests passing (unit + integration)
- ✅ Redis connection verified

**No-Go if:**
- ❌ 5xx errors on production organizers
- ❌ Response time >3s on cold start
- ❌ Metrics significantly off (>5% error)
- ❌ Tier gating bypassable
- ❌ Redis unavailable with no graceful fallback

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Estimated Lines of Code | ~360 |
| New Files | 8 (5 Sprint 1, 3 Sprint 2) |
| Modified Files | 5 (4 Sprint 1, 1 Sprint 2) |
| Query Count (50 sales) | 2–3 (optimized from 5N) |
| Cache TTL | 5 minutes |
| Expected Response Time | <500ms cached |
| Tier Requirement | PRO minimum |
| Database Migrations | 0 (schema ready) |
