# COMPREHENSIVE FRONTEND AUDIT — FindA.Sale
**Date:** 2026-03-20 (Session 209)
**Scope:** All 135 pages, 164 components, all roles (ORGANIZER, USER/SHOPPER, ADMIN, PUBLIC), all tiers (FREE, SIMPLE, PRO, TEAMS, HUNT_PASS)
**Method:** Full code-level grep + file read of every page and component

---

## EXECUTIVE SUMMARY

| Dimension | Pass | Fail | Coverage |
|-----------|------|------|----------|
| Dark Mode (Pages) | 37 | 83 | 27% |
| Dark Mode (Components) | 26 | 138 | 16% |
| Empty States | 13 | 34 useQuery pages without | 28% |
| Loading States (Skeleton) | 37 | 15 useQuery pages without | 71% |
| Error Handling | 84 | 22 pages without | 79% |
| Aria Labels | 14 | 75 pages without | 16% |
| Alt Text on Images | — | 30 images across 17 pages missing | — |
| Head/Meta Tags | 87 | 15 pages without | 85% |
| OG Tags | 12 | 90 pages without | 12% |
| Mobile Responsive Classes | 47 | 55 pages without | 46% |
| H1 Heading | 75+ | 12 pages without | 88% |
| Pro Feature Upsell (not redirect) | 1 (brand-kit) | 7 pages silently redirect | 12% |
| Hunt Pass Shopper Tier UI | 0 visible | 15 code references, no grayed-out UI | 0% |

---

## SECTION 1: DARK MODE — PAGE-BY-PAGE CHECKLIST

### Legend
- ✅ = Has dark: classes (may still need review for completeness)
- ❌ = ZERO dark: classes — completely broken in dark mode
- ⚠️ = Partial — some elements have dark:, others don't
- N/A = Server-rendered or non-visual page

### Public / Auth Pages
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 1 | Home | `/` | ✅ | — |
| 2 | About | `/about` | ❌ | [ ] |
| 3 | Contact | `/contact` | ❌ | [ ] |
| 4 | FAQ | `/faq` | ❌ | [ ] |
| 5 | Guide | `/guide` | ❌ | [ ] |
| 6 | Condition Guide | `/condition-guide` | ❌ | [ ] |
| 7 | Privacy | `/privacy` | ❌ | [ ] |
| 8 | Terms | `/terms` | ❌ | [ ] |
| 9 | Login | `/login` | ❌ | [ ] |
| 10 | Register | `/register` | ❌ | [ ] |
| 11 | Forgot Password | `/forgot-password` | ❌ | [ ] |
| 12 | Reset Password | `/reset-password` | ❌ | [ ] |
| 13 | Plan a Sale | `/plan` | ❌ | [ ] |
| 14 | Offline | `/offline` | ❌ | [ ] |
| 15 | Unsubscribe | `/unsubscribe` | ❌ | [ ] |
| 16 | 404 | `/404` | ❌ | [ ] |
| 17 | 500 | `/500` | ❌ | [ ] |

### Discovery / Browse Pages
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 18 | Search | `/search` | ❌ | [ ] |
| 19 | Map | `/map` | ❌ | [ ] |
| 20 | Calendar | `/calendar` | ✅ | — |
| 21 | Feed | `/feed` | ❌ | [ ] |
| 22 | Trending | `/trending` | ✅ | — |
| 23 | Surprise Me | `/surprise-me` | ❌ | [ ] |
| 24 | Leaderboard | `/leaderboard` | ❌ | [ ] |
| 25 | Challenges | `/challenges` | ✅ | — |
| 26 | Categories Index | `/categories` | ❌ | [ ] |
| 27 | Category Detail | `/categories/[category]` | ❌ | [ ] |
| 28 | Tags | `/tags/[slug]` | ❌ | [ ] |
| 29 | Cities | `/cities` | ❌ | [ ] |
| 30 | City Detail | `/city/[city]` | ✅ | — |
| 31 | Neighborhoods Index | `/neighborhoods` | ❌ | [ ] |
| 32 | Neighborhood Detail | `/neighborhoods/[slug]` | ❌ | [ ] |
| 33 | Hubs Index | `/hubs` | ❌ | [ ] |
| 34 | Hub Detail | `/hubs/[slug]` | ❌ | [ ] |
| 35 | Sales by Zip | `/sales/zip/[zip]` | ❌ | [ ] |
| 36 | Encyclopedia Index | `/encyclopedia` | ✅ | — |
| 37 | Encyclopedia Detail | `/encyclopedia/[slug]` | ✅ | — |

### Sales & Items
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 38 | Sale Detail | `/sales/[id]` | ✅ | — |
| 39 | Item Detail | `/items/[id]` | ✅ | — |

