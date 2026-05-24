# Patrick's Dashboard — Week of May 24, 2026 (Updated S782)

---

## Audit Alerts (Weekly Site Audit — 2026-05-23)

**HIGH — `/categories` page shows raw eBay taxonomy paths as category names.** Instead of clean labels like "Comics" or "Action Figures," shoppers see internal strings like "Collectibles:Comic Books & Memorabilia:Comics:Comics & Graphic Novels." Needs a display-name mapping before this page is shown to new users.

**MEDIUM (4 items):**
- `/privacy` — em dash renders as literal `—` text
- `/calendar` — long-running sales repeat on every day, dominating the view
- `/sales/[id]` — "YARD" badge on an auction sale + breadcrumb missing sale name
- `/map` — 200 sales listed but zero pins visible on the map

Full report: `claude_docs/audits/weekly-audit-2026-05-23.md`

---

## What Happened This Week

**S782 (latest — Outreach Opens UI + Queue Reset):**
- Built `/admin/outreach-opens` page — click "View opened emails →" in the Outreach Email Pipeline widget on `/admin`
- Shows organizer name, email, address, website (linked), which touch was opened, sent + open dates, status badge
- Re-queued 418 emails sent before the deliverability fix (354 from May 17–23 + 64 from early May 24 batches before 16:51 UTC). Queue back to ~3,349 PENDING.

**S781 (DMARC Upgrade + Email Stack Audit):**
- Full email auth audit: Resend ✅ clean, Google Workspace ✅ clean, MailerLite gap documented (free plan, negligible risk — 1 campaign ever sent)
- Email stack roles clarified: Resend = app automated emails, Google Workspace = cold outreach, MailerLite = subscriber list (barely used)
- ✅ DMARC upgraded: `_dmarc.finda.sale` now `p=quarantine` — confirmed live. Emails that fail auth land in spam instead of inboxes.

**S780/S780b (Deliverability Fix + GitGuardian + CORS + Indexes + Password Rotation + DNS):**
- Fixed email MIME: plain-text fallback now included in outreach emails (was html-only, hurting deliverability)
- Fixed CORS P0: `api.finda.sale` wasn't in the CORS allowlist after S779 added it as Railway custom domain — 34 errors in 23hrs
- GitGuardian alert: live Railway DB password was committed in STATE.md (S776). Removed from files. ✅ **Password rotated** — new password active, backend uses reference variable (auto-updates)
- 7 database indexes added for 5 Sentry slow queries (1–1.7 second queries down to fast indexed lookups)
- ✅ Root SPF DNS updated: added `_spf.google.com` include + changed `?all` → `~all` (stronger anti-spoofing)

**S779 (Outreach Email Deliverability Fix):**
- Found root cause of 0% open rate: every email body had `backend-production-153c9.up.railway.app` URLs — spam filters blocked them automatically.
- Fixed: `api.finda.sale` added as custom domain on Railway; DNS records added to Vercel; you set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** ~3,349 PENDING (418 re-queued this session). Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S782 code + docs:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/adminController.ts
git add packages/backend/src/routes/admin.ts
git add packages/frontend/pages/admin/index.tsx
git add packages/frontend/pages/admin/outreach-opens.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: outreach opens page + queue reset (S782)"
.\push.ps1
```

### 2. Update Global CLAUDE.md password:
In your Cowork settings (Global CLAUDE.md), update both DATABASE_URL lines (internal + public proxy) with the new password from Railway dashboard. [Passwords redacted from docs — store in CLAUDE.md only, never in committed files]

### 3. Delete temp scripts (if still present):
```powershell
Remove-Item -LiteralPath "C:\Users\desee\ClaudeProjects\FindaSale\packages\database\check-hidden.js"
Remove-Item -LiteralPath "C:\Users\desee\ClaudeProjects\FindaSale\packages\database\fix-hidden-backfill.js"
```

---

## Next Up

1. Push S782 (action #1 above)
2. Update Global CLAUDE.md password (action #2)
3. Delete temp scripts (action #3)
4. user3 TEAMS modal bug + review queue UX improvement
5. Chrome QA: #424/#425/#426 (needs PRO account with eBay OAuth connected)
