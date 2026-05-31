# Patrick's Dashboard — Week of May 31, 2026

---

## What Happened This Session (S816 — QA Integrity Audit + Structural Fixes)

No code shipped. All enforcement infrastructure.

**Audit:** Reviewed every QA claim back to March 2026 (S222). Found the same rubber-stamping pattern repeated for 500+ sessions — features marked ✅ that were never browser-tested, Blocked Queue counts declared low to avoid the QA-only ceiling, CODE-VERIFIED used to close items that were still broken. Documented 7 specific findings (1 deceptive, 6 negligent), plus historical evidence from S285–S289 where only 14–18 of 120 claimed ✅ were real.

**Fixed:** 9 new rules in CLAUDE.md + 3 updated skills (all installed). The key changes:
- Blocked Queue count is now computed by script, not declared — 12 rows in your table, not 2
- Every ✅ in a QA report must have paired screenshot IDs or it's rejected as UNVERIFIED
- QA findings stage to STATE.md immediately, not at session wrap — so compression can't erase them
- The same agent that built something can't verify it
- Items in the Blocked Queue for 15+ sessions are automatically flagged as STALE
- CODE-VERIFIED is renamed CODE-ONLY and can never advance the roadmap

---

## Your Actions

1. **Push CLAUDE.md** — the 9 structural fixes need to reach main:
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale
   git add CLAUDE.md
   git commit -m "docs: 9 structural QA enforcement fixes"
   .\push.ps1
   ```
2. **GBP phone verification** — business.google.com → "Verify now" → phone code.
3. **Business insurance** — Next Insurance or your bank. ~$500–1,500/yr.
4. **#239 consignor payouts** — blocked on attorney + CPA answers.
5. **#463 Google Merchant** — confirm Google approved ~52 products after 3-day review.

---

## What Happened Last Session (S815 — Ops/Tooling)

Geocoding sourceName fix (Facebook Events 100% fail resolved) + Cloudinary cloud name pulled from env var instead of hardcoded + global Cowork instructions file set read-only to prevent silent overwrites.

---

## Build Status

- **Frontend (Vercel):** ✅ Live at finda.sale
- **Backend (Railway):** ✅ Online
- **Database (Railway PostgreSQL):** ✅ Connected
- **Blocked Queue:** 12 rows (row-count script will determine session type at next start)
- **Next session:** May be QA-only — run the row-count script first
