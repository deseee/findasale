# Infra Spend Tracker

> Patrick populates the Railway and Vercel rows — those dashboards don't expose cost via API.
> All other rows are derived from public pricing tiers + usage data from the audit.
> Origin: Guardrail (d) from `claude_docs/audits/infra-cost-security-2026-06-24.md` §8.
> Last updated: 2026-06-25 (S1032)

---

## Monthly spend snapshot

| Provider | Plan / Tier | Est. monthly cost | Source | Patrick action needed? |
|----------|-------------|-------------------|--------|------------------------|
| **Railway — backend** | Starter (always-on) | ~$5–10 | Railway dashboard → Usage | Yes — confirm current bill |
| **Railway — PostgreSQL** | Starter shared | Included in above | Railway dashboard | No |
| **Vercel — frontend** | Hobby (free) | $0 | Public pricing | No |
| **GitHub Actions** | Free (2,000 min/mo) + $0.006/min overage | $0 target post-S1031 (was ~$12/mo) | GH Settings → Billing | Check after billing unblock |
| **Cloudinary** | Free (25 credits/mo) | $0 | Cloudinary dashboard | No — monitor if photo volume grows |
| **Sentry** | Free Developer | $0 | Sentry dashboard | No |
| **Resend** | Free (3,000 emails/mo) | $0 | Resend dashboard | No |
| **Stripe** | Pay-per-transaction | % of GMV | Stripe dashboard | No |
| **Google Cloud Vision** | Pay-per-use | ~$0–? | GCP console → Billing | Yes — confirm current bill; lockdown in effect since May 2026 $201 incident |
| **Google Workspace** | Business Starter | ~$6/user/mo | Google Admin | Yes — confirm seats |
| **Twilio** | Pay-per-use | ~$0–? | Twilio console | Yes — confirm current bill |
| **Anthropic (Claude)** | Pay-per-token | ~$0–? | Anthropic console | Yes — confirm current bill |
| **Spaceship (registrar)** | Annual domain renewal | ~$15/yr (~$1.25/mo) | Spaceship account | No |
| **ImprovMX** | Free tier | $0 | ImprovMX dashboard | No |
| **MailerLite** | Free tier (legacy) | $0 | MailerLite dashboard | No |

---

## GitHub Actions usage detail (most monitored — programmatically visible)

| Workflow category | Est. min/mo (post-S1031) | Notes |
|-------------------|--------------------------|-------|
| CI typecheck (ci-typecheck.yml) | ~80–120 | ~2–4 min/run × ~30–40 pushes/mo |
| Core scrapers (GarageSaleFinder, EstateSalesNet, Facebook Events) | ~300 | Daily feeds, ~3–5 min each |
| License batch (51-state, weekly) | ~180 | Consolidated from 53 individual workflows (S1031) |
| OSM Overpass (weekly) | ~170 | Modest; keep |
| PublicSurplus (monthly post-S1031) | ~194 | Was weekly ~840/mo |
| Geocode ungeocoded (1×/day post-S1031) | ~30 | Was 3×/day |
| Outreach emails (1×/day post-S1031) | ~24 | Was 6×/day; cap=1 |
| Other scrapers (quarterly/annual) | ~40 | EstateSalesOrg, SwapmeetDirectory, misc |
| **Total target** | **~1,000–1,300** | **Well under 2,000 free limit** |

Pre-S1031 baseline: ~3,300–4,000 min/mo (~$12/mo overage). Target post-S1031: ≤2,000 min/mo ($0).

---

## Cost-per-value reference (from audit, 7-day data)

| Feed | 7-day listings | Value tier |
|------|---------------|------------|
| GarageSaleFinder | 4,751 | Core — keep daily |
| Facebook Events | 2,655 | Core — keep daily |
| EstateSalesNet | 2,479 | Core — keep daily |
| License/directory scrapers | N/A (organizer leads) | Secondary — weekly batch acceptable |

---

## Patrick action items

1. **Railway bill** — open Railway dashboard → Project `keen-wisdom` → Usage. Record actual $/mo in this file.
2. **GitHub Actions billing unblock** — GitHub → Settings → Billing & plans → resolve payment method. Until done, CI is blocked (runs die in <30s).
3. **Google Cloud Vision** — open GCP console → Billing → check current month spend. Vision API lockdown rules are in project memory.
4. **Anthropic API** — open console.anthropic.com → Usage. The AI tagging pipeline (Claude Haiku) runs per photo uploaded.
5. **Twilio** — confirm current spend; SMS is low-frequency but pay-per-message.

---

## Re-audit trigger

Update this file when:
- Monthly Railway/Vercel bills arrive
- GitHub Actions billing status changes
- A new paid API is added
- Usage spikes (Sentry alert, scraper regression, photo upload surge)