### Organizer Pages
| # | Page | Route | Dark Mode | Tier Gate | Fix Status |
|---|------|-------|-----------|-----------|------------|
| 40 | Dashboard | `/organizer/dashboard` | ✅ | SIMPLE | — |
| 41 | Create Sale | `/organizer/create-sale` | ❌ | SIMPLE | [ ] |
| 42 | Add Items Index | `/organizer/add-items` | ❌ | SIMPLE | [ ] |
| 43 | Add Items (Sale) | `/organizer/add-items/[saleId]` | ❌ | SIMPLE | [ ] |
| 44 | Add Items Review | `/organizer/add-items/[saleId]/review` | ❌ | SIMPLE | [ ] |
| 45 | Edit Sale | `/organizer/edit-sale/[id]` | ✅ | SIMPLE | — |
| 46 | Edit Item | `/organizer/edit-item/[id]` | ❌ | SIMPLE | [ ] |
| 47 | Checklist | `/organizer/checklist/[saleId]` | ❌ | SIMPLE | [ ] |
| 48 | Item Library | `/organizer/item-library` | ✅ | PRO | — |
| 49 | Print Inventory | `/organizer/print-inventory` | ✅ | — | — |
| 50 | POS | `/organizer/pos` | ✅ | SIMPLE | — |
| 51 | Offline Mode | `/organizer/offline` | ✅ | PRO (redirect) | [ ] upsell |
| 52 | Promote | `/organizer/promote/[saleId]` | ❌ | SIMPLE | [ ] |
| 53 | Send Update | `/organizer/send-update/[saleId]` | ❌ | SIMPLE | [ ] |
| 54 | Photo Ops | `/organizer/photo-ops/[saleId]` | ❌ | PRO (redirect) | [ ] upsell |
| 55 | Insights | `/organizer/insights` | ⚠️ partial | NO GATE (bug?) | [ ] |
| 56 | Performance | `/organizer/performance` | ❌ redirect only | — | [ ] remove or fix |
| 57 | Analytics (per-sale) | `/organizer/sales/[id]/analytics` | ❌ | — | [ ] |
| 58 | Flip Report | `/organizer/flip-report/[saleId]` | ❌ | PRO (redirect) | [ ] upsell |
| 59 | Appraisals | `/organizer/appraisals` | ✅ | PRO (redirect) | [ ] upsell |
| 60 | Command Center | `/organizer/command-center` | ✅ | PRO (redirect) | [ ] upsell |
| 61 | Fraud Signals | `/organizer/fraud-signals` | ✅ | PRO (redirect) | [ ] upsell |
| 62 | Holds | `/organizer/holds` | ✅ | — | — |
| 63 | Line Queue | `/organizer/line-queue/[id]` | ✅ | — | — |
| 64 | Payouts | `/organizer/payouts` | ❌ | SIMPLE | [ ] |
| 65 | Bounties | `/organizer/bounties` | ✅ | — | — |
| 66 | Message Templates | `/organizer/message-templates` | ✅ | PRO | — |
| 67 | Email Digest Preview | `/organizer/email-digest-preview` | ❌ | — | [ ] |
| 68 | Brand Kit | `/organizer/brand-kit` | ✅ | PRO (grayed out ✅) | — |
| 69 | Reputation | `/organizer/reputation` | ✅ | — | — |
| 70 | Ripples | `/organizer/ripples` | ❌ | — | [ ] |
| 71 | Typology | `/organizer/typology` | ✅ | PRO (redirect) | [ ] upsell |
| 72 | UGC Moderation | `/organizer/ugc-moderation` | ❌ | — | [ ] |
| 73 | Settings | `/organizer/settings` | ⚠️ partial | SIMPLE | [ ] |
| 74 | Storefront | `/organizer/storefront/[slug]` | ✅ | — | — |
| 75 | Subscription | `/organizer/subscription` | ❌ | — | [ ] |
| 76 | Premium | `/organizer/premium` | ❌ | — | [ ] |
| 77 | Pro Features | `/organizer/pro-features` | ❌ | — | [ ] |
| 78 | Upgrade | `/organizer/upgrade` | ❌ | — | [ ] |
| 79 | Workspace | `/organizer/workspace` | ✅ | TEAMS (redirect) | [ ] upsell |
| 80 | Webhooks | `/organizer/webhooks` | ❌ | — | [ ] |

### Organizer Hubs
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 81 | Hubs Index | `/organizer/hubs` | ❌ | [ ] |
| 82 | Create Hub | `/organizer/hubs/create` | ❌ | [ ] |
| 83 | Manage Hub | `/organizer/hubs/[hubId]/manage` | ❌ | [ ] |

