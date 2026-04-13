# Organizer Guidance Spec — S350

**Objective:** Give every organizer-facing feature a tooltip and explainer that lives *alongside* the feature name — not replacing it. Feature names stay exactly as they are in the UI. This spec is the source of truth for what tooltip copy, explainer text, and CTAs say next to each feature. Target audience: organizers 50–70 years old, running physical sales, time-pressured and often not smartphone natives.

**How to use this spec:** When a dev adds a tooltip (❓ icon), empty state, or inline helper text, the copy comes from here. The feature name in the UI does not change. The guidance layer explains what the feature does for *their business*, in plain language, right next to the label.

**Brand voice:** Warm, encouraging, plain English. Always "your sale," "your buyers," "your earnings." CTAs use verb + outcome ("See what sold," "Add your first item"). Target reading level: 6th grade.

---

## SECTION 1: FEATURE TOOLTIP & EXPLAINER COPY

Feature names appear in the UI exactly as written. The copy below goes in tooltips (❓), inline explainer text (small gray text below the label), or feature description lines on pricing/settings pages. These are not label replacements — they are guidance that appears alongside the label.

---

### SIMPLE / PRO / TEAMS (tier names — keep as-is)

**Tooltip on tier badge (dashboard):**
> "Your current plan on FindA.Sale. SIMPLE: pay 10% per sale, no monthly fee. PRO: pay 8% per sale, plus tools that help you sell more. TEAMS: run multiple organizers from one account."

**Inline explainer on pricing page (below tier name):**
- SIMPLE: "Good for getting started. No monthly cost — just 10% when items sell."
- PRO: "Best for active organizers. Lower fees (8%) plus tools that speed up your workflow and bring more buyers to your sales."
- TEAMS: "For companies or families running multiple sales at once. One account, multiple organizers."

**Where it appears:** `/organizer/pricing`, dashboard tier badge, upgrade prompts

---

### Featured Placement (keep as-is)

**Tooltip on PRO feature list:**
> "Your sale shows near the top when shoppers search for estate sales in your area. More visibility means more buyers walk through your door."

**Where it appears:** PRO feature list, upgrade gate

---

### Verified Badge / Verified Seller (keep as-is)

**Tooltip on badge:**
> "This checkmark tells shoppers you've run successful sales on FindA.Sale. Buyers are more likely to trust a verified organizer — it can mean more sales."

**Where it appears:** Organizer profile, sale listing header, settings

---

### Flip Report (keep as-is)

**Tooltip on dashboard link:**
> "After your sale, see exactly which items sold, which didn't, and at what price. Use it to price your next sale smarter."

**Inline explainer on PRO feature list:**
> "Your personal sales report. Know what your buyers actually wanted — and what to price differently next time."

**Where it appears:** Dashboard, `/organizer/flip-report`, PRO feature list, tier upgrade gate

---

### Brand Kit (keep as-is)

**Tooltip:**
> "Add your logo, brand colors, and social media links. Your sale listings will look professional and buyers can follow you to future sales."

**Inline explainer (PRO feature list):**
> "Give your sales a consistent look. Repeat customers recognize you and come back."

**Where it appears:** `/organizer/brand-kit`, PRO feature list, settings

---

### Auto-Markdown (keep as-is)

**Tooltip:**
> "Items that haven't sold after a few days will automatically drop in price. You set the lowest price they can reach — nothing sells for less than you want."

**Inline explainer on edit-sale form:**
> "Clears out slow-moving inventory without you having to check prices manually every day."

**Where it appears:** Edit sale form, PRO feature list

---

### Print Kit / Print Inventory (keep as-is)

**Tooltip on Print Kit:**
> "Print a yard sign with a QR code and individual price tags for each item. Shoppers scan the QR code to find items on their phone — no more digging through piles."

**Tooltip on Print Inventory:**
> "A printable list of all your items with prices. Keep it on a clipboard so you can look up prices quickly during the sale."

**Where it appears:** `/organizer/print-kit`, `/organizer/print-inventory`, PRO feature list

---

### Item Tagger (UI name) / Typology Classifier (internal name — use Item Tagger in UI)

**Tooltip:**
> "After you take a photo, our system suggests tags like 'vintage,' 'mid-century,' or 'furniture.' These tags help shoppers find your item in search. You can edit or add your own before publishing."

**Inline explainer on photo review screen:**
> "These tags were guessed from your photo. Check them — the more accurate they are, the easier it is for the right buyer to find this item."

**Where it appears:** Photo review screen, add items page, PRO feature list

---

### Webhooks (keep as-is)

**Tooltip:**
> "Send your sale data automatically to other tools you use — like accounting software, spreadsheets, or email lists. Saves re-entering the same information twice."

**Inline explainer (TEAMS feature list):**
> "For organizers who use other business software. Data flows out automatically when items sell."

**Where it appears:** `/organizer/webhooks`, TEAMS feature list

---

### POS (keep as-is)

**Tooltip:**
> "Ring up items and take payment from shoppers right at your sale location — cash, card, or both. No separate card reader needed."

**Where it appears:** Dashboard tools, roadmap

---

### Hold / Active Hold / Hold Expiry (keep as-is)

**Tooltip on "Active Holds" dashboard stat:**
> "A buyer has reserved this item and is on their way to pay. If they don't come back before the timer runs out, the item goes back on sale automatically."

**Tooltip on hold timer:**
> "Time left before this hold expires. When it hits zero, the item is available again."

**Inline explainer on holds panel:**
> "Holds let buyers claim an item before they arrive. You control whether holds are on or off for each sale."

