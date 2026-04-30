# Patrick's Dashboard — S594 ✅ COMPLETE

## Status: Video audio fixed + login password toggle + voiceover fine-tuned + icon pulse animation + new VO files. Push block below.

---

## S594 Summary

Three things shipped:

**1. finda.sale/video audio fixed.** All 13 voiceover lines now play. Root cause: the embed guard in `organizer-video-ad.html` was doing an early return when `?embed=1` was in the URL — which is exactly how `video.html` loads the ad in its iframe. Removed the guard. Kept `?embed=1` for layout. Added `allow="autoplay"` to the iframe so the Web Audio API works post-gesture.

**2. Missing vo-01 through vo-06 pushed.** These files were never on GitHub. Found and pushed mid-session.

**3. Login show/hide password toggle.** Eye icon on the password field — click to reveal/hide.

Plus a full round of voiceover timing work: 13-line final CLIPS array, staggered icon pulse animation on the 4 export buttons (Excel→PDF→CSV→QB), new vo-11/12/13 recordings, and a QB/CSV position swap.

---

## ⚡ Do This Now

**Step 1 — Copy new MP3 files from Downloads:**

You need to move the new recordings into the project before pushing:
```powershell
Copy-Item "$env:USERPROFILE\Downloads\[your-vo-11-filename].mp3" "C:\Users\desee\ClaudeProjects\FindaSale\packages\frontend\public\vo-11.mp3" -Force
Copy-Item "$env:USERPROFILE\Downloads\[your-vo-12-filename].mp3" "C:\Users\desee\ClaudeProjects\FindaSale\packages\frontend\public\vo-12.mp3" -Force
Copy-Item "$env:USERPROFILE\Downloads\[your-vo-13-filename].mp3" "C:\Users\desee\ClaudeProjects\FindaSale\packages\frontend\public\vo-13.mp3" -Force
```
(Replace filenames with whatever you saved them as. vo-12 and vo-13 came from mp3cut.net; vo-11 came from ElevenLabs.)

**Step 2 — Push (S594 wrap):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/public/organizer-video-ad.html
git add packages/frontend/public/video.html
git add packages/frontend/pages/login.tsx
git add packages/frontend/public/vo-11.mp3
git add packages/frontend/public/vo-12.mp3
git add packages/frontend/public/vo-13.mp3
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: video audio + login password toggle + voiceover polish + icon pulse animation [wrap S594]"
.\push.ps1
```

**Step 3 — Smoke test after deploy:**
- `finda.sale/video` — click Play, all 13 lines audible, icons pulse in scene 4 after eBay counter hits 38
- `finda.sale/login` — type a password, click the eye icon, verify it shows/hides

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| Copy new MP3 files (Steps 1–2 above) | vo-11/12/13 not on GitHub yet | Yes |
| Push block above | S594 code + wrap docs | Yes |
| S597 push (from previous session) | Condition rating sync + FAQ merge — may still be pending | Check git status |
| Vercel redeploy without build cache | Mode 1 eBay token returns 500 (not blocking cron) | No |
| Spot-check FAQ pricing % | S 80–100 / A 60–80 / B 40–60 / C 25–40 / D 10–25 — verify before beta | No |
| Advisory outreach drafts | 28 Gmail drafts ready — send 1–2/day | No |

---

## P2 Bug to Dispatch

**Tier Lapse Banner (P2):** Banner shows red + has X dismiss button. Spec says sticky amber. Also shows "Your Plan: PRO" card alongside the lapse warning (contradictory). Needs dev fix before beta.

---

## QA Queue Remaining

| Feature | Status | Notes |
|---------|--------|-------|
| finda.sale/video audio | Pending push + smoke test | S594 fix |
| Login password toggle | Pending push + smoke test | S594 |
| S597 condition rating sync + FAQ merge | Pending push + Chrome QA | From S597 |
| Treasure hunt progress page | Pending push + Chrome QA | S595 carryover |
| Treasure hunt via=qr guard | Pending push + Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| #251 priceBeforeMarkdown | Blocked | Needs item with markdownApplied=true |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |
| S529 mobile nav rank | Pending | Mobile viewport test |
| S550 Affiliate signup (?aff=) | Pending | Chrome signup flow test |
| #52 Encyclopedia detail page | Pending | Railway redeploy d77cff42 |

---

## Carry-over

- **Advisory outreach:** 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias.
- **eBay sync:** Tasks #9/#10 pending if not dispatched.
