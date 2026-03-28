# Patrick's Dashboard — Session 327 (March 28, 2026)

---

## Build Status

- **Railway:** ✅ Green
- **Vercel:** ✅ Green
- **DB:** ✅ No migration pending
- **S327 Status:** ✅ COMPLETE — S326 smoke test, 2 of 3 fixes verified

---

## No Push Needed

S327 was QA-only. No code changes.

---

## Session 327 Summary

**S326 smoke test session — verified 2 of 3 fixes on live site.**

1. **Buyer Preview Cloudinary photos — ✅ VERIFIED.** All item cards on the public sale page show real Cloudinary photos with correct aspect ratios. The `ar_4:3` fix is confirmed working in production.

2. **Review & Publish hooks fix — ✅ VERIFIED.** Page correctly handles static export empty `router.query`. API call to `/items/drafts` fires after hydration. Shows "0 items" correctly because all items are AVAILABLE. The React hooks violation bug is fixed.

3. **Single-item Publish button — UNVERIFIED.** No DRAFT items exist to test against. Manual Entry creates items as AVAILABLE, skipping the draft pipeline. Need to camera-capture an item to create a DRAFT, then test the Publish button.

4. **New P2 found: draft counter mismatch.** Add Items page says "14 items • 1 draft" but all items are AVAILABLE and the `/items/drafts` endpoint returns empty. The counter is lying.

---

## Next Session (S328) — Start Here

1. **Fix P2 draft counter mismatch** on Add Items page
2. **Delete "QA Test Item - Delete Me"** from the sale (0 photos, clutter)
3. **Camera-capture a test item** → creates DRAFT → verify single-item Publish button
4. Continue product audit — organizer + shopper flows
5. P3 gaps: desktop nav search, map sale type filter, edit-sale cover photo

---

## Blocked/Unverified Queue

| Feature | Status | What's Needed |
|---------|--------|----------------|
| Single-item publish fix | Code deployed S326, verified S327 API fires but no DRAFT items | Camera-capture item → Review & Publish → Publish → confirm toast + status |
| #143 Camera AI confidence | UNVERIFIED since S314 | Real device camera capture |
| #143 PreviewModal onError | Acceptable UNVERIFIED | Can't trigger Cloudinary 503 in prod |
| Draft counter mismatch | P2 found S327 | Investigate Add Items page "1 draft" counter vs `/items/drafts` endpoint |

---