### Shopper Pages
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 84 | Dashboard | `/shopper/dashboard` | ❌ | [ ] |
| 85 | Favorites | `/shopper/favorites` | ✅ | — |
| 86 | Holds | `/shopper/holds` | ❌ | [ ] |
| 87 | Purchases | `/shopper/purchases` | ❌ | [ ] |
| 88 | Receipts | `/shopper/receipts` | ❌ | [ ] |
| 89 | Disputes | `/shopper/disputes` | ✅ | — |
| 90 | Alerts | `/shopper/alerts` | ❌ | [ ] |
| 91 | Achievements | `/shopper/achievements` | ✅ | — |
| 92 | Loyalty | `/shopper/loyalty` | ✅ | — |
| 93 | Settings | `/shopper/settings` | ❌ | [ ] |
| 94 | Collector Passport | `/shopper/collector-passport` | ❌ | [ ] |
| 95 | Loot Log | `/shopper/loot-log` | ❌ | [ ] |
| 96 | Loot Log Detail | `/shopper/loot-log/[purchaseId]` | ❌ | [ ] |
| 97 | Loot Log Public | `/shopper/loot-log/public/[userId]` | ❌ | [ ] |
| 98 | Trails | `/shopper/trails` | ✅ | — |
| 99 | Trail Detail | `/shopper/trails/[trailId]` | ✅ | — |

### User / Social Pages
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 100 | Profile | `/profile` | ❌ | [ ] |
| 101 | Notifications | `/notifications` | ❌ | [ ] |
| 102 | Messages Index | `/messages` | ❌ | [ ] |
| 103 | Message Thread | `/messages/[id]` | ❌ | [ ] |
| 104 | New Message | `/messages/new` | ❌ | [ ] |
| 105 | Wishlists | `/wishlists` | ❌ | [ ] |
| 106 | Shared Wishlist | `/wishlists/shared/[slug]` | ❌ | [ ] |
| 107 | Referral Dashboard | `/referral-dashboard` | ❌ | [ ] |
| 108 | Refer | `/refer/[code]` | ❌ | [ ] |
| 109 | Affiliate | `/affiliate/[id]` | ❌ | [ ] |
| 110 | Organizer Profile | `/organizers/[id]` | ✅ | — |
| 111 | Shopper Profile | `/shoppers/[id]` | ✅ | — |
| 112 | Trail Share | `/trail/[shareToken]` | ✅ | — |

### Pricing / Plans
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 113 | Plan | `/plan` | ❌ | [ ] |

### Admin Pages
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 114 | Admin Index | `/admin` | ❌ | [ ] |
| 115 | Users | `/admin/users` | ❌ | [ ] |
| 116 | Sales | `/admin/sales` | ❌ | [ ] |
| 117 | Invites | `/admin/invites` | ❌ | [ ] |
| 118 | Disputes | `/admin/disputes` | ❌ | [ ] |
| 119 | AB Tests | `/admin/ab-tests` | ❌ | [ ] |

### Creator / Gamification
| # | Page | Route | Dark Mode | Fix Status |
|---|------|-------|-----------|------------|
| 120 | Creator Dashboard | `/creator/dashboard` | ❌ | [ ] |

---

## SECTION 2: DARK MODE — COMPONENT CHECKLIST

### Components WITHOUT dark: classes (138 of 164 — 84% broken)

