# Greenfield Growth Avenues — Beyond Directory Submissions (June 2026)

Second-pass research after reconciling against everything already done/queued (see `APP-SUBMISSION-DIRECTORY-RESEARCH-2026.md` + roadmap #462–#494). These are **net-new channels** not in any prior list: adjacent-vertical partnerships, free app-store paths, AI-answer-engine discovery, PR source platforms, and the Michigan/GR ecosystem. Each marked **automatable-now** vs **needs Patrick**, with traps flagged.

---

## TOP PICKS (if we do only the highest-leverage new things)

1. **Microsoft Store via PWABuilder** — FREE (all dev fees removed 2026), real app-store presence, no native code. Mostly automatable. ⭐
2. **eBay Partner Network** — free, near-instant approval, turns our existing eBay integration into commission revenue. Needs Patrick (eBay account). ⭐
3. **Wikidata entity** — the only remaining AI-discovery gap (schema.org, IndexNow, robots.txt all verified already shipped S965). Off-site, needs a citable mention or two first. ⭐
4. **Alignable** — free local small-biz network; doubles as lead-gen since estate/consignment businesses ARE our customer. ⭐
5. **Source of Sources (SOS)** — free, the real HARO successor; earned media via consumer-lifestyle reporters. ⭐

---

## 1. Free PWA → App Store paths (no native code)

| Path | Cost | Effort | Status notes | Priority |
|---|---|---|---|---|
| **Microsoft Store via PWABuilder** | $0 (all reg fees removed 2026) | Low | Reserve name in Partner Center → PWABuilder "Package for Stores" → submit. Needs MS account + passing PWABuilder quality check. Largely automatable. | **HIGH** |
| **Google Play via TWA** (Bubblewrap/PWABuilder) | $25 one-time | Low-Med | Needs Lighthouse PWA ≥80 (audit first) + assetlinks.json in /.well-known/. Patrick pays $25 + holds signing keys. | **HIGH** |
| **Samsung Galaxy Store** | $0 | Trivial | Literally email PWA URL to pwasupport@samsung.com. Small reach but free. | **MEDIUM** |
| Apple App Store | $99/yr | High | ❌ **TRAP** — Guideline 4.2 rejects "repackaged websites"; PWA wrappers routinely rejected. iOS users get the PWA via Safari Add-to-Home-Screen for free. **Skip.** | SKIP |
| Meta Horizon/Quest | $0 | Low | VR-headset audience, ~zero overlap. **Skip.** | SKIP |

## 2. AI answer-engine discoverability — ⚠️ MOSTLY ALREADY DONE (verified S965, codebase check)

Codebase verification S965: most of this is already shipped. Do NOT dispatch dev work — only the off-site Wikidata entity remains.

| Item | Status (verified S965) |
|---|---|
| Schema.org JSON-LD | ✅ **DONE** — `sales/[id].tsx` emits Event + Place + PostalAddress + Organization + AggregateOffer + Product + Offer + BreadcrumbList + EventSeries + SpeakableSpecification; JSON-LD present across 26 page types. More complete than recommended. |
| IndexNow | ✅ **DONE** — `packages/backend/src/services/indexNowService.ts` built. |
| robots.txt AI-crawler access | ✅ **EFFECTIVELY DONE** — `public/robots.txt` is `Allow: /` for `*`, which permits GPTBot/PerplexityBot/ClaudeBot/etc. Explicit per-bot stanzas are cosmetic only. |
| **Wikidata entity** | ⬜ **NET-NEW (off-site, not code)** — brand-owner editing allowed with citable sources; feeds the AI knowledge graph. Needs a couple third-party mentions first (ties to PR). Only genuine remaining AI item. |
| Wikipedia article | Defer — notability bar not met yet. |
| llms.txt | Optional, ⚠️ unproven for citation lift in 2026. Not implemented; low value. |
| Perplexity/ChatGPT merchant feeds | Low-fit (shippable-SKU programs); ChatGPT already pulls our Google Merchant Center feed. |

## 3. Tech-vendor programs (most "showcases" are hype — two real wins)

| Program | Reality | Priority |
|---|---|---|
| **eBay Partner Network** | ✅ Real, free, near-instant approval, no traffic minimum. Affiliate **revenue** on our existing eBay integration. Needs Patrick. | **HIGH** (revenue, not backlink) |
| **Stripe Partner Directory** | ✅ Real, free; "Verified Partner" badge + directory listing. Credibility, not traffic. Needs Patrick. | **MEDIUM** |
| Next.js / Vercel / Cloudinary / Prisma / Algolia / Twilio "showcases" | ❌ Curated enterprise marketing, **no open submission**. Confirmed via page + Vercel community thread. Skip unless we become a flagship customer. | SKIP |

## 4. Adjacent-vertical partnerships (life-event ecosystem around estate sales)

| Org | Angle | Cost | Priority |
|---|---|---|---|
| **NASMM** (senior move managers) | **Industry Partner** listing — exact audience (they run estate sales as a service line). | ~$2,200/yr (conference-bundled — ask about a listing-only tier) | **HIGH** (best fit; price is the question) |
| **NAPO** (professional organizers) | **Business Partner** membership + directory. | $50 + $25 fees; annual dues TBD (contact their BD) | **MED-HIGH** |
| Seniors Blue Book | Regional senior-resource ads incl. downsizing/estate categories. | Paid | MEDIUM (only if a MI/GR edition exists) |
| SRES (Realtors), Eldercare Locator/AAAs, probate attorneys, funeral aftercare, junk removal, Habitat/Goodwill | ⚠️ **Not listable** — credential-gated, government referral, or no vendor directory exists. These are 1:1 BD/referral outreach, not submissions. | — | LOW (separate outbound track) |
| Caring Transitions | ⚠️ **Competitor** (runs its own CTBids estate auctions). Watch, don't list. | — | AVOID |

## 5. PR / journalist source platforms (HARO is dead — use successors)

| Platform | Reality | Priority |
|---|---|---|
| **Source of Sources (SOS)** | ✅ Free; Peter Shankman's real HARO successor (~40k members). Reply to relevant queries on decluttering/downsizing/resale/side-hustles. Strict relevance policy. Automatable-now. | **HIGH** |
| **Featured.com** (ex-Terkel) | ✅ Free tier; build an expert profile, answered questions carry backlinks. Now owns the HARO newsletter. | **HIGH** |
| Help a B2B Writer → MentionMatch | ✅ Free; B2B slant (partial fit). | MEDIUM |
| Qwoted | Free tier + ~$99/mo Pro. Higher journalist quality, active pitching. | MEDIUM (free first) |
| SourceBottle | Free + ~$25/mo. Thinner US volume. | LOW-MED |
| ResponseSource / Antiques Trade Gazette | ⚠️ UK-centric — skip. | SKIP |
| Failory / Starter Story (founder interviews) | ⚠️ Want revenue traction we may not have yet; defer. The "solo non-tech founder, AI as dev team" story is compelling later. | MEDIUM (defer to a traction milestone) |
| Built In | ⚠️ No GR hub, team/hiring-focused. | LOW |

> Honest note: dedicated US resale/estate trade press is thin and competitor-owned. Route earned media through **consumer-lifestyle reporters** (via SOS/Featured) covering "the secondhand boom," not a trade-press circuit.

## 6. Michigan / Grand Rapids ecosystem (local credibility, backlinks, grants)

| Org | Angle | Cost | Priority |
|---|---|---|---|
| **Alignable** | Free local small-biz profile + referral network. **Doubles as lead-gen** — estate/consignment businesses are our customer. | Free tier | **HIGH** |
| **SCORE West Michigan** | Free SBA mentoring (retail/GTM sounding board). | Free | **HIGH** |
| **Michigan SBDC** (West MI @ GVSU) | Free counseling + market research; gateway to GR ecosystem. | Free | **HIGH** |
| **The Right Place** | Anchor GR economic-dev org; network + feature/connect. | Free to engage | **HIGH** |
| **Start Garden "The 100"** | ⏰ Non-dilutive grant competition; **applications open (June 1)**. 100-sec video + milestone app. Meijer first-customer angle. | Free to apply | **HIGH (time-sensitive)** |
| **Hello Alice** | Free account, passive grant-matching. | Free | MEDIUM |
| **SBAM** (Small Business Assoc. of Michigan) | Statewide member directory + events. | ~$195/yr | MED-HIGH (paid call) |
| GR Chamber | Membership directory + local credibility. | Paid | MEDIUM |
| IFundWomen, GROW, Spring GR | ⚠️ Historically center women/underrepresented founders — **verify eligibility** before investing. | — | LOW (likely mismatch) |
| GVSU Blue Dot Lab, MSU/WMU Evergreen funds, MEDC PMBC, Hello West Michigan | ⚠️ Not open till 2028 / equity-VC / B2B-procurement / talent-attraction — wrong fit now. | — | SKIP |

---

## How these break down for execution

- **Dev tasks (dispatch findasale-dev):** Microsoft Store package, Google Play TWA + assetlinks.json, Lighthouse PWA audit. (AI-discovery items — schema.org, IndexNow, robots.txt — verified ALREADY DONE S965; no dispatch needed.)
- **Free submissions/profiles (mostly automatable):** Samsung Store email, Alignable, Source of Sources, Featured.com, Stripe Partner, Wikidata entity, Hello Alice.
- **Needs Patrick (account/business/paid decision):** eBay Partner Network, Microsoft/Google Play accounts, NASMM ($2,200 — confirm listing-only tier), NAPO dues, SBAM ($195), Start Garden application (time-sensitive), SCORE/SBDC/Right Place intros.
- **Skip (flagged traps/mismatch):** Apple App Store, Meta Quest, vendor showcases, SRES, Caring Transitions, UK PR platforms, IFundWomen/GROW/Spring GR (eligibility), llms.txt-as-citation-strategy.

*Researched June 12, 2026. Deduped against the existing directory pipeline and prior research doc.*