**Where it appears:** Dashboard stats, holds panel, item detail, hold notifications

---

### Explorer's Guild — what shopper ranks mean for YOUR sale (keep all names as-is)

Feature names (Explorer's Guild, Explorer Rank, Initiate, Scout, Ranger, Sage, Grandmaster) stay exactly as written. The guidance below helps organizers understand what a shopper's rank tells them about that buyer.

**Tooltip on Explorer's Guild (in nav/settings):**
> "Our buyer loyalty program. Shoppers earn rank by visiting sales, scanning items, and buying. Higher-ranked shoppers are your most active, reliable buyers."

**Tooltip on shopper rank badge (shown on hold requests and activity feed):**
> "This is the shopper's rank in our loyalty program — it tells you how active and experienced they are as a buyer."

**Rank-specific inline context (shown next to rank badge on holds panel):**
- **Initiate** — "New to FindA.Sale. First hold or purchase."
- **Scout** (500+ XP) — "Has visited multiple sales. Starting to become a regular."
- **Ranger** (1500+ XP) — "Active buyer. Visits sales frequently and completes purchases."
- **Sage** (2500+ XP) — "One of your best potential customers. High purchase completion rate."
- **Grandmaster** (5000+ XP) — "Your most loyal buyer type. Grandmasters almost always follow through on holds."

**Why this matters for organizers:** When a Grandmaster places a hold, it's a near-certain sale. When an Initiate holds an item, it may be worth a quick confirmation. Rank gives you buyer intelligence without needing to know them personally.

**Where it appears:** Holds panel, activity feed, sale stats, organizer dashboard shopper insight card

---

### QR Code Check-In (keep as-is)

**Tooltip:**
> "Shoppers scan this QR code at your door to confirm they're actually at your sale. Reduces no-shows on holds — if someone can't scan in, the hold doesn't activate."

**Where it appears:** Edit sale form, hold settings, Print Kit output

---

### CSV Export (keep as-is)

**Tooltip:**
> "Download all your items as a spreadsheet file. Open it in Excel, Google Sheets, or your accounting software."

**Where it appears:** Print inventory page, PRO feature list

---

### Entrance PIN (keep as-is)

**Tooltip:**
> "Optional. Shoppers enter this code when they arrive so you know they're at the right address. Helps keep your home address more private."

**Tooltip on Entrance Note field:**
> "Directions for shoppers when they arrive — 'Park in the driveway' or 'Use the side gate.' Shows up on the sale detail page."

**Where it appears:** Edit sale form, sale detail page

---

## SECTION 2: TOOLTIP COPY LIBRARY

**Format:** Hover-over or info-icon explanations (max 2 sentences). Write in plain language, benefit-first.

### Active Holds (on dashboard stat)
> "Shoppers have saved these items and may come back to buy them in the next 30–90 minutes. You'll see notifications when they approve or cancel."

### Cash Fee Balance (on payouts page)
> "This is the FindA.Sale platform fee coming out of your sales. Your earnings appear here after each sale ends."

### Organizer Tier Badge (on dashboard/profile)
> "This shows your current plan. Each plan includes different tools and fees. Visit Pricing to see what you can unlock."

### Flip Report Link (on dashboard)
> "See exactly what sold from your last sale and at what price. Use this to price your next items smarter and earn more."

### Auto-Markdown Toggle (on edit-sale form)
> "Turn this on and we'll slowly drop prices on items that aren't selling. Set a bottom price so items don't go too cheap."

### CSV Export Button (on print-inventory page)
> "Download your items as a spreadsheet. Useful for personal records, accounting software, or spreadsheets."

### Brand Kit Section (on settings)
> "Add your logo, brand colors, and social links. Your sales will look professional and shoppers can follow you on social media."

### QR Code Check-In Button (on edit-sale form)
> "Turn this on to require shoppers to scan a QR code at your door. Cuts down on people placing holds and never showing up."

### Entrance PIN Field (on edit-sale form)
> "Optional secret code shoppers text when arriving. Adds privacy and confirms they're actually at your location."

### Print Kit Button (on sale detail)
> "Print a yard sign with a QR code and price tags for each item. Makes your sale look professional and easier to navigate."

### Sale Status Badge (DRAFT / ACTIVE / ENDED)
> "**DRAFT:** Not yet live. No one can see or buy items. **ACTIVE:** Shoppers can see and buy. **ENDED:** Sale is closed; no more purchases."

### Pending vs AVAILABLE Item Status (on item list)
> "**PENDING:** You're still setting up this item (no photo, no price). **AVAILABLE:** Ready to sell — shoppers can see and buy it."

### Bulk Publish Button (on add-items page)
> "Publish all items at once instead of one by one. They'll show up in search immediately so shoppers can start buying."

### AI Tag Suggestions (after photo upload)
> "Our AI read your photo and guessed these tags (vintage, furniture, mid-century). Edit or add your own before publishing."

### Stripe Connect / Payout (on settings)
> "Connect your bank account so earnings go straight to you. Takes 2–3 business days to arrive after each sale."

### Holds Enabled Toggle (on edit-sale form)
> "Turn this on to let shoppers hold items. Turn off if you want everything sold first-come, first-served."

### Command Center Button (on dashboard)
> "One view of all your sales, holds, and earnings. Fastest way to run your sales from a phone or tablet."

---

## SECTION 3: EMPTY STATE COPY

### Dashboard: New Organizer (0 sales ever)

**Page:** `/organizer/dashboard`

- **Headline:** "Welcome! Ready to start your first sale?"
- **Subtext:** "Create a sale, add items, and start selling on FindA.Sale. We'll walk you through each step."
- **CTA Button:** "Create Your First Sale" → `/organizer/create-sale`

---

### Dashboard: Between Sales (organizer has ended sales but no active sales)

**Page:** `/organizer/dashboard`

- **Headline:** "Your last sale is done. Time for the next one?"
- **Subtext:** "Start a new sale, or clone your last one to reuse items and settings."
- **Primary CTA:** "Create a New Sale" → `/organizer/create-sale`
- **Secondary CTA:** "Review Your Last Sale's Results" → `/organizer/flip-report` (if tier ≥ PRO)

---

### Sale Items List: Zero Items Added

**Page:** `/organizer/add-items/[saleId]`

- **Headline:** "No items yet. Let's add some."
- **Subtext:** "Take a photo, type in a title and price, and publish. Or upload multiple items at once."
- **Primary CTA:** "Take a Photo" → Camera tab
- **Secondary CTA:** "Type Details" → Manual Entry tab
- **Tertiary CTA:** "Upload Multiple" → Batch upload tab

---

### Holds Panel: No Active Holds

**Page:** `/organizer/holds`

- **Headline:** "No active holds right now."
- **Subtext:** "Shoppers will appear here when they save items from your sales."
- **CTA:** "Go Back to Dashboard" → `/organizer/dashboard`

---

### Flip Report: No Sales Data

**Page:** `/organizer/flip-report/[saleId]` (new organizer or no completed sales)

- **Headline:** "Nothing to report yet."
- **Subtext:** "Your Flip Report will show up after your first sale ends. You'll see what sold, what didn't, and what to price next time."
- **CTA:** "Start Your First Sale" → `/organizer/create-sale`

---

### Earnings Page: $0 Earnings

**Page:** `/organizer/payouts`

- **Headline:** "No earnings yet."
- **Subtext:** "Every time an item sells, your earnings will show up here. Payouts go to your bank account 2–3 business days after your sale ends."
- **CTA:** "Create a Sale to Earn Money" → `/organizer/create-sale`

---

### Print Inventory: Zero Items Across All Sales

**Page:** `/organizer/print-inventory`

- **Headline:** "Nothing to print."
- **Subtext:** "Add items to a sale first. Then come back here to print your inventory."
- **CTA:** "Add Items to a Sale" → `/organizer/dashboard`

---

### Brand Kit: Not Set Up

**Page:** `/organizer/brand-kit`

- **Headline:** "Make your sales look professional."
- **Subtext:** "Add your logo, brand colors, and social media links so shoppers recognize your brand."
- **CTA:** "Add Your Brand Info" → (scroll to form)

---

### Webhooks: No Webhooks Created (TEAMS only)

**Page:** `/organizer/webhooks`

- **Headline:** "Connect FindA.Sale to your other tools."
- **Subtext:** "Send sale data automatically to accounting software, email tools, or apps you use. Saves manual data entry."
- **CTA:** "Create Your First Webhook" → (scroll to form)

---

## SECTION 4: CRITICAL WORKFLOW GUIDANCE

### Workflow A: Create First Sale

**Goal:** Guide a non-technical, time-pressured organizer through sale setup.

---

#### Step 1: What Are You Selling?
**Route:** `/organizer/create-sale`

**Instruction Copy:**
"Tell us about your sale. This is the basic info shoppers see when they search."

**Form Fields & Guidance:**
- **Sale Type** (dropdown)
  - Label: "What kind of sale is this?"
  - Placeholder: "Estate Sale, Yard Sale, Auction, Flea Market, Consignment"
  - Help text: "Shoppers filter by type, so choose the one that matches your sale."

- **Sale Title** (text input)
  - Label: "Give your sale a name"
  - Placeholder: "Spring Estate Sale on Maple Street"
  - Help text: "Use words shoppers will search for: location, dates, or what you're selling."

- **Description** (textarea)
  - Label: "Tell shoppers what to expect"
  - Placeholder: "Vintage furniture, mid-century lamps, estate jewelry, dishes. Everything must go."
  - Help text: (AI Generate button) "Click the magic wand to let AI write this for you."

**Primary CTA:** "Next: Date & Location" → Step 2

---

#### Step 2: When & Where?
**Route:** `/organizer/create-sale` (continued)

**Instruction Copy:**
"Tell shoppers when and where to find you."

**Form Fields & Guidance:**
- **Start Date & End Date** (date pickers)
  - Label: "When does your sale run?"
  - Help text: "Start date must be today or later. End date must be after start date."

- **Address** (text input)
  - Label: "Where is your sale?"
  - Placeholder: "123 Main Street"
  - Help text: "Shoppers use this to find you on the map."

- **City, State, Zip** (text inputs)
  - Auto-fill if possible.

- **Entrance Note** (optional textarea)
  - Label: "Where do shoppers enter?"
  - Placeholder: "Park in driveway. Knock on side gate."
  - Help text: "Directions help shoppers find the right door."

**Primary CTA:** "Next: Sale Photo" → Step 3

---

#### Step 3: Add a Cover Photo
**Route:** `/organizer/create-sale` (continued)

**Instruction Copy:**
"Add one photo so shoppers see what your sale looks like."

**Photo Upload Guidance:**
- **Main Photo** (upload area)
  - Label: "Upload a photo"
  - Help text: "Use a photo of your best items or the sale location. Shoppers see this when they search."
  - Button: "Pick a Photo from Your Phone" or "Take a Photo Now"

**Primary CTA:** "Next: Review & Publish" → Step 4

---

#### Step 4: Review & Publish
**Route:** `/organizer/create-sale` (continued)

**Instruction Copy:**
"Everything looks good? Publish your sale so shoppers can start browsing."

**Review Cards:**
- Sale title, type, dates
- Location
- Description
- Cover photo

**Warnings (if needed):**
- "No items added yet. You can add items after publishing, or add them now."
- "Entrance note is empty. This helps shoppers find you."

**Primary CTA:** "Publish Your Sale" → Sale is ACTIVE
**Secondary CTA:** "Add Items First" → `/organizer/add-items/[saleId]` (if zero items)
**Tertiary CTA:** "Save as Draft" → Sale is DRAFT (not visible to shoppers yet)

**Celebration:** Show a "You're live!" banner with next steps: "Now add items and shoppers can start buying."

---

### Workflow B: Add Items (Camera Flow)

**Goal:** Make photo capture → AI tagging → publish as fast as possible (under 60 seconds per item).

---

#### Step 1: Open Camera
**Page:** `/organizer/add-items/[saleId]`, Camera tab

**Instruction Copy:**
"Take a photo of an item. Our AI will suggest a description, tags, and price."

**Camera Screen:**
- Large viewfinder
- Quality hint (if dark): "⚠️ It's a bit dark. Try moving to brighter light for clearer tags."
- Button: "📸 Capture Photo"

**Tip Box:**
"Good lighting = better AI tags. Take a closeup if possible."

---

#### Step 2: Capture & Review
**Page:** `/organizer/add-items/[saleId]`, Camera tab, after capture

**Display:**
- Photo preview (full screen or modal)
- AI is analyzing... (spinner)
- "This usually takes 3 seconds."

**After AI Completes:**
- Show AI suggestions: title, description, tags, condition grade, estimated price
- Buttons: "✏️ Edit" (opens form for manual changes), "📸 Retake", "✅ Looks Good, Publish"

**Tip:**
"Don't like the AI guess? Edit anything below before publishing."

---

#### Step 3: Review AI Tags
**Page:** Camera review screen (form appears below preview)

**Form Fields (Pre-Filled by AI):**

- **Title** (text input)
  - Placeholder: "Vintage Eames Lounge Chair, 1960s"
  - Label: "Item name"

- **Description** (textarea, optional)
  - Pre-filled AI description
  - Help text: "Edit the AI description or leave it as-is."

- **Category** (dropdown)
  - AI-suggested category highlighted
  - Options: "Furniture," "Jewelry," "Kitchen," "Art," "Electronics," etc.

- **Condition Grade** (radio buttons)
  - S = Mint | A = Excellent | B = Good | C = Fair | D = Poor
  - Visual color-coded badges
  - Help text: "S is perfect, like new. D is worn but still functional."

- **Tags** (text input, comma-separated)
  - Pre-filled: "vintage, mid-century, furniture"
  - Help text: "Tags help shoppers search. Add your own (e.g., 'signed by artist')."

- **Price** (number input)
  - Pre-filled by AI valuation
  - Help text: "Set any price you want. Adjust based on condition."

- **Photo** (preview with ✏️ Replace button)
  - Show captured photo
  - Button: "Replace Photo" (retake or pick different photo)

**Tip Box (Gold):**
"Items with 3+ photos sell faster. Add more photos?"
- Button: "Add Another Photo" → Camera capture again
- Button: "Skip" → Continue to publish

---

#### Step 4: Publish or Save Draft
**Page:** Camera review screen (form bottom)

**Buttons:**
- **"Publish Item"** → Item becomes AVAILABLE immediately
  - Toast: "Item published! Shoppers can see it now."
  - Next action: "Add another item?" with Camera tab selected

- **"Save as Draft"** → Item becomes DRAFT (only you see it)
  - Toast: "Saved. Publish it later from your item list."
  - Useful for: need to take more photos, researching price, deciding whether to sell it

- **"Add More Photos First"** → Stay in camera, take 2–3 more captures
  - After each capture, return to same item form
  - Button changes to "Done Adding Photos" → back to publish screen

---

#### Optional: Bulk Upload (Batch Tab)

**Page:** `/organizer/add-items/[saleId]`, Batch tab

**Instruction Copy:**
"Upload multiple photos at once. We'll tag and price each one automatically."

**Workflow:**
1. **Pick Multiple Photos** → File picker (select 5–10 at once)
   - Help text: "Take 5–10 photos of different items. AI will create one item per photo."

2. **AI Processes All** → Progress bar
   - "Processing 7 photos... 3 of 7 done"

3. **Review All Items** → Grid of 7 preview cards
   - Each card shows: thumbnail, AI title, price, condition
   - Edit button on each card to change details
   - Bulk actions: "Publish All," "Save All as Drafts," "Delete One"

4. **Publish** → All items go live at once
   - Toast: "7 items published! Shoppers can see them now."

---

### Workflow C: Manage Holds During a Sale

**Goal:** Help organizers quickly approve/deny holds, track expiry, and manage shopper expectations.

---

#### Step 1: Receive Hold Notification
**Notification (in-app badge + email):**

**In-App Toast (right side, 5 seconds):**
> "Sarah held your Vintage Chair for 30 minutes. Approve or decline?"
> Button: "View Hold" → Holds page

**Email (subject line):**
> "[FindA.Sale] Sarah saved your Vintage Chair — 30 minutes to decide"

---

#### Step 2: Review Hold Request
**Page:** `/organizer/holds`

**Hold Card Display:**
- Shopper name + profile badge (rank: Scout, Ranger, etc.)
- Item photo (thumbnail)
- Item title + price
- **Status:** "Hold expires in 28 min" (countdown timer)
- **Shopper note** (optional): "I'll be there in 20 min. Can you hold this?"

**Fraud Alert (if triggered):**
- 🚨 Red badge: "Caution: New shopper account" or "Multiple holds on this account"
- Stays visible but doesn't block approval

**Buttons:**
- ✅ **"Approve Hold"** → Shopper gets notification, item is off limits to others
- ❌ **"Deny Hold"** → Shopper gets notification, item goes back on sale
- 🔄 **"Extend 15 Minutes"** → Hold stays active, timer resets (optional, PRO only)

---

#### Step 3: Track Hold Expiry
**Visual Indicator on Holds Dashboard:**

**Hold Card Design:**
- Timer at top: "⏱️ Expires in 22 min"
- Color indicator: Green (>15 min), Yellow (5–15 min), Red (<5 min)

**Optional Automation:**
- "Mark Sold" button (pre-filled with shopper name + amount) — see Workflow D
- "Release Hold" button (if shopper is no-show after timer expires)

---

#### Step 4: Mark Item Sold or Release Hold

**If Shopper Buys:**
- Button: "Mark Sold" → Item status becomes SOLD
- (Future: Holds with payment will auto-mark when paid)

**If Shopper Doesn't Show:**
- Hold auto-expires after timer
- Option to manually "Release Hold" if needed
- Item goes back to AVAILABLE

**Notifications Organizer Sends:**
- Approve: "Your hold is confirmed! Come by whenever."
- Deny: "This item was claimed by another shopper. Check our other items."
- Release (no-show): "Your hold has expired. The item is available again if you want to come back."

---

### Workflow D: End of Sale / Wrap-Up

**Goal:** Help organizers close out a sale, see results, and get paid.

---

#### Step 1: Mark Sale Ended
**Page:** `/organizer/edit-sale/[id]`

**Status Indicator (at top):**
- Current status badge: "ACTIVE" (green)
- Button: "End This Sale" (red)

**Modal Confirmation:**
> "Are you sure? Shoppers won't be able to buy items anymore. Items will stay on your past sales list."
> - Checkbox: "Mark all items as sold" (optional pre-action)
> - Button: "Yes, End Sale"
> - Button: "Cancel"

**After Confirmation:**
- Sale status becomes ENDED
- All AVAILABLE items become UNSOLD
- Holds auto-expire
- Toast: "Sale ended! Check your results."

---

#### Step 2: Review Results
**Page:** Auto-redirect to Flip Report or prompt to view `/organizer/flip-report/[saleId]` (if PRO)

**Flip Report Displays:**
- **At a Glance:** Total items, sold, unsold, earnings
- **What sold:** Grid of sold items with sale price (grouped by category)
- **What didn't:** Grid of unsold items (in gray)
- **Price insights:** "Jewelry sold fast. Dishes sat longer." (AI-generated insight)
- **Next sale tip:** "Raise jewelry prices 10–15%. Consider lower dish prices or bundle them."

**If SIMPLE tier (no Flip Report):**
- Simple summary card: "Items sold: 12 of 15. Earnings: $342. Upgrade to PRO to see what price your items next time."
- Button: "Unlock Flip Report" → `/organizer/pricing`

---

#### Step 3: Check Earnings
**Page:** `/organizer/payouts`

**Earnings Display:**
- **Sale name:** "Spring Estate Sale"
- **Status:** "Completed"
- **Gross revenue:** $450 (total from all sales)
- **FindA.Sale fee:** $45 (10% for SIMPLE, 8% for PRO)
- **Stripe processing fee:** $12
- **Your earnings:** $393 ✅ (pending or processing)

**Payout Timeline:**
- "Earnings arrive in your bank account within 2–3 business days after your sale ends."

**Payout Options:**
- Current schedule: "Weekly payouts every Monday"
- Button: "Change Payout Schedule" → payout settings
- Button: "Get Paid Now (Instant)" → instant payout option (may have small fee)

---

#### Step 4: Create Next Sale or Clone
**Page:** Dashboard after sale ends

**Options Card:**
- **"Create a New Sale"** button → `/organizer/create-sale`
  - Subtext: "Start fresh with new items."

- **"Clone Your Last Sale"** button → (create sale with same title, location, type)
  - Subtext: "Reuse the same details and add new items."
  - Modal: Pre-fills address, dates (with new start/end), description
  - Button: "Create Sale"

**Congrats Message:**
> "Great job! You've run a sale on FindA.Sale. Ready for the next one? Organizers who run 2+ sales earn 10% more per item on average."

---

## SECTION 5: ONBOARDING MODAL COPY (FIRST LOGIN)

**Trigger:** First time user visits `/organizer/dashboard`
**Storage:** localStorage key `findasale_organizer_onboarding_seen` (show once per browser)
**Design:** 3 slides, centered modal, skip option on each slide

---

### Screen 1: Welcome
**Headline:** "Welcome to FindA.Sale, [First Name]!"

**Body:**
"You're now an organizer. Sell estate items, yard sale finds, auction inventory, or consignment stock on our marketplace. Shoppers near you can find and buy your items online or in person."

**CTA Button:** "Next: How It Works" → Screen 2
**Skip Link:** "Skip tour" (dismiss modal)

---

### Screen 2: How It Works
**Headline:** "In 4 steps, you'll be selling"

**Body (bullet points):**
1. 📋 **Create a sale** — Tell us when, where, and what you're selling
2. 📸 **Add items** — Take photos, our AI suggests prices and tags
3. 🔍 **Shoppers find you** — People near you search and buy
4. 💰 **Get paid** — Earnings go straight to your bank account

**Subtext:** "The whole process takes about 30 minutes."

**CTA Button:** "Next: Get Started" → Screen 3
**Skip Link:** "Skip tour"

---

### Screen 3: Let's Go
**Headline:** "Ready to start your first sale?"

**Body:** "We'll walk you through it. Most organizers add their first items in under 30 minutes."

**Primary CTA Button:** "Create Your First Sale" → Dismiss modal, redirect to `/organizer/create-sale`
**Secondary CTA Button:** "Explore the Dashboard First" → Dismiss modal, stay on dashboard
**Skip Link:** "Skip tour" (dismiss modal)

---

## SECTION 6: PHOTO UPLOAD GUIDANCE COPY

### Before Capture

**Screen:** Camera tab, before taking photo

**Headline:** "Let's add an item"

**Instruction Copy:**
"Point your camera at an item and tap the button. Our AI will read your photo and fill in the details for you."

**Pre-Capture Tips (gold box):**
- "✨ **Lighting matters.** Brighter light helps AI tags. Avoid harsh shadows."
- "📏 **Get close.** A clear closeup is better than a wide shot."
- "🔄 **Show condition.** If there's damage, let the camera see it so you can price fairly."

**Button:** "📸 Take a Photo"

---

### During Upload (AI Analyzing)

**Screen:** After photo captured, spinner visible

**Copy:**
"Your photo is being analyzed by AI. This usually takes 3 seconds..."

**Visual:** Spinner + progress indicator
- "Reading your photo..."
- "Suggesting tags..."
- "Estimating value..."

---

### AI Tag Suggestions Appear

**Screen:** Review form with AI suggestions filled in

**Headline:** "Here's what we found:"

**Explanation Copy:**
"Our AI read your photo and filled in details below. The tags help shoppers search and find your item. Edit anything that's wrong before publishing."

**Form Sections (each pre-filled):**

1. **Title** (AI-generated)
   - "Vintage Eames Lounge Chair, 1960s"
   - Help text: "✏️ Edit the title if AI got it wrong"

2. **Tags** (AI-suggested, comma-separated)
   - "vintage, mid-century, furniture, leather"
   - Help text: "These help shoppers search. Add unique tags like 'signed by artist' if true."

3. **Condition** (AI guessed)
   - Radio buttons with color badges: S / A / B / C / D
   - Help text: "S = like new. D = worn but works."

4. **Price** (AI estimated)
   - Number input, pre-filled
   - Help text: "AI estimated this value. You can change it. Check Flip Reports from similar items."

---

### Poor Quality Photo Warning

**Trigger:** Image is very dark, very blurry, or face detected

**Visual:** Warning banner at top of form

**Copy (if dark):**
> "⚠️ **Your photo is pretty dark.** AI tags might be less accurate. Try retaking with better lighting?"
> - Button: "📸 Retake Photo"
> - Button: "It's Fine, Let's Publish Anyway"

**Copy (if blurry):**
> "⚠️ **Your photo is blurry.** Retake it in steadier light?"
> - Button: "📸 Retake Photo"
> - Button: "Skip and Edit Later"

**Copy (if face detected):**
> "⚠️ **We detected a person in this photo.** Consider cropping them out for privacy, or you can proceed."
> - Button: "📸 Retake Photo"
> - Button: "Crop the Photo"
> - Button: "Proceed Anyway"

---

### Photo Count Guidance

**Display:** After item is published

**Tip Box (gold):**
"💡 **Items with 3+ photos sell faster.** Add 2 more photos of this item from different angles?"

**Buttons:**
- "📸 Add More Photos" → Camera capture again (for same item)
- "Next Item" → Fresh camera for a new item
- "Done Adding Items" → Back to dashboard

---

## SECTION 7: TIER UPGRADE COPY

**Design:** When shopper encounters a locked feature, show a modal or collapsible gate with:
1. Feature name (big)
2. What it does in business-outcome language (1 sentence)
3. Why they need it (1–2 sentences)
4. CTA to upgrade

---

### Flip Report Gate

**Feature:** Flip Report

**Gate Headline:** "See what sold and price smarter."

**Gate Body:**
"After your sale ends, Flip Report shows you exactly which items sold, which items sat, and at what price. Use this data to price your next sale smarter and earn more per item."

**Missing Without This:** "You're making pricing decisions blind. You don't know what sold or what didn't."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

### Auto-Markdown Gate

**Feature:** Auto-Markdown

**Gate Headline:** "Automatically lower prices to clear inventory."

**Gate Body:**
"Turn on Auto-Markdown and FindA.Sale automatically drops prices on slow-selling items after a few days. You set the floor price — items never go below what you choose. Clears inventory faster so you're not stuck with unsold stuff."

**Missing Without This:** "Items that don't sell stick around. You have to manually lower prices or mark them unsold."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

### Brand Kit Gate

**Feature:** Brand Kit

**Gate Headline:** "Make your sales look professional."

**Gate Body:**
"Add your logo, brand colors, and social media links. Your sales will have a polished look, and shoppers can follow you across platforms."

**Missing Without This:** "Your sales use default FindA.Sale styling. Shoppers won't remember your brand or know how to follow you."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

### CSV Export Gate

**Feature:** CSV Export

**Gate Headline:** "Download your inventory to Excel or spreadsheet."

**Gate Body:**
"Export all your items as a .csv file so you can use them in spreadsheets, accounting software, or inventory systems."

**Missing Without This:** "You have to manually type your items into other tools. Copy-and-paste takes forever."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

### Print Kit Gate

**Feature:** Print Kit

**Gate Headline:** "Print flyers and price tags for your sale."

**Gate Body:**
"Print a yard sign with a QR code and price tags for each item. Shoppers scan the QR to find items on their phone instead of hunting through piles. Looks professional too."

**Missing Without This:** "Shoppers have to remember item numbers or wander around. No way to find items online while at your sale."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

### Webhooks Gate

**Feature:** Webhooks

**Gate Headline:** "Send your sale data to other tools automatically."

**Gate Body:**
"Connect FindA.Sale to accounting software, email tools, or other apps. Sale data flows automatically instead of manual re-entry. Saves hours every sale."

**Missing Without This:** "You re-enter sale data into every tool. Copy-paste, spreadsheets, manual entry — it's slow and error-prone."

**CTA Button:** "Upgrade to TEAMS — $99/month" → `/organizer/pricing`

---

### Typology Classifier / Item Tagger Gate

**Feature:** Item Tagger

**Gate Headline:** "Let AI fill in item details automatically."

**Gate Body:**
"Take a photo. AI reads it and suggests a title, description, tags, and price. You edit if needed, then publish. No typing."

**Missing Without This:** "You type every item detail by hand. 15 items = 30 minutes of typing. Item Tagger cuts that down to 5 minutes."

**CTA Button:** "Upgrade to PRO — $49/month" → `/organizer/pricing`

---

## SECTION 8: ERROR & VALIDATION MESSAGES

**Principle:** Explain what went wrong in plain language, then tell the organizer how to fix it. Never use jargon.

---

### Navigation & Auth Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Sale not found" | "We can't find that sale. It might have been deleted or you don't have permission to view it. Go back to your dashboard." |
| "Unauthorized" | "You don't have permission to do this. Sign in or switch to the account that owns this sale." |
| "Not authenticated" | "You need to sign in first. Go to the Sign In page." |
| "Insufficient permissions" | "Your account doesn't have permission to do this. Contact the sale owner or upgrade your plan." |

---

### Item & Inventory Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Item must have at least one photo before publishing" | "Every item needs at least one photo. Take a photo or upload one before publishing." |
| "Item title is required" | "Give your item a name so shoppers know what it is." |
| "Price must be greater than $0" | "Set a price of at least $0.01. Free items aren't allowed." |
| "You have reached your item limit" | "You've added the maximum items for your plan. Upgrade to PRO to add more. Or delete items you don't want to sell." |
| "Category is required" | "Pick a category (e.g., 'Furniture' or 'Jewelry'). Categories help shoppers find your items." |

---

### Sale Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Sale must be active to place holds" | "Shoppers can only hold items while a sale is active. Start your sale or check that the dates are correct." |
| "Sale title is required" | "Every sale needs a title. Something like 'Spring Estate Sale on Oak Street' works great." |
| "End date must be after start date" | "Your sale has to end after it starts. Pick a later date for the end date." |
| "Start date must be today or in the future" | "You can't start a sale in the past. Pick today or a future date." |

---

### Hold & Reservation Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Hold has expired" | "This hold ran out of time. The shopper didn't confirm, so the item is back on sale. If they message you, you can create a new hold." |
| "Item already has an active hold" | "Another shopper is already holding this item. Wait for their hold to expire, or contact them to release it." |
| "Shopper rank too low to hold" | "This shopper isn't eligible to hold items yet. They need to be a Scout or higher in the Explorer's Guild. (This is rare.)" |
| "You can't hold your own item" | "Organizers can't hold items from their own sales. Remove yourself as an organizer if you want to shop." |

---

### Payment & Payout Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Payment failed" | "We couldn't process the payment. Make sure your payment method is current and try again. If this keeps happening, contact support." |
| "Stripe Connect not set up" | "You need to connect your bank account to receive payouts. Go to Settings > Payments and set up Stripe Connect." |
| "Insufficient funds for payout" | "You don't have enough earnings to request a payout. Payouts are sent automatically when you reach a minimum balance." |

---

### Upload & Form Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "File too large" | "That photo is too big. Use a photo under 10 MB. Most phone photos are fine." |
| "Invalid file type" | "That file type isn't supported. Upload a JPG, PNG, or WebP image." |
| "Upload failed" | "Something went wrong. Check your internet connection and try again." |
| "Photo failed to process" | "We couldn't analyze that photo. The lighting might be too dark. Try retaking it with better light." |

---

### Tier & Subscription Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Feature requires PRO tier" | "This feature is only available on the PRO plan. Upgrade to PRO for $49/month to unlock it." |
| "Feature requires TEAMS tier" | "This feature is only available on the TEAMS plan. Upgrade to TEAMS for $99/month if you have multiple organizers." |
| "Subscription payment failed" | "We couldn't charge your card for your subscription. Update your payment method in Settings > Billing." |
| "Subscription expired" | "Your plan expired. Renew it to keep selling on FindA.Sale." |

---

### Network & Server Errors

| Current Error | Plain Language Rewrite |
|---|---|
| "Network error" | "Something went wrong with your internet connection. Check that you're online and try again." |
| "Server error" | "Our servers hiccupped. Wait a moment and try again. If this keeps happening, contact support." |
| "Timeout" | "That took too long. Check your internet and try again. Or contact support if it keeps timing out." |

---

### Success Messages (Not Errors, But Important Confirmations)

| Current Copy | Improved Copy |
|---|---|
| "Item created" | "Item published! Shoppers can see it now." |
| "Sale updated" | "Sale saved. Your changes are live." |
| "Hold confirmed" | "Hold approved. Shopper has 30 minutes to come by." |
| "Payout requested" | "Payout requested! You'll see the money in your bank account within 2–3 business days." |
| "Item marked sold" | "Great! You've sold this item. Shopper will get a receipt." |

---

## SECTION 9: BUTTON & CTA LABELS

**Principle:** CTAs should be a verb + outcome, not generic "OK" or "Submit."

| Generic Label | Better CTA |
|---|---|
| "OK" | [Context-specific, e.g., "Create Sale," "Save Changes," "Approve Hold"] |
| "Submit" | [Context-specific, e.g., "Publish Item," "Send Sale," "Request Payout"] |
| "Next" | [Specific, e.g., "Next: Add Items," "Continue to Pricing"] |
| "Save" | [Specific, e.g., "Save Sale Draft," "Save Changes," "Save & Publish"] |
| "Delete" | [Specific, e.g., "Delete This Item," "Remove Photo"] |
| "Close" | [Context-specific, e.g., "End This Sale," "Dismiss"] |

---

## SECTION 10: COMMON QUESTIONS & QUICK HELP

Use these copy snippets in tooltips, help modals, or contextual guidance.

---

### "What's the difference between a Hold and a Purchase?"

**Tooltip:**
"A **hold** is when a shopper clicks 'Save' to reserve an item for 30–90 minutes. They haven't paid yet — they might change their mind. A **purchase** is when they've bought it and paid. You're guaranteed the money."

---

### "Why should I enable holds?"

**Tooltip:**
"Holds help shoppers decide. They keep an item off the market for a few minutes while someone finds cash, decides if they want it, or brings a friend over to see it. Shoppers with more holds are less likely to no-show. (You can turn off holds if you prefer first-come-first-served.)"

---

### "How long do items stay on sale?"

**Tooltip:**
"As long as you want. Items stay live until you manually end the sale or mark them sold. You can run a sale for a weekend or a month — it's up to you."

---

### "Can I run multiple sales at once?"

**Tooltip:**
"Yes. Start as many sales as you want. PRO organizers can run unlimited concurrent sales. SIMPLE organizers have a limit of one active sale at a time."

---

### "How do I get paid?"

**Tooltip:**
"After your sale ends and items sell, your earnings are collected. You can request payouts on a schedule (daily, weekly, monthly) or manually whenever you want. Money goes straight to your bank account within 2–3 business days."

---

### "What fees do I pay?"

**Tooltip:**
"On SIMPLE, you pay a 10% platform fee per item sold. On PRO, it's 8%. You also pay a small Stripe payment processing fee (~3%). For example: if an item sells for $100, you pay $10 (SIMPLE) or $8 (PRO) to FindA.Sale, plus ~$3 to Stripe, and you keep ~$87 or ~$89."

---

## FORMATTING & TONE GUIDELINES

### When Writing Copy

1. **Use second-person ("you," "your"):** Not "Organizers can..." but "You can..."
2. **Benefit-first:** Not "This tool allows..." but "Use this to earn more..."
3. **Short paragraphs:** Max 2 sentences per paragraph. Use bullets for steps.
4. **Plain words:** No "leverage," "utilize," "facilitate," "seamless," "robust"
5. **Action verbs:** "Take a photo," "Add items," "Get paid" — not "Enable," "Configure," "Execute"
6. **Avoid negatives:** Not "Don't forget" but "Remember to..."
7. **Optional = soften:** "You can add..." not "You must add..."
8. **Dark mode:** Test all copy in light and dark mode. No contrast issues.

### Reading Level

Target 6th grade (ages 11–12). Use [Hemingway Editor](https://hemingwayapp.com/) to check.

- Average sentence length: < 15 words
- Avoid subordinate clauses
- Avoid jargon unless explained in tooltip

### Microcopy Examples

| ❌ Avoid | ✅ Use |
|---|---|
| "Initialize photo upload" | "Take a photo" |
| "Leverage your Flip Report data" | "Use your Flip Report to price smarter" |
| "Facilitate item discovery" | "Help shoppers find your items" |
| "Designate a tier upgrade" | "Upgrade to PRO" |
| "Persist your form data" | "Your changes are saved" |

---

## DEPLOYMENT CHECKLIST

Before shipping any organizer-facing copy, verify:

- [ ] All tooltips are ≤2 sentences
- [ ] All CTAs are verb + outcome
- [ ] No jargon without a tooltip
- [ ] Empty states have headline + subtext + CTA
- [ ] Error messages explain what went wrong + how to fix it
- [ ] Onboarding modal is <5 steps and shows 1× only
- [ ] No all-caps except acronyms (PRO, CSV, PIN)
- [ ] Dark mode contrast is ✅ (4.5:1 minimum)
- [ ] Mobile view doesn't overflow (test on iPhone SE)
- [ ] Reading level is 6th grade or below
- [ ] No assumptions about technical knowledge

---

**Document Status:** Complete specification for S350+ organizer UX writing
**Author Guidance:** Use this as the north star for all organizer-facing copy changes
**Maintenance:** Update this spec whenever you add a major organizer feature or change terminology