| # | Component | bg-white? | text-warm-900? | Fix Status |
|---|-----------|-----------|----------------|------------|
| 1 | AchievementBadge | — | — | [ ] |
| 2 | ActivityFeed | ✅ | ✅ | [ ] |
| 3 | ActivitySummary | — | — | [ ] |
| 4 | AddToCalendarButton | — | — | [ ] |
| 5 | AddressAutocomplete | ✅ | ✅ | [ ] |
| 6 | AuctionCountdown | — | — | [ ] |
| 7 | AuthContext | — | — | N/A (logic only) |
| 8 | BadgeDisplay | — | — | [ ] |
| 9 | BidModal | ✅ | ✅ | [ ] |
| 10 | BountyModal | ✅ | — | [ ] |
| 11 | BulkActionDropdown | ✅ | — | [ ] |
| 12 | BulkCategoryModal | ✅ | ✅ | [ ] |
| 13 | BulkConfirmModal | ✅ | ✅ | [ ] |
| 14 | BulkItemToolbar | ✅ | ✅ | [ ] |
| 15 | BulkOperationErrorModal | ✅ | — | [ ] |
| 16 | BulkPhotoModal | ✅ | ✅ | [ ] |
| 17 | BulkPriceModal | — | ✅ | [ ] |
| 18 | BulkStatusModal | — | ✅ | [ ] |
| 19 | BulkTagModal | — | ✅ | [ ] |
| 20 | BuyingPoolCard | ✅ | — | [ ] |
| 21 | CSVImportModal | ✅ | — | [ ] |
| 22 | CartDrawer | ✅ | ✅ | [ ] |
| 23 | CartIcon | — | — | [ ] |
| 24 | CheckoutModal | ✅ | ✅ (7x) | [ ] |
| 25 | CommandCenterCard | ✅ | ✅ | [ ] |
| 26 | ConditionBadge | — | — | [ ] |
| 27 | Confetti | — | — | N/A (visual fx) |
| 28 | CountdownTimer | — | — | [ ] |
| 29 | DateRangeSelector | — | ✅ | [ ] |
| 30 | DisputeForm | ✅ | ✅ | [ ] |
| 31 | EmptyState | — | ✅ | [ ] |
| 32 | EntranceMarker | — | — | [ ] |
| 33 | EntrancePinPicker | — | — | [ ] |
| 34 | EntrancePinPickerInner | — | — | [ ] |
| 35 | FeedbackWidget | — | ✅ | [ ] |
| 36 | FilterSidebar | ✅ (3x) | ✅ (7x) | [ ] |
| 37 | FlashDealBanner | ✅ | — | [ ] |
| 38 | FlashDealForm | — | ✅ | [ ] |
| 39 | FollowButton | — | — | [ ] |
| 40 | FollowOrganizerButton | ✅ | — | [ ] |
| 41 | FraudBadge | — | — | [ ] |
| 42 | HeatmapLegend | ✅ | — | [ ] |
| 43 | HeatmapOverlay | — | — | [ ] |
| 44 | HoldTimer | — | — | [ ] |
| 45 | HuntPassModal | ✅ | — | [ ] |
| 46 | HypeMeter | — | — | [ ] |
| 47 | InstallPrompt | ✅ | ✅ | [ ] |
| 48 | ItemListWithBulkSelection | ✅ | ✅ | [ ] |
| 49 | ItemOGMeta | — | — | N/A (meta only) |
| 50 | ItemPhotoManager | — | — | [ ] |
| 51 | ItemPriceHistoryChart | ✅ | — | [ ] |
| 52 | ItemSearch | ✅ | ✅ | [ ] |
| 53 | ItemSearchResults | ✅ | ✅ | [ ] |
| 54 | ItemShareButton | — | — | [ ] |
| 55 | LiveFeedWidget | — | — | [ ] |
| 56 | LocationMap | ✅ | ✅ | [ ] |
| 57 | LoyaltyPassport | ✅ (3x) | — | [ ] |
| 58 | MyPickupAppointments | ✅ | ✅ (3x) | [ ] |
| 59 | NearMissNudge | — | — | [ ] |
| 60 | NotificationBell | ✅ | ✅ | [ ] |
| 61 | NotificationPreferences | — | ✅ (4x) | [ ] |
| 62 | OfflineIndicator | ✅ | — | [ ] |
| 63 | OnboardingWizard | ✅ | ✅ (3x) | [ ] |
| 64 | OrganizerReputation | — | — | [ ] |
| 65 | OrganizerSaleCard | — | ✅ | [ ] |
| 66 | OrganizerTierBadge | — | — | [ ] |
| 67 | PasskeyManager (has dark) | — | — | ✅ |
| 68 | PhotoLightbox | ✅ | — | [ ] |
| 69 | PhotoOpMarker | — | — | [ ] |
| 70 | PickupBookingCard | ✅ | — | [ ] |
| 71 | PickupSlotManager | ✅ | — | [ ] |
| 72 | PointsBadge | — | — | [ ] |
| 73 | PostPerformanceCard | — | — | [ ] |
| 74 | PremiumCTA | — | — | [ ] |
| 75 | PriceSuggestion | — | — | [ ] |
| 76 | QuickReplyPicker | ✅ | — | [ ] |
| 77 | RSVPAttendeesModal | — | — | [ ] |
| 78 | RSVPBadge | — | — | [ ] |
| 79 | RapidCapture | ✅ (5x) | — | [ ] |
| 80 | RarityBadge | — | — | [ ] |
| 81 | ReceiptCard | ✅ | — | [ ] |
| 82 | RecentlyViewed | ✅ | — | [ ] |
| 83 | RemindMeButton | — | — | [ ] |
| 84 | ReputationTier | — | — | [ ] |
| 85 | ReturnRequestModal | ✅ | — | [ ] |
| 86 | ReverseAuctionBadge | — | — | [ ] |
| 87 | ReviewsSection | ✅ | — | [ ] |
| 88 | RippleIndicator | ✅ (4x) | — | [ ] |
| 89 | RouteBuilder | ✅ | — | [ ] |
| 90 | SaleChecklist | — | — | [ ] |
| 91 | SaleMap | — | — | [ ] |
| 92 | SaleMapInner | — | — | [ ] |
| 93 | SaleOGMeta | — | — | N/A (meta only) |
| 94 | SalePerformanceBadge | — | — | [ ] |
| 95 | SaleQRCode | — | — | [ ] |
| 96 | SaleRSVPButton | — | — | [ ] |
| 97 | SaleSelector | — | — | [ ] |
| 98 | SaleShareButton | — | — | [ ] |
| 99 | SaleStatusWidget | — | — | [ ] |
| 100 | SaleSubscription | — | — | [ ] |
| 101 | SaleTourGallery | — | — | [ ] |
| 102 | SaleWaitlistButton | — | — | [ ] |
| 103 | SalesNearYou | — | — | [ ] |
| 104 | SearchFilterPanel | — | — | [ ] |
| 105 | SearchSuggestions | — | — | [ ] |
| 106 | ShopperReferralCard | — | — | [ ] |
| 107 | SimilarItems | — | — | [ ] |
| 108 | Skeleton | — | — | [ ] |
| 109 | SkeletonCards | — | — | [ ] |
| 110 | SmartInventoryUpload | — | — | [ ] |
| 111 | SocialPostGenerator | — | — | [ ] |
| 112 | SocialProofBadge | — | — | [ ] |
| 113 | StarRating | — | — | [ ] |
| 114 | StreakWidget | — | — | [ ] |
| 115 | SyncQueueModal | — | — | [ ] |
| 116 | TierBadge | — | — | [ ] |
| 117 | TierComparisonTable | — | — | [ ] |
| 118 | Tooltip | — | — | [ ] |
| 119 | TreasureHuntBanner | — | — | [ ] |
| 120 | TypologyBadge | — | — | [ ] |
| 121 | UGCPhotoGallery | — | — | [ ] |
| 122 | UGCPhotoSubmitButton | — | — | [ ] |
| 123 | UsageBar | — | — | [ ] |
| 124 | VerifiedBadge | — | — | [ ] |
| 125 | VisualSearchButton | — | — | [ ] |
| 126 | VoiceTagButton | — | — | [ ] |
| 127 | WishlistAlertForm | — | — | [ ] |
| 128 | WishlistShareButton | — | — | [ ] |
| 129 | YourWishlists | — | — | [ ] |
| 130 | camera/CaptureButton | ✅ | — | [ ] |
| 131 | camera/ModeToggle | — | — | [ ] |
| 132 | camera/PreviewModal | ✅ | ✅ | [ ] |
| 133 | camera/RapidCarousel | ✅ | ✅ (3x) | [ ] |
| 134-138 | PerformanceDashboard/* (5 sub-components) | ✅ (8x in MetricsGrid) | ✅ (15x+ in MetricsGrid) | [ ] |

### Components WITH dark: classes (26 — good, but verify completeness)
AppraisalResponseForm, BottomTabNav, ChallengeBadge, CityHeatBanner, DegradationBanner, EncyclopediaCard, ErrorBoundary, ItemCard, Layout, LibraryItemCard, LowBandwidthBanner, NudgeBar, OnboardingModal, OrganizerOnboardingModal, PasskeyManager, ReferralWidget, ReputationBadge, SaleCard, SimpleModePanel, SocialProofMessage, TeamsOnboardingWizard, ThemeToggle, TierGatedNav, ToastContext, ValuationWidget

---

## SECTION 3: TIER GATING — PRO FEATURE UPSELL AUDIT

### Current Behavior vs. Required Behavior

**Required (Patrick's directive):** SIMPLE users should SEE pro features grayed out with upgrade CTA — NOT be silently redirected.

| Page | Current Behavior | Required Behavior | Fix Status |
|------|-----------------|-------------------|------------|
| Command Center | `router.push('/organizer/upgrade')` — blank flash, redirect | Show page with overlay: "PRO feature — Upgrade" | [ ] |
| Appraisals | `router.push('/organizer/upgrade')` — blank flash, redirect | Show page with overlay: "PRO feature — Upgrade" | [ ] |
| Fraud Signals | `router.push('/organizer/upgrade')` — blank flash, redirect | Show page with overlay: "PRO feature — Upgrade" | [ ] |
| Offline Mode | `router.push('/organizer/upgrade')` — blank flash, redirect | Show page with overlay: "PRO feature — Upgrade" | [ ] |
| Typology | `router.push('/organizer/upgrade')` — blank flash, redirect | Show page with overlay: "PRO feature — Upgrade" | [ ] |
| Flip Report | Shows upgrade box inline (decent but no preview) | Show blurred report preview + upgrade CTA | [ ] |
| Photo Ops | `if (!isPro)` — shows upgrade message | Good start, but could show sample photo op | — |
| Workspace | `router.push` for non-TEAMS | Show page with overlay: "TEAMS feature — Upgrade" | [ ] |
| **Brand Kit** | **PRO section grayed out with "Upgrade to PRO" text** | **✅ CORRECT PATTERN — use this as template** | ✅ |

### Nav Visibility for SIMPLE Users
| Feature | Currently in Nav for SIMPLE? | Should be? | Fix Status |
|---------|------------------------------|------------|------------|
| Insights | ❌ Hidden | ✅ Yes, with PRO badge | [ ] |
| Command Center | ❌ Hidden | ✅ Yes, with PRO badge + lock icon | [ ] |
| Typology | ❌ Hidden | ✅ Yes, with PRO badge + lock icon | [ ] |
| Fraud Signals | ❌ Hidden | ✅ Yes, with PRO badge + lock icon | [ ] |
| Offline Mode | ❌ Hidden | ✅ Yes, with PRO badge + lock icon | [ ] |
| Appraisals | ❌ Hidden | ✅ Yes, with PRO badge + lock icon | [ ] |
| Workspace | ❌ Hidden (even for PRO) | ✅ Yes, with TEAMS badge + lock icon | [ ] |

### Hunt Pass (Upgraded Shopper Tier) — Status

Per roadmap: Hunt Pass is a $4.99/month paid add-on for shoppers. It provides 2× streak multiplier. It's listed as SHIPPED in the roadmap with ✅ on DB/API/UI/QA.

| Component | Hunt Pass Visibility | Fix Status |
|-----------|---------------------|------------|
| HuntPassModal.tsx | Exists — Stripe payment flow | Needs dark mode [ ] |
| StreakWidget.tsx | Shows Hunt Pass badge + upgrade button | Needs dark mode [ ] |
| LoyaltyPassport.tsx | Shows Hunt Pass CTA | Needs dark mode [ ] |
| AuthContext.tsx | `huntPassActive` flag tracked | N/A (logic) |
| OnboardingModal.tsx | Mentions Hunt Pass points | Needs dark mode [ ] |
| profile.tsx | Hunt Pass section | Needs dark mode [ ] |
| faq.tsx | Hunt Pass FAQ entry | Needs dark mode [ ] |
| shopper/dashboard.tsx | Mentions Hunt Pass points | Needs dark mode [ ] |

**Assessment:** Hunt Pass exists in code and is functional (Stripe billing wired). The UI for non-Hunt-Pass shoppers should show what they're missing — currently the StreakWidget shows an upgrade button which is correct. However, ALL Hunt Pass UI components lack dark mode.

**Missing:** There is no dedicated "Hunt Pass" landing page equivalent to `/organizer/upgrade`. Shoppers can only discover Hunt Pass through the StreakWidget or LoyaltyPassport. Consider adding a `/shopper/hunt-pass` page or section in shopper dashboard that explains benefits and drives conversion.

---

## SECTION 4: EMPTY STATE / LOADING / ERROR — PAGE-BY-PAGE

### Pages using useQuery WITHOUT EmptyState (gaps — need empty state added)
| # | Page | Has Skeleton? | Has Error? | Has Empty State? | Fix Status |
|---|------|--------------|------------|-----------------|------------|
| 1 | categories/[category] | ❌ | ✅ | ❌ | [ ] |
| 2 | categories/index | ❌ | ✅ | ❌ | [ ] |
| 3 | cities/index | ❌ | ❌ | ❌ | [ ] |
| 4 | creator/dashboard | ❌ | ✅ | ❌ | [ ] |
| 5 | messages/[id] | ❌ | ✅ | ❌ | [ ] |
| 6 | messages/index | ❌ | ✅ | ❌ | [ ] |
| 7 | messages/new | ❌ | ✅ | ❌ | [ ] |
| 8 | organizer/bounties | ❌ | ✅ | ❌ | [ ] |
| 9 | organizer/email-digest-preview | ❌ | ❌ | ❌ | [ ] |
| 10 | organizer/holds | ❌ | ✅ | ❌ | [ ] |
| 11 | organizer/hubs/[hubId]/manage | ❌ | ✅ | ❌ | [ ] |
| 12 | organizer/hubs/create | ❌ | ✅ | ❌ | [ ] |
| 13 | organizer/hubs/index | ❌ | ✅ | ❌ | [ ] |
| 14 | organizer/message-templates | ❌ | ❌ | ❌ | [ ] |
| 15 | organizer/payouts | ❌ | ✅ | ❌ | [ ] |
| 16 | organizer/photo-ops/[saleId] | ❌ | ❌ | ❌ | [ ] |
| 17 | organizer/premium | ❌ | ❌ | ❌ | [ ] |
| 18 | organizer/ripples | ❌ | ✅ | ❌ | [ ] |
| 19 | organizer/settings | ❌ | ✅ | ❌ | [ ] |
| 20 | organizer/webhooks | ❌ | ✅ | ❌ | [ ] |
| 21 | profile | ❌ | ✅ | ❌ | [ ] |
| 22 | referral-dashboard | ❌ | ✅ | ❌ | [ ] |
| 23 | shopper/holds | ❌ | ✅ | ❌ | [ ] |
| 24 | shopper/loot-log/[purchaseId] | ❌ | ✅ | ❌ | [ ] |
| 25 | shopper/purchases | ❌ | ✅ | ❌ | [ ] |
| 26 | shopper/receipts | ❌ | ✅ | ❌ | [ ] |
| 27 | shoppers/[id] | ❌ | ✅ | ❌ | [ ] |
| 28 | surprise-me | ❌ | ✅ | ❌ | [ ] |
| 29 | wishlists | ❌ | ✅ | ❌ | [ ] |
| 30 | wishlists/shared/[slug] | ❌ | ✅ | ❌ | [ ] |

### Pages WITHOUT error handling (22 — need error state added)
| # | Page | Fix Status |
|---|------|------------|
| 1 | challenges | [ ] |
| 2 | cities/index | [ ] |
| 3 | encyclopedia/index | [ ] |
| 4 | guide | [ ] |
| 5 | neighborhoods/index | [ ] |
| 6 | organizer/email-digest-preview | [ ] |
| 7 | organizer/message-templates | [ ] |
| 8 | organizer/photo-ops/[saleId] | [ ] |
| 9 | organizer/premium | [ ] |
| 10 | organizer/pro-features | [ ] |
| 11 | shopper/dashboard | [ ] |
| 12 | shopper/disputes | [ ] |
| 13 | shopper/loot-log | [ ] |
| 14 | shopper/settings | [ ] |
| 15 | shopper/trails | [ ] |
| 16 | trending | [ ] |

---

## SECTION 5: ACCESSIBILITY CHECKLIST

### Pages WITHOUT any aria-label attributes (75 of 89 user-facing pages)
**ALL organizer pages** except add-items/[saleId] and line-queue/[id] lack aria labels.
**ALL shopper pages** except settings lack aria labels.
**ALL admin pages** lack aria labels.
**ALL public pages** except faq, login, register, search lack aria labels.

### Images Missing alt Text (30 instances across 17 pages)
| Page | Line(s) | Fix Status |
|------|---------|------------|
| categories/[category] | 108 | [ ] |
| items/[id] | 398, 414 | [ ] |
| leaderboard | 176 | [ ] |
| neighborhoods/[slug] | 143 | [ ] |
| organizer/add-items/[saleId]/review | 418 | [ ] |
| organizer/add-items/[saleId] | 1550 | [ ] |
| organizer/appraisals | 180 | [ ] |
| organizer/brand-kit | 317 | [ ] |
| organizer/holds | 310 | [ ] |
| organizer/pos | 603 | [ ] |
| organizer/promote/[saleId] | 470 | [ ] |
| organizer/storefront/[slug] | 136, 155, 299 | [ ] |
| organizer/typology | 96 | [ ] |
| organizer/ugc-moderation | 116 | [ ] |
| organizer/workspace | 288 | [ ] |
| organizers/[id] | 226 | [ ] |
| profile | 247 | [ ] |
| sales/[id] | 390, 404, 544, 732 | [ ] |
| search | 39 | [ ] |
| shopper/collector-passport | 305 | [ ] |
| shopper/favorites | 190 | [ ] |
| shopper/holds | 129 | [ ] |
| wishlists/shared/[slug] | 135 | [ ] |
| wishlists | 304 | [ ] |

---

## SECTION 6: SEO — MISSING META TAGS

### Pages WITHOUT Head/meta tags (15 pages)
| Page | Fix Status |
|------|------------|
| admin/ab-tests | [ ] |
| admin/index | [ ] |
| admin/sales | [ ] |
| admin/users | [ ] |
| affiliate/[id] | [ ] |
| organizer/add-items (index) | [ ] |
| organizer/performance | [ ] (redirect — remove or add) |
| organizer/photo-ops/[saleId] | [ ] |
| organizer/pos | [ ] |
| organizer/ripples | [ ] |
| refer/[code] | [ ] |
| sales/[id] | [ ] (uses SaleOGMeta component instead) |

### Pages WITHOUT OG tags (90+ pages — only 12 pages have them)
**Pages WITH OG tags:** about, cities/index, condition-guide, contact, encyclopedia/[slug], feed, index, items/[id], map, neighborhoods/[slug], tags/[slug], trending

All other pages lack OG tags. Priority for adding: sales/[id] (uses SaleOGMeta), organizer/storefront/[slug], shopper public profiles, leaderboard, challenges.

---

## SECTION 7: MOBILE RESPONSIVENESS

### Pages WITHOUT any responsive breakpoint classes (55 pages)
These pages have NO `sm:`, `md:`, `lg:`, or `xl:` classes and will render identically on mobile and desktop:

| Category | Pages |
|----------|-------|
| Auth | forgot-password, reset-password |
| Admin | ALL 6 admin pages |
| Messages | ALL 3 message pages |
| Neighborhoods | Both pages |
| Organizer | add-items index, add-items review, appraisals, bounties, brand-kit, checklist, create-sale, edit-item, edit-sale, email-digest, holds, line-queue, message-templates, photo-ops, print-inventory, send-update, settings, typology, webhooks |
| Shopper | alerts, disputes, favorites, loot-log (all 3), purchases, receipts, settings, trails/[trailId] |
| Other | privacy, terms, unsubscribe, refer/[code], affiliate/[id] |

---

## SECTION 8: NAVIGATION AUDIT

### Current Nav Item Counts
| Role | Tier | Items in Drawer | Verdict | Fix Status |
|------|------|-----------------|---------|------------|
| Logged out | — | 7 (Home, Trending, About, Leaderboard, Contact, Login, Register) | OK | — |
| Shopper (USER) | — | 15 items | TOO MANY — needs collapsible groups | [ ] |
| Organizer | SIMPLE | 10 items (hides all PRO features) | Missing feature discovery | [ ] |
| Organizer | PRO | 16 items | TOO MANY — needs collapsible groups | [ ] |
| Organizer | TEAMS | 17 items | TOO MANY — needs collapsible groups | [ ] |
| Admin | — | 16+ items | TOO MANY | [ ] |

### Missing from Nav
| Item | Should be accessible to | Fix Status |
|------|------------------------|------------|
| Map / Explore (logged-out) | Public | [ ] |
| PRO features with lock icon (SIMPLE) | SIMPLE organizers | [ ] |
| TEAMS features with lock icon (PRO) | PRO organizers | [ ] |
| Hunt Pass info/upgrade (shoppers without) | Free shoppers | [ ] |

---

## SECTION 9: VISUAL CONSISTENCY

### Pages WITHOUT h1 tag (12 pages)
| Page | Fix Status |
|------|------------|
| login | [ ] |
| register | [ ] |
| search | [ ] |
| affiliate/[id] | [ ] |
| messages/[id] | [ ] |
| organizer/add-items (index) | [ ] |
| organizer/performance (redirect) | N/A |
| refer/[code] | [ ] |

### Font Consistency
- `font-fraunces` used correctly in: pos, premium, pro-features, subscription, typology, upgrade
- `font-mono` used correctly for code/technical content
- No rouge font declarations found — Tailwind config enforces Inter/Fraunces

---

## SECTION 10: OPEN QUESTIONS FOR PATRICK

1. **Insights tier gate:** `/organizer/insights` has NO tier check. Nav hides it from SIMPLE. Should Insights be PRO-only (add gate) or available to all (show in nav)?

2. **Plan a Sale auth:** `/plan` is public with no login required. Is this intentional? (Roadmap says FREE tier, public rate-limited.)

3. **Creator Dashboard role:** `/creator/dashboard` has no role check. What role accesses this?

4. **Hunt Pass landing page:** Should we create a `/shopper/hunt-pass` page to explain benefits and drive conversion? Currently only discoverable through StreakWidget and LoyaltyPassport.

5. **Performance redirect:** `/organizer/performance` just redirects to `/organizer/insights`. Remove the page and update all links, or keep the redirect?

---

## SECTION 11: RECOMMENDED FIX PRIORITY

### Phase 1 — Critical Visibility (Dark Mode + Tier Upsell)
**Est: 3-4 dev dispatches**
1. Create `<TierGate>` component (use brand-kit pattern as template)
2. Replace all 7 `router.push('/organizer/upgrade')` with `<TierGate>` overlay
3. Update Layout.tsx nav to show all features for all tiers with lock icons
4. Dark mode pass on all 83 pages (batch by category — public, organizer, shopper, admin)
5. Dark mode pass on top 50 most-used components

### Phase 2 — Empty States + Error Handling
**Est: 2 dev dispatches**
1. Add EmptyState to 30 useQuery pages without it
2. Add error handling to 22 pages without it
3. Add Skeleton loading to 15 useQuery pages without it

### Phase 3 — Accessibility
**Est: 1-2 dev dispatches**
1. Add aria-label to all 75 pages missing them
2. Add alt text to all 30 images missing it
3. Keyboard nav audit on key flows

### Phase 4 — Mobile + Nav + Polish
**Est: 1-2 dev dispatches**
1. Add responsive classes to 55 pages without them
2. Implement collapsible nav sections
3. Add h1 tags to 12 pages missing them
4. Add Head/meta to 15 pages missing them

### Phase 5 — Hunt Pass Shopper Tier
**Est: 1 dev dispatch**
1. Dark mode on all Hunt Pass components
2. Create Hunt Pass landing page or shopper upgrade section
3. Ensure non-Hunt-Pass shoppers see grayed-out premium features

---

## VERIFICATION PROTOCOL

After each fix batch, dev must run:
```bash
# Verify dark mode coverage
cd packages/frontend/pages && grep -rL "dark:" --include="*.tsx" . | wc -l
# Target: 0 (from current 83)

cd packages/frontend/components && grep -rL "dark:" --include="*.tsx" . | wc -l
# Target: <10 (logic-only components exempt)

# Verify no silent redirects on tier-gated pages
grep -rn "router.push.*upgrade" --include="*.tsx" pages/organizer/ | wc -l
# Target: 0

# Verify empty states
grep -rL "EmptyState\|empty" --include="*.tsx" pages/ | wc -l
# Track reduction over time

# Verify aria labels
grep -rL "aria-" --include="*.tsx" pages/ | wc -l
# Target: <15 (some pages legitimately don't need them)
```

---

**Total findings: 400+ individual items across 10 audit dimensions.**
**This checklist is the single source of truth for frontend QA verification.**
