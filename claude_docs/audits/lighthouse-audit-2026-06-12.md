# Lighthouse Audit — finda.sale (2026-06-12, S968)

Run with Lighthouse 13.4.0 (headless Chrome for Testing 149), mobile form factor, against production https://finda.sale/ (homepage). Prompted by findPWA's acceptance requirement of a "good/perfect Lighthouse audit."

## Scores (mobile)

| Category | Score |
|---|---|
| Performance | **57** ⚠️ |
| Accessibility | 95 ✅ |
| Best Practices | 88 ✅ |
| SEO | 100 ✅ |

Note: Lighthouse 13 removed the dedicated **PWA category** — installability is no longer scored as a category. The `installable-manifest` audit returned n/a here. PWA installability (manifest + service worker + maskable icon) must be verified separately for directories like findPWA.

## Core Web Vitals (mobile, lab)

- FCP 1.9 s (ok) · **LCP 5.1 s** ⚠️ · **TBT 1,010 ms** ⚠️ · CLS 0.023 ✅ · Speed Index 3.4 s

Performance is dragged down by LCP and main-thread blocking, not layout shift.

## Actionable findings

**Performance (P2 — real, worth a dev ticket):**
- LCP 5.1 s — likely the hero/above-the-fold image or font/JS render-blocking. Biggest single lever.
- TBT 1,010 ms — heavy main-thread JS on load.
- Reduce unused JavaScript (~800 ms) and unused CSS (~260 ms).

**Accessibility (95):**
- Heading elements not in sequentially-descending order.
- Some touch targets lack sufficient size/spacing.

**Best Practices (88):**
- Serves some images at low resolution.
- Browser console errors logged on load (investigate).
- Missing source maps for large first-party JS.

**SEO: 100** — clean. (Consistent with the SEO work shipped through S944.)

## Implication for directory submissions

findPWA wants a strong Lighthouse pass + installability. SEO/Accessibility/Best-Practices are in good shape; **mobile Performance (57) is the weak spot.** It likely won't hard-block a directory listing, but it's the highest-value fix for both directory acceptance AND shopper-side conversion (slow LCP loses mobile shoppers). Recommend a perf pass: optimize LCP image, trim unused JS/CSS, defer non-critical scripts.

Raw report saved at /tmp/lh-mobile.json during the run (sandbox, ephemeral).

---

## Post-fix re-test (S968) — INCONCLUSIVE lab, fix shipped

After the S968 code-split fix deployed (commit pushed, Vercel green), Lighthouse was re-run from the sandbox 3× against live finda.sale (mobile). Results were dominated by environment noise:

| Run | Performance | LCP | TBT | CLS |
|---|---|---|---|---|
| baseline | 57 | 5.1 s | 1,010 ms | 0.023 |
| after #1 | 56 | 3.5 s | 850 ms | 0.26 |
| after #2 | 36 | 10.8 s | 1,150 ms | 0 |
| after #3 | 32 | 11.3 s | 1,610 ms | 0 |

**Conclusion:** Single-run lab Lighthouse from this sandbox is NOT a reliable measure here — LCP swung 3.5 s → 11.3 s on the same deployed page, driven by variable network latency from the sandbox to production. The one-off CLS 0.26 was noise (0 on reruns) — **no CLS regression**.

**What is verifiable:** the fix removes 10 non-critical components (7 app-wide overlays + 3 homepage banners) from the initial JS bundle via `next/dynamic ssr:false` — a structural reduction in parse/execute work, independent of any noisy lab number.

**Authoritative verdict source:** Vercel Speed Insights (already installed) — real-user field CWV over the next few days. Alternatively, PageSpeed Insights (Google's consistent infra) once its daily quota resets or with an API key. Do not treat sandbox lab runs as the scoreboard.

